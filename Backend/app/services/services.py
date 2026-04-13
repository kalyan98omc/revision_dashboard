"""
app/services/
─────────────
Service Layer — all business logic lives here.
Services orchestrate repositories and external APIs.
Controllers call services; services never know about HTTP.
"""

from __future__ import annotations

import os
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Generator

import structlog
from flask import current_app
from flask_jwt_extended import create_access_token, create_refresh_token, decode_token

from app.extensions import db, cache
from app.models.models import (
    User, UserRole, UserStatus, MessageRole, QuizDifficulty
)
from app.repositories.repositories import (
    UserRepository, TokenRepository, QuizRepository,
    AttemptRepository, ChatRepository, AuditRepository, SubjectRepository,
)

log = structlog.get_logger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
#  CUSTOM EXCEPTIONS  (descriptive, caught in error handlers)
# ─────────────────────────────────────────────────────────────────────────────

class ServiceError(Exception):
    """Base service error — maps to HTTP 400."""
    http_code = 400

class AuthError(ServiceError):
    """Authentication / authorization failure — maps to HTTP 401."""
    http_code = 401

class ForbiddenError(ServiceError):
    """Insufficient permissions — maps to HTTP 403."""
    http_code = 403

class NotFoundError(ServiceError):
    """Resource not found — maps to HTTP 404."""
    http_code = 404

class ConflictError(ServiceError):
    """Duplicate resource — maps to HTTP 409."""
    http_code = 409


# ─────────────────────────────────────────────────────────────────────────────
#  AUTH SERVICE
# ─────────────────────────────────────────────────────────────────────────────

