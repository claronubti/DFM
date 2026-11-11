from pathlib import Path
import json

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_app_dir = Path(__file__).resolve().parent.parent
_backend_dir = _app_dir.parent
_root_dir = _backend_dir.parent


class Settings(BaseSettings):
    """Global application settings and environment configuration loaded from .env.

    All sensitive credentials, API keys, secrets, database connection strings,
    and runtime parameters are required from .env / environment variables.
    No hardcoded default values are used for infrastructure, secrets, or authentication.
    """

    # ── Environment ──────────────────────────────────────────────────
    PROD: bool
    AUTH_ENABLED: bool

    # ── Database ─────────────────────────────────────────────────────
    DATABASE_URL: str
    PROD_DATABASE_URL: str | None = None
    EXPIRE_ON_COMMIT: bool = False

    # ── JWT Authentication & Authorization ───────────────────────────
    ACCESS_SECRET_KEY: str
    REFRESH_SECRET_KEY: str
    RESET_PASSWORD_SECRET_KEY: str
    VERIFICATION_SECRET_KEY: str
    ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_SECONDS: int
    REFRESH_TOKEN_EXPIRE_DAYS: int

    # ── Microsoft Fabric REST APIs (Service Principal) ───────────────
    AZURE_TENANT_ID: str
    AZURE_CLIENT_ID: str
    AZURE_CLIENT_SECRET: str

    # ── Microsoft Entra ID (Azure AD) – User Auth / SSO / RBAC ──────
    AZURE_AD_TENANT_ID: str
    AZURE_AD_CLIENT_ID: str

    # ── Microsoft Graph API Directory Service Credentials ────────────
    USERS_AZURE_AD_TENANT_ID: str
    USERS_AZURE_AD_CLIENT_ID: str
    USERS_AZURE_AD_CLIENT_SECRET: str

    # ── Adaptive Dual-Speed Leased Polling ───────────────────────────
    POLL_INTERVAL_ACTIVE_SECONDS: float
    POLL_INTERVAL_IDLE_SECONDS: float
    LEASE_EXPIRY_SECONDS: int
    MAX_PARALLEL_FABRIC_REQUESTS: int

    # ── Role-Based Access Control (Comma-separated admin emails) ─────
    ADMIN_EMAILS: str

    # ── AI Failure Diagnostics (Azure OpenAI GPT-4o) ─────────────────
    AZURE_OPENAI_ENDPOINT: str
    AZURE_OPENAI_DEPLOYMENT: str
    AZURE_OPENAI_API_KEY: str
    AZURE_OPENAI_API_VERSION: str

    # ── Frontend URL & CORS ──────────────────────────────────────────
    FRONTEND_URL: str
    CORS_ORIGINS: list[str] = ["*"]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: str | list[str]) -> list[str]:
        """Parse comma-separated strings or JSON arrays into a list of allowed CORS origins."""
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return parsed
            except (json.JSONDecodeError, TypeError):
                pass
            return [s.strip() for s in v.split(",") if s.strip()]
        return v or []

    # ── HTTP Rate Limiting (slowapi, requests per minute) ────────────
    RATE_LIMIT_LOGIN: str = "10/minute"
    RATE_LIMIT_REFRESH: str = "20/minute"
    RATE_LIMIT_SSO_EXCHANGE: str = "30/minute"

    # ── CSRF ─────────────────────────────────────────────────────────
    CSRF_SECRET: str | None = None

    # ── 24/7 Autonomous Azure Function Watchdog Appliance ────────────
    AZURE_WATCHDOG_URL: str

    # ── Celery async task offloading (Strict Redis Broker) ───────────
    CELERY_ENABLED: bool
    CELERY_TASK_ALWAYS_EAGER: bool
    REDIS_URL: str
    CELERY_BROKER_URL: str
    CELERY_RESULT_BACKEND: str

    @property
    def celery_broker(self) -> str:
        """Effective Celery broker URL (strictly Redis)."""
        return self.CELERY_BROKER_URL or self.REDIS_URL

    @property
    def celery_backend(self) -> str:
        """Effective Celery result backend URL (strictly Redis)."""
        return self.CELERY_RESULT_BACKEND or self.REDIS_URL

    model_config = SettingsConfigDict(
        env_file=[
            str(_backend_dir / ".env"),
            str(_root_dir / ".env"),
        ],
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
