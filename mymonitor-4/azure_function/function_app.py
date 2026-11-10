import datetime
import logging
import sys
from contextlib import asynccontextmanager
from typing import Any, Dict, Optional

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import azure.functions as func
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from core.config import settings
from db.session import init_db
from services.alert_service import alert_service
from services.db_service import db_service
from services.fabric_service import fabric_service
from services.watchdog_engine import watchdog_engine

# Configure logging
logging.basicConfig(level=logging.INFO)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logger = logging.getLogger("azure_watchdog")


# ── FastAPI Schemas ──────────────────────────────────────────────────────────
class TestEmailRequest(BaseModel):
    email: str
    role: Optional[str] = "L1 Support Lead"
    pipelineName: Optional[str] = "Demo Pipeline"


# ── FastAPI Lifespan Manager ─────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initializes database schema and logs service startup."""
    logger.info("Initializing 24/7 Autonomous Watchdog Azure Function Appliance...")
    await init_db()
    yield
    logger.info("Shutting down Watchdog Appliance...")


# ── FastAPI Application Instance ─────────────────────────────────────────────
fastapi_app = FastAPI(
    title="Microsoft Fabric 24/7 Autonomous Watchdog API",
    description=(
        "Autonomous watchdog service running 24/7 in Azure Functions. "
        "Sweeps capacity-assigned workspaces, tracks SLA1 & SLA2 deadlines, and dispatches L1/L2 alerts."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── FastAPI Routes (Interactive Swagger Documentation) ───────────────────────
@fastapi_app.get("/", include_in_schema=False)
async def root():
    """Redirects root URL directly to interactive Swagger OpenAPI documentation."""
    return RedirectResponse(url="/docs")


@fastapi_app.get("/api/health", tags=["Monitoring & Diagnostics"])
async def health_check() -> Dict[str, Any]:
    """Health check endpoint validating Fabric Service Principal token and configuration."""
    token = await fabric_service.get_token()
    token_valid = bool(token and len(token) > 20)
    return {
        "status": "healthy" if token_valid else "degraded",
        "service": "24/7 Autonomous Fabric Watchdog",
        "timestampUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "fabricAuth": {
            "tokenAcquired": token_valid,
            "tenantId": settings.AZURE_TENANT_ID,
            "clientId": settings.AZURE_CLIENT_ID,
        },
        "cronSchedule": settings.WATCHDOG_CRON_SCHEDULE,
        "databaseConfigured": bool(settings.DATABASE_URL),
    }


@fastapi_app.get("/api/workspaces/capacity", tags=["Workspaces"])
async def list_capacity_workspaces():
    """Discovers and returns only capacity-assigned workspaces (~30 workspaces) from Microsoft Fabric."""
    workspaces = await fabric_service.get_capacity_workspaces()
    return {
        "count": len(workspaces),
        "capacityWorkspaces": [
            {
                "id": ws.get("id"),
                "name": ws.get("displayName") or ws.get("name"),
                "capacityId": ws.get("capacityId"),
                "type": ws.get("type", "Workspace"),
            }
            for ws in workspaces
        ],
    }


@fastapi_app.post("/api/sweep/trigger", tags=["Watchdog Operations"])
async def trigger_manual_sweep():
    """Manually triggers an immediate autonomous sweep across all capacity workspaces.

    Returns full execution statistics including checked pipelines, failures detected,
    and alert emails dispatched.
    """
    logger.info("Manual watchdog sweep requested via FastAPI endpoint.")
    report = await watchdog_engine.run_watchdog_sweep()
    return {
        "status": "success",
        "message": "Watchdog sweep executed successfully.",
        "report": report,
    }


@fastapi_app.get("/api/incidents/active", tags=["SLA & Incidents"])
async def get_active_incidents():
    """Returns all active, escalated, and critical unresolved incidents stored in the shared database."""
    incidents = await db_service.get_all_unresolved_incidents()
    return {
        "count": len(incidents),
        "incidents": incidents,
    }


@fastapi_app.post("/api/test-email", tags=["Email & Notifications"])
async def test_email_delivery(payload: TestEmailRequest):
    """Sends a verification email to test SMTP connectivity and deliverability."""
    subject = f"[TEST VERIFICATION] Fabric Alert System Test — {payload.role}"
    recipient_name = payload.email.split("@")[0] if "@" in payload.email else payload.email
    from services.alert_service import format_ist
    test_time_ist = format_ist(datetime.datetime.now(datetime.timezone.utc))

    plain = f"""
Hi {recipient_name},

Our support team has generated a test verification message to confirm SMTP connectivity:

Failure details:
Pipeline Name: {payload.pipelineName}
Recipient: {payload.email}
Assigned Role: {payload.role}
Delivery Status: Successful
Verification Time (IST): {test_time_ist}
Action Required: None (Verification test completed successfully)

Support team reply:
SMTP connection and deliverability test completed successfully.

Please click the below link to view more details
{settings.FRONTEND_URL}

If you have any questions or need further assistance, please reach out to our support team at helpdesk.
    """.strip()

    details = [
        ("Pipeline Name", payload.pipelineName),
        ("Recipient", payload.email),
        ("Assigned Role", payload.role),
        ("Delivery Status", "Successful"),
        ("Verification Time (IST)", test_time_ist),
        ("Action Required", "None (Verification test completed successfully)"),
    ]
    html = alert_service._build_email_html(
        recipient_email=payload.email,
        intro_message="Our support team has generated a test verification message to confirm SMTP connectivity:",
        section_title="Failure details:",
        details=details,
        reply_title="Verification result:",
        reply_content="SMTP connection and deliverability test completed successfully.",
        link_url=settings.FRONTEND_URL,
        link_text="View Failure Details in Dashboard",
        banner_text="SMTP Connectivity Verification &bull; Deliverability test operational.",
        banner_type="info",
    )
    success = await alert_service.send_email(payload.email, subject, html, plain)
    if success:
        return {"status": "success", "message": f"Test email dispatched to {payload.email}"}
    raise HTTPException(status_code=500, detail="Failed to dispatch test email over SMTP.")


# ── Azure Functions v2 Model Integration ─────────────────────────────────────
# 1. Mount FastAPI app via AsgiFunctionApp (provides /docs, /redoc, and REST endpoints)
app = func.AsgiFunctionApp(app=fastapi_app, http_auth_level=func.AuthLevel.ANONYMOUS)


# 2. Register 24/7 Autonomous Timer Trigger on the exact same Function App instance
@app.timer_trigger(
    schedule=settings.WATCHDOG_CRON_SCHEDULE,
    arg_name="watchdogTimer",
    run_on_startup=False,
    use_monitor=False,
)
async def autonomous_watchdog_timer(watchdogTimer: func.TimerRequest) -> None:
    """Timer trigger executing every 2 minutes 24/7 in the cloud:
    - Sweeps capacity workspaces
    - Detects pipeline failures & recoveries
    - Enforces multi-tier SLA1 & SLA2 escalations
    - Dispatches L1/L2 alerts and 30-minute recurring reminders
    """
    if watchdogTimer.past_due:
        logger.warning("Watchdog timer trigger is running past due.")

    try:
        await watchdog_engine.run_watchdog_sweep()
    except Exception as e:
        logger.error(f"Error during autonomous watchdog sweep: {e}", exc_info=True)
