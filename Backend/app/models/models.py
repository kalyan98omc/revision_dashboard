"""
app/models/
──────────
Domain Layer — pure data shapes, zero business logic.
All models inherit from a shared TimestampMixin for audit trails.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey,
    Integer, String, Text, UniqueConstraint, Index, Enum as SAEnum,
    JSON, SmallInteger,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, validates
from sqlalchemy.ext.hybrid import hybrid_property

from app.extensions import db, bcrypt


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _uuid():
    return str(uuid.uuid4())


def _now():
    return datetime.now(timezone.utc)


# ─── Mixins ───────────────────────────────────────────────────────────────────

class TimestampMixin:
    """Automatic created_at / updated_at on every model."""
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class SoftDeleteMixin:
    """Marks records as deleted without removing them from the DB."""
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    is_deleted = Column(Boolean, default=False, nullable=False)

    def soft_delete(self):
        self.deleted_at = _now()
        self.is_deleted = True


# ─── Enums ────────────────────────────────────────────────────────────────────

import enum

class UserRole(str, enum.Enum):
    STUDENT = "student"
    TEACHER = "teacher"
    ADMIN   = "admin"

class UserStatus(str, enum.Enum):
    ACTIVE    = "active"
    INACTIVE  = "inactive"
    SUSPENDED = "suspended"
    PENDING   = "pending"      # Email not yet verified

class QuizDifficulty(str, enum.Enum):
    EASY   = "easy"
    MEDIUM = "medium"
    HARD   = "hard"

class MessageRole(str, enum.Enum):
    USER      = "user"
    ASSISTANT = "assistant"
    SYSTEM    = "system"


class StudentGoal(str, enum.Enum):
    TOP_100     = "top_100"
    TOP_1000    = "top_1000"
    SECURE_SEAT = "secure_seat"

class StudentLevel(str, enum.Enum):
    BRIGHT  = "bright"
    AVERAGE = "average"
    WEAK    = "weak"

class PYQCategory(str, enum.Enum):
    CORE       = "core"          # 🔴 Compulsory — high frequency
    FREQUENT   = "frequent"      # 🟠 Frequently tested
    OCCASIONAL = "occasional"    # 🟡 Occasionally tested
    RARE       = "rare"          # ⚪ Rare / obscure

class MasteryStatus(str, enum.Enum):
    NOT_STARTED = "not_started"
    DIAGNOSED   = "diagnosed"    # Diagnostic SAQs completed
    IN_PROGRESS = "in_progress"  # Training questions ongoing
    MASTERED    = "mastered"     # All question layers passed

class QuestionType(str, enum.Enum):
    SAQ = "saq"   # Short Answer Question
    LAQ = "laq"   # Long Answer Question
    MCQ = "mcq"   # Multiple Choice Question

class DocumentStatus(str, enum.Enum):
    UPLOADING  = "uploading"       # File being saved locally
    PROCESSING = "processing"      # Uploading to OpenAI
    INDEXED    = "indexed"         # Successfully stored in vector DB
    READY      = "ready"           # Legacy: same as INDEXED
    FAILED     = "failed"          # Upload/processing error


# ─────────────────────────────────────────────────────────────────────────────
#  USER
# ─────────────────────────────────────────────────────────────────────────────

class User(db.Model, TimestampMixin, SoftDeleteMixin):
    """
    Core user entity. Passwords are NEVER stored in plaintext.
    Sensitive fields (password_hash) are excluded from to_dict().
    """
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("email", name="uq_users_email"),
        UniqueConstraint("username", name="uq_users_username"),
        Index("ix_users_email_active", "email", "is_deleted"),
    )

    # Identity
    id           = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    email        = Column(String(254), nullable=False)          # RFC 5321 limit
    username     = Column(String(30), nullable=False)
    display_name = Column(String(80), nullable=False)
    avatar_url   = Column(String(512), nullable=True)

    # Auth
    password_hash        = Column(String(128), nullable=False)
    role                 = Column(SAEnum(UserRole), default=UserRole.STUDENT, nullable=False)
    status               = Column(SAEnum(UserStatus), default=UserStatus.PENDING, nullable=False)
    email_verified       = Column(Boolean, default=False, nullable=False)
    email_verify_token   = Column(String(128), nullable=True)
    password_reset_token = Column(String(128), nullable=True)
    password_reset_exp   = Column(DateTime(timezone=True), nullable=True)
    totp_secret          = Column(String(64), nullable=True)    # 2FA
    totp_enabled         = Column(Boolean, default=False, nullable=False)

    # Activity
    last_login_at    = Column(DateTime(timezone=True), nullable=True)
    last_login_ip    = Column(String(45), nullable=True)        # IPv6 safe
    login_count      = Column(Integer, default=0, nullable=False)
    failed_login_count = Column(Integer, default=0, nullable=False)
    locked_until     = Column(DateTime(timezone=True), nullable=True)

    # Gamification
    xp_total        = Column(Integer, default=0, nullable=False)
    streak_days     = Column(Integer, default=0, nullable=False)
    streak_last_date = Column(DateTime(timezone=True), nullable=True)

    # Preferences (stored as JSON for flexibility)
    preferences = Column(JSON, default=dict, nullable=False)

    # ── Relationships ──────────────────────────────────────────────────────────
    quiz_attempts    = relationship("UserQuizAttempt", back_populates="user", lazy="dynamic")
    chat_sessions    = relationship("ChatSession", back_populates="user", lazy="dynamic")
    refresh_tokens   = relationship("RefreshToken", back_populates="user", lazy="dynamic", cascade="all, delete-orphan")
    subject_progress = relationship("UserSubjectProgress", back_populates="user", lazy="dynamic", cascade="all, delete-orphan")
    student_profile  = relationship("StudentProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    topic_assessments = relationship("TopicAssessment", back_populates="user", lazy="dynamic", cascade="all, delete-orphan")
    revision_schedules = relationship("RevisionSchedule", back_populates="user", lazy="dynamic", cascade="all, delete-orphan")

    # ── Password handling ─────────────────────────────────────────────────────
    def set_password(self, raw_password: str) -> None:
        """Hash and store password. Raises if password is too weak."""
        if len(raw_password) < 8:
            raise ValueError("Password must be at least 8 characters")
        self.password_hash = bcrypt.generate_password_hash(raw_password).decode("utf-8")

    def check_password(self, raw_password: str) -> bool:
        return bcrypt.check_password_hash(self.password_hash, raw_password)

    @validates("email")
    def validate_email(self, key, value):
        return value.strip().lower()

    @validates("username")
    def validate_username(self, key, value):
        value = value.strip().lower()
        if not value.replace("_", "").replace("-", "").isalnum():
            raise ValueError("Username may only contain letters, numbers, _ and -")
        return value

    @hybrid_property
    def is_locked(self) -> bool:
        if self.locked_until and self.locked_until > _now():
            return True
        return False

    def to_dict(self, include_private: bool = False) -> dict:
        data = {
            "id":           self.id,
            "email":        self.email,
            "username":     self.username,
            "display_name": self.display_name,
            "avatar_url":   self.avatar_url,
            "role":         self.role.value,
            "status":       self.status.value,
            "email_verified": self.email_verified,
            "xp_total":     self.xp_total,
            "streak_days":  self.streak_days,
            "last_login_at": self.last_login_at.isoformat() if self.last_login_at else None,
            "created_at":   self.created_at.isoformat(),
            "preferences":  self.preferences,
        }
        if include_private:
            data.update({
                "login_count":        self.login_count,
                "failed_login_count": self.failed_login_count,
                "totp_enabled":       self.totp_enabled,
                "last_login_ip":      self.last_login_ip,
            })
        return data

    def __repr__(self):
        return f"<User {self.username} [{self.role.value}]>"


# ─────────────────────────────────────────────────────────────────────────────
#  REFRESH TOKEN  (JWT token blacklist + rotation)
# ─────────────────────────────────────────────────────────────────────────────

class RefreshToken(db.Model, TimestampMixin):
    __tablename__ = "refresh_tokens"
    __table_args__ = (
        Index("ix_refresh_tokens_jti", "jti"),
        Index("ix_refresh_tokens_user", "user_id"),
    )

    id         = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    user_id    = Column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    jti        = Column(String(128), nullable=False, unique=True)   # JWT ID
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked    = Column(Boolean, default=False, nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    user_agent = Column(String(256), nullable=True)
    ip_address = Column(String(45), nullable=True)

    user = relationship("User", back_populates="refresh_tokens")

    def revoke(self):
        self.revoked = True
        self.revoked_at = _now()


# ─────────────────────────────────────────────────────────────────────────────
#  SUBJECT
# ─────────────────────────────────────────────────────────────────────────────

class Subject(db.Model, TimestampMixin):
    __tablename__ = "subjects"

    id          = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    name        = Column(String(100), nullable=False, unique=True)
    slug        = Column(String(120), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    icon_emoji  = Column(String(10), nullable=True)
    color_hex   = Column(String(7), nullable=True)
    is_active   = Column(Boolean, default=True, nullable=False)
    sort_order  = Column(SmallInteger, default=0, nullable=False)

    quizzes  = relationship("Quiz", back_populates="subject", lazy="dynamic")
    progress = relationship("UserSubjectProgress", back_populates="subject", lazy="dynamic")
    topics   = relationship("Topic", back_populates="subject", lazy="dynamic", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="subject", lazy="dynamic")
    pyqs     = relationship("PYQ", back_populates="subject", lazy="dynamic")

    def to_dict(self) -> dict:
        return {
            "id": self.id, "name": self.name, "slug": self.slug,
            "description": self.description, "icon_emoji": self.icon_emoji,
            "color_hex": self.color_hex, "is_active": self.is_active,
        }


class UserSubjectProgress(db.Model, TimestampMixin):
    """Tracks per-user mastery per subject (used for spaced repetition)."""
    __tablename__ = "user_subject_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "subject_id", name="uq_user_subject"),
    )

    id            = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    user_id       = Column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    subject_id    = Column(UUID(as_uuid=False), ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    mastery_score = Column(Float, default=0.0, nullable=False)   # 0–100
    quizzes_taken = Column(Integer, default=0, nullable=False)
    avg_score     = Column(Float, default=0.0, nullable=False)
    last_activity = Column(DateTime(timezone=True), nullable=True)

    user    = relationship("User", back_populates="subject_progress")
    subject = relationship("Subject", back_populates="progress")


# ─────────────────────────────────────────────────────────────────────────────
#  QUIZ
# ─────────────────────────────────────────────────────────────────────────────

class Quiz(db.Model, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "quizzes"
    __table_args__ = (
        Index("ix_quizzes_subject", "subject_id"),
        Index("ix_quizzes_active", "is_deleted", "is_published"),
    )

    id          = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    subject_id  = Column(UUID(as_uuid=False), ForeignKey("subjects.id"), nullable=False)
    created_by  = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    title       = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    difficulty  = Column(SAEnum(QuizDifficulty), default=QuizDifficulty.MEDIUM, nullable=False)
    time_limit_seconds = Column(Integer, nullable=True)   # None = no limit
    is_published = Column(Boolean, default=False, nullable=False)
    pass_score   = Column(Float, default=70.0, nullable=False)    # % to pass
    xp_reward    = Column(Integer, default=100, nullable=False)
    tags         = Column(JSON, default=list, nullable=False)

    subject   = relationship("Subject", back_populates="quizzes")
    questions = relationship("QuizQuestion", back_populates="quiz", order_by="QuizQuestion.sort_order", cascade="all, delete-orphan")
    attempts  = relationship("UserQuizAttempt", back_populates="quiz", lazy="dynamic")

    @property
    def question_count(self) -> int:
        return len(self.questions)

    def to_dict(self, include_questions: bool = False) -> dict:
        data = {
            "id": self.id, "title": self.title, "description": self.description,
            "difficulty": self.difficulty.value, "subject": self.subject.to_dict() if self.subject else None,
            "question_count": self.question_count, "time_limit_seconds": self.time_limit_seconds,
            "pass_score": self.pass_score, "xp_reward": self.xp_reward,
            "tags": self.tags, "is_published": self.is_published,
            "created_at": self.created_at.isoformat(),
        }
        if include_questions:
            data["questions"] = [q.to_dict() for q in self.questions]
        return data


class QuizQuestion(db.Model, TimestampMixin):
    __tablename__ = "quiz_questions"

    id          = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    quiz_id     = Column(UUID(as_uuid=False), ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False)
    text        = Column(Text, nullable=False)
    options     = Column(JSON, nullable=False)   # List[str]
    correct_idx = Column(SmallInteger, nullable=False)
    explanation = Column(Text, nullable=True)
    sort_order  = Column(SmallInteger, default=0, nullable=False)
    points      = Column(SmallInteger, default=1, nullable=False)
    # Spaced repetition metadata
    difficulty_rating = Column(Float, default=2.5, nullable=False)   # SM-2 EFactor

    quiz = relationship("Quiz", back_populates="questions")

    def to_dict(self, include_answer: bool = False) -> dict:
        data = {
            "id": self.id, "text": self.text, "options": self.options,
            "explanation": self.explanation if include_answer else None,
            "sort_order": self.sort_order, "points": self.points,
        }
        if include_answer:
            data["correct_idx"] = self.correct_idx
        return data


# ─────────────────────────────────────────────────────────────────────────────
#  QUIZ ATTEMPT
# ─────────────────────────────────────────────────────────────────────────────

class UserQuizAttempt(db.Model, TimestampMixin):
    __tablename__ = "user_quiz_attempts"
    __table_args__ = (
        Index("ix_attempts_user", "user_id"),
        Index("ix_attempts_quiz", "quiz_id"),
    )

    id          = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    user_id     = Column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    quiz_id     = Column(UUID(as_uuid=False), ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False)
    answers     = Column(JSON, nullable=False)    # {question_id: chosen_idx}
    score_pct   = Column(Float, nullable=False)   # 0–100
    score_raw   = Column(Integer, nullable=False)
    max_score   = Column(Integer, nullable=False)
    passed      = Column(Boolean, nullable=False)
    xp_earned   = Column(Integer, default=0, nullable=False)
    time_taken_seconds = Column(Integer, nullable=True)
    completed_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    user = relationship("User", back_populates="quiz_attempts")
    quiz = relationship("Quiz", back_populates="attempts")

    def to_dict(self) -> dict:
        return {
            "id": self.id, "quiz_id": self.quiz_id,
            "score_pct": round(self.score_pct, 2), "score_raw": self.score_raw,
            "max_score": self.max_score, "passed": self.passed,
            "xp_earned": self.xp_earned, "time_taken_seconds": self.time_taken_seconds,
            "answers": self.answers, "completed_at": self.completed_at.isoformat(),
        }


# ─────────────────────────────────────────────────────────────────────────────
#  AI CHAT
# ─────────────────────────────────────────────────────────────────────────────

class ChatSession(db.Model, TimestampMixin):
    __tablename__ = "chat_sessions"
    __table_args__ = (
        Index("ix_chat_sessions_user", "user_id"),
    )

    id         = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    user_id    = Column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title      = Column(String(200), nullable=True)
    subject_id = Column(UUID(as_uuid=False), ForeignKey("subjects.id"), nullable=True)
    is_active  = Column(Boolean, default=True, nullable=False)
    token_count = Column(Integer, default=0, nullable=False)   # Running total for billing
    last_message_at = Column(DateTime(timezone=True), nullable=True)

    user     = relationship("User", back_populates="chat_sessions")
    subject  = relationship("Subject")
    messages = relationship("ChatMessage", back_populates="session", order_by="ChatMessage.created_at", cascade="all, delete-orphan", lazy="dynamic")

    def to_dict(self, include_messages: bool = False) -> dict:
        data = {
            "id": self.id, "title": self.title, "is_active": self.is_active,
            "token_count": self.token_count,
            "last_message_at": self.last_message_at.isoformat() if self.last_message_at else None,
            "created_at": self.created_at.isoformat(),
        }
        if include_messages:
            data["messages"] = [m.to_dict() for m in self.messages]
        return data


class ChatMessage(db.Model, TimestampMixin):
    __tablename__ = "chat_messages"
    __table_args__ = (
        Index("ix_chat_messages_session", "session_id"),
    )

    id         = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    session_id = Column(UUID(as_uuid=False), ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False)
    role       = Column(SAEnum(MessageRole), nullable=False)
    content    = Column(Text, nullable=False)
    token_count = Column(Integer, default=0, nullable=False)
    audio_url  = Column(String(512), nullable=True)   # Whisper input / TTS output
    message_metadata = Column("metadata", JSON, default=dict, nullable=False)   # model, finish_reason etc.

    session = relationship("ChatSession", back_populates="messages")

    def to_dict(self) -> dict:
        return {
            "id": self.id, "role": self.role.value, "content": self.content,
            "token_count": self.token_count, "audio_url": self.audio_url,
            "created_at": self.created_at.isoformat(),
        }


# ─────────────────────────────────────────────────────────────────────────────
#  AUDIT LOG  (immutable — insert-only, never update)
# ─────────────────────────────────────────────────────────────────────────────

class AuditLog(db.Model):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_user", "user_id"),
        Index("ix_audit_action", "action"),
        Index("ix_audit_created", "created_at"),
    )

    id         = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    user_id    = Column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action     = Column(String(100), nullable=False)   # e.g. "user.login", "quiz.attempt"
    resource   = Column(String(100), nullable=True)    # e.g. "quiz:abc-123"
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(256), nullable=True)
    payload    = Column(JSON, default=dict, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)


# ─────────────────────────────────────────────────────────────────────────────
#  NEET-PG: TOPIC HIERARCHY
# ─────────────────────────────────────────────────────────────────────────────

class Topic(db.Model, TimestampMixin):
    """A topic within a NEET-PG subject (e.g., 'Renal Tubular Acidosis' under Medicine)."""
    __tablename__ = "topics"
    __table_args__ = (
        Index("ix_topics_subject", "subject_id"),
        UniqueConstraint("subject_id", "slug", name="uq_topic_subject_slug"),
    )

    id          = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    subject_id  = Column(UUID(as_uuid=False), ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    name        = Column(String(200), nullable=False)
    slug        = Column(String(220), nullable=False)
    description = Column(Text, nullable=True)
    sort_order  = Column(SmallInteger, default=0, nullable=False)
    weightage   = Column(Float, default=1.0, nullable=False)   # Relative importance
    pyq_count   = Column(Integer, default=0, nullable=False)   # Cached PYQ count

    subject   = relationship("Subject", back_populates="topics")
    subtopics = relationship("SubTopic", back_populates="topic", cascade="all, delete-orphan", order_by="SubTopic.sort_order")
    pyqs      = relationship("PYQ", back_populates="topic", lazy="dynamic")

    def to_dict(self) -> dict:
        return {
            "id": self.id, "name": self.name, "slug": self.slug,
            "description": self.description, "sort_order": self.sort_order,
            "weightage": self.weightage, "pyq_count": self.pyq_count,
            "subject_id": self.subject_id,
            "subtopics": [s.to_dict() for s in self.subtopics],
        }


class SubTopic(db.Model, TimestampMixin):
    """Granular sub-topic within a topic."""
    __tablename__ = "subtopics"
    __table_args__ = (
        Index("ix_subtopics_topic", "topic_id"),
    )

    id         = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    topic_id   = Column(UUID(as_uuid=False), ForeignKey("topics.id", ondelete="CASCADE"), nullable=False)
    name       = Column(String(200), nullable=False)
    slug       = Column(String(220), nullable=False)
    sort_order = Column(SmallInteger, default=0, nullable=False)
    pyq_count  = Column(Integer, default=0, nullable=False)

    topic = relationship("Topic", back_populates="subtopics")

    def to_dict(self) -> dict:
        return {
            "id": self.id, "name": self.name, "slug": self.slug,
            "sort_order": self.sort_order, "pyq_count": self.pyq_count,
        }


# ─────────────────────────────────────────────────────────────────────────────
#  NEET-PG: ADMIN DOCUMENT (RAG uploads)
# ─────────────────────────────────────────────────────────────────────────────

class Document(db.Model, TimestampMixin):
    """A document uploaded by admin for OpenAI RAG vector store."""
    __tablename__ = "documents"
    __table_args__ = (
        Index("ix_documents_subject", "subject_id"),
    )

    id              = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    subject_id      = Column(UUID(as_uuid=False), ForeignKey("subjects.id"), nullable=True)
    uploaded_by     = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    filename        = Column(String(300), nullable=False)
    original_name   = Column(String(300), nullable=False)
    file_size_bytes = Column(Integer, nullable=False)
    mime_type       = Column(String(100), nullable=False)
    file_path       = Column(String(512), nullable=False)    # Local path
    openai_file_id  = Column(String(200), nullable=True)     # OpenAI Files API id
    vector_store_id = Column(String(200), nullable=True)     # OpenAI vector store id
    status          = Column(SAEnum(DocumentStatus), default=DocumentStatus.UPLOADING, nullable=False)
    error_message   = Column(Text, nullable=True)
    page_count      = Column(Integer, nullable=True)
    description     = Column(Text, nullable=True)

    subject = relationship("Subject", back_populates="documents")
    uploader = relationship("User")

    def to_dict(self) -> dict:
        return {
            "id": self.id, "subject_id": self.subject_id,
            "filename": self.original_name, "file_size_bytes": self.file_size_bytes,
            "mime_type": self.mime_type, "status": self.status.value,
            "error_message": self.error_message, "page_count": self.page_count,
            "description": self.description, "openai_file_id": self.openai_file_id,
            "created_at": self.created_at.isoformat(),
        }


# ─────────────────────────────────────────────────────────────────────────────
#  NEET-PG: PREVIOUS YEAR QUESTIONS
# ─────────────────────────────────────────────────────────────────────────────

class PYQ(db.Model, TimestampMixin):
    """Previous Year Question with frequency-based categorization."""
    __tablename__ = "pyqs"
    __table_args__ = (
        Index("ix_pyqs_subject", "subject_id"),
        Index("ix_pyqs_topic", "topic_id"),
        Index("ix_pyqs_category", "category"),
    )

    id          = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    subject_id  = Column(UUID(as_uuid=False), ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    topic_id    = Column(UUID(as_uuid=False), ForeignKey("topics.id", ondelete="SET NULL"), nullable=True)
    year        = Column(Integer, nullable=True)               # Exam year
    question    = Column(Text, nullable=False)
    options     = Column(JSON, nullable=True)                  # MCQ options (list of strings)
    correct_idx = Column(SmallInteger, nullable=True)
    explanation = Column(Text, nullable=True)
    category    = Column(SAEnum(PYQCategory), default=PYQCategory.OCCASIONAL, nullable=False)
    times_asked = Column(Integer, default=1, nullable=False)   # How many years this appeared
    difficulty  = Column(SAEnum(QuizDifficulty), default=QuizDifficulty.MEDIUM, nullable=False)
    tags        = Column(JSON, default=list, nullable=False)

    subject = relationship("Subject", back_populates="pyqs")
    topic   = relationship("Topic", back_populates="pyqs")

    def to_dict(self) -> dict:
        return {
            "id": self.id, "subject_id": self.subject_id, "topic_id": self.topic_id,
            "year": self.year, "question": self.question, "options": self.options,
            "correct_idx": self.correct_idx, "explanation": self.explanation,
            "category": self.category.value, "times_asked": self.times_asked,
            "difficulty": self.difficulty.value, "tags": self.tags,
            "created_at": self.created_at.isoformat(),
        }


# ─────────────────────────────────────────────────────────────────────────────
#  NEET-PG: STUDENT PROFILE (prep configuration)
# ─────────────────────────────────────────────────────────────────────────────

class StudentProfile(db.Model, TimestampMixin):
    """Student's preparation configuration for personalized study planning."""
    __tablename__ = "student_profiles"

    id               = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    user_id          = Column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    goal             = Column(SAEnum(StudentGoal), default=StudentGoal.SECURE_SEAT, nullable=False)
    self_level       = Column(SAEnum(StudentLevel), default=StudentLevel.AVERAGE, nullable=False)
    hours_per_day    = Column(Float, default=6.0, nullable=False)
    prep_months      = Column(Integer, default=6, nullable=False)        # Months until exam
    exam_date        = Column(DateTime(timezone=True), nullable=True)
    subject_strengths = Column(JSON, default=dict, nullable=False)       # {subject_id: 1-10 rating}
    overall_strength  = Column(Integer, default=5, nullable=False)       # 1-10 self-rating
    completed_onboarding = Column(Boolean, default=False, nullable=False)
    study_plan       = Column(JSON, default=dict, nullable=False)        # Cached AI-generated plan

    user = relationship("User", back_populates="student_profile")

    def to_dict(self) -> dict:
        return {
            "id": self.id, "user_id": self.user_id,
            "goal": self.goal.value, "self_level": self.self_level.value,
            "hours_per_day": self.hours_per_day, "prep_months": self.prep_months,
            "exam_date": self.exam_date.isoformat() if self.exam_date else None,
            "subject_strengths": self.subject_strengths,
            "overall_strength": self.overall_strength,
            "completed_onboarding": self.completed_onboarding,
            "study_plan": self.study_plan,
            "created_at": self.created_at.isoformat(),
        }


