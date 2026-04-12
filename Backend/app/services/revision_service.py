"""
app/services/revision_service.py
─────────────────────────────────
Revision Service — AI-powered adaptive mastery system for NEET-PG.
Handles student profiling, study plan generation, diagnostic assessment,
layered training (SAQ → LAQ → MCQ), and spaced revision scheduling.
"""

import os
import json
import uuid
import structlog
from typing import Optional
from datetime import datetime, timezone, timedelta
from anthropic import Anthropic

from app.extensions import db
from app.models.models import (
    User, Subject, Topic, StudentProfile, TopicAssessment,
    RevisionSchedule, PYQ, PYQCategory,
    StudentGoal, StudentLevel, MasteryStatus, QuestionType,
)
from app.services.services import ServiceError, NotFoundError

log = structlog.get_logger(__name__)


class RevisionService:

    _client: Optional[Anthropic] = None

    @classmethod
    def _get_client(cls) -> Anthropic:
        if cls._client is None:
            api_key = os.getenv("ANTHROPIC_API_KEY")
            if not api_key:
                raise ServiceError("ANTHROPIC_API_KEY not configured")
            cls._client = Anthropic(api_key=api_key)
        return cls._client

    # ── Student Profile ───────────────────────────────────────────────────────

    @staticmethod
    def create_or_update_profile(user_id: str, data: dict) -> dict:
        """Create or update student's preparation profile."""
        user = db.session.get(User, user_id)
        if not user:
            raise NotFoundError("User not found")

        profile = StudentProfile.query.filter_by(user_id=user_id).first()
        if not profile:
            profile = StudentProfile(id=str(uuid.uuid4()), user_id=user_id)
            db.session.add(profile)

        if "goal" in data:
            profile.goal = StudentGoal(data["goal"])
        if "self_level" in data:
            profile.self_level = StudentLevel(data["self_level"])
        if "hours_per_day" in data:
            profile.hours_per_day = float(data["hours_per_day"])
        if "prep_months" in data:
            profile.prep_months = int(data["prep_months"])
        if "exam_date" in data and data["exam_date"]:
            profile.exam_date = datetime.fromisoformat(data["exam_date"])
        if "subject_strengths" in data:
            profile.subject_strengths = data["subject_strengths"]
        if "overall_strength" in data:
            profile.overall_strength = int(data["overall_strength"])

        profile.completed_onboarding = True
        db.session.commit()
        return profile.to_dict()

    @staticmethod
    def get_profile(user_id: str) -> Optional[dict]:
        """Get student profile."""
        profile = StudentProfile.query.filter_by(user_id=user_id).first()
        return profile.to_dict() if profile else None

    # ── Study Plan Generation ─────────────────────────────────────────────────

    @classmethod
    def generate_study_plan(cls, user_id: str) -> dict:
        """Generate personalized study plan using AI based on student profile."""
        profile = StudentProfile.query.filter_by(user_id=user_id).first()
        if not profile:
            raise ServiceError("Complete onboarding first")

        subjects = Subject.query.filter_by(is_active=True)\
            .order_by(Subject.sort_order).all()

        # Build subject data with PYQ counts
        subject_data = []
        for s in subjects:
            pyq_count = PYQ.query.filter_by(subject_id=s.id).count()
            core_count = PYQ.query.filter_by(
                subject_id=s.id, category=PYQCategory.CORE).count()
            topic_count = Topic.query.filter_by(subject_id=s.id).count()
            strength = profile.subject_strengths.get(s.id, 5)

            subject_data.append({
                "id": s.id,
                "name": s.name,
                "pyq_count": pyq_count,
                "core_pyq_count": core_count,
                "topic_count": topic_count,
                "student_strength": strength,
            })

        # Generate plan using AI
        prompt = f"""Generate a personalized NEET-PG study plan. Return ONLY valid JSON.

Student Profile:
- Goal: {profile.goal.value} ({"Top 100 rank" if profile.goal == StudentGoal.TOP_100 else "Top 1000 rank" if profile.goal == StudentGoal.TOP_1000 else "Secure a seat"})
- Self-assessed level: {profile.self_level.value}
- Hours per day: {profile.hours_per_day}
- Months until exam: {profile.prep_months}
- Overall strength: {profile.overall_strength}/10

Subjects with PYQ data:
{json.dumps(subject_data, indent=2)}

Create a study plan with:
1. Hours per week for each subject (proportional to PYQ importance and inverse to student strength)
2. Priority order (1 = highest priority)
3. Recommended daily schedule
4. Key focus areas per subject

Return JSON format:
{{
  "subjects": [
    {{
      "subject_id": "...",
      "subject_name": "...",
      "hours_per_week": 0,
      "priority": 1,
      "focus_areas": ["..."],
      "strategy_note": "..."
    }}
  ],
  "daily_schedule": [
    {{"time_slot": "6:00-8:00 AM", "activity": "...", "subject": "..."}}
  ],
  "weekly_targets": "...",
  "revision_strategy": "..."
}}"""

        try:
            client = cls._get_client()
            response = client.messages.create(
                model="claude-3-5-sonnet-20240620",
                system="You are a NEET-PG study planning expert. Always return valid JSON only.",
                messages=[
                    {"role": "user", "content": prompt},
                ],
                temperature=0.7,
                max_tokens=2000,
            )

            plan = json.loads(response.content[0].text)
        except Exception as e:
            log.error("study_plan_generation_failed", error=str(e))
            # Fallback: generate a simple plan algorithmically
            plan = cls._generate_fallback_plan(profile, subject_data)

        # Save plan to profile
        profile.study_plan = plan
        db.session.commit()

        return plan

    @staticmethod
    def _generate_fallback_plan(profile, subject_data: list) -> dict:
        """Algorithmic fallback if AI plan generation fails."""
        total_hours = profile.hours_per_day * 7  # hours per week

        # Weight by PYQ count and inverse of strength
        weights = []
        for s in subject_data:
            pyq_weight = max(s["pyq_count"], 1)
            strength_inv = 11 - s["student_strength"]  # 1-10 → 10-1
            weight = pyq_weight * strength_inv
            weights.append(weight)

        total_weight = sum(weights) or 1
        subjects_plan = []
        for i, s in enumerate(subject_data):
            hours = round(total_hours * weights[i] / total_weight, 1)
            subjects_plan.append({
                "subject_id": s["id"],
                "subject_name": s["name"],
                "hours_per_week": hours,
                "priority": i + 1,
                "focus_areas": ["Core PYQ topics", "High-yield areas"],
                "strategy_note": "Focus on core concepts first",
            })

        # Sort by hours descending
        subjects_plan.sort(key=lambda x: x["hours_per_week"], reverse=True)
        for i, s in enumerate(subjects_plan):
            s["priority"] = i + 1

        return {
            "subjects": subjects_plan,
            "daily_schedule": [
                {"time_slot": "6:00-8:00 AM", "activity": "New topic study", "subject": "High priority"},
                {"time_slot": "8:00-9:00 AM", "activity": "Break + light revision", "subject": ""},
                {"time_slot": "9:00-12:00 PM", "activity": "PYQ practice", "subject": "Rotating"},
                {"time_slot": "2:00-5:00 PM", "activity": "Deep study", "subject": "Weak areas"},
                {"time_slot": "7:00-9:00 PM", "activity": "Revision + MCQs", "subject": "Mixed"},
            ],
            "weekly_targets": f"Complete {int(total_hours)} hours of focused study",
            "revision_strategy": "Spaced repetition with increasing intervals",
        }

    # ── Diagnostic Assessment ─────────────────────────────────────────────────

    @classmethod
    def start_diagnostic(cls, user_id: str, topic_id: str) -> dict:
        """Generate 3-4 diagnostic SAQs for a topic using RAG context."""
        topic = db.session.get(Topic, topic_id)
        if not topic:
            raise NotFoundError("Topic not found")

        subject = db.session.get(Subject, topic.subject_id)
        profile = StudentProfile.query.filter_by(user_id=user_id).first()

        # Get or create assessment record
        assessment = TopicAssessment.query.filter_by(
            user_id=user_id, topic_id=topic_id).first()
        if not assessment:
            assessment = TopicAssessment(
                id=str(uuid.uuid4()),
                user_id=user_id,
                topic_id=topic_id,
            )
            db.session.add(assessment)

        # Get relevant PYQs for context
        pyqs = PYQ.query.filter_by(topic_id=topic_id)\
            .order_by(PYQ.category).limit(10).all()
        pyq_context = "\n".join([f"- {p.question}" for p in pyqs])

        prompt = f"""Generate exactly 4 diagnostic Short Answer Questions (SAQs) for the topic "{topic.name}" 
in {subject.name} for NEET-PG preparation.

These questions must test:
1. Core conceptual clarity
2. Common PYQ areas (based on previous year patterns below)
3. Differentiation ability (distinguishing similar concepts)
4. Clinical application

Previous year question patterns for this topic:
{pyq_context if pyq_context else "No PYQ data available yet."}

Student level: {profile.self_level.value if profile else "average"}
Student goal: {profile.goal.value if profile else "secure_seat"}

Return ONLY valid JSON:
{{
  "questions": [
    {{
      "id": 1,
      "question": "...",
      "key_concepts": ["concept1", "concept2"],
      "expected_depth": "brief|moderate|detailed",
      "ideal_answer_points": ["point1", "point2", "point3"]
    }}
  ]
}}"""

        try:
            client = cls._get_client()

            response = client.messages.create(
                model="claude-3-5-sonnet-20240620",
                system="You are a NEET-PG medical exam expert. Return only valid JSON.",
                messages=[
                    {"role": "user", "content": prompt},
                ],
                temperature=0.7,
                max_tokens=1500,
            )
            
            content = response.content[0].text
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            questions = json.loads(content)

        except Exception as e:
            log.error("diagnostic_generation_failed", error=str(e))
            # Fallback questions
            questions = {
                "questions": [
                    {"id": 1, "question": f"What are the key features of {topic.name}?",
                     "key_concepts": [topic.name], "expected_depth": "moderate",
                     "ideal_answer_points": ["Define key concepts", "Clinical significance"]},
                    {"id": 2, "question": f"How do you differentiate the subtypes of {topic.name}?",
                     "key_concepts": [topic.name], "expected_depth": "moderate",
                     "ideal_answer_points": ["Classification", "Distinguishing features"]},
                    {"id": 3, "question": f"What is the clinical significance of {topic.name}?",
                     "key_concepts": [topic.name], "expected_depth": "moderate",
                     "ideal_answer_points": ["Clinical implications", "Management"]},
                    {"id": 4, "question": f"What investigations are relevant for {topic.name}?",
                     "key_concepts": [topic.name], "expected_depth": "brief",
                     "ideal_answer_points": ["Investigations", "Expected findings"]},
                ]
            }

        assessment.mastery_status = MasteryStatus.NOT_STARTED
        assessment.last_activity = datetime.now(timezone.utc)
        db.session.commit()

        return {
            "assessment_id": assessment.id,
            "topic": topic.to_dict(),
            "questions": questions.get("questions", []),
        }

    # ── Evaluate Diagnostic ───────────────────────────────────────────────────

    @classmethod
    def evaluate_diagnostic(cls, user_id: str, topic_id: str, answers: list) -> dict:
        """
        Evaluate student's diagnostic SAQ answers using AI.
        
        answers: [{"question_id": 1, "question": "...", "answer": "..."}]
        """
        assessment = TopicAssessment.query.filter_by(
            user_id=user_id, topic_id=topic_id).first()
        if not assessment:
            raise NotFoundError("No assessment found. Start diagnostic first.")

        topic = db.session.get(Topic, topic_id)
        profile = StudentProfile.query.filter_by(user_id=user_id).first()

        prompt = f"""Evaluate these student answers for the topic "{topic.name}" in NEET-PG context.

Student answers:
{json.dumps(answers, indent=2)}

For each answer, evaluate:
1. Score (0-25, where 25 is perfect)
2. What they got right
3. What they missed or got wrong
4. Conceptual mistakes or confusion patterns

Then provide:
- Overall score (0-100)
- Student readiness level: "weak" (0-25), "average" (26-50), "good" (51-75), "strong" (76-100)
- Knowledge gaps identified
- Confusion patterns detected
- Recommended focus areas

Student goal: {profile.goal.value if profile else "secure_seat"}

Return ONLY valid JSON:
{{
  "answer_evaluations": [
    {{
      "question_id": 1,
      "score": 0,
      "max_score": 25,
      "feedback": "...",
      "correct_points": ["..."],
      "missed_points": ["..."],
      "conceptual_errors": ["..."]
    }}
  ],
  "overall_score": 0,
  "readiness_level": "weak|average|good|strong",
  "knowledge_gaps": ["..."],
  "confusion_patterns": ["..."],
  "recommended_focus": ["..."],
  "encouragement": "..."
}}"""

        try:
            client = cls._get_client()
            response = client.messages.create(
                model="claude-3-5-sonnet-20240620",
                system="You are a supportive but honest NEET-PG tutor. Evaluate student answers thoroughly. Return only valid JSON.",
                messages=[
                    {"role": "user", "content": prompt},
                ],
                temperature=0.5,
                max_tokens=2000,
            )
            evaluation = json.loads(response.content[0].text)
        except Exception as e:
            log.error("diagnostic_eval_failed", error=str(e))
            # Simple fallback
            total = len(answers)
            answered = sum(1 for a in answers if a.get("answer", "").strip())
            score = (answered / total * 100) if total > 0 else 0
            evaluation = {
                "overall_score": score,
                "readiness_level": "average",
                "knowledge_gaps": ["Unable to evaluate — AI error"],
                "confusion_patterns": [],
                "recommended_focus": ["Review all concepts"],
                "encouragement": "Keep practicing!",
                "answer_evaluations": [],
            }

        # Update assessment
        assessment.diagnostic_score = evaluation.get("overall_score", 0)
        assessment.diagnostic_answers = answers
        assessment.ai_feedback = {
            "readiness_level": evaluation.get("readiness_level", "average"),
            "knowledge_gaps": evaluation.get("knowledge_gaps", []),
            "confusion_patterns": evaluation.get("confusion_patterns", []),
            "recommended_focus": evaluation.get("recommended_focus", []),
        }
        assessment.mastery_status = MasteryStatus.DIAGNOSED
        assessment.current_question_type = QuestionType.SAQ
        assessment.last_activity = datetime.now(timezone.utc)
        db.session.commit()

        return evaluation

    # ── Training Questions ────────────────────────────────────────────────────

    @classmethod
    def get_training_question(cls, user_id: str, topic_id: str) -> dict:
        """Generate next training question based on current level (SAQ → LAQ → MCQ)."""
        assessment = TopicAssessment.query.filter_by(
            user_id=user_id, topic_id=topic_id).first()
        if not assessment:
            raise NotFoundError("Start diagnostic assessment first")

        if assessment.mastery_status == MasteryStatus.MASTERED:
            return {"mastered": True, "message": "You've mastered this topic!"}

        topic = db.session.get(Topic, topic_id)
        profile = StudentProfile.query.filter_by(user_id=user_id).first()
        q_type = assessment.current_question_type

        # Get gaps for targeted questions
        gaps = assessment.ai_feedback.get("knowledge_gaps", [])
        focus = assessment.ai_feedback.get("recommended_focus", [])

        if q_type == QuestionType.MCQ:
            prompt = cls._build_mcq_prompt(topic, profile, gaps, focus)
        elif q_type == QuestionType.LAQ:
            prompt = cls._build_laq_prompt(topic, profile, gaps, focus)
        else:
            prompt = cls._build_saq_prompt(topic, profile, gaps, focus)

        try:
            client = cls._get_client()
            response = client.messages.create(
                model="claude-3-5-sonnet-20240620",
                system="You are a NEET-PG tutor generating training questions. Return only valid JSON.",
                messages=[
                    {"role": "user", "content": prompt},
                ],
                temperature=0.7,
                max_tokens=1000,
            )
            question = json.loads(response.content[0].text)
        except Exception as e:
            log.error("training_question_failed", error=str(e))
            question = {
                "question_type": q_type.value,
                "question": f"Explain the key aspects of {topic.name} relevant to NEET-PG.",
                "hints": ["Consider clinical applications"],
            }

        question["question_type"] = q_type.value
        question["questions_answered"] = assessment.questions_answered
        question["correct_answers"] = assessment.correct_answers
        return question

    @staticmethod
    def _build_saq_prompt(topic, profile, gaps, focus):
        return f"""Generate 1 Short Answer Question (SAQ) for "{topic.name}" targeting these knowledge gaps:
{json.dumps(gaps)}
Focus areas: {json.dumps(focus)}
Student level: {profile.self_level.value if profile else "average"}

Return JSON: {{"question": "...", "hints": ["..."], "ideal_answer_points": ["..."], "difficulty": "easy|medium|hard"}}"""

    @staticmethod
    def _build_laq_prompt(topic, profile, gaps, focus):
        return f"""Generate 1 Long Answer Question (LAQ) for "{topic.name}" targeting these knowledge gaps:
{json.dumps(gaps)}
Focus areas: {json.dumps(focus)}
Student level: {profile.self_level.value if profile else "average"}

The LAQ should require a detailed, structured answer covering multiple aspects.

Return JSON: {{"question": "...", "expected_structure": ["intro", "main_points", "clinical_relevance", "conclusion"], "ideal_answer_points": ["..."], "difficulty": "medium|hard"}}"""

    @staticmethod
    def _build_mcq_prompt(topic, profile, gaps, focus):
        return f"""Generate 1 Multiple Choice Question (MCQ) for "{topic.name}" targeting these knowledge gaps:
{json.dumps(gaps)}
Focus areas: {json.dumps(focus)}
Student level: {profile.self_level.value if profile else "average"}

Return JSON: {{"question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], "correct_idx": 0, "explanation": "...", "difficulty": "medium|hard"}}"""

    # ── Evaluate Training Answer ──────────────────────────────────────────────

    @classmethod
    def evaluate_training_answer(cls, user_id: str, topic_id: str,
                                  question: str, answer: str,
                                  question_type: str) -> dict:
        """Evaluate a training answer and decide if student should progress."""
        assessment = TopicAssessment.query.filter_by(
            user_id=user_id, topic_id=topic_id).first()
        if not assessment:
            raise NotFoundError("No assessment found")

        topic = db.session.get(Topic, topic_id)

        prompt = f"""Evaluate this {question_type.upper()} answer for "{topic.name}":

Question: {question}
Student's Answer: {answer}

Score from 0-100 and provide feedback. Also indicate if the answer demonstrates understanding.

Return JSON: {{"score": 0, "is_correct": false, "feedback": "...", "key_takeaway": "...", "areas_to_improve": ["..."]}}"""

        try:
            client = cls._get_client()
            response = client.messages.create(
                model="claude-3-5-sonnet-20240620",
                system="You are a supportive NEET-PG tutor. Be encouraging but honest. Return only valid JSON.",
                messages=[
                    {"role": "user", "content": prompt},
                ],
                temperature=0.5,
                max_tokens=800,
            )
            result = json.loads(response.content[0].text)
        except Exception as e:
            log.error("training_eval_failed", error=str(e))
            result = {"score": 50, "is_correct": False, "feedback": "Unable to evaluate",
                      "key_takeaway": "", "areas_to_improve": []}

        # Update assessment progress
        assessment.questions_answered += 1
        if result.get("is_correct") or result.get("score", 0) >= 60:
            assessment.correct_answers += 1

        # Update training progress
        progress = assessment.training_progress or {}
        q_type = assessment.current_question_type.value
        scores = progress.get(f"{q_type}_scores", [])
        scores.append(result.get("score", 0))
        progress[f"{q_type}_scores"] = scores
        progress[f"{q_type}_count"] = len(scores)
        assessment.training_progress = progress

        # Check if should advance question type
        advancement = cls._check_advancement(assessment)
        result["advancement"] = advancement
        result["current_question_type"] = assessment.current_question_type.value
        result["mastery_status"] = assessment.mastery_status.value

        assessment.last_activity = datetime.now(timezone.utc)
        db.session.commit()

        return result

    @classmethod
    def _check_advancement(cls, assessment: TopicAssessment) -> dict:
        """Check if student should advance to next question type or achieve mastery."""
        progress = assessment.training_progress or {}
        current = assessment.current_question_type
        advancement = {"advanced": False, "message": ""}

        # Thresholds: need 3+ correct at ≥60% before advancing
        threshold_count = 3
        threshold_score = 60

        if current == QuestionType.SAQ:
            scores = progress.get("saq_scores", [])
            if len(scores) >= threshold_count:
                avg = sum(scores[-threshold_count:]) / threshold_count
                if avg >= threshold_score:
                    assessment.current_question_type = QuestionType.LAQ
                    advancement = {"advanced": True, "message": "Great progress! Moving to Long Answer Questions."}

        elif current == QuestionType.LAQ:
            scores = progress.get("laq_scores", [])
            if len(scores) >= threshold_count:
                avg = sum(scores[-threshold_count:]) / threshold_count
                if avg >= threshold_score:
                    assessment.current_question_type = QuestionType.MCQ
                    advancement = {"advanced": True, "message": "Excellent! Let's test with MCQs now."}

        elif current == QuestionType.MCQ:
            scores = progress.get("mcq_scores", [])
            if len(scores) >= threshold_count:
                avg = sum(scores[-threshold_count:]) / threshold_count
                if avg >= threshold_score:
                    assessment.mastery_status = MasteryStatus.MASTERED
                    assessment.mastered_at = datetime.now(timezone.utc)
                    advancement = {"advanced": True, "message": "🎉 Topic Mastered! You've demonstrated thorough understanding."}
                    # Schedule spaced revision
                    cls._schedule_revision(assessment)

        if not advancement["advanced"] and assessment.mastery_status != MasteryStatus.MASTERED:
            assessment.mastery_status = MasteryStatus.IN_PROGRESS

        return advancement

    @classmethod
    def _schedule_revision(cls, assessment: TopicAssessment) -> None:
        """Create spaced revision schedule after mastery (1, 3, 7, 14, 30 days)."""
        intervals = [1, 3, 7, 14, 30]
        now = datetime.now(timezone.utc)

        for i, days in enumerate(intervals, 1):
            schedule = RevisionSchedule(
                id=str(uuid.uuid4()),
                user_id=assessment.user_id,
                topic_id=assessment.topic_id,
                scheduled_date=now + timedelta(days=days),
                revision_number=i,
                interval_days=days,
            )
            db.session.add(schedule)
        
        db.session.commit()
        log.info("revision_schedule_created", 
                assessment_id=assessment.id, 
                schedule_count=len(intervals))

    # ── Progress Tracking ─────────────────────────────────────────────────────

    @staticmethod
    def get_progress(user_id: str) -> dict:
        """Get overall mastery progress across all topics."""
        assessments = TopicAssessment.query.filter_by(user_id=user_id).all()
        subjects = Subject.query.filter_by(is_active=True)\
            .order_by(Subject.sort_order).all()

        subject_progress = []
        total_topics = 0
        mastered_topics = 0
        in_progress = 0

        for s in subjects:
            topics = Topic.query.filter_by(subject_id=s.id).all()
            topic_progress = []
            for t in topics:
                total_topics += 1
                a = next((a for a in assessments if a.topic_id == t.id), None)
                status = a.mastery_status.value if a else "not_started"
                if status == "mastered":
                    mastered_topics += 1
                elif status in ("diagnosed", "in_progress"):
                    in_progress += 1

                topic_progress.append({
                    "topic_id": t.id,
                    "topic_name": t.name,
                    "status": status,
                    "diagnostic_score": a.diagnostic_score if a else None,
                    "questions_answered": a.questions_answered if a else 0,
                    "correct_answers": a.correct_answers if a else 0,
                    "current_question_type": a.current_question_type.value if a else "saq",
                })

            subject_progress.append({
                "subject_id": s.id,
                "subject_name": s.name,
                "icon_emoji": s.icon_emoji,
                "color_hex": s.color_hex,
                "topics": topic_progress,
                "total_topics": len(topics),
                "mastered_count": sum(1 for tp in topic_progress if tp["status"] == "mastered"),
            })

        return {
            "total_topics": total_topics,
            "mastered_topics": mastered_topics,
            "in_progress_topics": in_progress,
            "not_started_topics": total_topics - mastered_topics - in_progress,
            "mastery_percentage": round(mastered_topics / total_topics * 100, 1) if total_topics > 0 else 0,
            "subjects": subject_progress,
        }

    @staticmethod
    def get_revision_schedule(user_id: str) -> list:
        """Get upcoming revision schedule."""
        schedules = RevisionSchedule.query.filter_by(
            user_id=user_id, completed=False
        ).order_by(RevisionSchedule.scheduled_date).all()

        result = []
        for s in schedules:
            topic = db.session.get(Topic, s.topic_id)
            data = s.to_dict()
            data["topic_name"] = topic.name if topic else "Unknown"
            data["is_overdue"] = s.scheduled_date < datetime.now(timezone.utc)
            result.append(data)
        return result

    @staticmethod
    def complete_revision(user_id: str, schedule_id: str, score: float) -> dict:
        """Mark a revision as completed with score."""
        schedule = db.session.get(RevisionSchedule, schedule_id)
        if not schedule or schedule.user_id != user_id:
            raise NotFoundError("Revision schedule not found")

        schedule.completed = True
        schedule.completed_at = datetime.now(timezone.utc)
        schedule.score = score
        db.session.commit()
        return schedule.to_dict()
