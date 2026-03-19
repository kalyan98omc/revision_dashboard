"""
app/middleware/security.py
──────────────────────────
Security middleware:
  - JWT token blacklist checks
  - Role-based access control decorators
  - Request sanitization / validation helpers
  - Security headers
"""

from functools import wraps

import structlog
from flask import request, g, jsonify, current_app
from flask_jwt_extended import (
    verify_jwt_in_request, get_jwt_identity, get_jwt,
    JWTManager,
)

from app.extensions import jwt, db
from app.repositories.repositories import TokenRepository, AuditRepository
from app.models.models import UserRole, User

log = structlog.get_logger(__name__)


# ─── JWT Callbacks ────────────────────────────────────────────────────────────

def register_jwt_callbacks(jwt_manager: JWTManager) -> None:
    """Hook JWT events for blacklist checking and custom error responses."""

    @jwt_manager.token_in_blocklist_loader
    def check_if_token_revoked(jwt_header: dict, jwt_payload: dict) -> bool:
        """Called on every protected request. Checks Redis-backed blacklist."""
        jti = jwt_payload.get("jti", "")
        token_type = jwt_payload.get("type")
        if token_type == "refresh":
            return TokenRepository.is_blacklisted(jti)
        # Access tokens aren't individually tracked for performance;
        # their short expiry (60 min) is the revocation mechanism.
        return False

    @jwt_manager.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        return jsonify({"error": "Token has expired", "code": "TOKEN_EXPIRED"}), 401

    @jwt_manager.invalid_token_loader
    def invalid_token_callback(error):
        return jsonify({"error": "Invalid token", "code": "TOKEN_INVALID"}), 401

    @jwt_manager.unauthorized_loader
    def missing_token_callback(error):
        return jsonify({"error": "Authorization required", "code": "TOKEN_MISSING"}), 401

    @jwt_manager.revoked_token_loader
    def revoked_token_callback(jwt_header, jwt_payload):
        return jsonify({"error": "Token has been revoked", "code": "TOKEN_REVOKED"}), 401


# ─── Security Headers ────────────────────────────────────────────────────────

def add_security_headers(response):
    """Attach security headers to every response."""
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(self)"
    if not current_app.debug:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


# ─── RBAC Decorators ─────────────────────────────────────────────────────────

def roles_required(*allowed_roles: UserRole):
    """
    Decorator: require the current user to have one of the given roles.
    Must be used INSIDE @jwt_required().

    Usage:
        @jwt_required()
        @roles_required(UserRole.ADMIN, UserRole.TEACHER)
        def admin_only_view():
            ...
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            claims = get_jwt()
            user_role = claims.get("role")
            allowed_values = {r.value for r in allowed_roles}
            if user_role not in allowed_values:
                AuditRepository.log(
                    "auth.forbidden",
                    user_id=get_jwt_identity(),
                    ip_address=request.remote_addr,
                    payload={"required": list(allowed_values), "actual": user_role},
                )
                db.session.commit()
                return jsonify({"error": "Insufficient permissions", "code": "FORBIDDEN"}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def owner_or_admin(get_resource_user_id):
    """
    Decorator: allow access only if the current user owns the resource or is admin.

    Usage:
        @jwt_required()
        @owner_or_admin(lambda: request.view_args['user_id'])
        def get_user(user_id):
            ...
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            claims = get_jwt()
            current_user_id = get_jwt_identity()
            resource_user_id = get_resource_user_id()
            if current_user_id != resource_user_id and claims.get("role") != UserRole.ADMIN.value:
                return jsonify({"error": "Access denied", "code": "FORBIDDEN"}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator


# ─── Request Helpers ──────────────────────────────────────────────────────────

def get_request_ip() -> str:
    """Extract real client IP, respecting X-Forwarded-For from trusted proxy."""
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # Take the leftmost (client) IP
        return forwarded_for.split(",")[0].strip()
    return request.remote_addr or "unknown"


def get_request_ua() -> str:
    return request.headers.get("User-Agent", "")[:256]


def require_json(fn):
    """Decorator: ensures the request Content-Type is application/json."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not request.is_json:
            return jsonify({"error": "Content-Type must be application/json"}), 415
        return fn(*args, **kwargs)
    return wrapper


def validate_pagination() -> tuple[int, int]:
    """Parse and clamp pagination query params."""
    try:
        page = max(1, int(request.args.get("page", 1)))
        per_page = min(100, max(1, int(request.args.get("per_page", 20))))
    except (ValueError, TypeError):
        page, per_page = 1, 20
    return page, per_page