# ─────────────────────────────────────────────────────────────────────────────
#  NEET-PG: TOPIC ASSESSMENT (diagnostic + training + mastery)
# ─────────────────────────────────────────────────────────────────────────────

class TopicAssessment(db.Model, TimestampMixin):
    """Tracks student's diagnostic scores and mastery status per topic."""
    __tablename__ = "topic_assessments"
    __table_args__ = (
        UniqueConstraint("user_id", "topic_id", name="uq_user_topic_assessment"),
        Index("ix_topic_assessments_user", "user_id"),
    )

    id                = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    user_id           = Column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    topic_id          = Column(UUID(as_uuid=False), ForeignKey("topics.id", ondelete="CASCADE"), nullable=False)
    mastery_status    = Column(SAEnum(MasteryStatus), default=MasteryStatus.NOT_STARTED, nullable=False)
    diagnostic_score  = Column(Float, nullable=True)          # 0-100 from initial SAQs
    diagnostic_answers = Column(JSON, default=list, nullable=False)  # [{question, answer, score, feedback}]
    training_progress = Column(JSON, default=dict, nullable=False)   # {saq_done, laq_done, mcq_done, scores}
    current_question_type = Column(SAEnum(QuestionType), default=QuestionType.SAQ, nullable=False)
    questions_answered = Column(Integer, default=0, nullable=False)
    correct_answers    = Column(Integer, default=0, nullable=False)
    ai_feedback       = Column(JSON, default=dict, nullable=False)   # Gap analysis, confusion patterns
    mastered_at       = Column(DateTime(timezone=True), nullable=True)
    last_activity     = Column(DateTime(timezone=True), nullable=True)

    user  = relationship("User", back_populates="topic_assessments")
    topic = relationship("Topic")

    def to_dict(self) -> dict:
        return {
            "id": self.id, "user_id": self.user_id, "topic_id": self.topic_id,
            "mastery_status": self.mastery_status.value,
            "diagnostic_score": self.diagnostic_score,
            "training_progress": self.training_progress,
            "current_question_type": self.current_question_type.value,
            "questions_answered": self.questions_answered,
            "correct_answers": self.correct_answers,
            "ai_feedback": self.ai_feedback,
            "mastered_at": self.mastered_at.isoformat() if self.mastered_at else None,
            "last_activity": self.last_activity.isoformat() if self.last_activity else None,
        }


