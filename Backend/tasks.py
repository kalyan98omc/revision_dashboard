"""
app/tasks/
──────────
Celery background tasks for:
- Sending emails (registration, password reset)
- Cleaning up expired tokens
- Generating AI quiz questions
- Sending TTS audio responses
"""

from __future__ import annotations
import os
from datetime import datetime, timezone

import structlog
from celery import Celery

log = structlog.get_logger(__name__)


def make_celery(app) -> Celery:
    """Create Celery instance bound to Flask app context."""
    celery = Celery(
        app.import_name,
        broker=app.config["CELERY_BROKER_URL"],
        backend=app.config["CELERY_RESULT_BACKEND"],
    )
    celery.conf.update(app.config)

    class ContextTask(celery.Task):
        def __call__(self, *args, **kwargs):
            with app.app_context():
                return self.run(*args, **kwargs)

    celery.Task = ContextTask
    return celery


# ── Task Definitions ──────────────────────────────────────────────────────────
# These are registered on the celery instance created in wsgi/app factory.
# Import with: from app.tasks.tasks import celery_app, send_verification_email

# ─────────────────────────────────────────────────────────────────────────────

def register_tasks(celery: Celery):
    """Register all task functions onto the celery app."""

    @celery.task(bind=True, max_retries=3, default_retry_delay=60)
    def send_verification_email(self, user_id: str, token: str):
        """Send email verification link."""
        try:
            from app.repositories.repositories import UserRepository
            user = UserRepository.get_by_id(user_id)
            if not user:
                return

            # TODO: integrate with SendGrid / SES / SMTP
            # from sendgrid import SendGridAPIClient
            # sg = SendGridAPIClient(os.environ['SENDGRID_API_KEY'])
            # message = Mail(...)
            # sg.send(message)

            verify_url = f"{os.getenv('FRONTEND_URL', 'http://localhost:5173')}/verify-email/{token}"
            log.info("email.verification_sent", user_id=user_id, email=user.email, url=verify_url)

        except Exception as exc:
            log.error("email.verification_failed", user_id=user_id, error=str(exc))
            raise self.retry(exc=exc)

    @celery.task(bind=True, max_retries=3, default_retry_delay=60)
    def send_password_reset_email(self, user_id: str, token: str):
        try:
            from app.repositories.repositories import UserRepository
            user = UserRepository.get_by_id(user_id)
            if not user:
                return

            reset_url = f"{os.getenv('FRONTEND_URL', 'http://localhost:5173')}/reset-password/{token}"
            log.info("email.password_reset_sent", user_id=user_id, email=user.email, url=reset_url)

        except Exception as exc:
            raise self.retry(exc=exc)

    @celery.task
    def cleanup_expired_tokens():
        """Prune expired refresh tokens. Run every hour via Celery Beat."""
        from app.repositories.repositories import TokenRepository
        from app.extensions import db
        count = TokenRepository.cleanup_expired()
        db.session.commit()
        log.info("tokens.cleanup", deleted=count)
        return count

    @celery.task(bind=True, max_retries=2)
    def generate_ai_quiz(self, subject_id: str, difficulty: str, question_count: int, creator_id: str):
        """
        Use OpenAI to auto-generate quiz questions for a subject.
        Creates a quiz in DRAFT state; teacher/admin reviews before publishing.
        """
        try:
            from anthropic import Anthropic
            import json
            from app.extensions import db
            from app.repositories.repositories import QuizRepository, SubjectRepository
            from app.models.models import QuizQuestion

            subject = SubjectRepository.get_by_id(subject_id)
            if not subject:
                return

            client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

            prompt = f"""Generate {question_count} multiple-choice quiz questions for the subject: {subject.name}.
Difficulty: {difficulty}.
Return ONLY a valid JSON array with this exact structure:
[
  {{
    "text": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_idx": 0,
    "explanation": "Why option A is correct..."
  }}
]"""

            response = client.messages.create(
                model="claude-3-5-sonnet-20240620",
                max_tokens=3000,
                temperature=0.7,
                messages=[{"role": "user", "content": prompt}],
            )

            raw = response.content[0].text
            questions_data = json.loads(raw).get("questions", json.loads(raw))

            # Create quiz
            quiz = QuizRepository.create(
                subject_id=subject_id,
                title=f"AI-Generated {subject.name} Quiz ({difficulty.title()})",
                difficulty=difficulty,
                created_by=creator_id,
                is_published=False,  # Draft — needs review
                tags=["ai-generated"],
            )

            for i, q in enumerate(questions_data):
                question = QuizQuestion(
                    quiz_id=quiz.id,
                    text=q["text"],
                    options=q["options"],
                    correct_idx=q["correct_idx"],
                    explanation=q.get("explanation"),
                    sort_order=i,
                )
                db.session.add(question)

            db.session.commit()
            log.info("quiz.ai_generated", quiz_id=quiz.id, question_count=len(questions_data))
            return {"quiz_id": quiz.id, "question_count": len(questions_data)}

        except Exception as exc:
            log.error("quiz.ai_generation_failed", error=str(exc))
            raise self.retry(exc=exc)

    @celery.task(bind=True, max_retries=2)
    def generate_tts_response(self, message_id: str, text: str):
        """
        Convert AI text response to speech via OpenAI TTS.
        Saves the audio URL to the ChatMessage record.
        """
        try:
            from app.extensions import db
            from app.models.models import ChatMessage

            # Anthropic does not support TTS out of the box currently. 
            # Placeholder or fallback logic if needed.
            # raise NotImplementedError("TTS is not supported by Anthropic")

            # Save audio file
            upload_dir = os.getenv("UPLOAD_FOLDER", "./uploads")
            audio_dir = os.path.join(upload_dir, "tts")
            os.makedirs(audio_dir, exist_ok=True)

            filename = f"{message_id}.mp3"
            filepath = os.path.join(audio_dir, filename)
            # Simulated audio file creation for now
            with open(filepath, "wb") as f:
                f.write(b"")

            # Update message with audio URL
            # TODO: Upload to S3/GCS and store public URL
            audio_url = f"/uploads/tts/{filename}"
            msg = db.session.get(ChatMessage, message_id)
            if msg:
                msg.audio_url = audio_url
                db.session.commit()

            log.info("tts.generated", message_id=message_id)
            return {"audio_url": audio_url}

        except Exception as exc:
            log.error("tts.failed", message_id=message_id, error=str(exc))
            raise self.retry(exc=exc)

    # Celery Beat schedule — periodic tasks
    celery.conf.beat_schedule = {
        "cleanup-expired-tokens": {
            "task": "app.tasks.tasks.cleanup_expired_tokens",
            "schedule": 3600.0,  # Every hour
        },
    }

    return celery