class AuthService:

    # ── Registration ──────────────────────────────────────────────────────────

    @staticmethod
    def register(
        email: str,
        username: str,
        display_name: str,
        password: str,
        role: str = "student",
    ) -> dict:
        # Uniqueness checks
        if UserRepository.find_by_email(email):
            raise ConflictError("Email address is already registered")
        if UserRepository.find_by_username(username):
            raise ConflictError("Username is already taken")

        # Validate password strength
        AuthService._validate_password(password)

        # Map role string to enum (default to STUDENT for safety)
        safe_role = UserRole.STUDENT
        if role == "teacher":
            safe_role = UserRole.TEACHER
        # ADMIN role can only be assigned programmatically, never via API

        user = UserRepository.create(
            email=email,
            username=username,
            display_name=display_name,
            raw_password=password,
            role=safe_role,
        )

        # Generate email verification token
        token = secrets.token_urlsafe(32)
        user.email_verify_token = token

        # Flush user to DB so FK constraint on audit_logs.user_id is satisfied
        db.session.flush()

        AuditRepository.log(
            action="user.register",
            user_id=user.id,
            payload={"email": email, "username": username},
        )

        db.session.commit()

        log.info("user.registered", user_id=user.id, username=username)

        # TODO: Send verification email via Celery task
        # from app.tasks.email_tasks import send_verification_email
        # send_verification_email.delay(user.id, token)

        return {"user": user.to_dict(), "verify_token": token}

    # ── Login ─────────────────────────────────────────────────────────────────

    @staticmethod
    def login(identifier: str, password: str, ip: str, user_agent: str) -> dict:
        user = UserRepository.find_by_email_or_username(identifier)

        if user is None:
            # Don't reveal whether the user exists
            raise AuthError("Invalid credentials")

        if user.is_deleted:
            raise AuthError("Account not found")

        if user.is_locked:
            raise AuthError("Account temporarily locked due to too many failed attempts. Try again later.")

        if not user.check_password(password):
            UserRepository.record_login(user, ip, success=False)
            AuditRepository.log("user.login_failed", user_id=user.id, ip_address=ip)
            db.session.commit()
            raise AuthError("Invalid credentials")

        if user.status == UserStatus.SUSPENDED:
            raise AuthError("Account is suspended. Contact support.")

        # Activate pending accounts on first login (email verify could be skipped in dev)
        if user.status == UserStatus.PENDING:
            user.status = UserStatus.ACTIVE

        UserRepository.record_login(user, ip, success=True)

        # Issue JWT tokens
        additional_claims = {"role": user.role.value, "uid": user.id}
        access_token = create_access_token(identity=user.id, additional_claims=additional_claims)
        refresh_token = create_refresh_token(identity=user.id, additional_claims=additional_claims)

        # Decode to extract JTI for blacklist tracking
        decoded_refresh = decode_token(refresh_token)
        jti = decoded_refresh["jti"]
        expires_at = datetime.fromtimestamp(decoded_refresh["exp"], tz=timezone.utc)

        TokenRepository.create(
            user_id=user.id,
            jti=jti,
            expires_at=expires_at,
            ip=ip,
            ua=user_agent,
        )

        AuditRepository.log("user.login", user_id=user.id, ip_address=ip, user_agent=user_agent)
        db.session.commit()

        log.info("user.login", user_id=user.id, ip=ip)

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "Bearer",
            "user": user.to_dict(),
        }

    # ── Refresh ───────────────────────────────────────────────────────────────

    @staticmethod
    def refresh(jti: str, user_id: str, user_agent: str, ip: str) -> dict:
        token_record = TokenRepository.find_by_jti(jti)
        if token_record is None or token_record.revoked:
            raise AuthError("Refresh token is invalid or has been revoked")

        user = UserRepository.get_by_id(user_id)
        if not user or user.is_deleted:
            raise AuthError("User not found")

        # Rotate: revoke old token, issue new pair
        token_record.revoke()

        additional_claims = {"role": user.role.value, "uid": user.id}
        new_access = create_access_token(identity=user.id, additional_claims=additional_claims)
        new_refresh = create_refresh_token(identity=user.id, additional_claims=additional_claims)

        decoded = decode_token(new_refresh)
        new_jti = decoded["jti"]
        new_exp = datetime.fromtimestamp(decoded["exp"], tz=timezone.utc)

        TokenRepository.create(user_id=user.id, jti=new_jti, expires_at=new_exp, ip=ip, ua=user_agent)

        AuditRepository.log("user.token_refresh", user_id=user.id, ip_address=ip)
        db.session.commit()

        return {"access_token": new_access, "refresh_token": new_refresh, "token_type": "Bearer"}

    # ── Logout ────────────────────────────────────────────────────────────────

    @staticmethod
    def logout(jti: str, user_id: str, all_devices: bool = False) -> None:
        if all_devices:
            count = TokenRepository.revoke_all_for_user(user_id)
            log.info("user.logout_all", user_id=user_id, tokens_revoked=count)
        else:
            token = TokenRepository.find_by_jti(jti)
            if token:
                token.revoke()
        AuditRepository.log("user.logout", user_id=user_id)
        db.session.commit()

    # ── Verify Email ──────────────────────────────────────────────────────────

    @staticmethod
    def verify_email(token: str) -> User:
        user = UserRepository.find_by_verify_token(token)
        if not user:
            raise NotFoundError("Invalid or expired verification token")
        user.email_verified = True
        user.email_verify_token = None
        user.status = UserStatus.ACTIVE
        AuditRepository.log("user.email_verified", user_id=user.id)
        db.session.commit()
        return user

    # ── Password Reset ────────────────────────────────────────────────────────

    @staticmethod
    def request_password_reset(email: str) -> Optional[str]:
        user = UserRepository.find_by_email(email)
        if not user:
            return None  # Silently succeed to prevent email enumeration

        token = secrets.token_urlsafe(32)
        user.password_reset_token = token
        user.password_reset_exp = datetime.now(timezone.utc) + timedelta(hours=1)
        AuditRepository.log("user.password_reset_requested", user_id=user.id)
        db.session.commit()

        # TODO: Send email via Celery
        # send_password_reset_email.delay(user.id, token)
        return token

    @staticmethod
    def reset_password(token: str, new_password: str) -> None:
        user = UserRepository.find_by_reset_token(token)
        if not user:
            raise AuthError("Invalid or expired reset token")
        AuthService._validate_password(new_password)
        user.set_password(new_password)
        user.password_reset_token = None
        user.password_reset_exp = None
        # Revoke all sessions for security
        TokenRepository.revoke_all_for_user(user.id)
        AuditRepository.log("user.password_reset", user_id=user.id)
        db.session.commit()

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _validate_password(password: str) -> None:
        errors = []
        if len(password) < 8:
            errors.append("at least 8 characters")
        if not any(c.isupper() for c in password):
            errors.append("one uppercase letter")
        if not any(c.isdigit() for c in password):
            errors.append("one number")
        if errors:
            raise ServiceError(f"Password must contain: {', '.join(errors)}")