# ─────────────────────────────────────────────────────────────────────────────
#  NEET-PG: SPACED REVISION SCHEDULE
# ─────────────────────────────────────────────────────────────────────────────

class RevisionSchedule(db.Model, TimestampMixin):
    """Spaced repetition schedule entries for revisiting mastered topics."""
    __tablename__ = "revision_schedules"
    __table_args__ = (
        Index("ix_revision_user", "user_id"),
        Index("ix_revision_due", "scheduled_date"),
    )

    id             = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    user_id        = Column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    topic_id       = Column(UUID(as_uuid=False), ForeignKey("topics.id", ondelete="CASCADE"), nullable=False)
    scheduled_date = Column(DateTime(timezone=True), nullable=False)
    completed      = Column(Boolean, default=False, nullable=False)
    completed_at   = Column(DateTime(timezone=True), nullable=True)
    revision_number = Column(Integer, default=1, nullable=False)  # 1st, 2nd, 3rd revision
    score          = Column(Float, nullable=True)                 # Score on revision quiz
    interval_days  = Column(Integer, default=1, nullable=False)   # Days until next revision

    user  = relationship("User", back_populates="revision_schedules")
    topic = relationship("Topic")

    def to_dict(self) -> dict:
        return {
            "id": self.id, "topic_id": self.topic_id,
            "scheduled_date": self.scheduled_date.isoformat(),
            "completed": self.completed,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "revision_number": self.revision_number,
            "score": self.score, "interval_days": self.interval_days,
        }


