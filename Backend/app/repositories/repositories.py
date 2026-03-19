"""
app/repositories/
──────────────────
Repository Layer — all database I/O lives here.
Services call repositories; repositories call SQLAlchemy.
Swap the ORM or DB engine without touching business logic.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, List, Tuple
import uuid

from sqlalchemy import func, or_, desc, asc
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models.models import (
    User, UserRole, UserStatus,
    RefreshToken, Subject, UserSubjectProgress,
    Quiz, QuizQuestion, UserQuizAttempt,
    ChatSession, ChatMessage, MessageRole,
    AuditLog,
)


def _now():
    return datetime.now(timezone.utc)


# ─────────────────────────────────────────────────────────────────────────────
#  BASE REPOSITORY
# ─────────────────────────────────────────────────────────────────────────────

class BaseRepository:
    """Shared CRUD helpers. Override per-entity as needed."""

    model = None

    @classmethod
    def get_by_id(cls, record_id: str):
        return db.session.get(cls.model, record_id)

    @classmethod
    def get_all(cls, page: int = 1, per_page: int = 20) -> Tuple[list, int]:
        pagination = (
            db.session.query(cls.model)
            .order_by(desc(cls.model.created_at))
            .paginate(page=page, per_page=per_page, error_out=False)
        )
        return pagination.items, pagination.total

    @classmethod
    def save(cls, instance) -> None:
        db.session.add(instance)
        db.session.flush()   # Get ID without committing

    @classmethod
    def commit(cls) -> None:
        db.session.commit()

    @classmethod
    def rollback(cls) -> None:
        db.session.rollback()

    @classmethod
    def delete(cls, instance) -> None:
        db.session.delete(instance)


# ─────────────────────────────────────────────────────────────────────────────
#  USER REPOSITORY
# ─────────────────────────────────────────────────────────────────────────────

class UserRepository(BaseRepository):
    model = User

    # ── Lookups ───────────────────────────────────────────────────────────────

    @staticmethod
    def find_by_email(email: str) -> Optional[User]:
        return (
            db.session.query(User)
            .filter(User.email == email.lower().strip(), User.is_deleted == False)
            .first()
        )

    @staticmethod
    def find_by_username(username: str) -> Optional[User]:
        return (
            db.session.query(User)
            .filter(User.username == username.lower().strip(), User.is_deleted == False)
            .first()
        )

    @staticmethod
    def find_by_email_or_username(identifier: str) -> Optional[User]:
        ident = identifier.lower().strip()
        return (
            db.session.query(User)
            .filter(
                or_(User.email == ident, User.username == ident),
                User.is_deleted == False,
            )
            .first()
        )

    @staticmethod
    def find_by_verify_token(token: str) -> Optional[User]:
        return db.session.query(User).filter(User.email_verify_token == token).first()

    @staticmethod
    def find_by_reset_token(token: str) -> Optional[User]:
        return (
            db.session.query(User)
            .filter(
                User.password_reset_token == token,
                User.password_reset_exp > _now(),
            )
            .first()
        )

    # ── Writes ────────────────────────────────────────────────────────────────

    @staticmethod
    def create(
        email: str,
        username: str,
        display_name: str,
        raw_password: str,
        role: UserRole = UserRole.STUDENT,
    ) -> User:
        user = User(
            id=str(uuid.uuid4()),
            email=email,
            username=username,
            display_name=display_name,
            role=role,
            status=UserStatus.PENDING,
            preferences={},
        )
        user.set_password(raw_password)
        db.session.add(user)
        return user

    @staticmethod
    def record_login(user: User, ip: str, success: bool) -> None:
        if success:
            user.last_login_at = _now()
            user.last_login_ip = ip
            user.login_count += 1
            user.failed_login_count = 0
            user.locked_until = None
        else:
            user.failed_login_count = (user.failed_login_count or 0) + 1
            # Lock after 5 consecutive failures for 15 minutes
            if user.failed_login_count >= 5:
                from datetime import timedelta
                user.locked_until = _now() + timedelta(minutes=15)

    @staticmethod
    def update_streak(user: User) -> None:
        from datetime import timedelta
        today = _now().date()
        if user.streak_last_date:
            last = user.streak_last_date.date()
            if last == today:
                return   # Already updated today
            elif last == today - timedelta(days=1):
                user.streak_days += 1
            else:
                user.streak_days = 1  # Reset
        else:
            user.streak_days = 1
        user.streak_last_date = _now()

    @staticmethod
    def add_xp(user: User, amount: int) -> int:
        user.xp_total = (user.xp_total or 0) + amount
        return user.xp_total

    # ── Pagination / Listing ──────────────────────────────────────────────────

    @staticmethod
    def list_users(
        page: int = 1,
        per_page: int = 20,
        search: Optional[str] = None,
        role: Optional[UserRole] = None,
        status: Optional[UserStatus] = None,
        sort_by: str = "created_at",
        sort_dir: str = "desc",
    ) -> Tuple[List[User], int]:
        q = db.session.query(User).filter(User.is_deleted == False)

        if search:
            like = f"%{search}%"
            q = q.filter(or_(
                User.email.ilike(like),
                User.username.ilike(like),
                User.display_name.ilike(like),
            ))
        if role:
            q = q.filter(User.role == role)
        if status:
            q = q.filter(User.status == status)

        col = getattr(User, sort_by, User.created_at)
        q = q.order_by(desc(col) if sort_dir == "desc" else asc(col))

        pagination = q.paginate(page=page, per_page=per_page, error_out=False)
        return pagination.items, pagination.total

    @staticmethod
    def get_leaderboard(limit: int = 10) -> List[User]:
        return (
            db.session.query(User)
            .filter(User.status == UserStatus.ACTIVE, User.is_deleted == False)
            .order_by(desc(User.xp_total))
            .limit(limit)
            .all()
        )


# ─────────────────────────────────────────────────────────────────────────────
#  TOKEN REPOSITORY
# ─────────────────────────────────────────────────────────────────────────────

class TokenRepository(BaseRepository):
    model = RefreshToken

    @staticmethod
    def create(user_id: str, jti: str, expires_at: datetime, ip: str, ua: str) -> RefreshToken:
        token = RefreshToken(
            id=str(uuid.uuid4()),
            user_id=user_id,
            jti=jti,
            expires_at=expires_at,
            ip_address=ip,
            user_agent=ua,
        )
        db.session.add(token)
        return token

    @staticmethod
    def find_by_jti(jti: str) -> Optional[RefreshToken]:
        return db.session.query(RefreshToken).filter(RefreshToken.jti == jti).first()

    @staticmethod
    def is_blacklisted(jti: str) -> bool:
        token = db.session.query(RefreshToken).filter(RefreshToken.jti == jti).first()
        if token is None:
            return True   # Unknown tokens are treated as blacklisted
        return token.revoked

    @staticmethod
    def revoke_all_for_user(user_id: str) -> int:
        """Logout from all devices."""
        updated = (
            db.session.query(RefreshToken)
            .filter(RefreshToken.user_id == user_id, RefreshToken.revoked == False)
            .update({"revoked": True, "revoked_at": _now()})
        )
        return updated

    @staticmethod
    def cleanup_expired() -> int:
        """Prune expired tokens — run via Celery beat."""
        deleted = (
            db.session.query(RefreshToken)
            .filter(RefreshToken.expires_at < _now())
            .delete()
        )
        return deleted


# ─────────────────────────────────────────────────────────────────────────────
#  QUIZ REPOSITORY
# ─────────────────────────────────────────────────────────────────────────────

class QuizRepository(BaseRepository):
    model = Quiz

    @staticmethod
    def find_published(
        subject_id: Optional[str] = None,
        difficulty: Optional[str] = None,
        page: int = 1,
        per_page: int = 20,
    ) -> Tuple[List[Quiz], int]:
        q = db.session.query(Quiz).filter(
            Quiz.is_published == True,
            Quiz.is_deleted == False,
        )
        if subject_id:
            q = q.filter(Quiz.subject_id == subject_id)
        if difficulty:
            q = q.filter(Quiz.difficulty == difficulty)
        pagination = q.order_by(desc(Quiz.created_at)).paginate(page=page, per_page=per_page, error_out=False)
        return pagination.items, pagination.total

    @staticmethod
    def get_with_questions(quiz_id: str) -> Optional[Quiz]:
        return (
            db.session.query(Quiz)
            .filter(Quiz.id == quiz_id, Quiz.is_deleted == False)
            .first()
        )

    @staticmethod
    def create(
        subject_id: str,
        title: str,
        difficulty: str,
        created_by: str,
        **kwargs,
    ) -> Quiz:
        quiz = Quiz(
            id=str(uuid.uuid4()),
            subject_id=subject_id,
            title=title,
            difficulty=difficulty,
            created_by=created_by,
            **kwargs,
        )
        db.session.add(quiz)
        return quiz


# ─────────────────────────────────────────────────────────────────────────────
#  ATTEMPT REPOSITORY
# ─────────────────────────────────────────────────────────────────────────────

class AttemptRepository(BaseRepository):
    model = UserQuizAttempt

    @staticmethod
    def create(
        user_id: str,
        quiz_id: str,
        answers: dict,
        score_pct: float,
        score_raw: int,
        max_score: int,
        passed: bool,
        xp_earned: int,
        time_taken: Optional[int] = None,
    ) -> UserQuizAttempt:
        attempt = UserQuizAttempt(
            id=str(uuid.uuid4()),
            user_id=user_id,
            quiz_id=quiz_id,
            answers=answers,
            score_pct=score_pct,
            score_raw=score_raw,
            max_score=max_score,
            passed=passed,
            xp_earned=xp_earned,
            time_taken_seconds=time_taken,
        )
        db.session.add(attempt)
        return attempt

    @staticmethod
    def get_user_attempts(user_id: str, quiz_id: Optional[str] = None, limit: int = 20) -> List[UserQuizAttempt]:
        q = db.session.query(UserQuizAttempt).filter(UserQuizAttempt.user_id == user_id)
        if quiz_id:
            q = q.filter(UserQuizAttempt.quiz_id == quiz_id)
        return q.order_by(desc(UserQuizAttempt.completed_at)).limit(limit).all()

    @staticmethod
    def get_stats_for_user(user_id: str) -> dict:
        result = db.session.query(
            func.count(UserQuizAttempt.id).label("total"),
            func.avg(UserQuizAttempt.score_pct).label("avg_score"),
            func.sum(UserQuizAttempt.xp_earned).label("total_xp"),
        ).filter(UserQuizAttempt.user_id == user_id).one()
        return {
            "total_attempts": result.total or 0,
            "avg_score": round(float(result.avg_score or 0), 2),
            "total_xp": result.total_xp or 0,
        }


# ─────────────────────────────────────────────────────────────────────────────
#  CHAT REPOSITORY
# ─────────────────────────────────────────────────────────────────────────────

class ChatRepository(BaseRepository):
    model = ChatSession

    @staticmethod
    def create_session(user_id: str, title: Optional[str] = None, subject_id: Optional[str] = None) -> ChatSession:
        session = ChatSession(
            id=str(uuid.uuid4()),
            user_id=user_id,
            title=title or "New Session",
            subject_id=subject_id,
        )
        db.session.add(session)
        return session

    @staticmethod
    def get_user_sessions(user_id: str, page: int = 1, per_page: int = 20) -> Tuple[List[ChatSession], int]:
        pagination = (
            db.session.query(ChatSession)
            .filter(ChatSession.user_id == user_id, ChatSession.is_active == True)
            .order_by(desc(ChatSession.last_message_at))
            .paginate(page=page, per_page=per_page, error_out=False)
        )
        return pagination.items, pagination.total

    @staticmethod
    def get_session(session_id: str, user_id: str) -> Optional[ChatSession]:
        return (
            db.session.query(ChatSession)
            .filter(ChatSession.id == session_id, ChatSession.user_id == user_id)
            .first()
        )

    @staticmethod
    def add_message(
        session_id: str,
        role: MessageRole,
        content: str,
        token_count: int = 0,
        audio_url: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> ChatMessage:
        msg = ChatMessage(
            id=str(uuid.uuid4()),
            session_id=session_id,
            role=role,
            content=content,
            token_count=token_count,
            audio_url=audio_url,
            metadata=metadata or {},
        )
        db.session.add(msg)
        # Update session token count and last_message_at
        db.session.query(ChatSession).filter(ChatSession.id == session_id).update({
            "token_count": ChatSession.token_count + token_count,
            "last_message_at": _now(),
        })
        return msg

    @staticmethod
    def get_recent_messages(session_id: str, limit: int = 20) -> List[ChatMessage]:
        """Returns messages in chronological order for context window."""
        return (
            db.session.query(ChatMessage)
            .filter(ChatMessage.session_id == session_id)
            .order_by(asc(ChatMessage.created_at))
            .limit(limit)
            .all()
        )


# ─────────────────────────────────────────────────────────────────────────────
#  AUDIT REPOSITORY
# ─────────────────────────────────────────────────────────────────────────────

class AuditRepository:

    @staticmethod
    def log(
        action: str,
        user_id: Optional[str] = None,
        resource: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        payload: Optional[dict] = None,
    ) -> None:
        entry = AuditLog(
            id=str(uuid.uuid4()),
            user_id=user_id,
            action=action,
            resource=resource,
            ip_address=ip_address,
            user_agent=user_agent,
            payload=payload or {},
        )
        db.session.add(entry)
        # Audit inserts don't need to block — flush but let the caller commit


# ─────────────────────────────────────────────────────────────────────────────
#  SUBJECT REPOSITORY
# ─────────────────────────────────────────────────────────────────────────────

class SubjectRepository(BaseRepository):
    model = Subject

    @staticmethod
    def get_all_active() -> List[Subject]:
        return (
            db.session.query(Subject)
            .filter(Subject.is_active == True)
            .order_by(Subject.sort_order)
            .all()
        )

    @staticmethod
    def find_by_slug(slug: str) -> Optional[Subject]:
        return db.session.query(Subject).filter(Subject.slug == slug).first()

    @staticmethod
    def upsert_progress(user_id: str, subject_id: str, new_score: float) -> UserSubjectProgress:
        prog = (
            db.session.query(UserSubjectProgress)
            .filter_by(user_id=user_id, subject_id=subject_id)
            .first()
        )
        if prog is None:
            prog = UserSubjectProgress(
                id=str(uuid.uuid4()),
                user_id=user_id,
                subject_id=subject_id,
            )
            db.session.add(prog)

        # Exponential moving average for mastery score
        alpha = 0.3
        prog.mastery_score = alpha * new_score + (1 - alpha) * prog.mastery_score
        prog.quizzes_taken = (prog.quizzes_taken or 0) + 1
        prog.last_activity = _now()

        n = prog.quizzes_taken
        prog.avg_score = ((prog.avg_score or 0) * (n - 1) + new_score) / n

        return prog
