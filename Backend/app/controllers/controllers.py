"""
app/controllers/
─────────────────
Presentation Layer — Flask Blueprints + SocketIO event handlers.
Controllers: validate input → call service → return response.
No business logic here.
"""

from __future__ import annotations

import structlog
from flask import Blueprint, request, jsonify, stream_with_context, Response
from flask_jwt_extended import (
    jwt_required, get_jwt_identity, get_jwt,
    create_access_token,
)
from flask_socketio import emit, join_room, leave_room, disconnect
from marshmallow import Schema, fields, validate, ValidationError, EXCLUDE

from app.extensions import db, limiter, socketio
from app.services.services import (
    AuthService, UserService, QuizService, ChatService, SubjectService,
    AuthError, ServiceError, NotFoundError, ConflictError, ForbiddenError,
)
from app.middleware.security import (
    roles_required, get_request_ip, get_request_ua,
    require_json, validate_pagination,
)
from app.models.models import UserRole

log = structlog.get_logger(__name__)


# ─── Shared Error Handler ────────────────────────────────────────────────────

def _handle_service_error(e: Exception):
    if isinstance(e, (AuthError,)):
        return jsonify({"error": str(e)}), 401
    if isinstance(e, ForbiddenError):
        return jsonify({"error": str(e)}), 403
    if isinstance(e, NotFoundError):
        return jsonify({"error": str(e)}), 404
    if isinstance(e, ConflictError):
        return jsonify({"error": str(e)}), 409
    if isinstance(e, ServiceError):
        return jsonify({"error": str(e)}), 400
    log.exception("unhandled_error", exc=str(e))
    return jsonify({"error": "Internal server error"}), 500


# ─────────────────────────────────────────────────────────────────────────────
#  VALIDATION SCHEMAS  (Marshmallow)
# ─────────────────────────────────────────────────────────────────────────────

class RegisterSchema(Schema):
    email        = fields.Email(required=True)
    username     = fields.Str(required=True, validate=validate.Length(min=3, max=30))
    display_name = fields.Str(required=True, validate=validate.Length(min=2, max=80))
    password     = fields.Str(required=True, validate=validate.Length(min=8, max=128))
    role         = fields.Str(validate=validate.OneOf(["student", "teacher"]), load_default="student")
    class Meta:
        unknown = EXCLUDE

class LoginSchema(Schema):
    identifier = fields.Str(required=True)  # email or username
    password   = fields.Str(required=True)
    class Meta:
        unknown = EXCLUDE

class PasswordResetRequestSchema(Schema):
    email = fields.Email(required=True)
    class Meta:
        unknown = EXCLUDE

class PasswordResetSchema(Schema):
    token    = fields.Str(required=True)
    password = fields.Str(required=True, validate=validate.Length(min=8, max=128))
    class Meta:
        unknown = EXCLUDE

class QuizAttemptSchema(Schema):
    answers    = fields.Dict(keys=fields.Str(), values=fields.Int(), required=True)
    time_taken = fields.Int(load_default=None)
    class Meta:
        unknown = EXCLUDE

class ChatMessageSchema(Schema):
    message = fields.Str(required=True, validate=validate.Length(min=1, max=4000))
    custom_system_prompt = fields.Str(allow_none=True)
    class Meta:
        unknown = EXCLUDE

class CreateSessionSchema(Schema):
    title      = fields.Str(load_default=None, validate=validate.Length(max=200))
    subject_id = fields.Str(load_default=None)
    class Meta:
        unknown = EXCLUDE

class UpdateProfileSchema(Schema):
    display_name = fields.Str(validate=validate.Length(min=2, max=80))
    avatar_url   = fields.Url(allow_none=True)
    preferences  = fields.Dict(load_default=None)
    class Meta:
        unknown = EXCLUDE


# ─────────────────────────────────────────────────────────────────────────────
#  AUTH BLUEPRINT
# ─────────────────────────────────────────────────────────────────────────────

auth_bp = Blueprint("auth", __name__, url_prefix="/api/v1/auth")