# ─────────────────────────────────────────────────────────────────────────────
#  FEATURE FLAGS
# ─────────────────────────────────────────────────────────────────────────────

class FeatureFlag(db.Model, TimestampMixin):
    __tablename__ = "feature_flags"

    id           = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    page_name    = Column(String(50), nullable=False)          # dashboard, studyplan, assessment, etc.
    feature_key  = Column(String(100), nullable=False)         # e.g. "ai_tutor_enabled"
    label        = Column(String(200), nullable=False)         # Human-readable label
    enabled      = Column(Boolean, default=True, nullable=False)
    allowed_roles = Column(JSON, default=list)                 # ["student","teacher"] or ["admin"]
    description  = Column(Text, nullable=True)

    __table_args__ = (
        Index("ix_feature_flags_page", "page_name"),
        db.UniqueConstraint("page_name", "feature_key", name="uq_feature_page_key"),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id, "page_name": self.page_name,
            "feature_key": self.feature_key, "label": self.label,
            "enabled": self.enabled, "allowed_roles": self.allowed_roles or [],
            "description": self.description,
        }


# ─────────────────────────────────────────────────────────────────────────────
#  MODEL VARIANTS  (RAG Training)
# ─────────────────────────────────────────────────────────────────────────────

class ModelVariantStatus(str, enum.Enum):
    DRAFT    = "draft"
    TRAINING = "training"
    READY    = "ready"
    ARCHIVED = "archived"

