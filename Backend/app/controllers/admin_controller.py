"""
app/controllers/admin_controller.py
────────────────────────────────────
Admin API Blueprint — document uploads (RAG), PYQ management, topic CRUD.
All endpoints require admin role.
"""

import structlog
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from marshmallow import Schema, fields, validate, EXCLUDE

from app.services.admin_service import AdminService
from app.services.services import ServiceError, ForbiddenError, NotFoundError
from app.models.models import User, UserRole
from app.extensions import db

log = structlog.get_logger(__name__)

admin_bp = Blueprint("admin", __name__, url_prefix="/api/v1/admin")


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _require_admin():
    """Check if current user is admin."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user or user.role != UserRole.ADMIN:
        raise ForbiddenError("Admin access required")
    return user_id


def _handle_error(e):
    if isinstance(e, (ServiceError, ForbiddenError, NotFoundError)):
        return jsonify({"error": str(e)}), e.http_code
    log.error("admin_error", error=str(e))
    return jsonify({"error": "Internal server error"}), 500


# ─── Validation Schemas ──────────────────────────────────────────────────────

class TopicSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    name = fields.Str(required=True, validate=validate.Length(min=2, max=200))
    description = fields.Str(load_default=None)
    sort_order = fields.Int(load_default=0)
    weightage = fields.Float(load_default=1.0)


class SubTopicSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    name = fields.Str(required=True, validate=validate.Length(min=2, max=200))
    sort_order = fields.Int(load_default=0)


class PYQImportSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    subject_id = fields.Str(required=True)
    questions = fields.List(fields.Dict(), required=True)


# ─── Document Endpoints ──────────────────────────────────────────────────────

@admin_bp.route("/documents/upload", methods=["POST"])
@jwt_required()
def upload_document():
    try:
        user_id = _require_admin()

        if "file" not in request.files:
            return jsonify({"error": "No file provided"}), 400

        file = request.files["file"]
        if not file.filename:
            return jsonify({"error": "Empty filename"}), 400

        subject_id = request.form.get("subject_id")
        description = request.form.get("description")

        result = AdminService.upload_document(
            file_storage=file,
            subject_id=subject_id,
            user_id=user_id,
            description=description,
        )
        return jsonify(result), 201
    except Exception as e:
        return _handle_error(e)


@admin_bp.route("/documents", methods=["GET"])
@jwt_required()
def list_documents():
    try:
        _require_admin()
        subject_id = request.args.get("subject_id")
        page = request.args.get("page", 1, type=int)
        per_page = request.args.get("per_page", 20, type=int)

        result = AdminService.get_documents(
            subject_id=subject_id, page=page, per_page=per_page)
        return jsonify(result), 200
    except Exception as e:
        return _handle_error(e)


@admin_bp.route("/documents/<doc_id>", methods=["DELETE"])
@jwt_required()
def delete_document(doc_id: str):
    try:
        _require_admin()
        AdminService.delete_document(doc_id)
        return jsonify({"message": "Document deleted"}), 200
    except Exception as e:
        return _handle_error(e)


# ─── Subject & Topic Endpoints ───────────────────────────────────────────────

@admin_bp.route("/subjects", methods=["GET"])
@jwt_required()
def get_subjects():
    try:
        _require_admin()
        result = AdminService.get_subjects_with_stats()
        return jsonify({"subjects": result}), 200
    except Exception as e:
        return _handle_error(e)


@admin_bp.route("/subjects/<subject_id>/topics", methods=["GET"])
@jwt_required()
def get_topics(subject_id: str):
    try:
        _require_admin()
        result = AdminService.get_topics(subject_id)
        return jsonify({"topics": result}), 200
    except Exception as e:
        return _handle_error(e)


@admin_bp.route("/subjects/<subject_id>/topics", methods=["POST"])
@jwt_required()
def create_topic(subject_id: str):
    try:
        _require_admin()
        schema = TopicSchema()
        data = schema.load(request.get_json())
        result = AdminService.create_topic(
            subject_id=subject_id,
            name=data["name"],
            description=data.get("description"),
            sort_order=data.get("sort_order", 0),
            weightage=data.get("weightage", 1.0),
        )
        return jsonify(result), 201
    except Exception as e:
        return _handle_error(e)


@admin_bp.route("/topics/<topic_id>/subtopics", methods=["POST"])
@jwt_required()
def create_subtopic(topic_id: str):
    try:
        _require_admin()
        schema = SubTopicSchema()
        data = schema.load(request.get_json())
        result = AdminService.create_subtopic(
            topic_id=topic_id,
            name=data["name"],
            sort_order=data.get("sort_order", 0),
        )
        return jsonify(result), 201
    except Exception as e:
        return _handle_error(e)


# ─── PYQ Endpoints ────────────────────────────────────────────────────────────

@admin_bp.route("/pyqs/import", methods=["POST"])
@jwt_required()
def import_pyqs():
    try:
        _require_admin()
        schema = PYQImportSchema()
        data = schema.load(request.get_json())
        result = AdminService.import_pyqs(
            subject_id=data["subject_id"],
            questions=data["questions"],
        )
        return jsonify(result), 201
    except Exception as e:
        return _handle_error(e)


@admin_bp.route("/pyqs", methods=["GET"])
@jwt_required()
def list_pyqs():
    try:
        _require_admin()
        result = AdminService.get_pyqs(
            subject_id=request.args.get("subject_id"),
            topic_id=request.args.get("topic_id"),
            category=request.args.get("category"),
            page=request.args.get("page", 1, type=int),
            per_page=request.args.get("per_page", 20, type=int),
        )
        return jsonify(result), 200
    except Exception as e:
        return _handle_error(e)


# ─── Dashboard Stats ─────────────────────────────────────────────────────────

@admin_bp.route("/dashboard", methods=["GET"])
@jwt_required()
def dashboard_stats():
    try:
        _require_admin()
        return jsonify(AdminService.get_dashboard_stats()), 200
    except Exception as e:
        return _handle_error(e)


# ─── User Management ─────────────────────────────────────────────────────────

@admin_bp.route("/users", methods=["GET"])
@jwt_required()
def admin_list_users():
    try:
        _require_admin()
        result = AdminService.list_users(
            page=request.args.get("page", 1, type=int),
            per_page=request.args.get("per_page", 20, type=int),
            search=request.args.get("search"),
            role=request.args.get("role"),
            status=request.args.get("status"),
        )
        return jsonify(result), 200
    except Exception as e:
        return _handle_error(e)


@admin_bp.route("/users/<user_id>", methods=["PUT"])
@jwt_required()
def admin_update_user(user_id: str):
    try:
        _require_admin()
        result = AdminService.update_user(user_id, request.get_json())
        return jsonify(result), 200
    except Exception as e:
        return _handle_error(e)


# ─── Subject CRUD ─────────────────────────────────────────────────────────────

@admin_bp.route("/subjects", methods=["POST"])
@jwt_required()
def admin_create_subject():
    try:
        _require_admin()
        result = AdminService.create_subject(request.get_json())
        return jsonify(result), 201
    except Exception as e:
        return _handle_error(e)


@admin_bp.route("/subjects/<subject_id>", methods=["PUT"])
@jwt_required()
def admin_update_subject(subject_id: str):
    try:
        _require_admin()
        result = AdminService.update_subject(subject_id, request.get_json())
        return jsonify(result), 200
    except Exception as e:
        return _handle_error(e)


@admin_bp.route("/subjects/<subject_id>", methods=["DELETE"])
@jwt_required()
def admin_delete_subject(subject_id: str):
    try:
        _require_admin()
        AdminService.delete_subject(subject_id)
        return jsonify({"message": "Subject deactivated"}), 200
    except Exception as e:
        return _handle_error(e)


# ─── Feature Flags ────────────────────────────────────────────────────────────

@admin_bp.route("/features", methods=["GET"])
@jwt_required()
def get_features():
    try:
        _require_admin()
        return jsonify({"features": AdminService.get_feature_flags()}), 200
    except Exception as e:
        return _handle_error(e)


@admin_bp.route("/features/<flag_id>", methods=["PUT"])
@jwt_required()
def update_feature(flag_id: str):
    try:
        _require_admin()
        result = AdminService.update_feature_flag(flag_id, request.get_json())
        return jsonify(result), 200
    except Exception as e:
        return _handle_error(e)


# ─── Model Variants (RAG Training) ───────────────────────────────────────────

@admin_bp.route("/models", methods=["GET"])
@jwt_required()
def list_models():
    try:
        _require_admin()
        return jsonify({"variants": AdminService.list_model_variants()}), 200
    except Exception as e:
        return _handle_error(e)


@admin_bp.route("/models", methods=["POST"])
@jwt_required()
def create_model():
    try:
        user_id = _require_admin()
        result = AdminService.create_model_variant(request.get_json(), user_id)
        return jsonify(result), 201
    except Exception as e:
        return _handle_error(e)


@admin_bp.route("/models/<variant_id>", methods=["PUT"])
@jwt_required()
def update_model(variant_id: str):
    try:
        _require_admin()
        result = AdminService.update_model_variant(variant_id, request.get_json())
        return jsonify(result), 200
    except Exception as e:
        return _handle_error(e)


@admin_bp.route("/models/<variant_id>", methods=["DELETE"])
@jwt_required()
def delete_model(variant_id: str):
    try:
        _require_admin()
        AdminService.delete_model_variant(variant_id)
        return jsonify({"message": "Model variant deleted"}), 200
    except Exception as e:
        return _handle_error(e)


@admin_bp.route("/models/<variant_id>/files", methods=["GET"])
@jwt_required()
def get_model_files(variant_id: str):
    try:
        _require_admin()
        return jsonify({"files": AdminService.get_variant_files(variant_id)}), 200
    except Exception as e:
        return _handle_error(e)


@admin_bp.route("/models/<variant_id>/files", methods=["POST"])
@jwt_required()
def upload_model_file(variant_id: str):
    try:
        _require_admin()
        if "file" not in request.files:
            return jsonify({"error": "No file provided"}), 400
        file = request.files["file"]
        tags = request.form.getlist("tags") or []
        result = AdminService.add_file_to_variant(variant_id, file, tags)
        return jsonify(result), 201
    except Exception as e:
        return _handle_error(e)


@admin_bp.route("/models/<variant_id>/files/<file_id>", methods=["DELETE"])
@jwt_required()
def delete_model_file(variant_id: str, file_id: str):
    try:
        _require_admin()
        AdminService.remove_file_from_variant(variant_id, file_id)
        return jsonify({"message": "File removed"}), 200
    except Exception as e:
        return _handle_error(e)


@admin_bp.route("/models/<variant_id>/deploy", methods=["POST"])
@jwt_required()
def deploy_model(variant_id: str):
    try:
        _require_admin()
        result = AdminService.deploy_variant(variant_id)
        return jsonify(result), 200
    except Exception as e:
        return _handle_error(e)

