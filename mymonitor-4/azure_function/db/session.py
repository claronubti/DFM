import logging
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from core.config import settings
from .base import Base
from .models import SLAIncident, SLAConfig  # noqa: F401

logger = logging.getLogger("azure_watchdog.db")


def normalize_db_url(url: str) -> str:
    """
    Normalizes the database connection URL for SQLAlchemy async engine.
    Ensures required connection parameters (e.g. TrustServerCertificate) are set,
    and automatically adapts to installed ODBC drivers (Driver 18 / Driver 17).
    """
    if not url:
        return "sqlite+aiosqlite:///:memory:"
    cleaned = url.strip()

    try:
        import pyodbc
        available = pyodbc.drivers()
        if "ODBC Driver 18 for SQL Server" in available and "ODBC+Driver+17" in cleaned:
            cleaned = cleaned.replace("ODBC+Driver+17+for+SQL+Server", "ODBC+Driver+18+for+SQL+Server")
        elif "ODBC Driver 17 for SQL Server" in available and "ODBC+Driver+18" in cleaned and "ODBC Driver 18 for SQL Server" not in available:
            cleaned = cleaned.replace("ODBC+Driver+18+for+SQL+Server", "ODBC+Driver+17+for+SQL+Server")
    except Exception:
        pass

    if "mssql" in cleaned and "TrustServerCertificate" not in cleaned:
        sep = "&" if ("?" in cleaned or ";" in cleaned) else "?"
        cleaned += f"{sep}TrustServerCertificate=yes"
    return cleaned


db_url = normalize_db_url(settings.DATABASE_URL or "sqlite+aiosqlite:///:memory:")
is_mssql = "mssql" in db_url

# Configure database engine
engine_kwargs = {
    "echo": False,
    "pool_pre_ping": True,
}

if "sqlite" not in db_url:
    engine_kwargs.update({
        "pool_size": 10 if is_mssql else 5,
        "max_overflow": 20 if is_mssql else 10,
        "pool_recycle": 300,
    })

engine = create_async_engine(
    db_url,
    **engine_kwargs,
)

async_session_maker = async_sessionmaker(
    engine,
    expire_on_commit=False,
)


async def init_db() -> None:
    """Creates tables in Azure SQL Database if they do not already exist."""
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database schemas and tables verified successfully.")
    except Exception as e:
        logger.warning(
            f"Could not connect to Azure SQL Database to verify tables (check DATABASE_URL): {e}"
        )


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Yields an asynchronous database session for queries and transactions."""
    async with async_session_maker() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
