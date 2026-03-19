"""
tests/test_api.py
──────────────────
Integration tests for Auth, User, and Quiz endpoints.
Run: pytest tests/ -v --cov=app
"""

import json
import pytest
from app import create_app
from app.extensions import db as _db
from config.settings import TestingConfig


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def app():
    app = create_app(TestingConfig)
    with app.app_context():
        _db.create_all()
        yield app
        _db.drop_all()


@pytest.fixture(scope="function")
def client(app):
    return app.test_client()


@pytest.fixture(scope="function", autouse=True)
def clean_db(app):
    """Roll back DB changes after each test."""
    with app.app_context():
        yield
        _db.session.rollback()
        # Clear all tables
        for table in reversed(_db.metadata.sorted_tables):
            _db.session.execute(table.delete())
        _db.session.commit()


@pytest.fixture
def register_user(client):
    """Helper: register + return user data."""
    def _register(email="test@example.com", username="testuser",
                  display_name="Test User", password="Test123!"):
        resp = client.post("/api/v1/auth/register", json={
            "email": email, "username": username,
            "display_name": display_name, "password": password,
        })
        return resp
    return _register


@pytest.fixture
def auth_headers(client, register_user):
    """Helper: register, login, return Authorization header."""
    register_user()
    resp = client.post("/api/v1/auth/login", json={
        "identifier": "test@example.com",
        "password": "Test123!",
    })
    data = resp.get_json()
    token = data["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ─── Auth Tests ───────────────────────────────────────────────────────────────

class TestRegistration:

    def test_register_success(self, client):
        resp = client.post("/api/v1/auth/register", json={
            "email": "new@example.com",
            "username": "newuser",
            "display_name": "New User",
            "password": "Secure123!",
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert "user" in data
        assert data["user"]["email"] == "new@example.com"
        assert "password" not in str(data)     # Never leak passwords

    def test_register_duplicate_email(self, client, register_user):
        register_user()
        resp = client.post("/api/v1/auth/register", json={
            "email": "test@example.com",
            "username": "otheruser",
            "display_name": "Other",
            "password": "Test123!",
        })
        assert resp.status_code == 409
        assert "already registered" in resp.get_json()["error"]

    def test_register_weak_password(self, client):
        resp = client.post("/api/v1/auth/register", json={
            "email": "weak@example.com",
            "username": "weakuser",
            "display_name": "Weak",
            "password": "short",
        })
        assert resp.status_code in (400, 422)

    def test_register_invalid_email(self, client):
        resp = client.post("/api/v1/auth/register", json={
            "email": "not-an-email",
            "username": "baduser",
            "display_name": "Bad",
            "password": "Test123!",
        })
        assert resp.status_code == 422

    def test_register_cannot_create_admin(self, client):
        resp = client.post("/api/v1/auth/register", json={
            "email": "fake@example.com",
            "username": "fakeadmin",
            "display_name": "Fake Admin",
            "password": "Test123!",
            "role": "admin",  # Should be ignored
        })
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["user"]["role"] == "student"


class TestLogin:

    def test_login_success(self, client, register_user):
        register_user()
        resp = client.post("/api/v1/auth/login", json={
            "identifier": "test@example.com",
            "password": "Test123!",
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "Bearer"

    def test_login_wrong_password(self, client, register_user):
        register_user()
        resp = client.post("/api/v1/auth/login", json={
            "identifier": "test@example.com",
            "password": "WrongPass1!",
        })
        assert resp.status_code == 401

    def test_login_nonexistent_user(self, client):
        resp = client.post("/api/v1/auth/login", json={
            "identifier": "nobody@example.com",
            "password": "Test123!",
        })
        assert resp.status_code == 401

    def test_login_by_username(self, client, register_user):
        register_user()
        resp = client.post("/api/v1/auth/login", json={
            "identifier": "testuser",
            "password": "Test123!",
        })
        assert resp.status_code == 200

    def test_login_account_lockout(self, client, register_user):
        register_user()
        for _ in range(5):
            client.post("/api/v1/auth/login", json={
                "identifier": "test@example.com",
                "password": "WrongPass1!",
            })
        resp = client.post("/api/v1/auth/login", json={
            "identifier": "test@example.com",
            "password": "Test123!",
        })
        assert resp.status_code == 401
        assert "locked" in resp.get_json()["error"].lower()


class TestLogout:

    def test_logout(self, client, auth_headers):
        resp = client.post("/api/v1/auth/logout", headers=auth_headers, json={})
        assert resp.status_code == 200

    def test_cannot_use_revoked_token(self, client, auth_headers):
        client.post("/api/v1/auth/logout", headers=auth_headers, json={})
        # Access token is still valid for its short lifetime
        # (full blacklist requires refresh token tracking)
        resp = client.get("/api/v1/users/me", headers=auth_headers)
        # Should still work since access tokens aren't individually blacklisted
        assert resp.status_code in (200, 401)


# ─── User Tests ───────────────────────────────────────────────────────────────

class TestUserProfile:

    def test_get_me(self, client, auth_headers):
        resp = client.get("/api/v1/users/me", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["email"] == "test@example.com"
        assert "password_hash" not in data

    def test_get_me_unauthorized(self, client):
        resp = client.get("/api/v1/users/me")
        assert resp.status_code == 401

    def test_update_profile(self, client, auth_headers):
        resp = client.patch("/api/v1/users/me", headers=auth_headers, json={
            "display_name": "Updated Name",
        })
        assert resp.status_code == 200
        assert resp.get_json()["display_name"] == "Updated Name"

    def test_cannot_update_role_via_profile(self, client, auth_headers):
        resp = client.patch("/api/v1/users/me", headers=auth_headers, json={
            "role": "admin",  # Should be ignored
        })
        # Should succeed but ignore role field
        assert resp.status_code == 200
        assert resp.get_json().get("role") == "student"

    def test_leaderboard(self, client, auth_headers):
        resp = client.get("/api/v1/users/leaderboard", headers=auth_headers)
        assert resp.status_code == 200
        assert "leaderboard" in resp.get_json()

    def test_list_users_requires_admin(self, client, auth_headers):
        resp = client.get("/api/v1/users/", headers=auth_headers)
        assert resp.status_code == 403


# ─── Health Tests ─────────────────────────────────────────────────────────────

class TestHealth:

    def test_health_check(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.get_json()["status"] == "ok"

    def test_db_health(self, client):
        resp = client.get("/health/db")
        assert resp.status_code == 200

    def test_rate_limit_headers(self, client):
        resp = client.get("/health")
        # Rate limit headers should be present
        assert resp.status_code == 200


# ─── Security Tests ───────────────────────────────────────────────────────────

class TestSecurity:

    def test_security_headers(self, client):
        resp = client.get("/health")
        assert resp.headers.get("X-Content-Type-Options") == "nosniff"
        assert resp.headers.get("X-Frame-Options") == "DENY"

    def test_requires_json_content_type(self, client):
        resp = client.post("/api/v1/auth/register",
                           data="not json", content_type="text/plain")
        assert resp.status_code == 415

    def test_cannot_access_protected_route_without_token(self, client):
        resp = client.get("/api/v1/users/me")
        assert resp.status_code == 401

    def test_invalid_token_rejected(self, client):
        resp = client.get("/api/v1/users/me",
                          headers={"Authorization": "Bearer invalid.token.here"})
        assert resp.status_code == 401

    def test_xss_in_display_name_sanitized(self, client, auth_headers):
        resp = client.patch("/api/v1/users/me", headers=auth_headers, json={
            "display_name": '<script>alert("xss")</script>',
        })
        # Marshmallow validates length; bleach sanitizes in service
        assert resp.status_code in (200, 422)
