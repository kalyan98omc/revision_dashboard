"""
app/__init__.py
───────────────
Application Factory Pattern.
- Prevents circular imports
- Enables multiple app instances (testing)
- All extensions initialized here
"""

from __future__ import annotations

import logging
import os

import structlog
from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException

from config.settings import get_config
from app.extensions import db, jwt, bcrypt, socketio, limiter, cache, cors


def create_app(config=None) -> Flask:
    app = Flask(__name__)

    # ── Load Config ───────────────────────────────────────────────────────────
    cfg = config or get_config()
    app.config.from_object(cfg)

    # ── Ensure upload directory exists ────────────────────────────────────────
    os.makedirs(app.config.get("UPLOAD_FOLDER", "./uploads"), exist_ok=True)

    # ── Initialize Extensions ─────────────────────────────────────────────────
    _init_extensions(app)

    # ── Register Blueprints ───────────────────────────────────────────────────
    _register_blueprints(app)

    # ── Register SocketIO Handlers ────────────────────────────────────────────
    _register_socketio(app)

    # ── Register Error Handlers ───────────────────────────────────────────────
    _register_error_handlers(app)

    # ── Security Headers ──────────────────────────────────────────────────────
    from app.middleware.security import add_security_headers
    app.after_request(add_security_headers)

    # ── Structured Logging ────────────────────────────────────────────────────
    _configure_logging(app)

    # ── JWT Callbacks ─────────────────────────────────────────────────────────
    from app.middleware.security import register_jwt_callbacks
    register_jwt_callbacks(jwt)


    # ── CLI Commands ────────────────────────────────────────────────────────────
    from seed import register_cli_commands
    register_cli_commands(app)

    app.logger.info("ApexLearn API initialized", extra={"env": os.getenv("FLASK_ENV")})
    return app


def _init_extensions(app: Flask) -> None:
    db.init_app(app)
    jwt.init_app(app)
    bcrypt.init_app(app)
    limiter.init_app(app)
    cache.init_app(app)

    cors.init_app(
        app,
        resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}},
        supports_credentials=True,
    )

    # SocketIO with Redis message queue for horizontal scaling
    socketio.init_app(
        app,
        message_queue=app.config.get("SOCKETIO_MESSAGE_QUEUE"),
        cors_allowed_origins=app.config["CORS_ORIGINS"],
        ping_timeout=app.config.get("SOCKETIO_PING_TIMEOUT", 20),
        ping_interval=app.config.get("SOCKETIO_PING_INTERVAL", 25),
        async_mode="eventlet",           # Eventlet for concurrent WebSocket handling
        logger=False,
        engineio_logger=False,
    )


def _register_blueprints(app: Flask) -> None:
    from app.controllers.controllers import (
        auth_bp, user_bp, quiz_bp, chat_bp, subject_bp, health_bp,
    )
    from app.controllers.admin_controller import admin_bp
    from app.controllers.revision_controller import revision_bp

    for blueprint in (auth_bp, user_bp, quiz_bp, chat_bp, subject_bp,
                      health_bp, admin_bp, revision_bp):
        app.register_blueprint(blueprint)


def _register_socketio(app: Flask) -> None:
    from app.controllers.controllers import register_socket_handlers
    with app.app_context():
        register_socket_handlers(socketio)


def _register_error_handlers(app: Flask) -> None:
    """Global error handlers for unhandled exceptions."""

    @app.errorhandler(400)
    def bad_request(e):
        return jsonify({"error": "Bad request", "message": str(e)}), 400

    @app.errorhandler(401)
    def unauthorized(e):
        return jsonify({"error": "Unauthorized"}), 401

    @app.errorhandler(403)
    def forbidden(e):
        return jsonify({"error": "Forbidden"}), 403

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return jsonify({"error": "Method not allowed"}), 405

    @app.errorhandler(413)
    def payload_too_large(e):
        return jsonify({"error": "Payload too large"}), 413

    @app.errorhandler(429)
    def rate_limit_exceeded(e):
        return jsonify({"error": "Rate limit exceeded. Slow down.", "retry_after": str(e.retry_after)}), 429

    @app.errorhandler(500)
    def internal_error(e):
        db.session.rollback()
        structlog.get_logger().error("internal_error", error=str(e))
        return jsonify({"error": "Internal server error"}), 500

    @app.errorhandler(HTTPException)
    def handle_http_exception(e):
        return jsonify({"error": e.name, "message": e.description}), e.code


def _configure_logging(app: Flask) -> None:
    level = getattr(logging, app.config.get("LOG_LEVEL", "INFO").upper(), logging.INFO)

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer() if app.debug else structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
    )

    # Suppress noisy libs in production
    if not app.debug:
        logging.getLogger("werkzeug").setLevel(logging.WARNING)
        logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