# ─────────────────────────────────────────────────────────────────────────────
#  USER SERVICE
# ─────────────────────────────────────────────────────────────────────────────

class UserService:

    @staticmethod
    def get_profile(user_id: str) -> User:
        user = UserRepository.get_by_id(user_id)
        if not user or user.is_deleted:
            raise NotFoundError("User not found")
        return user

    @staticmethod
    def update_profile(user_id: str, data: dict) -> User:
        user = UserRepository.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found")

        allowed_fields = {"display_name", "avatar_url", "preferences"}
        for field, value in data.items():
            if field in allowed_fields:
                setattr(user, field, value)

        AuditRepository.log("user.profile_updated", user_id=user_id, payload={"fields": list(data.keys())})
        db.session.commit()
        return user

    @staticmethod
    @cache.memoize(timeout=60)
    def get_leaderboard() -> List[dict]:
        users = UserRepository.get_leaderboard(limit=20)
        return [
            {**u.to_dict(), "rank": i + 1}
            for i, u in enumerate(users)
        ]

    @staticmethod
    def list_users(page: int, per_page: int, **filters) -> dict:
        users, total = UserRepository.list_users(page=page, per_page=per_page, **filters)
        return {
            "items": [u.to_dict(include_private=True) for u in users],
            "total": total,
            "page": page,
            "per_page": per_page,
            "pages": (total + per_page - 1) // per_page,
        }


# ─────────────────────────────────────────────────────────────────────────────
#  QUIZ SERVICE
# ─────────────────────────────────────────────────────────────────────────────

class QuizService:

    @staticmethod
    def list_quizzes(
        subject_id: Optional[str] = None,
        difficulty: Optional[str] = None,
        page: int = 1,
        per_page: int = 20,
    ) -> dict:
        quizzes, total = QuizRepository.find_published(
            subject_id=subject_id, difficulty=difficulty,
            page=page, per_page=per_page,
        )
        return {
            "items": [q.to_dict() for q in quizzes],
            "total": total, "page": page, "per_page": per_page,
        }

    @staticmethod
    def get_quiz_for_attempt(quiz_id: str) -> dict:
        """Returns quiz with questions but WITHOUT correct answers."""
        quiz = QuizRepository.get_with_questions(quiz_id)
        if not quiz:
            raise NotFoundError("Quiz not found")
        if not quiz.is_published:
            raise NotFoundError("Quiz not available")
        return quiz.to_dict(include_questions=True)

    @staticmethod
    def grade_attempt(
        user_id: str,
        quiz_id: str,
        answers: dict,    # {question_id: chosen_idx}
        time_taken: Optional[int] = None,
    ) -> dict:
        quiz = QuizRepository.get_with_questions(quiz_id)
        if not quiz:
            raise NotFoundError("Quiz not found")

        # Grade each question
        score_raw = 0
        max_score = sum(q.points for q in quiz.questions)
        answer_details = {}

        for question in quiz.questions:
            chosen = answers.get(question.id)
            is_correct = chosen == question.correct_idx
            if is_correct:
                score_raw += question.points
            answer_details[question.id] = {
                "chosen": chosen,
                "correct": question.correct_idx,
                "is_correct": is_correct,
                "explanation": question.explanation,
            }

        score_pct = (score_raw / max_score) * 100 if max_score > 0 else 0
        passed = score_pct >= quiz.pass_score

        # Calculate XP with bonuses
        xp_earned = QuizService._calculate_xp(quiz, score_pct, passed, time_taken)

        # Save attempt
        attempt = AttemptRepository.create(
            user_id=user_id,
            quiz_id=quiz_id,
            answers=answers,
            score_pct=score_pct,
            score_raw=score_raw,
            max_score=max_score,
            passed=passed,
            xp_earned=xp_earned,
            time_taken=time_taken,
        )

        # Update user XP and streak
        user = UserRepository.get_by_id(user_id)
        if user:
            UserRepository.add_xp(user, xp_earned)
            UserRepository.update_streak(user)

        # Update subject mastery
        SubjectRepository.upsert_progress(user_id, quiz.subject_id, score_pct)

        AuditRepository.log(
            "quiz.attempt",
            user_id=user_id,
            resource=f"quiz:{quiz_id}",
            payload={"score_pct": round(score_pct, 2), "passed": passed, "xp": xp_earned},
        )

        # Invalidate leaderboard cache
        cache.delete_memoized(UserService.get_leaderboard)

        db.session.commit()

        return {
            "attempt": attempt.to_dict(),
            "score_pct": round(score_pct, 2),
            "passed": passed,
            "xp_earned": xp_earned,
            "answer_details": answer_details,
            "correct_count": score_raw,
            "total_questions": len(quiz.questions),
        }

    @staticmethod
    def _calculate_xp(quiz, score_pct: float, passed: bool, time_taken: Optional[int]) -> int:
        if not passed:
            # Still award partial XP for trying
            return int(quiz.xp_reward * (score_pct / 100) * 0.5)

        base_xp = quiz.xp_reward
        # Difficulty multiplier
        multipliers = {QuizDifficulty.EASY: 1.0, QuizDifficulty.MEDIUM: 1.5, QuizDifficulty.HARD: 2.0}
        xp = int(base_xp * multipliers.get(quiz.difficulty, 1.0))
        # Perfect score bonus
        if score_pct == 100:
            xp = int(xp * 1.25)
        # Speed bonus (finished in under 60% of allowed time)
        if time_taken and quiz.time_limit_seconds:
            if time_taken < quiz.time_limit_seconds * 0.6:
                xp = int(xp * 1.1)
        return xp


