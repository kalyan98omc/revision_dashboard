"""
app/controllers/revision_controller.py
───────────────────────────────────────
Revision API Blueprint — student profile, study plan, diagnostic assessment,
training questions, progress tracking, and revision scheduling.
"""

import structlog
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from marshmallow import Schema, fields, validate, EXCLUDE

from app.services.revision_service import RevisionService
from app.services.services import ServiceError, NotFoundError

log = structlog.get_logger(__name__)

revision_bp = Blueprint("revision", __name__, url_prefix="/api/v1/revision")


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _handle_error(e):
    if isinstance(e, (ServiceError, NotFoundError)):
        return jsonify({"error": str(e)}), e.http_code
    log.error("revision_error", error=str(e))
    return jsonify({"error": "Internal server error"}), 500


# ─── Validation Schemas ──────────────────────────────────────────────────────

class StudentProfileSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    goal = fields.Str(validate=validate.OneOf(["top_100", "top_1000", "secure_seat"]))
    self_level = fields.Str(validate=validate.OneOf(["bright", "average", "weak"]))
    hours_per_day = fields.Float(validate=validate.Range(min=1, max=18))
    prep_months = fields.Int(validate=validate.Range(min=1, max=36))
    exam_date = fields.Str(load_default=None)
    subject_strengths = fields.Dict(keys=fields.Str(), values=fields.Int(), load_default=None)
    overall_strength = fields.Int(validate=validate.Range(min=1, max=10), load_default=None)


class DiagnosticSubmitSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    answers = fields.List(fields.Dict(), required=True)


class TrainingSubmitSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    question = fields.Str(required=True)
    answer = fields.Str(required=True)
    question_type = fields.Str(
        required=True,
        validate=validate.OneOf(["saq", "laq", "mcq"]))


# ─── Student Profile ─────────────────────────────────────────────────────────

@revision_bp.route("/profile", methods=["POST"])
@jwt_required()
def save_profile():
    try:
        user_id = get_jwt_identity()
        schema = StudentProfileSchema()
        data = schema.load(request.get_json())
        result = RevisionService.create_or_update_profile(user_id, data)
        return jsonify(result), 200
    except Exception as e:
        return _handle_error(e)


@revision_bp.route("/profile", methods=["GET"])
@jwt_required()
def get_profile():
    try:
        user_id = get_jwt_identity()
        result = RevisionService.get_profile(user_id)
        if not result:
            return jsonify({"completed_onboarding": False}), 200
        return jsonify(result), 200
    except Exception as e:
        return _handle_error(e)


# ─── Study Plan ───────────────────────────────────────────────────────────────

@revision_bp.route("/study-plan", methods=["GET"])
@jwt_required()
def get_study_plan():
    try:
        user_id = get_jwt_identity()
        result = RevisionService.generate_study_plan(user_id)
        return jsonify(result), 200
    except Exception as e:
        return _handle_error(e)


# ─── Diagnostic Assessment ───────────────────────────────────────────────────

@revision_bp.route("/assess/<topic_id>", methods=["POST"])
@jwt_required()
def start_assessment(topic_id: str):
    try:
        user_id = get_jwt_identity()
        result = RevisionService.start_diagnostic(user_id, topic_id)
        return jsonify(result), 200
    except Exception as e:
        return _handle_error(e)


@revision_bp.route("/assess/<topic_id>/submit", methods=["POST"])
@jwt_required()
def submit_diagnostic(topic_id: str):
    try:
        user_id = get_jwt_identity()
        schema = DiagnosticSubmitSchema()
        data = schema.load(request.get_json())
        result = RevisionService.evaluate_diagnostic(
            user_id, topic_id, data["answers"])
        return jsonify(result), 200
    except Exception as e:
        return _handle_error(e)


# ─── Training Questions ──────────────────────────────────────────────────────

@revision_bp.route("/train/<topic_id>", methods=["GET"])
@jwt_required()
def get_training_question(topic_id: str):
    try:
        user_id = get_jwt_identity()
        result = RevisionService.get_training_question(user_id, topic_id)
        return jsonify(result), 200
    except Exception as e:
        return _handle_error(e)


@revision_bp.route("/train/<topic_id>/submit", methods=["POST"])
@jwt_required()
def submit_training_answer(topic_id: str):
    try:
        user_id = get_jwt_identity()
        schema = TrainingSubmitSchema()
        data = schema.load(request.get_json())
        result = RevisionService.evaluate_training_answer(
            user_id=user_id,
            topic_id=topic_id,
            question=data["question"],
            answer=data["answer"],
            question_type=data["question_type"],
        )
        return jsonify(result), 200
    except Exception as e:
        return _handle_error(e)


# ─── Progress & Schedule ─────────────────────────────────────────────────────

@revision_bp.route("/progress", methods=["GET"])
@jwt_required()
def get_progress():
    try:
        user_id = get_jwt_identity()
        result = RevisionService.get_progress(user_id)
        return jsonify(result), 200
    except Exception as e:
        return _handle_error(e)


@revision_bp.route("/schedule", methods=["GET"])
@jwt_required()
def get_schedule():
    try:
        user_id = get_jwt_identity()
        result = RevisionService.get_revision_schedule(user_id)
        return jsonify({"schedules": result}), 200
    except Exception as e:
        return _handle_error(e)


@revision_bp.route("/schedule/<schedule_id>/complete", methods=["POST"])
@jwt_required()
def complete_revision(schedule_id: str):
    try:
        user_id = get_jwt_identity()
        score = request.get_json().get("score", 0)
        result = RevisionService.complete_revision(user_id, schedule_id, score)
        return jsonify(result), 200
    except Exception as e:
        return _handle_error(e)