@auth_bp.post("/register")
@limiter.limit("5 per minute")
@require_json
def register():
    try:
        data = RegisterSchema().load(request.get_json())
    except ValidationError as e:
        return jsonify({"error": "Validation failed", "details": e.messages}), 422

    try:
        result = AuthService.register(**data)
        return jsonify({"message": "Account created. Check your email to verify.", "user": result["user"]}), 201
    except Exception as e:
        return _handle_service_error(e)


@auth_bp.post("/login")
@limiter.limit("10 per minute")
@require_json
def login():
    try:
        data = LoginSchema().load(request.get_json())
    except ValidationError as e:
        return jsonify({"error": "Validation failed", "details": e.messages}), 422

    try:
        result = AuthService.login(
            identifier=data["identifier"],
            password=data["password"],
            ip=get_request_ip(),
            user_agent=get_request_ua(),
        )
        return jsonify(result), 200
    except Exception as e:
        return _handle_service_error(e)


@auth_bp.post("/refresh")
@jwt_required(refresh=True)
def refresh():
    try:
        claims = get_jwt()
        result = AuthService.refresh(
            jti=claims["jti"],
            user_id=get_jwt_identity(),
            ip=get_request_ip(),
            user_agent=get_request_ua(),
        )
        return jsonify(result), 200
    except Exception as e:
        return _handle_service_error(e)


@auth_bp.post("/logout")
@jwt_required()
def logout():
    all_devices = request.get_json(silent=True, force=True) or {}
    AuthService.logout(
        jti=get_jwt()["jti"],
        user_id=get_jwt_identity(),
        all_devices=all_devices.get("all_devices", False),
    )
    return jsonify({"message": "Logged out successfully"}), 200


@auth_bp.get("/verify-email/<token>")
def verify_email(token: str):
    try:
        user = AuthService.verify_email(token)
        return jsonify({"message": "Email verified successfully", "user": user.to_dict()}), 200
    except Exception as e:
        return _handle_service_error(e)


@auth_bp.post("/request-password-reset")
@limiter.limit("3 per hour")
@require_json
def request_password_reset():
    try:
        data = PasswordResetRequestSchema().load(request.get_json())
    except ValidationError as e:
        return jsonify({"error": "Validation failed", "details": e.messages}), 422

    # Always return 200 to prevent email enumeration
    AuthService.request_password_reset(data["email"])
    return jsonify({"message": "If an account exists, a reset email has been sent"}), 200


@auth_bp.post("/reset-password")
@limiter.limit("5 per hour")
@require_json
def reset_password():
    try:
        data = PasswordResetSchema().load(request.get_json())
    except ValidationError as e:
        return jsonify({"error": "Validation failed", "details": e.messages}), 422

    try:
        AuthService.reset_password(data["token"], data["password"])
        return jsonify({"message": "Password reset successfully"}), 200
    except Exception as e:
        return _handle_service_error(e)


# ─────────────────────────────────────────────────────────────────────────────
#  USER BLUEPRINT
# ─────────────────────────────────────────────────────────────────────────────

user_bp = Blueprint("users", __name__, url_prefix="/api/v1/users")


@user_bp.get("/me")
@jwt_required()
def get_me():
    try:
        user = UserService.get_profile(get_jwt_identity())
        return jsonify(user.to_dict(include_private=True)), 200
    except Exception as e:
        return _handle_service_error(e)


@user_bp.patch("/me")
@jwt_required()
@require_json
def update_me():
    try:
        data = UpdateProfileSchema().load(request.get_json())
    except ValidationError as e:
        return jsonify({"error": "Validation failed", "details": e.messages}), 422

    try:
        user = UserService.update_profile(get_jwt_identity(), data)
        return jsonify(user.to_dict()), 200
    except Exception as e:
        return _handle_service_error(e)


@user_bp.get("/me/progress")
@jwt_required()
def get_my_progress():
    try:
        progress = SubjectService.get_user_progress(get_jwt_identity())
        stats = QuizService._get_user_stats(get_jwt_identity()) if hasattr(QuizService, '_get_user_stats') else {}
        return jsonify({"subject_progress": progress, "stats": stats}), 200
    except Exception as e:
        return _handle_service_error(e)