# ─────────────────────────────────────────────────────────────────────────────
#  AI CHAT SERVICE
# ─────────────────────────────────────────────────────────────────────────────

class ChatService:

    @staticmethod
    def create_session(user_id: str, subject_id: Optional[str] = None, title: Optional[str] = None) -> dict:
        session = ChatRepository.create_session(user_id, title=title, subject_id=subject_id)
        # Add system prompt as first message
        system_prompt = ChatService._build_system_prompt(subject_id)
        ChatRepository.add_message(
            session_id=session.id,
            role=MessageRole.SYSTEM,
            content=system_prompt,
            metadata={"model": "claude-3-5-sonnet-20240620"},
        )
        db.session.commit()
        return session.to_dict()

    @staticmethod
    def get_sessions(user_id: str, page: int = 1, per_page: int = 20) -> dict:
        sessions, total = ChatRepository.get_user_sessions(user_id, page=page, per_page=per_page)
        return {
            "items": [s.to_dict() for s in sessions],
            "total": total, "page": page, "per_page": per_page,
        }

    @staticmethod
    def get_session_history(session_id: str, user_id: str) -> dict:
        session = ChatRepository.get_session(session_id, user_id)
        if not session:
            raise NotFoundError("Session not found")
        messages = ChatRepository.get_recent_messages(session_id, limit=100)
        return session.to_dict() | {"messages": [m.to_dict() for m in messages if m.role != MessageRole.SYSTEM]}

    @staticmethod
    def stream_response(
        session_id: str,
        user_id: str,
        user_message: str,
        use_rag: bool = True,
        custom_system_prompt: Optional[str] = None,
    ) -> Generator[str, None, None]:
        """
        Yields text chunks for Server-Sent Events or SocketIO streaming.
        Uses the OpenAI Assistants API (with file_search tool) to retrieve
        relevant content from the OpenAI Vector Store (RAG) and stream replies.
        Saves user message and full assistant response to DB on completion.
        """
        session = ChatRepository.get_session(session_id, user_id)
        if not session:
            raise NotFoundError("Chat session not found")

        # Sanitize input
        import bleach
        clean_message = bleach.clean(user_message.strip(), tags=[], strip=True)
        if not clean_message:
            raise ServiceError("Message cannot be empty")
        if len(clean_message) > 4000:
            raise ServiceError("Message too long (max 4000 characters)")

        # Save user message
        user_msg = ChatRepository.add_message(
            session_id=session_id,
            role=MessageRole.USER,
            content=clean_message,
        )

        # Build message history — only user/assistant turns for the thread
        history = ChatRepository.get_recent_messages(session_id, limit=20)
        thread_messages = [
            {"role": m.role.value, "content": m.content}
            for m in history
            if m.role in (MessageRole.USER, MessageRole.ASSISTANT)
        ]

        # Stream from Anthropic
        full_response = ""
        token_count = 0
        finish_reason = "stop"

        try:
            from anthropic import Anthropic
            
            # ── Validate API Key ──
            api_key = current_app.config.get("ANTHROPIC_API_KEY", "").strip()
            if not api_key:
                log.error("anthropic.missing_api_key")
                yield "Anthropic API key is not configured. Please contact admin."
                return
            
            client = Anthropic(api_key=api_key)

            system_instructions = custom_system_prompt or ChatService._build_system_prompt(session.subject_id)
            anthropic_messages = []
            for m in history:
                role = "assistant" if m.role.value == "assistant" else "user"
                anthropic_messages.append({"role": role, "content": m.content})

            try:
                with client.messages.stream(
                    max_tokens=1024,
                    model="claude-3-5-sonnet-20240620",
                    system=system_instructions,
                    messages=anthropic_messages,
                ) as stream:
                    for text_chunk in stream.text_stream:
                        full_response += text_chunk
                        yield text_chunk
            except Exception as e:
                log.error("anthropic.chat_completion_failed", error=str(e), session_id=session_id)
                yield "Chat completion failed. Please try again."
                return

            # Approximate token count
            token_count = len(full_response.split()) * 1.3

        except Exception as e:
            log.error("anthropic.stream_error", error=str(e), error_type=type(e).__name__, session_id=session_id)
            fallback = "I'm having trouble connecting to the AI service right now. Please try again in a moment."
            full_response = fallback
            yield fallback

        # Save assistant response
        ChatRepository.add_message(
            session_id=session_id,
            role=MessageRole.ASSISTANT,
            content=full_response,
            token_count=int(token_count),
            metadata={"model": "claude-3-5-sonnet-20240620", "finish_reason": finish_reason},
        )

        # Auto-title the session from first user message
        if not session.title or session.title == "New Session":
            title = clean_message[:60] + ("..." if len(clean_message) > 60 else "")
            session.title = title

        db.session.commit()

    @staticmethod
    def transcribe_audio(session_id: str, user_id: str, audio_bytes: bytes, filename: str) -> dict:
        """
        Transcribes audio via OpenAI Whisper and creates a chat message.
        Returns the transcript so the frontend can display it.
        """
        session = ChatRepository.get_session(session_id, user_id)
        if not session:
            raise NotFoundError("Session not found")

        try:
            # Anthropic doesn't have an audio transcription API yet, stubbing this out
            return {"transcript": "Audio transcription is currently unsupported on Anthropic models."}

        except Exception as e:
            log.error("transcription_error", error=str(e))
            raise ServiceError("Audio transcription failed. Please try again.")

    @staticmethod
    def _build_system_prompt(subject_id: Optional[str] = None) -> str:
        base = (
            "You are ApexLearn AI, an expert educational tutor. "
            "Your goal is to help students understand concepts deeply, not just memorize answers. "
            "When explaining topics:\n"
            "- Break down complex ideas into simple, logical steps\n"
            "- Use concrete examples and analogies\n"
            "- Encourage critical thinking with follow-up questions\n"
            "- Format mathematical expressions clearly\n"
            "- Adapt your explanation depth based on the student's apparent level\n"
            "Always be encouraging, patient, and precise."
        )
        if subject_id:
            subject = SubjectRepository.get_by_id(subject_id) if hasattr(SubjectRepository, 'get_by_id') else None
            if subject:
                base += f"\n\nFocus area: {subject.name}."
        return base


# ─────────────────────────────────────────────────────────────────────────────
#  SUBJECT SERVICE
# ─────────────────────────────────────────────────────────────────────────────

class SubjectService:

    @staticmethod
    @cache.memoize(timeout=300)
    def get_all() -> List[dict]:
        subjects = SubjectRepository.get_all_active()
        return [s.to_dict() for s in subjects]

    @staticmethod
    def get_user_progress(user_id: str) -> List[dict]:
        from app.models.models import UserSubjectProgress
        from app.extensions import db
        from sqlalchemy import desc

        progress_rows = (
            db.session.query(UserSubjectProgress)
            .filter(UserSubjectProgress.user_id == user_id)
            .order_by(desc(UserSubjectProgress.last_activity))
            .all()
        )
        return [
            {
                "subject": p.subject.to_dict() if p.subject else None,
                "mastery_score": round(p.mastery_score, 2),
                "quizzes_taken": p.quizzes_taken,
                "avg_score": round(p.avg_score, 2),
                "last_activity": p.last_activity.isoformat() if p.last_activity else None,
            }
            for p in progress_rows
        ]
