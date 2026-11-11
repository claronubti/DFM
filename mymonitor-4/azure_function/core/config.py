import json
import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# Automatically load local.settings.json Values into environment if running outside Azure Functions host (e.g. uvicorn/tests)
_root_dir = Path(__file__).resolve().parent.parent
_local_settings_file = _root_dir / "local.settings.json"
if _local_settings_file.exists():
    try:
        _content = _local_settings_file.read_text(encoding="utf-8").strip()
        if _content:
            _data = json.loads(_content)
            for _k, _v in _data.get("Values", {}).items():
                os.environ[_k] = str(_v)
    except Exception:
        pass

# Fallback: load .env from azure_function or backend/.env if DATABASE_URL not set
if not os.environ.get("DATABASE_URL"):
    try:
        from dotenv import load_dotenv
        load_dotenv(_root_dir / ".env")
        if not os.environ.get("DATABASE_URL"):
            load_dotenv(_root_dir.parent / "backend" / ".env")
    except Exception:
        pass


class Settings(BaseSettings):
    """Configuration settings for the 24/7 Autonomous Azure Function Watchdog.

    All configuration values are retrieved directly from the host environment
    (local.settings.json locally, or Azure Function App Settings in the cloud).
    No credentials or infrastructure endpoints have hardcoded default values.
    """

    # ── Microsoft Fabric Service Principal Credentials ──────────────
    AZURE_TENANT_ID: str = ""
    AZURE_CLIENT_ID: str = ""
    AZURE_CLIENT_SECRET: str = ""
    FABRIC_API_BASE_URL: str = "https://api.fabric.microsoft.com/v1"

    # ── Azure SQL Database (Shared Single Source of Truth) ───────────
    DATABASE_URL: str = ""

    # ── SMTP / Alert Email Configuration ────────────────────────────
    MAIL_USERNAME: str = ""
    MAIL_PASSWORD: str = ""
    MAIL_FROM: str = ""
    MAIL_PORT: int = 587
    MAIL_SERVER: str = "smtp.gmail.com"
    MAIL_STARTTLS: bool = True
    MAIL_SSL_TLS: bool = False
    USE_CREDENTIALS: bool = True

    @property
    def clean_mail_username(self) -> str:
        return (self.MAIL_USERNAME or "").strip()

    @property
    def clean_mail_password(self) -> str:
        return (self.MAIL_PASSWORD or "").replace(" ", "").strip()

    # ── SLA Thresholds & Cadence ────────────────────────────────────
    DEFAULT_SLA1_MINUTES: int = 30
    DEFAULT_SLA2_MINUTES: int = 60
    CRITICAL_REMINDER_MINUTES: int = 30
    WATCHDOG_CRON_SCHEDULE: str = "0 */1 * * * *"

    # ── Web UI Dashboard URL for deep-links in email alerts ─────────
    FRONTEND_URL: str = "http://localhost:5173"

    model_config = SettingsConfigDict(
        case_sensitive=True,
        extra="ignore"
    )



settings = Settings()
