import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List

import asyncio

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.routing import APIRoute
from fastapi.staticfiles import StaticFiles
from fastapi_pagination import add_pagination
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.core.csrf import CSRFMiddleware
from app.core.events import create_database
from app.core.rate_limiter import limiter
from app.modules.auth.router import router as auth_router
from app.modules.diagnostics.router import router as diagnostics_router
from app.modules.directory.router import router as directory_router
from app.modules.pipelines.router import router as pipelines_router
from app.modules.sla.router import router as sla_router
from app.modules.table_logs.router import router as table_logs_router
from app.modules.users.router import router as users_router
from app.modules.users.service import users_service
from app.modules.websocket.router import router as websocket_router
from app.modules.workspaces.router import router as workspaces_router
from app.modules.pipelines.service import leased_poller
from app.shared.constants import AUTH_URL_PATH

logger = logging.getLogger("fabric_monitor")
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)


def simple_generate_unique_route_id(route: APIRoute) -> str:
    """Generate a clean and unique route identifier using the route's tag and name."""
    tags = route.tags if route.tags else ["default"]
    return f"{tags[0]}-{route.name}"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application startup, database initialization, background services, and graceful shutdown."""
    logger.info("Initializing Microsoft Fabric Real-Time Monitoring Hub...")

    # 1. Initialize SQLite DB tables for all modules (users, roles, pipelines, SLA, etc.)
    await create_database()

    # 2. Seed admin users
    admin_emails = [e.strip() for e in (settings.ADMIN_EMAILS or "").split(",") if e.strip()]
    await users_service.seed_defaults(admin_emails)

    # 3. Start background leased poller for active viewing workspaces
    leased_poller.start()
    logger.info("Background leased poller started (alert emails offloaded to Azure Function).")

    # 4. In Celery mode, relay WebSocket events published by worker processes
    #    (Fabric sync, incident alerts) to locally-connected clients via Redis.
    subscriber_task = None
    if settings.CELERY_ENABLED:
        from app.core.event_bus import event_bus
        subscriber_task = asyncio.create_task(event_bus.subscribe_and_relay())
        logger.info("Celery mode enabled: Redis WebSocket relay subscriber started.")

    yield

    # Shutdown: Stop poller cleanly
    logger.info("Shutting down Fabric Monitoring Hub...")
    leased_poller.stop()
    if subscriber_task:
        subscriber_task.cancel()


def create_app() -> FastAPI:
    """Instantiate and configure the FastAPI application instance with routes, middleware, and exception handlers."""
    app = FastAPI(
        title="Microsoft Fabric Real-Time Monitoring Hub",
        description="Enterprise modular FastAPI backend for real-time Fabric pipeline monitoring, SLA alerting, and table telemetry",
        version="1.0.0",
        generate_unique_id_function=simple_generate_unique_route_id,
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # Calculate allowed CORS origins
    cors_list: List[str] = list(settings.CORS_ORIGINS) if settings.CORS_ORIGINS else []
    if settings.FRONTEND_URL and settings.FRONTEND_URL not in cors_list:
        cors_list.append(settings.FRONTEND_URL)

    if "*" in cors_list or not cors_list:
        allowed_origins = ["*"]
    else:
        allowed_origins = list(set(cors_list))

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.add_middleware(CSRFMiddleware)

    # 1. Register Core Domain Routers
    app.include_router(workspaces_router)
    app.include_router(pipelines_router)
    app.include_router(sla_router)
    app.include_router(table_logs_router)
    app.include_router(diagnostics_router)
    app.include_router(directory_router)
    app.include_router(websocket_router)
    app.include_router(users_router)

    # 2. Register Auth Router under /api
    api_router = APIRouter(prefix="/api")
    api_router.include_router(auth_router, prefix=f"/{AUTH_URL_PATH}")
    app.include_router(api_router)

    # Health Check Endpoint
    @app.get("/health")
    async def health_check():
        """Return system health status, tenant information, and poller state."""
        return {
            "status": "healthy",
            "service": "fabric-monitoring-backend",
            "tenant_id": settings.AZURE_TENANT_ID,
            "poller_active": leased_poller._is_running,
        }

    add_pagination(app)

    # Mount static frontend build if present
    base_path = Path(__file__).resolve()
    potential_dist_paths = [
        base_path.parent.parent.parent.parent / "frontend" / "dist",  # from next-fastapi-starter/backend/app
        base_path.parent.parent.parent / "frontend" / "dist",         # from backend/app
        Path.cwd() / "frontend" / "dist",
    ]

    for p in potential_dist_paths:
        if p.exists() and (p / "index.html").exists():
            logger.info("Mounting frontend SPA from %s", p)
            app.mount("/", StaticFiles(directory=str(p), html=True), name="frontend")
            break
    else:
        @app.get("/")
        async def root():
            """Return API welcome message and documentation links when SPA dist is not mounted."""
            return {
                "message": "Microsoft Fabric Real-Time Job Monitoring API is running",
                "docs": "/docs",
                "health": "/health",
            }

    return app