class ModelVariant(db.Model, TimestampMixin):
    __tablename__ = "model_variants"

    id              = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    name            = Column(String(200), nullable=False)
    description     = Column(Text, nullable=True)
    base_model      = Column(String(100), default="claude-sonnet-4-5", nullable=False)
    system_prompt   = Column(Text, nullable=True)
    vector_store_id = Column(String(200), nullable=True)     # OpenAI vector store ID
    assistant_id    = Column(String(200), nullable=True)     # OpenAI assistant ID
    status          = Column(SAEnum(ModelVariantStatus), default=ModelVariantStatus.DRAFT, nullable=False)
    tags            = Column(JSON, default=list)             # Subject tags like ["anatomy","pathology"]
    assigned_goals  = Column(JSON, default=list)             # ["top_100","secure_seat"]
    assigned_subjects = Column(JSON, default=list)           # Subject IDs
    config          = Column(JSON, default=dict)             # Temperature, max_tokens, etc.
    created_by      = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)

    files = relationship("ModelVariantFile", back_populates="variant", cascade="all, delete-orphan", lazy="dynamic")

    def to_dict(self) -> dict:
        return {
            "id": self.id, "name": self.name, "description": self.description,
            "base_model": self.base_model, "system_prompt": self.system_prompt,
            "vector_store_id": self.vector_store_id, "assistant_id": self.assistant_id,
            "status": self.status.value, "tags": self.tags or [],
            "assigned_goals": self.assigned_goals or [],
            "assigned_subjects": self.assigned_subjects or [],
            "config": self.config or {},
            "file_count": self.files.count() if self.files else 0,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class ModelVariantFile(db.Model, TimestampMixin):
    __tablename__ = "model_variant_files"

    id          = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    variant_id  = Column(UUID(as_uuid=False), ForeignKey("model_variants.id", ondelete="CASCADE"), nullable=False)
    document_id = Column(UUID(as_uuid=False), ForeignKey("documents.id", ondelete="CASCADE"), nullable=True)
    filename    = Column(String(500), nullable=False)
    file_path   = Column(String(1000), nullable=True)
    file_size   = Column(Integer, default=0)
    openai_file_id = Column(String(200), nullable=True)
    tags        = Column(JSON, default=list)

    variant  = relationship("ModelVariant", back_populates="files")
    document = relationship("Document")

    def to_dict(self) -> dict:
        return {
            "id": self.id, "variant_id": self.variant_id,
            "document_id": self.document_id, "filename": self.filename,
            "file_size": self.file_size, "openai_file_id": self.openai_file_id,
            "tags": self.tags or [],
            "created_at": self.created_at.isoformat(),
        }


# ─────────────────────────────────────────────────────────────────────────────
#  QUIZ ENGINE: AI-GENERATED QUIZZES
# ─────────────────────────────────────────────────────────────────────────────

class QuizTemplate(db.Model, TimestampMixin):
    """Templates for generating quizzes from documents."""
    __tablename__ = "quiz_templates"

    id          = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    name        = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    subject_id  = Column(UUID(as_uuid=False), ForeignKey("subjects.id"), nullable=True)
    topic_id    = Column(UUID(as_uuid=False), ForeignKey("topics.id"), nullable=True)
    difficulty  = Column(SAEnum(QuizDifficulty), default=QuizDifficulty.MEDIUM, nullable=False)
    question_count = Column(SmallInteger, default=10, nullable=False)
    time_limit_minutes = Column(SmallInteger, default=15, nullable=False)
    prompt_template = Column(Text, nullable=False)  # Template for OpenAI
    vector_store_id = Column(String(200), nullable=True)  # Pinecone/Chroma index
    is_active   = Column(Boolean, default=True, nullable=False)
    created_by  = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)

    subject = relationship("Subject")
    topic   = relationship("Topic")
    creator = relationship("User")
    generations = relationship("QuizGeneration", back_populates="template", lazy="dynamic")

    def to_dict(self) -> dict:
        return {
            "id": self.id, "name": self.name, "description": self.description,
            "subject_id": self.subject_id, "topic_id": self.topic_id,
            "difficulty": self.difficulty.value, "question_count": self.question_count,
            "time_limit_minutes": self.time_limit_minutes, "is_active": self.is_active,
            "created_at": self.created_at.isoformat(),
        }