@user_bp.get("/leaderboard")
@jwt_required()
def get_leaderboard():
    data = UserService.get_leaderboard()
    return jsonify({"leaderboard": data}), 200


# Admin-only: list all users
@user_bp.get("/")
@jwt_required()
@roles_required(UserRole.ADMIN)
def list_users():
    page, per_page = validate_pagination()
    search = request.args.get("search")
    result = UserService.list_users(page=page, per_page=per_page, search=search)
    return jsonify(result), 200


@user_bp.get("/<user_id>")
@jwt_required()
@roles_required(UserRole.ADMIN, UserRole.TEACHER)
def get_user(user_id: str):
    try:
        user = UserService.get_profile(user_id)
        return jsonify(user.to_dict(include_private=True)), 200
    except Exception as e:
        return _handle_service_error(e)


# ─────────────────────────────────────────────────────────────────────────────
#  QUIZ BLUEPRINT
# ─────────────────────────────────────────────────────────────────────────────

quiz_bp = Blueprint("quizzes", __name__, url_prefix="/api/v1/quizzes")


@quiz_bp.get("/")
@jwt_required()
def list_quizzes():
    page, per_page = validate_pagination()
    subject_id = request.args.get("subject_id")
    difficulty = request.args.get("difficulty")

    try:
        result = QuizService.list_quizzes(
            subject_id=subject_id, difficulty=difficulty,
            page=page, per_page=per_page,
        )
        return jsonify(result), 200
    except Exception as e:
        return _handle_service_error(e)


@quiz_bp.get("/<quiz_id>")
@jwt_required()
def get_quiz(quiz_id: str):
    try:
        data = QuizService.get_quiz_for_attempt(quiz_id)
        return jsonify(data), 200
    except Exception as e:
        return _handle_service_error(e)


@quiz_bp.post("/<quiz_id>/attempt")
@jwt_required()
@limiter.limit("30 per hour")
@require_json
def submit_attempt(quiz_id: str):
    try:
        data = QuizAttemptSchema().load(request.get_json())
    except ValidationError as e:
        return jsonify({"error": "Validation failed", "details": e.messages}), 422

    try:
        result = QuizService.grade_attempt(
            user_id=get_jwt_identity(),
            quiz_id=quiz_id,
            answers=data["answers"],
            time_taken=data.get("time_taken"),
        )
        return jsonify(result), 200
    except Exception as e:
        return _handle_service_error(e)


@quiz_bp.get("/me/attempts")
@jwt_required()
def my_attempts():
    quiz_id = request.args.get("quiz_id")
    from app.repositories.repositories import AttemptRepository
    attempts = AttemptRepository.get_user_attempts(get_jwt_identity(), quiz_id=quiz_id)
    return jsonify({"items": [a.to_dict() for a in attempts]}), 200


# ─────────────────────────────────────────────────────────────────────────────
#  QUIZ ENGINE BLUEPRINT
# ─────────────────────────────────────────────────────────────────────────────

quiz_engine_bp = Blueprint("quiz_engine", __name__, url_prefix="/api/v1/quiz-engine")


@quiz_engine_bp.get("/templates")
@jwt_required()
def list_templates():
    subject_id = request.args.get("subject_id")
    try:
        from app.services.quiz_engine import QuizEngineService
        templates = QuizEngineService.list_templates(subject_id=subject_id)
        return jsonify({"items": templates}), 200
    except Exception as e:
        return _handle_service_error(e)


@quiz_engine_bp.post("/templates")
@jwt_required()
@roles_required(UserRole.ADMIN, UserRole.TEACHER)
@require_json
def create_template():
    try:
        data = CreateQuizTemplateSchema().load(request.get_json())
    except ValidationError as e:
        return jsonify({"error": "Validation failed", "details": e.messages}), 422

    try:
        from app.services.quiz_engine import QuizEngineService
        template = QuizEngineService.create_template(
            created_by=get_jwt_identity(),
            **data
        )
        return jsonify(template), 201
    except Exception as e:
        return _handle_service_error(e)


