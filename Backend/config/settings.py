"""
config/settings.py
──────────────────
Layered configuration using environment variables.
All secrets are loaded exclusively from environment — never hardcoded.
"""

import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()


class BaseConfig:
    """Shared defaults for all environments."""

    # ── Flask ─────────────────────────────────────────────────────────────────
    SECRET_KEY: str = os.environ["SECRET_KEY"]
    MAX_CONTENT_LENGTH: int = int(os.getenv("MAX_CONTENT_LENGTH_MB", 10)) * 1024 * 1024
    JSON_SORT_KEYS = False

    # ── Database ──────────────────────────────────────────────────────────────
    SQLALCHEMY_DATABASE_URI: str = os.environ["DATABASE_URL"]
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_size": int(os.getenv("DB_POOL_SIZE", 20)),
        "max_overflow": int(os.getenv("DB_MAX_OVERFLOW", 40)),
        "pool_timeout": int(os.getenv("DB_POOL_TIMEOUT", 30)),
        "pool_recycle": int(os.getenv("DB_POOL_RECYCLE", 3600)),
        "pool_pre_ping": True,          # Auto-reconnect on stale connections
    }

    # ── Redis ─────────────────────────────────────────────────────────────────
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    CACHE_TYPE = "RedisCache"
    CACHE_REDIS_URL: str = os.getenv("REDIS_CACHE_URL", "redis://localhost:6379/1")
    CACHE_DEFAULT_TIMEOUT = 300

    # ── JWT ───────────────────────────────────────────────────────────────────
    JWT_SECRET_KEY: str = os.environ["JWT_SECRET_KEY"]
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(
        minutes=int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES_MINUTES", 60))
    )
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(
        days=int(os.getenv("JWT_REFRESH_TOKEN_EXPIRES_DAYS", 30))
    )
    JWT_TOKEN_LOCATION = ["headers"]
    JWT_HEADER_NAME = "Authorization"
    JWT_HEADER_TYPE = "Bearer"
    JWT_BLACKLIST_ENABLED = True
    JWT_BLACKLIST_TOKEN_CHECKS = ["access", "refresh"]

    # ── Security ─────────────────────────────────────────────────────────────
    BCRYPT_LOG_ROUNDS: int = int(os.getenv("BCRYPT_LOG_ROUNDS", 12))
    CORS_ORIGINS: list = os.getenv(
        "CORS_ORIGINS", "http://localhost:5173"
    ).split(",")

    # ── Rate Limiting ─────────────────────────────────────────────────────────
    RATELIMIT_STORAGE_URI: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    RATELIMIT_DEFAULT: str = os.getenv("RATE_LIMIT_DEFAULT", "5000 per day;5000 per hour")
    RATELIMIT_STRATEGY = "fixed-window"
    RATELIMIT_HEADERS_ENABLED = True

    # ── SocketIO ──────────────────────────────────────────────────────────────
    SOCKETIO_MESSAGE_QUEUE: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    SOCKETIO_PING_TIMEOUT = 20
    SOCKETIO_PING_INTERVAL = 25

    # ── OpenAI ────────────────────────────────────────────────────────────────
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4-turbo-preview")
    OPENAI_WHISPER_MODEL: str = os.getenv("OPENAI_WHISPER_MODEL", "whisper-1")
    OPENAI_TTS_MODEL: str = os.getenv("OPENAI_TTS_MODEL", "tts-1")
    OPENAI_MAX_TOKENS: int = int(os.getenv("OPENAI_MAX_TOKENS", 1024))
    OPENAI_TEMPERATURE: float = float(os.getenv("OPENAI_TEMPERATURE", 0.7))

    # ── File Upload ───────────────────────────────────────────────────────────
    UPLOAD_FOLDER: str = os.getenv("UPLOAD_FOLDER", "./uploads")
    ALLOWED_EXTENSIONS: set = set(
        os.getenv("ALLOWED_EXTENSIONS", "pdf,png,jpg,jpeg,mp3,wav,m4a").split(",")
    )

    # ── Celery ────────────────────────────────────────────────────────────────
    CELERY_BROKER_URL: str = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/2")
    CELERY_RESULT_BACKEND: str = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/3")
    CELERY_TASK_SERIALIZER = "json"
    CELERY_RESULT_SERIALIZER = "json"
    CELERY_ACCEPT_CONTENT = ["json"]
    CELERY_TIMEZONE = "UTC"


class DevelopmentConfig(BaseConfig):
    DEBUG = True
    SQLALCHEMY_ECHO = False          # Set True to log SQL queries
    BCRYPT_LOG_ROUNDS = 4            # Faster hashing in dev


class TestingConfig(BaseConfig):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL_TEST", "sqlite:///:memory:"
    )
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=5)
    BCRYPT_LOG_ROUNDS = 4
    WTF_CSRF_ENABLED = False
    RATELIMIT_ENABLED = False
    CACHE_TYPE = "SimpleCache"


class ProductionConfig(BaseConfig):
    DEBUG = False
    SQLALCHEMY_ECHO = False
    # Enforce HTTPS cookies in production
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"


config_map = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
}


def get_config() -> BaseConfig:
    env = os.getenv("FLASK_ENV", "development")
    return config_map.get(env, DevelopmentConfig)
