# Microsoft Fabric 24/7 Autonomous Watchdog (Azure Function + FastAPI)

An enterprise 24/7 autonomous watchdog service built with **Azure Functions Python v2** and **FastAPI (`func.AsgiFunctionApp`)**.

---

## Key Architecture & Business Rules

1. **Direct SLA Database-Driven Sweep (High Performance & Zero Redundancy)**:
   - All pipelines that an admin chooses to monitor are configured in the `sla_configs` table in Azure SQL with their `pipeline_id`, `workspace_id`, and `l1_email`/`l2_email`.
   - The autonomous 24/7 watchdog directly queries `sla_configs` and immediately sweeps only those configured pipelines.
   - Eliminates redundant tenant-wide workspace pagination on every 2-minute cycle, drastically reducing Fabric API rate limits and executing sweeps in under 300ms.

2. **Tenant Capacity-Assigned Workspace Discovery Endpoint**:
   - For UI discovery and administration, `GET /api/workspaces/capacity` queries Microsoft Fabric (`GET /v1/workspaces`) with `continuationToken` pagination.
   - Discovers all enterprise capacity-assigned workspaces across the tenant (~35 workspaces).

3. **Multi-Tier SLA Escalation & Alert Lifecycle**:
   - **Initial Failure (L1 Alert)**: Dispatched **exactly once** immediately upon detecting a failure to the configured L1 lead.
   - **Prerequisite Email Delivery Verification**: 
     - **Before SLA1 Breached Mail (L2 Escalation)**: The engine strictly ensures that the initial Pipeline Failure alert (`l1NotifiedAt`) was confirmed and recorded as dispatched in the database, retrying delivery if missing.
     - **Before SLA1+SLA2 Critical Breach Mail (Both L1 & L2)**: The engine strictly ensures that both the initial Pipeline Failure alert (`l1NotifiedAt`) AND the SLA1/L2 escalation email (`l2EscalatedAt`) were confirmed and recorded as dispatched before sending the joint critical alert.
   - **Re-Run Failure**: If the pipeline executes again and fails, the incident is updated with latest error diagnostics while preserving the uninterrupted SLA stopwatch timer without spamming duplicate initial alerts.
   - **L2 Escalation (SLA1 Breached)**: When SLA1 deadline expires without resolution, an urgent escalation email is dispatched to the L2 lead (*"Needs fix before SLA2 target time"*).
   - **Critical SLA2 Breach**: When SLA2 threshold is also exceeded, a critical alert is dispatched to **BOTH L1 and L2** leads.
   - **30-Minute Recurring Reminders**: Dispatched to **BOTH L1 and L2** every 30 minutes while unresolved.
   - **Auto-Resolution**: When the pipeline succeeds on re-run, all active incidents are automatically marked as `RESOLVED` in the shared database, stopping SLA timers without dispatching noisy recovery emails.

4. **Clean Database Engine (`normalize_db_url`)**:
   - Public `normalize_db_url(url: str) -> str` normalizes connection strings and guarantees `TrustServerCertificate=yes` for Azure SQL Database.
   - Relies on the configured environment variable `ODBC Driver 18 for SQL Server` with no redundant runtime driver detection loops.

5. **24/7 Autonomous Cron Job**:
   - Runs on schedule (`0 */1 * * * *` or `0 */2 * * * *`) via Azure Function Timer Trigger.
   - Operates 24/7 in the cloud without requiring any active browser or frontend session.

6. **Interactive OpenAPI Swagger Docs (`/docs`)**:
   - Built on FastAPI via `func.AsgiFunctionApp`.
   - Access `/docs` and `/redoc` directly on your Azure Function URL.
   - Exposes REST endpoints for manual sweeps (`POST /api/sweep/trigger`), health diagnostics (`GET /api/health`), capacity workspaces (`GET /api/workspaces/capacity`), and SMTP verification (`POST /api/test-email`).

---

## Project Structure

```
azure_function/
├── host.json                # Azure Functions v2 extension bundle configuration
├── local.settings.json      # Local environment settings & credentials
├── requirements.txt         # Dependencies (FastAPI, azure-functions, sqlalchemy, httpx, aioodbc)
├── function_app.py          # FastAPI application + Timer Trigger (AsgiFunctionApp)
├── test_verify.py           # Verification script for auth, capacity workspaces, DB, and sweep
├── core/
│   ├── __init__.py
│   └── config.py            # Pydantic Settings loaded from environment
├── db/
│   ├── __init__.py
│   ├── base.py              # DeclarativeBase
│   ├── models.py            # SLAIncident & SLAConfig SQLAlchemy models
│   └── session.py           # Azure SQL async engine & normalize_db_url
└── services/
    ├── __init__.py
    ├── fabric_service.py    # Fabric OAuth2, pagination & capacity workspace discovery
    ├── db_service.py        # Database queries for configured SLAs & incident lifecycle
    ├── alert_service.py     # Multi-tier HTML email alerts & SMTP delivery
    └── watchdog_engine.py   # Autonomous sweep orchestrator for capacity & configured SLAs
```

---

## Configuration (`local.settings.json`)

Set your Azure SQL Database connection string and Service Principal details in `local.settings.json`:

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "python",
    "AZURE_TENANT_ID": "008502d6-3f79-46f0-ab37-9354e3fe80ff",
    "AZURE_CLIENT_ID": "25ad11d7-5885-4f0e-8424-919bf02e04eb",
    "AZURE_CLIENT_SECRET": "SWE8Q~EtZhXJAxLm_mVlLFBSI~It5ljFjID~kbvn",
    "DATABASE_URL": "mssql+aioodbc://<username>:<password>@<server>.database.windows.net:1433/<database>?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes&TrustServerCertificate=no",
    "MAIL_USERNAME": "uiaptracker@gmail.com",
    "MAIL_PASSWORD": "vvxcdmqftennvjhg",
    "MAIL_FROM": "uiaptracker@gmail.com",
    "MAIL_PORT": "587",
    "MAIL_SERVER": "smtp.gmail.com",
    "MAIL_STARTTLS": "true",
    "FRONTEND_URL": "http://localhost:5173",
    "WATCHDOG_CRON_SCHEDULE": "0 */1 * * * *"
  }
}
```

---

## Verification Test

To verify Fabric token generation, capacity-assigned workspace discovery, database connectivity, and watchdog sweep execution locally:

```bash
cd azure_function
.\venv\Scripts\python.exe test_verify.py
```

---

## Running Locally

### Option A: Azure Functions Core Tools (Recommended)
```bash
cd azure_function
func start
```
The console will expose:
- HTTP Trigger: `http://localhost:7071/`
- Interactive Swagger: `http://localhost:7071/docs`
- Timer Trigger: Fires automatically on schedule!

### Option B: FastAPI Standalone via Uvicorn (Testing API & Docs)
```bash
uvicorn azure_function.function_app:fastapi_app --port 8001 --reload
```
Open `http://localhost:8001/docs` in your browser.

---

## Deploying to Azure

### Using Azure CLI & Core Tools
```bash
# 1. Login to Azure
az login

# 2. Deploy Azure Function App
cd azure_function
func azure functionapp publish <YOUR_FUNCTION_APP_NAME>
```

Once deployed:
- Visit `https://<YOUR_FUNCTION_APP_NAME>.azurewebsites.net/docs` to view Swagger UI.
- The 24/7 Timer Trigger will automatically execute in Azure Functions without client interaction.