@quiz_engine_bp.post("/generate")
@jwt_required()
@require_json
def generate_quiz():
    try:
        data = GenerateQuizSchema().load(request.get_json())
    except ValidationError as e:
        return jsonify({"error": "Validation failed", "details": e.messages}), 422

    try:
        from app.services.quiz_engine import QuizEngineService
        result = QuizEngineService.generate_quiz(
            template_id=data["template_id"],
            user_id=get_jwt_identity(),
            custom_query=data.get("custom_query"),
        )
        return jsonify(result), 201
    except Exception as e:
        return _handle_service_error(e)


@quiz_engine_bp.get("/adaptive")
@jwt_required()
def get_adaptive_quiz():
    subject_id = request.args.get("subject_id")
    try:
        from app.services.quiz_engine import QuizEngineService
        quiz = QuizEngineService.get_adaptive_quiz(
            user_id=get_jwt_identity(),
            subject_id=subject_id,
        )
        return jsonify(quiz), 200
    except Exception as e:
        return _handle_service_error(e)


@quiz_engine_bp.get("/me/generations")
@jwt_required()
def my_generations():
    try:
        from app.repositories.repositories import QuizGenerationRepository
        generations = QuizGenerationRepository.get_user_generations(get_jwt_identity())
        return jsonify({"items": [g.to_dict() for g in generations]}), 200
    except Exception as e:
        return _handle_service_error(e)


# ─────────────────────────────────────────────────────────────────────────────
#  VALIDATION SCHEMAS (continued)
# ─────────────────────────────────────────────────────────────────────────────

class CreateQuizTemplateSchema(Schema):
    name = fields.Str(required=True, validate=validate.Length(min=1, max=200))
    description = fields.Str(allow_none=True)
    subject_id = fields.Str(allow_none=True)
    topic_id = fields.Str(allow_none=True)
    difficulty = fields.Str(validate=validate.OneOf(["easy", "medium", "hard"]), load_default="medium")
    question_count = fields.Int(validate=validate.Range(min=5, max=50), load_default=10)
    time_limit_minutes = fields.Int(validate=validate.Range(min=5, max=120), load_default=15)
    prompt_template = fields.Str(allow_none=True)
    class Meta:
        unknown = EXCLUDE

class GenerateQuizSchema(Schema):
    template_id = fields.Str(required=True)
    custom_query = fields.Str(allow_none=True)
    class Meta:
        unknown = EXCLUDE


# ─────────────────────────────────────────────────────────────────────────────
#  CHAT BLUEPRINT (REST endpoints for history / session management)
# ─────────────────────────────────────────────────────────────────────────────

chat_bp = Blueprint("chat", __name__, url_prefix="/api/v1/chat")


@chat_bp.post("/sessions")
@jwt_required()
@require_json
def create_session():
    try:
        data = CreateSessionSchema().load(request.get_json())
    except ValidationError as e:
        return jsonify({"error": "Validation failed", "details": e.messages}), 422

    try:
        session = ChatService.create_session(
            user_id=get_jwt_identity(),
            subject_id=data.get("subject_id"),
            title=data.get("title"),
        )
        return jsonify(session), 201
    except Exception as e:
        return _handle_service_error(e)


@chat_bp.get("/sessions")
@jwt_required()
def list_sessions():
    page, per_page = validate_pagination()
    result = ChatService.get_sessions(get_jwt_identity(), page=page, per_page=per_page)
    return jsonify(result), 200


@chat_bp.get("/sessions/<session_id>")
@jwt_required()
def get_session(session_id: str):
    try:
        data = ChatService.get_session_history(session_id, get_jwt_identity())
        return jsonify(data), 200
    except Exception as e:
        return _handle_service_error(e)