class QuizGeneration(db.Model, TimestampMixin):
    """Tracks AI-generated quiz instances."""
    __tablename__ = "quiz_generations"

    id          = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    template_id = Column(UUID(as_uuid=False), ForeignKey("quiz_templates.id", ondelete="CASCADE"), nullable=False)
    user_id     = Column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    quiz_id     = Column(UUID(as_uuid=False), ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=True)
    status      = Column(SAEnum(DocumentStatus), default=DocumentStatus.PROCESSING, nullable=False)
    openai_thread_id = Column(String(200), nullable=True)
    vector_query = Column(Text, nullable=True)  # The query used for vector search
    generated_content = Column(JSON, nullable=True)  # Raw AI response
    error_message = Column(Text, nullable=True)

    template = relationship("QuizTemplate", back_populates="generations")
    user    = relationship("User")
    quiz    = relationship("Quiz")

    def to_dict(self) -> dict:
        return {
            "id": self.id, "template_id": self.template_id, "user_id": self.user_id,
            "quiz_id": self.quiz_id, "status": self.status.value,
            "vector_query": self.vector_query, "error_message": self.error_message,
            "created_at": self.created_at.isoformat(),
        }


class VectorDocument(db.Model, TimestampMixin):
    """Vectorized document chunks for RAG."""
    __tablename__ = "vector_documents"

    id          = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    document_id = Column(UUID(as_uuid=False), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    content     = Column(Text, nullable=False)
    embedding   = Column(JSON, nullable=True)  # Vector embedding
    data_metadata    = Column(JSON, default=dict, nullable=False)  # Page, section, etc.
    vector_store_id = Column(String(200), nullable=True)  # External vector DB ID

    document = relationship("Document")

    def to_dict(self) -> dict:
        return {
            "id": self.id, "document_id": self.document_id, "chunk_index": self.chunk_index,
            "content": self.content[:200] + "..." if len(self.content) > 200 else self.content,
            "metadata": self.data_metadata, "vector_store_id": self.vector_store_id,
        }
