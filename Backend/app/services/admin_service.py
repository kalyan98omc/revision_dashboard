"""
app/services/admin_service.py
─────────────────────────────
Admin Service — handles document uploads to OpenAI RAG vector store,
PYQ management, and topic CRUD operations.
"""

import os
import uuid
import structlog
from typing import Optional
from datetime import datetime, timezone

from openai import OpenAI

from app.extensions import db
from app.models.models import (
    Document, DocumentStatus, Subject, Topic, SubTopic, PYQ,
    PYQCategory, QuizDifficulty, UserRole,
)
from app.services.services import ServiceError, ForbiddenError, NotFoundError

log = structlog.get_logger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
#  ADMIN SERVICE
# ─────────────────────────────────────────────────────────────────────────────

class AdminService:

    _client: Optional[OpenAI] = None
    _vector_store_id: Optional[str] = None
    _assistant_id: Optional[str] = None

    # ── OpenAI Client ─────────────────────────────────────────────────────────

    @classmethod
    def _get_client(cls) -> OpenAI:
        if cls._client is None:
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                raise ServiceError("OPENAI_API_KEY not configured")
            cls._client = OpenAI(api_key=api_key)
        return cls._client

    @classmethod
    def _ensure_vector_store(cls) -> str:
        """Get or create the NEET-PG vector store."""
        if cls._vector_store_id:
            return cls._vector_store_id

        client = cls._get_client()
        # Check if a vector store already exists
        stores = client.vector_stores.list(limit=100)
        for store in stores.data:
            if store.name == "neetpg-revision-docs":
                cls._vector_store_id = store.id
                return cls._vector_store_id

        # Create new vector store
        store = client.vector_stores.create(name="neetpg-revision-docs")
        cls._vector_store_id = store.id
        log.info("created_vector_store", store_id=store.id)
        return cls._vector_store_id

    @classmethod
    def _ensure_assistant(cls) -> str:
        """Get or create the NEET-PG AI assistant with file search enabled."""
        if cls._assistant_id:
            return cls._assistant_id

        client = cls._get_client()
        vector_store_id = cls._ensure_vector_store()

        # Check if assistant already exists
        assistants = client.beta.assistants.list(limit=100)
        for a in assistants.data:
            if a.name == "NEET-PG Revision Assistant":
                cls._assistant_id = a.id
                return cls._assistant_id

        # Create new assistant
        assistant = client.beta.assistants.create(
            name="NEET-PG Revision Assistant",
            instructions="""You are an expert NEET-PG medical exam tutor. You have access to uploaded 
study materials, previous year questions, and medical textbooks through file search.

Your role is to:
1. Generate diagnostic questions (SAQs) to assess student readiness on a topic
2. Evaluate student answers with detailed, constructive feedback
3. Identify knowledge gaps and confusion patterns
4. Generate training questions (SAQ → LAQ → MCQ) adapted to student level
5. Determine topic mastery based on cumulative performance
6. Provide explanations referencing the uploaded study materials

Always be encouraging but honest. Reference specific concepts from the uploaded documents.
Use clinical correlations when relevant. Format responses clearly with headers and bullet points.""",
            model=os.getenv("OPENAI_MODEL", "gpt-4-turbo-preview"),
            tools=[{"type": "file_search"}],
            tool_resources={
                "file_search": {
                    "vector_store_ids": [vector_store_id]
                }
            },
        )
        cls._assistant_id = assistant.id
        log.info("created_assistant", assistant_id=assistant.id)
        return cls._assistant_id

    # ── Document Upload ───────────────────────────────────────────────────────

    @staticmethod
    def upload_document(
        file_storage,          # werkzeug FileStorage
        subject_id: Optional[str],
        user_id: str,
        description: Optional[str] = None,
    ) -> dict:
        """Upload document to local storage and OpenAI vector store for RAG."""
        from flask import current_app

        # Validate subject
        if subject_id:
            subject = db.session.get(Subject, subject_id)
            if not subject:
                raise NotFoundError(f"Subject {subject_id} not found")

        # Save file locally
        upload_dir = current_app.config.get("UPLOAD_FOLDER", "./uploads")
        os.makedirs(upload_dir, exist_ok=True)

        original_name = file_storage.filename or "unknown"
        ext = os.path.splitext(original_name)[1].lower()
        allowed = {".pdf", ".docx", ".doc", ".txt", ".csv", ".json"}
        if ext not in allowed:
            raise ServiceError(f"File type {ext} not allowed. Allowed: {', '.join(allowed)}")

        safe_name = f"{uuid.uuid4().hex}{ext}"
        file_path = os.path.join(upload_dir, safe_name)
        file_storage.save(file_path)
        file_size = os.path.getsize(file_path)

        # Create DB record
        doc = Document(
            id=str(uuid.uuid4()),
            subject_id=subject_id,
            uploaded_by=user_id,
            filename=safe_name,
            original_name=original_name,
            file_size_bytes=file_size,
            mime_type=file_storage.content_type or "application/octet-stream",
            file_path=file_path,
            status=DocumentStatus.PROCESSING,
            description=description,
        )
        db.session.add(doc)
        db.session.flush()

        # Upload to OpenAI
        try:
            client = AdminService._get_client()
            vector_store_id = AdminService._ensure_vector_store()

            # Upload file to OpenAI
            with open(file_path, "rb") as f:
                oai_file = client.files.create(file=f, purpose="assistants")

            doc.openai_file_id = oai_file.id

            # Add to vector store
            client.vector_stores.files.create(
                vector_store_id=vector_store_id,
                file_id=oai_file.id,
            )

            doc.vector_store_id = vector_store_id
            doc.status = DocumentStatus.READY
            log.info("document_uploaded_to_openai",
                     doc_id=doc.id, file_id=oai_file.id)

        except Exception as e:
            doc.status = DocumentStatus.FAILED
            doc.error_message = str(e)
            log.error("openai_upload_failed", doc_id=doc.id, error=str(e))

        db.session.commit()
        return doc.to_dict()

    # ── Document Management ───────────────────────────────────────────────────

    @staticmethod
    def get_documents(subject_id: Optional[str] = None, page: int = 1, per_page: int = 20) -> dict:
        """List uploaded documents, optionally filtered by subject."""
        query = Document.query.order_by(Document.created_at.desc())
        if subject_id:
            query = query.filter_by(subject_id=subject_id)

        paginated = query.paginate(page=page, per_page=per_page, error_out=False)
        return {
            "documents": [d.to_dict() for d in paginated.items],
            "total": paginated.total,
            "page": page,
            "pages": paginated.pages,
        }

    @staticmethod
    def delete_document(doc_id: str) -> None:
        """Delete document from local storage, OpenAI, and database."""
        doc = db.session.get(Document, doc_id)
        if not doc:
            raise NotFoundError("Document not found")

        # Remove from OpenAI
        try:
            if doc.openai_file_id:
                client = AdminService._get_client()
                if doc.vector_store_id:
                    try:
                        client.vector_stores.files.delete(
                            vector_store_id=doc.vector_store_id,
                            file_id=doc.openai_file_id,
                        )
                    except Exception:
                        pass
                client.files.delete(doc.openai_file_id)
        except Exception as e:
            log.warning("openai_delete_failed", doc_id=doc_id, error=str(e))

        # Remove local file
        if os.path.exists(doc.file_path):
            os.remove(doc.file_path)

        db.session.delete(doc)
        db.session.commit()
        log.info("document_deleted", doc_id=doc_id)

    # ── Topic Management ──────────────────────────────────────────────────────

    @staticmethod
    def create_topic(subject_id: str, name: str, description: str = None,
                     sort_order: int = 0, weightage: float = 1.0) -> dict:
        """Create a topic within a subject."""
        subject = db.session.get(Subject, subject_id)
        if not subject:
            raise NotFoundError("Subject not found")

        from slugify import slugify
        slug = slugify(name)

        existing = Topic.query.filter_by(subject_id=subject_id, slug=slug).first()
        if existing:
            raise ServiceError(f"Topic '{name}' already exists in this subject")

        topic = Topic(
            id=str(uuid.uuid4()),
            subject_id=subject_id,
            name=name,
            slug=slug,
            description=description,
            sort_order=sort_order,
            weightage=weightage,
        )
        db.session.add(topic)
        db.session.commit()
        return topic.to_dict()

    @staticmethod
    def get_topics(subject_id: str) -> list:
        """Get all topics for a subject."""
        topics = Topic.query.filter_by(subject_id=subject_id)\
            .order_by(Topic.sort_order).all()
        return [t.to_dict() for t in topics]

    @staticmethod
    def create_subtopic(topic_id: str, name: str, sort_order: int = 0) -> dict:
        """Create a sub-topic within a topic."""
        topic = db.session.get(Topic, topic_id)
        if not topic:
            raise NotFoundError("Topic not found")

        from slugify import slugify
        subtopic = SubTopic(
            id=str(uuid.uuid4()),
            topic_id=topic_id,
            name=name,
            slug=slugify(name),
            sort_order=sort_order,
        )
        db.session.add(subtopic)
        db.session.commit()
        return subtopic.to_dict()

    # ── PYQ Import ────────────────────────────────────────────────────────────

    @staticmethod
    def import_pyqs(subject_id: str, questions: list) -> dict:
        """
        Bulk import PYQs for a subject. Auto-tags by frequency.

        Each question dict should have:
        - question (str, required)
        - options (list[str], optional)
        - correct_idx (int, optional)
        - explanation (str, optional)
        - year (int, optional)
        - topic_id (str, optional)
        - tags (list[str], optional)
        """
        subject = db.session.get(Subject, subject_id)
        if not subject:
            raise NotFoundError("Subject not found")

        imported = []
        for q_data in questions:
            if not q_data.get("question"):
                continue

            pyq = PYQ(
                id=str(uuid.uuid4()),
                subject_id=subject_id,
                topic_id=q_data.get("topic_id"),
                year=q_data.get("year"),
                question=q_data["question"],
                options=q_data.get("options"),
                correct_idx=q_data.get("correct_idx"),
                explanation=q_data.get("explanation"),
                tags=q_data.get("tags", []),
                category=PYQCategory.OCCASIONAL,  # Will be re-tagged below
            )
            db.session.add(pyq)
            imported.append(pyq)

        db.session.flush()

        # Auto-tag PYQs by frequency
        AdminService._auto_tag_pyqs(subject_id)

        db.session.commit()
        return {
            "imported_count": len(imported),
            "subject_id": subject_id,
        }

    @staticmethod
    def _auto_tag_pyqs(subject_id: str) -> None:
        """Categorize PYQs based on frequency of similar questions."""
        pyqs = PYQ.query.filter_by(subject_id=subject_id).all()

        # Count by topic
        topic_counts = {}
        for pyq in pyqs:
            key = pyq.topic_id or "general"
            topic_counts[key] = topic_counts.get(key, 0) + 1

        if not topic_counts:
            return

        max_count = max(topic_counts.values())

        for pyq in pyqs:
            key = pyq.topic_id or "general"
            count = topic_counts[key]
            ratio = count / max_count if max_count > 0 else 0

            if ratio >= 0.7:
                pyq.category = PYQCategory.CORE
            elif ratio >= 0.4:
                pyq.category = PYQCategory.FREQUENT
            elif ratio >= 0.15:
                pyq.category = PYQCategory.OCCASIONAL
            else:
                pyq.category = PYQCategory.RARE

            pyq.times_asked = count

    @staticmethod
    def get_pyqs(subject_id: Optional[str] = None, topic_id: Optional[str] = None,
                 category: Optional[str] = None, page: int = 1, per_page: int = 20) -> dict:
        """List PYQs with filtering."""
        query = PYQ.query
        if subject_id:
            query = query.filter_by(subject_id=subject_id)
        if topic_id:
            query = query.filter_by(topic_id=topic_id)
        if category:
            query = query.filter_by(category=PYQCategory(category))

        query = query.order_by(PYQ.year.desc().nullslast(), PYQ.created_at.desc())
        paginated = query.paginate(page=page, per_page=per_page, error_out=False)

        return {
            "pyqs": [p.to_dict() for p in paginated.items],
            "total": paginated.total,
            "page": page,
            "pages": paginated.pages,
        }

    # ── Get all NEET subjects with stats ──────────────────────────────────────

    @staticmethod
    def get_subjects_with_stats() -> list:
        """Get all subjects with topic counts and PYQ counts."""
        subjects = Subject.query.filter_by(is_active=True)\
            .order_by(Subject.sort_order).all()

        result = []
        for s in subjects:
            data = s.to_dict()
            data["topic_count"] = Topic.query.filter_by(subject_id=s.id).count()
            data["pyq_count"] = PYQ.query.filter_by(subject_id=s.id).count()
            data["document_count"] = Document.query.filter_by(
                subject_id=s.id, status=DocumentStatus.READY).count()
            result.append(data)
        return result

    # ── Dashboard Stats ───────────────────────────────────────────────────────

    @staticmethod
    def get_dashboard_stats() -> dict:
        from app.models.models import (
            User, UserStatus, TopicAssessment, MasteryStatus,
            Quiz, QuizAttempt, ModelVariant,
        )
        from sqlalchemy import func
        from datetime import datetime, timezone, timedelta

        total_users = User.query.filter_by(is_deleted=False).count()
        active_users = User.query.filter(
            User.last_login_at >= datetime.now(timezone.utc) - timedelta(days=1),
            User.is_deleted == False
        ).count()
        total_topics = Topic.query.count()
        mastered = TopicAssessment.query.filter_by(
            mastery_status=MasteryStatus.MASTERED).count()
        total_docs = Document.query.filter_by(status=DocumentStatus.READY).count()
        total_pyqs = PYQ.query.count()
        total_quizzes = Quiz.query.count()

        try:
            total_attempts = QuizAttempt.query.count()
            avg_score = db.session.query(func.avg(QuizAttempt.score_pct)).scalar() or 0
        except Exception:
            total_attempts = 0
            avg_score = 0

        model_variants = 0
        try:
            model_variants = ModelVariant.query.count()
        except Exception:
            pass

        return {
            "total_users": total_users,
            "active_users": active_users,
            "total_topics": total_topics,
            "topics_mastered": mastered,
            "total_documents": total_docs,
            "total_pyqs": total_pyqs,
            "total_quizzes": total_quizzes,
            "total_attempts": total_attempts,
            "avg_score": round(avg_score, 1),
            "model_variants": model_variants,
        }

    # ── User Management ──────────────────────────────────────────────────────

    @staticmethod
    def list_users(page: int = 1, per_page: int = 20, search: str = None,
                   role: str = None, status: str = None) -> dict:
        from app.models.models import User, UserStatus
        query = User.query.filter_by(is_deleted=False)
        if search:
            like = f"%{search}%"
            query = query.filter(
                db.or_(User.email.ilike(like), User.username.ilike(like),
                       User.display_name.ilike(like)))
        if role:
            query = query.filter_by(role=UserRole(role))
        if status:
            query = query.filter_by(status=UserStatus(status))

        query = query.order_by(User.created_at.desc())
        paginated = query.paginate(page=page, per_page=per_page, error_out=False)
        return {
            "users": [u.to_dict(include_private=True) for u in paginated.items],
            "total": paginated.total, "page": page, "pages": paginated.pages,
        }

    @staticmethod
    def update_user(user_id: str, data: dict) -> dict:
        from app.models.models import User, UserStatus
        user = db.session.get(User, user_id)
        if not user:
            raise NotFoundError("User not found")
        if "role" in data:
            user.role = UserRole(data["role"])
        if "status" in data:
            user.status = UserStatus(data["status"])
        db.session.commit()
        return user.to_dict(include_private=True)

    # ── Subject CRUD ─────────────────────────────────────────────────────────

    @staticmethod
    def create_subject(data: dict) -> dict:
        from slugify import slugify
        slug = slugify(data["name"])
        if Subject.query.filter_by(slug=slug).first():
            raise ServiceError(f"Subject '{data['name']}' already exists")
        subject = Subject(
            id=str(uuid.uuid4()), name=data["name"], slug=slug,
            icon_emoji=data.get("icon_emoji", "📚"),
            color_hex=data.get("color_hex", "#6366F1"),
            sort_order=data.get("sort_order", 99),
        )
        db.session.add(subject)
        db.session.commit()
        return subject.to_dict()

    @staticmethod
    def update_subject(subject_id: str, data: dict) -> dict:
        subject = db.session.get(Subject, subject_id)
        if not subject:
            raise NotFoundError("Subject not found")
        for field in ("name", "icon_emoji", "color_hex", "sort_order"):
            if field in data:
                setattr(subject, field, data[field])
        if "name" in data:
            from slugify import slugify
            subject.slug = slugify(data["name"])
        db.session.commit()
        result = subject.to_dict()
        result["topic_count"] = Topic.query.filter_by(subject_id=subject_id).count()
        result["pyq_count"] = PYQ.query.filter_by(subject_id=subject_id).count()
        return result

    @staticmethod
    def delete_subject(subject_id: str) -> None:
        subject = db.session.get(Subject, subject_id)
        if not subject:
            raise NotFoundError("Subject not found")
        subject.is_active = False
        db.session.commit()

    # ── Feature Flags ────────────────────────────────────────────────────────

    @staticmethod
    def get_feature_flags() -> list:
        from app.models.models import FeatureFlag
        flags = FeatureFlag.query.order_by(FeatureFlag.page_name, FeatureFlag.feature_key).all()
        if not flags:
            AdminService._seed_default_flags()
            flags = FeatureFlag.query.order_by(FeatureFlag.page_name, FeatureFlag.feature_key).all()
        return [f.to_dict() for f in flags]

    @staticmethod
    def update_feature_flag(flag_id: str, data: dict) -> dict:
        from app.models.models import FeatureFlag
        flag = db.session.get(FeatureFlag, flag_id)
        if not flag:
            raise NotFoundError("Feature flag not found")
        if "enabled" in data:
            flag.enabled = data["enabled"]
        if "allowed_roles" in data:
            flag.allowed_roles = data["allowed_roles"]
        db.session.commit()
        return flag.to_dict()

    @staticmethod
    def _seed_default_flags():
        from app.models.models import FeatureFlag
        defaults = [
            ("dashboard", "dashboard_stats", "Dashboard Statistics", True, ["student", "teacher", "admin"]),
            ("dashboard", "leaderboard", "Leaderboard", True, ["student", "teacher"]),
            ("studyplan", "ai_study_plan", "AI Study Plan", True, ["student"]),
            ("studyplan", "daily_schedule", "Daily Schedule", True, ["student"]),
            ("assessment", "diagnostic_saq", "Diagnostic SAQ", True, ["student"]),
            ("assessment", "training_flow", "Training Flow (SAQ→LAQ→MCQ)", True, ["student"]),
            ("revision", "spaced_repetition", "Spaced Repetition", True, ["student"]),
            ("revision", "revision_calendar", "Revision Calendar", True, ["student"]),
            ("chat", "ai_tutor", "AI Tutor Chat", True, ["student", "teacher"]),
            ("chat", "voice_input", "Voice Input (Whisper)", True, ["student"]),
            ("quiz", "quiz_engine", "Quiz Engine", True, ["student", "teacher"]),
            ("quiz", "create_quiz", "Create Custom Quiz", True, ["teacher", "admin"]),
            ("settings", "theme_toggle", "Theme Toggle", True, ["student", "teacher", "admin"]),
            ("settings", "profile_edit", "Profile Editing", True, ["student", "teacher", "admin"]),
        ]
        for page, key, label, enabled, roles in defaults:
            flag = FeatureFlag(
                id=str(uuid.uuid4()), page_name=page, feature_key=key,
                label=label, enabled=enabled, allowed_roles=roles,
            )
            db.session.add(flag)
        db.session.commit()

    # ── Model Variants (RAG Training) ────────────────────────────────────────

    @staticmethod
    def list_model_variants() -> list:
        from app.models.models import ModelVariant
        variants = ModelVariant.query.order_by(ModelVariant.created_at.desc()).all()
        return [v.to_dict() for v in variants]

    @staticmethod
    def create_model_variant(data: dict, user_id: str) -> dict:
        from app.models.models import ModelVariant, ModelVariantStatus
        variant = ModelVariant(
            id=str(uuid.uuid4()),
            name=data["name"],
            description=data.get("description"),
            base_model=data.get("base_model", "gpt-4o"),
            system_prompt=data.get("system_prompt"),
            status=ModelVariantStatus.DRAFT,
            tags=data.get("tags", []),
            assigned_goals=data.get("assigned_goals", []),
            assigned_subjects=data.get("assigned_subjects", []),
            config=data.get("config", {"temperature": 0.7, "max_tokens": 4096}),
            created_by=user_id,
        )
        db.session.add(variant)
        db.session.commit()
        return variant.to_dict()

    @staticmethod
    def update_model_variant(variant_id: str, data: dict) -> dict:
        from app.models.models import ModelVariant, ModelVariantStatus
        variant = db.session.get(ModelVariant, variant_id)
        if not variant:
            raise NotFoundError("Model variant not found")
        for field in ("name", "description", "base_model", "system_prompt",
                      "tags", "assigned_goals", "assigned_subjects", "config"):
            if field in data:
                setattr(variant, field, data[field])
        if "status" in data:
            variant.status = ModelVariantStatus(data["status"])
        db.session.commit()
        return variant.to_dict()

    @staticmethod
    def delete_model_variant(variant_id: str) -> None:
        from app.models.models import ModelVariant
        variant = db.session.get(ModelVariant, variant_id)
        if not variant:
            raise NotFoundError("Model variant not found")
        db.session.delete(variant)
        db.session.commit()

    @staticmethod
    def add_file_to_variant(variant_id: str, file_storage, tags: list = None) -> dict:
        from app.models.models import ModelVariant, ModelVariantFile
        from flask import current_app

        variant = db.session.get(ModelVariant, variant_id)
        if not variant:
            raise NotFoundError("Model variant not found")

        upload_dir = current_app.config.get("UPLOAD_FOLDER", "./uploads")
        os.makedirs(upload_dir, exist_ok=True)

        original_name = file_storage.filename or "unknown"
        ext = os.path.splitext(original_name)[1].lower()
        safe_name = f"{uuid.uuid4().hex}{ext}"
        file_path = os.path.join(upload_dir, safe_name)
        file_storage.save(file_path)
        file_size = os.path.getsize(file_path)

        openai_file_id = None
        try:
            client = AdminService._get_client()
            with open(file_path, "rb") as f:
                oai_file = client.files.create(file=f, purpose="assistants")
            openai_file_id = oai_file.id

            if variant.vector_store_id:
                client.vector_stores.files.create(
                    vector_store_id=variant.vector_store_id, file_id=oai_file.id)
        except Exception as e:
            log.warning("variant_file_upload_failed", error=str(e))

        vf = ModelVariantFile(
            id=str(uuid.uuid4()), variant_id=variant_id,
            filename=original_name, file_path=file_path,
            file_size=file_size, openai_file_id=openai_file_id,
            tags=tags or [],
        )
        db.session.add(vf)
        db.session.commit()
        return vf.to_dict()

    @staticmethod
    def remove_file_from_variant(variant_id: str, file_id: str) -> None:
        from app.models.models import ModelVariantFile
        vf = ModelVariantFile.query.filter_by(id=file_id, variant_id=variant_id).first()
        if not vf:
            raise NotFoundError("File not found")
        if vf.file_path and os.path.exists(vf.file_path):
            os.remove(vf.file_path)
        db.session.delete(vf)
        db.session.commit()

    @staticmethod
    def get_variant_files(variant_id: str) -> list:
        from app.models.models import ModelVariantFile
        files = ModelVariantFile.query.filter_by(variant_id=variant_id)\
            .order_by(ModelVariantFile.created_at.desc()).all()
        return [f.to_dict() for f in files]

    @staticmethod
    def deploy_variant(variant_id: str) -> dict:
        """Create/update OpenAI vector store and assistant for this variant."""
        from app.models.models import ModelVariant, ModelVariantFile, ModelVariantStatus

        variant = db.session.get(ModelVariant, variant_id)
        if not variant:
            raise NotFoundError("Model variant not found")

        try:
            client = AdminService._get_client()
            variant.status = ModelVariantStatus.TRAINING
            db.session.commit()

            # Create vector store if needed
            if not variant.vector_store_id:
                store = client.vector_stores.create(name=f"variant-{variant.name}")
                variant.vector_store_id = store.id

            # Upload all files to vector store
            files = ModelVariantFile.query.filter_by(variant_id=variant_id).all()
            for vf in files:
                if vf.openai_file_id and not vf.document_id:
                    try:
                        client.vector_stores.files.create(
                            vector_store_id=variant.vector_store_id,
                            file_id=vf.openai_file_id)
                    except Exception:
                        pass

            # Create assistant
            assistant = client.beta.assistants.create(
                name=f"NEET-PG: {variant.name}",
                instructions=variant.system_prompt or "You are a NEET-PG medical exam tutor.",
                model=variant.base_model,
                tools=[{"type": "file_search"}],
                tool_resources={"file_search": {"vector_store_ids": [variant.vector_store_id]}},
            )
            variant.assistant_id = assistant.id
            variant.status = ModelVariantStatus.READY
            db.session.commit()
            return variant.to_dict()

        except Exception as e:
            variant.status = ModelVariantStatus.DRAFT
            db.session.commit()
            log.error("variant_deploy_failed", error=str(e))
            raise ServiceError(f"Deploy failed: {str(e)}")