@chat_bp.post("/sessions/<session_id>/stream")
@jwt_required()
@limiter.limit("30 per minute")
@require_json
def stream_chat(session_id: str):
    """
    SSE (Server-Sent Events) streaming endpoint.
    Frontend connects via EventSource or fetch with ReadableStream.
    Each chunk is delivered as `data: <text>\\n\\n`.
    """
    try:
        data = ChatMessageSchema().load(request.get_json())
    except ValidationError as e:
        return jsonify({"error": "Validation failed", "details": e.messages}), 422

    user_id = get_jwt_identity()

    def generate():
        try:
            for chunk in ChatService.stream_response(
                session_id=session_id,
                user_id=user_id,
                user_message=data["message"],
                custom_system_prompt=data.get("custom_system_prompt"),
            ):
                # SSE format
                yield f"data: {chunk}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: [ERROR] {str(e)}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


@chat_bp.post("/sessions/<session_id>/message")
@jwt_required()
@limiter.limit("30 per minute")
@require_json
def send_message(session_id: str):
    """
    Alias for stream_chat endpoint.
    Accepts POST with {"message": "user message"}
    Returns streaming response with text/event-stream or plain text.
    """
    try:
        data = ChatMessageSchema().load(request.get_json())
    except ValidationError as e:
        return jsonify({"error": "Validation failed", "details": e.messages}), 422

    user_id = get_jwt_identity()

    def generate():
        try:
            for chunk in ChatService.stream_response(
                session_id=session_id,
                user_id=user_id,
                user_message=data["message"],
                custom_system_prompt=data.get("custom_system_prompt"),
            ):
                yield chunk

        except Exception as e:
            log.error("stream_error", exc=str(e), session_id=session_id)
            yield f"[ERROR] {str(e)}"

    return Response(
        stream_with_context(generate()),
        mimetype="text/plain; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Transfer-Encoding": "chunked",
        },
    )


@chat_bp.post("/sessions/<session_id>/transcribe")
@jwt_required()
@limiter.limit("10 per minute")
def transcribe_audio(session_id: str):
    """Whisper audio transcription endpoint."""
    if "audio" not in request.files:
        return jsonify({"error": "No audio file provided"}), 400

    audio_file = request.files["audio"]
    if audio_file.filename == "":
        return jsonify({"error": "Empty filename"}), 400

    # Validate file size (max 25MB per Whisper limit)
    audio_bytes = audio_file.read()
    if len(audio_bytes) > 25 * 1024 * 1024:
        return jsonify({"error": "Audio file too large (max 25MB)"}), 413

    try:
        result = ChatService.transcribe_audio(
            session_id=session_id,
            user_id=get_jwt_identity(),
            audio_bytes=audio_bytes,
            filename=audio_file.filename,
        )
        return jsonify(result), 200
    except Exception as e:
        return _handle_service_error(e)


@chat_bp.post("/realtime/token")
@jwt_required()
@limiter.limit("10 per minute")
def create_realtime_token():
    """
    Create an ephemeral OpenAI Realtime API session token.
    The frontend uses this short-lived key to connect directly to OpenAI's
    WebSocket endpoint without exposing the main API key in the browser.
    """
    return jsonify({
        "error": "Realtime audio is currently unsupported in the new Socrates Engine Architecture."
    }), 503


# ─────────────────────────────────────────────────────────────────────────────
#  SUBJECT BLUEPRINT
# ─────────────────────────────────────────────────────────────────────────────

subject_bp = Blueprint("subjects", __name__, url_prefix="/api/v1/subjects")


@subject_bp.get("", strict_slashes=False)
@subject_bp.get("/", strict_slashes=False)
@jwt_required()
def list_subjects():
    subjects = SubjectService.get_all()
    return jsonify({"items": subjects}), 200


# ─────────────────────────────────────────────────────────────────────────────
#  HEALTH CHECK BLUEPRINT
# ─────────────────────────────────────────────────────────────────────────────

health_bp = Blueprint("health", __name__)


@health_bp.get("/health")
def health_check():
    return jsonify({
        "status": "ok",
        "service": "ApexLearn API",
        "version": "1.0.0",
    }), 200


@health_bp.get("/health/db")
def db_health():
    try:
        db.session.execute(db.text("SELECT 1"))
        return jsonify({"status": "ok", "database": "connected"}), 200
    except Exception as e:
        return jsonify({"status": "error", "database": str(e)}), 503


# ─────────────────────────────────────────────────────────────────────────────
#  WEBSOCKET HANDLERS  (SocketIO)
# ─────────────────────────────────────────────────────────────────────────────

# Track connected users for concurrency metrics
_connected_users: dict[str, str] = {}   # socket_id → user_id


def register_socket_handlers(sio):
    """
    Register all SocketIO event handlers.
    Called once during app factory setup.

    Authentication: clients send their JWT access token in the
    connection handshake `auth` dict: { token: "Bearer <access_token>" }
    """

    @sio.on("connect")
    def on_connect(auth):
        """Validate JWT on WebSocket connect."""
        if not auth or "token" not in auth:
            log.warning("ws.connect_rejected", reason="no_token")
            return False   # Reject connection

        try:
            from flask_jwt_extended import decode_token
            from app.repositories.repositories import UserRepository
            raw = auth["token"].replace("Bearer ", "")
            payload = decode_token(raw)
            user_id = payload["sub"]

            user = UserRepository.get_by_id(user_id)
            if not user or user.is_deleted:
                return False

            from flask_socketio import request as socket_request
            sid = socket_request.sid
            _connected_users[sid] = user_id

            # Join a personal room so we can target this user
            join_room(f"user:{user_id}")
            emit("connected", {"user_id": user_id, "message": "Connected to ApexLearn"})
            log.info("ws.connected", user_id=user_id, sid=sid)

        except Exception as e:
            log.warning("ws.connect_error", error=str(e))
            return False

    @sio.on("disconnect")
    def on_disconnect():
        from flask_socketio import request as socket_request
        sid = socket_request.sid
        user_id = _connected_users.pop(sid, None)
        if user_id:
            leave_room(f"user:{user_id}")
            log.info("ws.disconnected", user_id=user_id, sid=sid)

    @sio.on("chat:message")
    def on_chat_message(data: dict):
        """
        Real-time chat via WebSocket (alternative to SSE streaming).
        Client sends: { session_id, message }
        Server streams: chat:chunk events, then chat:done
        """
        from flask_socketio import request as socket_request
        sid = socket_request.sid
        user_id = _connected_users.get(sid)

        if not user_id:
            emit("error", {"message": "Not authenticated"})
            return

        session_id = data.get("session_id")
        message = data.get("message", "").strip()

        if not session_id or not message:
            emit("error", {"message": "session_id and message are required"})
            return

        # Emit typing indicator to this user's room
        sio.emit("chat:typing", {"session_id": session_id}, room=f"user:{user_id}")

        try:
            for chunk in ChatService.stream_response(
                session_id=session_id,
                user_id=user_id,
                user_message=message,
            ):
                # Emit each chunk back to the specific user room
                sio.emit(
                    "chat:chunk",
                    {"session_id": session_id, "chunk": chunk},
                    room=f"user:{user_id}",
                )

            sio.emit("chat:done", {"session_id": session_id}, room=f"user:{user_id}")

        except Exception as e:
            log.error("ws.chat_error", error=str(e), user_id=user_id)
            sio.emit(
                "chat:error",
                {"session_id": session_id, "message": str(e)},
                room=f"user:{user_id}",
            )

    @sio.on("quiz:join")
    def on_quiz_join(data: dict):
        """Join a shared quiz room for live leaderboard updates."""
        from flask_socketio import request as socket_request
        sid = socket_request.sid
        user_id = _connected_users.get(sid)
        if not user_id:
            return

        quiz_id = data.get("quiz_id")
        if quiz_id:
            join_room(f"quiz:{quiz_id}")
            emit("quiz:joined", {"quiz_id": quiz_id})

    @sio.on("presence:ping")
    def on_presence_ping():
        """Heartbeat — client sends this every 30s."""
        emit("presence:pong", {"online_count": len(_connected_users)})

    @sio.on_error_default
    def on_socket_error(e):
        log.error("ws.error", error=str(e))
