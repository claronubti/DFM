# Microsoft Fabric Real-Time Monitoring Hub & 24/7 SLA Watchdog

An enterprise observability and incident governance platform for **Microsoft Fabric Data Pipelines**. Combines an interactive operator dashboard for live pipeline tracking with an autonomous 24/7 Azure Function watchdog for SLA tracking, multi-tier escalation, and automated incident resolution.

---

## System Architecture & Operational Philosophy

The platform decouples **unattended 24/7 background governance** from **interactive operator dashboards**:

1. **Autonomous 24/7 Watchdog Appliance (`azure_function/`)**:
   - Executes headlessly in the cloud on an Azure Functions Timer Trigger (or on-demand via REST endpoint).
   - Scopes queries strictly to pipelines with configured L1/L2 assignees in Azure SQL (`sla_configs`), eliminating tenant-wide Fabric API throttling (HTTP 429).
   - Serves as the single source of truth for creating incidents, tracking SLA1 and SLA2 deadlines, dispatching L1/L2 emails, and auto-resolving recovered pipelines in Azure SQL (stopping active SLA timers without sending redundant recovery emails).
2. **Interactive Monitoring Platform (`backend/` & `frontend/`)**:
   - FastAPI modular backend providing real-time workspace views, tree hierarchy nesting, and WebSocket streaming.
   - Vite React client providing an operator dashboard, root-cause error diagnostics with Azure OpenAI GPT-4o, and direct Delta table audit logs.
   - Admin Console with Microsoft Entra ID directory search via Microsoft Graph API for assigning L1/L2 teams and domains.
3. **Shared Azure SQL Database**:
   - Serves as the central persistent datastore (`sla_configs`, `sla_incidents`, `users`, `roles`).
   - Ensures that the Azure Function background watchdog and the web dashboard operate in lockstep.

---

## Azure Function Autonomous 24/7 Watchdog — Architecture & All Handled Cases

The Azure Function (`azure_function/services/watchdog_engine.py`) is designed for resilient, 24/7 autonomous operation without requiring human supervision or open browser tabs. It handles every operational edge case:

### 1. Scoped Discovery: Configured Pipelines Only (No 429 Throttling)
* **The Problem**: Querying hundreds of pipelines across all tenant workspaces on every cycle triggers Microsoft Fabric API rate limiting (HTTP 429) and produces alert spam.
* **The Solution**: The engine first queries Azure SQL `sla_configs` table to discover only pipelines with configured `l1Email` or `l2Email`. Only these specific pipelines are inspected against the Fabric REST API. If no pipelines are configured, Fabric polling is bypassed completely while existing database incidents are still evaluated.

### 2. Initial Pipeline Failure Detection & Single L1 Alert
* **Behavior**: When a configured pipeline's latest execution run fails (`status: "failed"`):
  1. Checks if an active incident already exists for this run or pipeline.
  2. If new, extracts granular failure diagnostics (`errorCode`, `message`) via Microsoft Fabric REST API (`/datapipelines/pipelineruns/{run_id}/queryactivityruns`).
  3. Computes the SLA1 response target time: `slaTargetTime = failedAt + sla1Minutes`.
  4. Inserts an incident record into Azure SQL `sla_incidents` with status `ACTIVE`.
  5. Dispatches **exactly one** high-priority HTML failure alert email to the **L1 Support Lead only**, containing error diagnostics, processing timestamps, and direct Fabric monitor deep-links.

### 3. Silent Rerun Updates During Ongoing Incidents (Anti-Spam)
* **Behavior**: When engineers re-trigger a failed pipeline or automated retry mechanisms execute while an incident is already open:
  * If the retry also fails, the watchdog recognizes that an incident is already `ACTIVE` or `ESCALATED_L2` for this pipeline.
  * Rather than spamming the support team with duplicate emails, the engine **silently updates** the incident record in Azure SQL with the latest `pipeline_run_id` and newest error diagnostics.
  * The original SLA countdown continues uninterrupted from the original failure time.

### 4. Automated Pipeline Recovery on Succeeded Re-Run (No Recovery Emails)
* **Behavior**: When a pipeline that previously suffered an incident successfully runs (`status: "completed"` or `"succeeded"`):
  1. The engine automatically transitions all active/escalated incidents for that pipeline to `RESOLVED` in the shared Azure SQL Database.
  2. Updates database fields: `resolved_at = now()`, `resolved_by = "Auto-Resolved (Pipeline Succeeded Run <run_id>)"`.
  3. **No Recovery Emails Sent**: In accordance with enterprise alerting policy, automated recovery emails are suppressed to prevent inbox clutter and noise. The resolution is committed to the shared database and instantly reflected in the operator dashboard.
  4. Resets all escalation timers and halts any further alerts.

### 5. Intermediate Success Detection (Fresh Failure Cycle)
* **The Problem**: If a pipeline fails, then an operator re-runs it and it succeeds, and later that day it fails again on a separate scheduled batch, a naive poller might see two failures and assume the pipeline has been broken for hours, triggering immediate false SLA breaches.
* **The Solution**: The watchdog inspects the run history timeline (`get_recent_pipeline_runs(limit=10)`). If a successful run exists between the previous failure and the new failure:
  * The old incident is automatically retired as resolved.
  * The new failed run is treated as a **brand-new, independent failure event**.
  * A fresh SLA1 countdown begins, and an initial L1 alert is dispatched with clean timers.

### 6. User-Acknowledged / Resolved via Web Dashboard
* **Behavior**: Operators can review incidents in the web UI and click the **"Resolve Incident"** button:
  * The incident record is updated in Azure SQL to `status: "RESOLVED"`.
  * The watchdog engine respects this state and immediately stops evaluating SLA escalations or sending reminder emails for that run.
  * If the pipeline fails on a subsequent run, the watchdog recognizes the prior incident was resolved and initiates a fresh incident cycle.

### 7. SLA1 Deadline Breach: Automatic Escalation to L2
* **Behavior**: Every sweep cycle evaluates all `ACTIVE` incidents in Azure SQL against `slaTargetTime`:
  * If `now_utc >= sla1_target_time` and the incident is still unresolved:
    1. Status transitions from `ACTIVE` to `ESCALATED_L2`.
    2. Records `l2_escalated_at = now()`.
    3. Calculates overdue minutes past the SLA1 window.
    4. Computes the upcoming SLA2 deadline.
    5. Dispatches **exactly one** escalation alert email to the **L2 Escalation Owner only**.

### 8. SLA2 Deadline Breach: Critical Escalation to Both L1 & L2
* **Behavior**: Supports both cumulative and incremental SLA2 configurations:
  * **Cumulative Deadline**: If `sla2Minutes > sla1Minutes` (e.g. Warning at 30m, Breach at 60m), SLA2 is measured as total elapsed time from the initial failure (`failedAt + sla2Minutes`).
  * **Incremental Window**: If `sla2Minutes <= sla1Minutes` (e.g. Warning at 30m, +15m additional window for L2), SLA2 is measured from the SLA1 target (`sla1Target + sla2Minutes`).
  * When `now_utc >= sla2_target_time`:
    1. Incident status transitions to `CRITICAL_UNRESOLVED`.
    2. Dispatches a high-priority critical alert email to **Both (L1 and L2)**.
    3. Initializes the 30-minute recurring reminder timer.

### 9. 30-Minute Recurring Reminders for Critical Incidents
* **Behavior**: Any incident lingering in `CRITICAL_UNRESOLVED` state represents an ongoing SLA breach:
  * The engine tracks `_last_critical_reminders[incident_id]`.
  * Every 30 minutes (`CRITICAL_REMINDER_MINUTES * 60`), if the incident remains unresolved and the pipeline has not succeeded, the engine dispatches a recurring reminder email to **Both (L1 and L2)** detailing total elapsed breach time and latest error status.
  * Stops immediately once the pipeline recovers or an operator marks it resolved.

### 10. Automatic Recipient Email De-Duplication
* **Behavior**: In many teams, an engineer may serve as both the L1 First Responder and L2 Escalation Manager.
  * When `l1Email == l2Email`, the alert dispatcher (`alert_service.py`) automatically de-duplicates recipient addresses before sending via SMTP.
  * The engineer receives exactly 1 consolidated email rather than multiple duplicate inbox messages.

### 11. Administrator Role & Permission Preservation
* **Behavior**: If an administrator email (e.g. `mohammedabdulmalik.m@ubtiinc.com`) is assigned as the L1 or L2 contact for a pipeline:
  * The system preserves their `admin` role and `is_admin = True` flags upon authentication.
  * They receive targeted operational alert emails for their assigned pipelines while maintaining unrestricted access to all workspaces, pipelines, user administration, and system settings across the tenant.

### 12. Concurrency Control & Fabric API Resiliency
* **Behavior**: To sweep multiple capacity workspaces rapidly while respecting Microsoft Fabric API concurrency boundaries:
  * Uses an `asyncio.Semaphore(10)` to safely bound parallel pipeline inspections.
  * Wraps API calls with retry logic and error logging to ensure transient network interruptions do not crash the watchdog.

### 13. Dual Deployment & Execution Interfaces
* **Behavior**: The appliance exposes two complementary operation modes:
  * **Autonomous Cloud Timer Trigger**: Runs on a configurable cron schedule (`0 */1 * * * *` or `0 */2 * * * *`) 24/7 without external intervention.
  * **FastAPI REST Endpoints**: Runs on the same instance via `AsgiFunctionApp`, exposing:
    * `GET /api/health` — Verifies token health, tenant configuration, and database connectivity.
    * `GET /api/workspaces/capacity` — Discovers all capacity-assigned workspaces (~30 workspaces).
    * `POST /api/sweep/trigger` — Manually forces an immediate sweep on-demand, returning full JSON execution metrics.
    * `GET /api/incidents/active` — Lists all active and escalated unresolved incidents.
    * `POST /api/test-email` — Sends verification test emails over SMTP.
    * `GET /openapi.json` & `/docs` — Interactive Swagger UI documentation.

---

## Core Features

* **Targeted Pipeline Monitoring**: Only tracks pipelines explicitly configured with SLA thresholds in the database, avoiding tenant-wide API rate limits and notification fatigue.
* **Multi-Tier SLA Escalation Lifecycle**:
  * **Initial Failure**: Creates an incident (`ACTIVE`), starts the SLA1 countdown, and sends **exactly 1 email to the L1 Support Lead only**.
  * **SLA1 Breach**: When the response deadline expires, escalates status to `ESCALATED_L2` and sends **exactly 1 escalation email to the L2 Owner only**.
  * **SLA2 Breach**: Starts after SLA1 (giving L2 their full resolution window). When expired, escalates status to `CRITICAL_UNRESOLVED` and sends **exactly 1 critical alert to Both (L1 and L2)**.
  * **Automated Historical Recovery**: Inspects Fabric execution history to detect when a pipeline succeeded after an incident and automatically marks past records as `RESOLVED` in the shared database (halting active SLA timers without sending redundant recovery emails). Prevents false "re-run" alerts on subsequent failures.
  * **Silent Ongoing Incident Tracking**: If a pipeline re-runs and fails while an incident is ongoing, silently updates the run ID and error diagnostics in the database without sending duplicate spam emails.
* **Support Assignment Flexibility**:
  * L1 and L2 can be configured as different engineers or the **same person**.
  * When L1 and L2 share the same email address, notification dispatches **automatically de-duplicate recipients** to prevent duplicate emails.
  * **Administrators Assigned to L1**: If an administrator is assigned as the L1 responder on a pipeline, they retain unrestricted administrator privileges upon login and continue to see all workspaces and pipelines across the tenant.
* **Role-Based Access Control (RBAC)**:
  * **Administrator**: Full unrestricted access across all workspaces, pipelines, user management, and configuration consoles.
  * **L1 Support Specialist**: Scoped visibility restricted to workspaces and pipelines assigned to their L1 roster.
  * **L2 Escalation Manager**: Scoped visibility restricted to assigned escalation pipelines.
* **Interactive Operator Hub**:
  * Real-time KPI summaries (Total, Running, Succeeded, Failed, SLA Breaches).
  * Expandable parent-child pipeline tree with on-demand run triggers.
  * Live WebSocket updates pushing immediate status changes directly to the operator interface.
* **AI-Assisted Error Diagnostics**: One-click analysis powered by Azure OpenAI GPT-4o, converting raw Fabric error logs into root causes and step-by-step remediation suggestions.
* **Lakehouse / Warehouse Audit Logs**: Direct T-SQL query integration over Fabric SQL Endpoints to inspect audit tables and Delta logs.

---

## Division of Responsibilities: Azure Function vs. Application

The platform divides duties between a headless background appliance and an interactive user-facing application:

| Responsibility | Azure Function (`azure_function/`) | Application Backend & Frontend (`backend/` & `frontend/`) |
| :--- | :--- | :--- |
| **Execution Environment** | Headless 24/7 background appliance running on Azure Functions / local runtime. | Interactive FastAPI server + Vite React client. |
| **Primary Trigger** | Autonomous Timer Trigger (runs every 60 seconds) or manual trigger via `POST /api/sweep/trigger`. | User-driven HTTP requests and continuous interactive client polling sessions. |
| **Pipeline Scope** | **Configured Pipelines Only**: Queries `sla_configs` in Azure SQL first and inspects only pipelines with active L1/L2 assignments. | **Workspace-Scoped**: Fetches and displays all items within the operator's currently selected workspace (subject to RBAC). |
| **SLA Tracking & Transitions** | Primary orchestrator for SLA incident creation, deadline calculations, and lifecycle updates (`ACTIVE` $\rightarrow$ `ESCALATED_L2` $\rightarrow$ `CRITICAL_UNRESOLVED`). | Displays real-time incident states and allows manual incident acknowledgement/resolution from the UI. |
| **Email Alert Delivery** | **Exclusive Handler**: Dispatches all automated HTML alert emails (L1 Alerts, L2 Escalations, SLA2 Breaches, and 30m Recurring Reminders; recovery emails suppressed). | Delegates test email requests to the Azure Function (`/api/test-email`). |
| **Live UI Streaming** | None (headless background appliance). | WebSocket connection broadcasting live status changes to active browser tabs. |
| **User & Role Administration** | Reads user and SLA assignments from Azure SQL DB. | Admin Setup Console with Microsoft Entra ID directory search via Microsoft Graph API. |
| **AI Error Diagnostics** | Extracts raw error diagnostics from Fabric API. | Orchestrates Azure OpenAI GPT-4o analysis and renders interactive diagnostic reports. |
| **Lakehouse Table Audit Logs** | Not involved. | Direct read-only T-SQL queries against Fabric SQL Endpoints. |

---

## 60-Second vs. 15-Second Polling Methods

The platform uses two distinct polling rhythms tailored for different operational needs:

```text
+---------------------------------------------------------------------------------------------------------+
|                                      EXECUTION TIMING COMPARISON                                        |
+---------------------------------------------------------------------------------------------------------+
| [Method 1] 60-Second Watchdog (Azure Function - 24/7 Autonomous)                                        |
|   T=00:00        T=01:00        T=02:00        T=03:00        T=04:00                                   |
|   |--------------|--------------|--------------|--------------|--------> (Runs every 60s continuously)  |
|   - Queries Azure SQL sla_configs for configured SLA pipelines only                                     |
|   - Inspects latest run status via Fabric REST API                                                      |
|   - Evaluates SLA1 & SLA2 deadlines, triggers email alerts & escalations                                 |
+---------------------------------------------------------------------------------------------------------+
| [Method 2] 15-Second Interactive Poller (Backend / Dashboard - Operator Session)                        |
|   T=00:00   T=00:15   T=00:30 (Active Run) -> T=00:31.5 -> T=00:33 -> T=00:45                          |
|   |---------|---------|-------> [Accelerates to 1.5s when runs are in-progress]                         |
|   - Polls active workspace chosen by logged-in operator                                                 |
|   - Streams live status over WebSockets directly to the React UI                                        |
+---------------------------------------------------------------------------------------------------------+
```

### 1. The 60-Second Autonomous Sweep (Azure Function Watchdog)
* **Frequency**: Runs once every 60 seconds (`0 */1 * * * *`).
* **Purpose**: **24/7 Autonomous SLA Governance & Email Notification**.
* **How It Operates**:
  1. Queries the Azure SQL database for pipelines where `l1_email` or `l2_email` is configured in `sla_configs`.
  2. Queries Microsoft Fabric REST APIs **only for those specific pipelines** to check their latest run status.
  3. Evaluates all active incidents in the database against their SLA1 and SLA2 target timestamps.
  4. Dispatches formal alert emails over SMTP when failures, escalations, or recoveries occur.
* **Why 60 Seconds**:
  * SLA windows are measured in minutes (typically 30–60 minutes). Checking every 60 seconds provides prompt detection without generating excessive API calls.
  * Bypasses Microsoft Fabric API rate limiting (HTTP 429) by only inspecting configured pipelines rather than all tenant workspaces.
  * Operates completely independently of whether any user is logged in or has a browser tab open.

### 2. The 15-Second Interactive Polling (Backend / Web Application)
* **Frequency**: Runs every 15 seconds while viewing a workspace; automatically accelerates to **1.5 seconds** when a pipeline run is actively in-progress.
* **Purpose**: **Interactive Operator Feedback & Live Dashboard State**.
* **How It Operates**:
  1. Triggered only while an operator has the web dashboard open and has selected a workspace.
  2. Queries Fabric for the execution runs of pipelines in the active workspace.
  3. Broadcasts updates over WebSockets directly to the React interface.
* **Why 15 Seconds (with 1.5s boost)**:
  * Operators watching a pipeline trigger need near-instant visual confirmation when execution status changes from `InProgress` to `Completed` or `Failed`.
  * Reduces latency for human operators without overloading Fabric APIs across the entire tenant.

### Summary Comparison

| Dimension | 60-Second Watchdog Method | 15-Second Interactive Method |
| :--- | :--- | :--- |
| **Component** | Azure Function Appliance | Application Backend & Frontend |
| **Trigger Mechanism** | Azure Timer Trigger (Cron schedule) | Frontend heartbeat / Background polling loop |
| **Pipeline Filter** | Only pipelines configured with L1/L2 in `sla_configs` | All pipelines in the currently selected workspace |
| **Primary Output** | Database records (`sla_incidents`) + SMTP Email Alerts | WebSocket UI state stream + Browser Dashboard updates |
| **Requires Logged-In User** | **No** (Runs 24/7 unattended) | **Yes** (Runs for active operator sessions) |

---

## End-to-End Workspace Flow & Architecture (Fabric APIs, Hierarchy & Optimizations)

When an operator selects a workspace in the dashboard, the platform initiates an optimized synchronization pipeline that communicates with Microsoft Fabric REST APIs, constructs the parent-child activity tree, and streams real-time updates over WebSockets.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                               WORKSPACE SELECTION & SYNC LIFECYCLE                              │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
  [Operator Dashboard]
         │
         │  1. User selects workspace -> Opens WebSocket (/ws/workspaces/{id})
         ▼
  [FastAPI Backend / Celery Worker]
         │
         │  2. GET /v1/workspaces/{id}/items?type=DataPipeline
         ▼
  [Fabric Items Endpoint]  -> Returns pipeline items (ID, Name, Type)
         │
         │  3. GET /v1/workspaces/{id}/items/{pipeline_id}/jobs/instances (Parallel)
         ▼
  [Fabric Jobs Endpoint]   -> Returns recent executions (Run ID, Status, Start/End Time)
         │
         ├───▶ [⚡ INSTANT EARLY SNAPSHOT (2s)] ──▶ Broadcasts FULL_SNAPSHOT to UI immediately!
         │
         │  4. Smart Activity Filtering:
         │     - "No Runs" pipelines?       ──▶ SKIP activity query (0 calls)
         │     - Terminal & already cached? ──▶ SKIP activity query (0 calls, use DB cache)
         │     - In-Progress or new run?    ──▶ POST /datapipelines/pipelineruns/{id}/queryactivityruns
         ▼
  [Fabric Activity Runs]   -> Returns inner activities & child pipeline execution IDs
         │
         │  5. Status Rollup: If any activity is InProgress -> Outer pipeline becomes InProgress!
         │  6. Hierarchy Nesting: Links ExecutePipeline activities to child pipelines (is_child = 1)
         │  7. Schedules Check: Reuses Azure SQL schedule cache (5m TTL)
         ▼
  [Enriched Final Snapshot] ──▶ Broadcasts complete hierarchy tree & metrics to React UI
```

---

### 1. Step-by-Step Fabric API Call Sequence & Responses

#### Step 1: Discovering Pipelines in Workspace
* **Fabric API Endpoint**:
  ```http
  GET https://api.fabric.microsoft.com/v1/workspaces/{workspace_id}/items?type=DataPipeline
  ```
* **Sample Fabric Response**:
  ```json
  {
    "value": [
      {
        "id": "73e97079-0604-436f-8566-04cae42ffc06",
        "type": "DataPipeline",
        "displayName": "PL_Master_ETL_Orchestrator",
        "description": "Master pipeline calling bronze and silver ingestion",
        "workspaceId": "de0c1b5c-344a-416d-896f-40b023bcc51b"
      },
      {
        "id": "e43b1234-abcd-4ef0-9111-a1b2c3d4e5f6",
        "type": "DataPipeline",
        "displayName": "PL_Bronze_Sub_Ingestion",
        "description": "Child pipeline called by master",
        "workspaceId": "de0c1b5c-344a-416d-896f-40b023bcc51b"
      }
    ]
  }
  ```
* **Backend Processing**:
  * Note: The items endpoint **only provides pipeline definitions**, not execution states or status.
  * The backend upserts these records into the `pipelines` table.

---

#### Step 2: Fetching Recent Job Instances (Pipeline Run Status)
* **Fabric API Endpoint**:
  ```http
  GET https://api.fabric.microsoft.com/v1/workspaces/{workspace_id}/items/{pipeline_id}/jobs/instances
  ```
* **Sample Fabric Response**:
  ```json
  {
    "value": [
      {
        "id": "b4a8e990-1122-3344-5566-778899aabbcc",
        "itemId": "73e97079-0604-436f-8566-04cae42ffc06",
        "jobType": "Pipeline",
        "invokeType": "Manual",
        "status": "InProgress",
        "rootActivityId": "b4a8e990-1122-3344-5566-778899aabbcc",
        "startTimeUtc": "2026-10-11T23:30:15.123Z",
        "endTimeUtc": null,
        "failureReason": null
      }
    ]
  }
  ```
* **Backend Processing**:
  * Saves runs into `pipeline_runs` table in local database.
  * **⚡ Optimization 1 — Instant Early Broadcast**: The moment these runs are saved, the backend immediately builds and broadcasts an early `FULL_SNAPSHOT` over WebSocket. The UI table updates in **~2 seconds**, rather than waiting 12 seconds for slow activity queries and schedules to finish.

---

#### Step 3: Querying Inner Activity Runs & Forming Hierarchy
* **Fabric API Endpoint**:
  ```http
  POST https://api.fabric.microsoft.com/v1/workspaces/{workspace_id}/datapipelines/pipelineruns/{run_id}/queryactivityruns
  ```
* **Request Payload**:
  ```json
  {
    "lastUpdatedAfter": "2026-10-04T00:00:00Z",
    "lastUpdatedBefore": "2026-10-12T23:59:59Z",
    "filters": [],
    "orderBy": [{ "orderBy": "ActivityRunStart", "order": "DESC" }]
  }
  ```
* **Sample Fabric Response (With Sub-Pipeline Invocation)**:
  ```json
  {
    "value": [
      {
        "activityRunId": "act-101",
        "activityName": "Invoke_Bronze_Ingestion",
        "activityType": "ExecutePipeline",
        "status": "InProgress",
        "activityRunStart": "2026-10-11T23:30:20Z",
        "activityRunEnd": null,
        "durationInMs": 15400,
        "input": {
          "pipeline": { "referenceName": "PL_Bronze_Sub_Ingestion" }
        },
        "output": {
          "pipelineRunId": "child-run-888",
          "pipelineName": "PL_Bronze_Sub_Ingestion"
        }
      },
      {
        "activityRunId": "act-102",
        "activityName": "Copy_Sales_Transactions",
        "activityType": "Copy",
        "status": "Succeeded",
        "activityRunStart": "2026-10-11T23:30:16Z",
        "activityRunEnd": "2026-10-11T23:30:19Z",
        "durationInMs": 3000
      }
    ]
  }
  ```
* **Hierarchy Nesting Logic**:
  * When an activity has `activityType == "ExecutePipeline"`, its output contains the `pipelineRunId` of the invoked sub-pipeline.
  * The backend recursively queries activities for `child-run-888` and nests them inside `activity.childPipeline`.
  * The database marks `is_child = 1` and `is_master = 0` for `PL_Bronze_Sub_Ingestion` so it appears strictly as an expandable node inside the master pipeline, eliminating duplicate floating rows in the root view.

---

#### Step 4: Pipeline Schedules & Triggers
* **Fabric API Endpoint**:
  ```http
  GET https://api.fabric.microsoft.com/v1/workspaces/{workspace_id}/items/{pipeline_id}/jobs/schedules
  ```
* **Sample Fabric Response**:
  ```json
  {
    "value": [
      {
        "id": "sched-1",
        "enabled": true,
        "scheduleType": "Daily",
        "nextRunTime": "2026-10-12T04:00:00Z",
        "timeZone": "UTC"
      }
    ]
  }
  ```
* **Backend Processing**:
  * Cached in Azure SQL `pipeline_schedules` with a **5-minute TTL**.
  * Reuses cache to prevent burning 4+ seconds calling Fabric on every poll cycle.

---

### 2. Severe Polling Optimizations Implemented

| Optimization | How It Works | Performance Benefit |
| :--- | :--- | :--- |
| **Instant Early Status Broadcast** | Emits a WebSocket `FULL_SNAPSHOT` immediately after Step 2 (`save_pipeline_runs`) finishes. | UI status changes update in **~2 seconds** instead of waiting 12+ seconds for activity recursion and schedules. |
| **Status Rollup (`NotStarted` $\rightarrow$ `InProgress`)** | Microsoft Fabric often marks pipeline job instances as `"NotStarted"` even while child activities are already executing. The poller detects running child activities and **auto-promotes the outer pipeline's status to `InProgress`**, displaying an active blue spinner instead of a misleading grey text badge. | Accurate, real-time representation of running pipelines without waiting for Fabric job state updates. |
| **0 API Calls for "No Runs" Pipelines** | If a pipeline has never run (placeholder `norun-*`), the engine detects it immediately and skips `queryactivityruns` completely. | Eliminates unnecessary 404/empty REST calls against Fabric. |
| **0 API Calls for Cached Terminal Runs** | Finished runs (`Completed`, `Failed`, `Cancelled`) already stored with activities in SQLite/Azure SQL are static. The engine **skips calling Fabric for finished runs**, preserving the cache even on force-sync. | Cuts 3–5 seconds and dozens of redundant HTTP requests per cycle. |
| **Non-Blocking Schedule Sync** | Checks a 5-minute cache TTL before querying schedules. If fresh, skips Fabric schedule calls; if stale, updates without delaying pipeline status. | Saves ~4.2 seconds of blocking network delay per poll cycle. |
| **Fabric HTTP Log Silencing & Clean Telemetry Table** | In `azure_function/`, all `httpx` and `httpcore` loggers are filtered to `WARNING`. On each sweep, a single clean ASCII table is rendered summarizing configured pipelines, workspaces, active failures, manual resolutions, and SLA alerts. | Completely eliminates hundreds of noisy `HTTP Request: GET ... 200 OK` lines from cloud log streams. |

---

## Project Structure

```
mymonitor/
├── azure_function/                  # 24/7 Autonomous Watchdog Appliance
│   ├── core/                        # Pydantic configuration loaded from environment
│   │   └── config.py                # App settings, credentials, and cron schedule
│   ├── db/                          # SQLAlchemy database models & session management
│   │   ├── base.py                  # DeclarativeBase definition
│   │   ├── models.py                # SLAConfig and SLAIncident schema
│   │   └── session.py               # Azure SQL async engine & normalize_db_url
│   ├── services/                    # Appliance business logic
│   │   ├── alert_service.py         # Multi-tier HTML email alerts & SMTP delivery
│   │   ├── db_service.py            # Database operations for configured SLAs & incidents
│   │   ├── fabric_service.py        # Fabric REST API client & capacity discovery
│   │   └── watchdog_engine.py       # Autonomous sweep orchestrator (sla_configs driven)
│   ├── function_app.py              # Timer Trigger & FastAPI application endpoints (AsgiFunctionApp)
│   ├── test_verify.py               # Local verification test script
│   ├── local.settings.json          # Local Azure Functions environment configuration
│   └── requirements.txt             # Python dependencies (FastAPI, azure-functions, aioodbc)
│
├── backend/                         # Interactive Monitoring API Platform
│   ├── app/                         # FastAPI core modules
│   │   ├── core/                    # Security, permissions, rate limiting, and config
│   │   ├── modules/                 # Modular domain architecture
│   │   │   ├── admin/               # Administrative roster & setup
│   │   │   ├── auth/                # Entra ID SSO & local JWT authentication
│   │   │   ├── diagnostics/         # GPT-4o AI error diagnostics
│   │   │   ├── directory/           # Microsoft Entra ID (Graph API) directory search
│   │   │   ├── lakehouse/           # Direct T-SQL query endpoints
│   │   │   ├── pipelines/           # Catalog, polling, triggers, & hierarchical run tree
│   │   │   ├── sla/                 # Incident management & SLA configuration
│   │   │   ├── table_logs/          # Delta audit logs & column mapping wizard
│   │   │   ├── users/               # User profiles, roles, and support staff roster
│   │   │   ├── websocket/           # WebSocket real-time telemetry streaming
│   │   │   └── workspaces/          # Workspace discovery & assignment
│   │   ├── app_factory.py           # Application initialization, middleware, & lifespan
│   │   └── main.py                  # API entry point & Uvicorn runner
│   ├── docker-compose.yml           # Redis broker container for Celery task offload
│   ├── Dockerfile                   # Backend & Celery container image definition
│   ├── run_celery.bat               # Windows batch script for Celery worker
│   ├── .env                         # Application environment configuration
│   └── requirements.txt             # Backend dependencies
│
├── frontend/                        # Fluent-Inspired Operator Interface
│   ├── src/
│   │   ├── components/              # Shared layouts, command bars, & modals
│   │   │   ├── layout/              # NavRail, SuiteBar, DashboardLayout, SlideOutPane
│   │   │   │   └── side-pane/       # Modular tabs: SidePaneOverviewTab, SidePaneDiagnosticsTab
│   │   │   └── shared/              # Reusable modals, pickers, & history rows
│   │   │       ├── history/         # HistoryActivityRow, HistorySubPipelineRow, HistoryContainerRow
│   │   │       ├── FabricPeoplePicker.jsx # Microsoft Entra ID user search component
│   │   │       ├── ErrorDetailModal.jsx   # Error diagnostics viewer modal
│   │   │       └── SlaConfigModal.jsx     # SLA threshold & team assignment modal
│   │   ├── features/                # Domain-specific feature modules
│   │   │   ├── admin/               # Administration console
│   │   │   │   ├── components/users/          # UsersPage, AddUserCard, UsersTable
│   │   │   │   └── components/pipeline-teams/ # PipelineTeamsPage, PipelineTeamsFilterBar, PipelineTeamsTable
│   │   │   ├── auth/                # MSAL Entra ID login & authentication gates
│   │   │   ├── monitoring/          # Operator monitoring hub
│   │   │   │   ├── components/rows/   # PipelineRow, LeafActivityRow, ContainerActivityRow, ExecutePipelineActivityRow
│   │   │   │   ├── components/badges/ # StatusBadge, SlaCountdownBadge
│   │   │   │   └── utils/             # activityTreeUtils.js, formatters.jsx
│   │   │   ├── table-logs/          # Lakehouse table audit logs & mapping wizard
│   │   │   │   ├── components/config/    # Step1ConnectionTest, Step2SchemaDiscovery, Step3ColumnMapping
│   │   │   │   └── components/dashboard/ # BatchFilterCard, BatchHeadersTable, BatchDetailsTable, LayerMetricsGrid, TableLogsTelemetryCard
│   │   │   └── openai/              # AI diagnostic presentation modal
│   │   ├── App.jsx                  # Root dashboard with role-based routing
│   │   └── main.jsx                 # Entry point with MSAL provider
│   └── package.json                 # Frontend dependencies
│
└── postman/                         # API Testing Collections & Environments
    ├── azure_function/              # Watchdog Appliance endpoints & Fabric REST APIs
    │   ├── Azure_Watchdog_Function.postman_collection.json
    │   ├── Azure_Watchdog_Function.postman_environment.json
    │   └── README.md
    └── monitor/                     # Interactive Application Backend collection & environment
        ├── Fabric_Monitor_Application.postman_collection.json
        ├── Fabric_Monitor_Application.postman_environment.json
        └── README.md
```

---

## Postman API Collections & Automated Testing

The repository provides two end-to-end, production-ready Postman collections and environments located in the `postman/` directory:

### 1. Interactive Application Platform APIs (`postman/monitor/`)
* **Collection File**: `Fabric_Monitor_Application.postman_collection.json`
* **Environment File**: `Fabric_Monitor_Application.postman_environment.json`
* **Port / Base URL**: `http://localhost:8000`
* **Automated Features**: Pre-request and test scripts automatically extract access tokens, refresh tokens, workspace IDs, pipeline IDs, and incident IDs into environment variables.
* **Coverage Across 11 Modules (40+ Endpoints)**:
  * **`00. Health & Diagnostics`**: `GET /health` (validates poller and tenant status).
  * **`01. Authentication & RBAC`**: `POST /api/auth/jwt/login`, `GET /api/auth/me`, `GET /api/auth/my-assignments`, `POST /api/auth/jwt/refresh`, `POST /api/auth/entra-id/exchange`, `POST /api/auth/jwt/logout`.
  * **`02. Entra ID Directory Search`**: `GET /api/directory/users` (Microsoft Graph search by name/email/UPN), `GET /api/directory/users/search` (rapid prefix search).
  * **`03. Admin Setup & Roster Management`**: `GET /api/roles`, `GET /api/admin/users`, `POST /api/admin/users` (Add L1/L2), `POST /api/admin/users/role`, `GET /api/admin/assignments`, `DELETE /api/admin/users/{email}`.
  * **`04. Workspaces & Pipeline Catalogs`**: `GET /api/workspaces`, `GET /api/workspaces/{wsId}/pipelines` (with `parent_only=true/false`), `GET /api/workspaces/{wsId}/parent-pipelines`, `GET /api/workspaces/{wsId}/pipeline-assignments`, `GET /api/workspaces/{wsId}/schedules`.
  * **`05. SLA & Domain Configuration`**: `POST /api/workspaces/{wsId}/pipelines/{pId}/sla` (assign L1/L2, SLA1/SLA2 minutes, domain), `GET /api/workspaces/{wsId}/pipelines/{pId}/sla`, `POST /api/workspaces/{wsId}/pipelines/{pId}/test-email`.
  * **`06. Pipeline Execution & Real-Time Monitoring`**:
    * `POST /api/workspaces/{wsId}/pipelines/{pId}/run` (on-demand trigger with instant live broadcast).
    * `GET /api/workspaces/{wsId}/snapshot` with date filter presets: `latest`, `today`, `yesterday`, `7d`, `30d`, and `custom`.
    * `GET /api/workspaces/{wsId}/tree` (hierarchical parent-child run tree).
    * `GET /api/workspaces/{wsId}/pipelines/{pId}/history` (full chronological run history).
    * `GET /api/workspaces/{wsId}/pipelines/{pId}/runs/{runId}/activities` (granular inner activity executions).
    * `GET /api/workspaces/{wsId}/pipelines/{pId}/schedule` and `schedules`.
  * **`07. SLA Incidents & Escalation Workflow`**: `GET /api/workspaces/{wsId}/incidents`, `POST /api/workspaces/{wsId}/incidents/{incId}/resolve`, `GET /api/workspaces/incidents` (tenant-wide active breaches), `POST /api/workspaces/incidents/{incId}/resolve`.
  * **`08. AI Diagnostics (Azure OpenAI GPT-4o)`**: `POST /api/diagnostics/ai-fix`, `POST /api/workspaces/{wsId}/diagnostics/ai-fix` (generates root-cause diagnosis, severity, remediation steps, and fix code).
  * **`09. Lakehouse Table Logs & SQL Metadata`**:
    * `GET /api/workspaces/{wsId}/data-artifacts` (Lakehouse & Warehouse SQL endpoints).
    * `GET /api/workspaces/{wsId}/table-logs/tables` (Delta table discovery).
    * `POST /api/workspaces/{wsId}/sql-metadata/tables` & `columns` (live schema inspection).
    * `POST /api/workspaces/{wsId}/table-logs/test-connection` (SQL connectivity validation).
    * `GET / POST / DELETE /api/workspaces/{wsId}/table-log-mapping` (audit log column mapping persistence).
    * `GET / POST /api/workspaces/{wsId}/table-logs/config` (storage artifact configuration).
    * `GET /api/workspaces/{wsId}/table-logs` (KPIs, Bronze/Silver layer counts).
    * `GET / POST /api/workspaces/{wsId}/table-logs/headers` (batch execution steps).
    * `GET /api/workspaces/{wsId}/table-logs/details` (detailed step-level metrics).
    * `GET /api/workspaces/{wsId}/table-logs/table-preview` (top N row preview).
    * `GET /api/workspaces/{wsId}/table-logs/diagnostic` (pipeline and Lakehouse health check).
  * **`10. WebSocket Real-Time Telemetry`**: `GET {{wsBaseUrl}}/ws/workspaces/{wsId}` (live snapshot + instant push broadcasts).

### 2. Azure Watchdog Function & Fabric REST APIs (`postman/azure_function/`)
* **Collection File**: `Azure_Watchdog_Function.postman_collection.json`
* **Environment File**: `Azure_Watchdog_Function.postman_environment.json`
* **Port / Base URL**: `http://localhost:7071` (Azure Functions Core Tools) or `http://localhost:8001` (FastAPI Uvicorn)
* **Structured in 2 Logical Folders**:
  * **Folder 1: Azure Function Watchdog Endpoints**:
    * `GET /api/health` — Returns watchdog health, validates Service Principal token, and reports cron schedule.
    * `GET /api/workspaces/capacity` — Sweeps tenant and lists all ~30 capacity-assigned workspaces.
    * `POST /api/sweep/trigger` — Executes an immediate on-demand autonomous sweep directly against `sla_configs`, checking configured SLA pipelines, tracking deadlines, escalating to L2, and returning execution stats (`pipelinesConfiguredInDB`, `pipelinesChecked`, `failedPipelinesDetected`, `newL1AlertsSent`, `rerunFailuresDetected`, `l2EscalationsTriggered`, `sla2BreachesTriggered`, `criticalRemindersSent`, `recoveriesResolved`, `durationMs`).
    * `GET /api/incidents/active` — Lists all active, escalated, and critical unresolved incidents from Azure SQL.
    * `POST /api/test-email` — Sends a test notification email over SMTP to verify alert deliverability.
    * `GET /openapi.json` — Returns raw OpenAPI 3.0 specification.
  * **Folder 2: Underlying Microsoft Fabric REST APIs (Step-by-Step Raw Testing)**:
    * `Step 1: Acquire Fabric OAuth2 Token` — Acquires token via Microsoft Entra ID; test script auto-saves into `{{fabric_token}}`.
    * `Step 2: List Workspaces (Inspect Capacity IDs)` — Queries workspaces and auto-selects a capacity workspace ID into `{{workspace_id}}`.
    * `Step 3: List Data Pipelines in Workspace` — Queries DataPipeline items and auto-saves `{{pipeline_id}}`.
    * `Step 4: Get Pipeline Execution Runs` — Queries `/jobs/instances` and auto-saves latest `{{run_id}}`.
    * `Step 5: Query Activity Runs & Error Diagnostics` — Queries granular activities and failure diagnostics via `/queryactivityruns`.

---

## Quickstart & Local Setup

### 1. Prerequisites
* **Python 3.11+**
* **Node.js 18+** & `npm`
* **Docker Desktop** (for Redis broker)
* **ODBC Driver 18 for SQL Server** (standardized for Azure Functions & FastAPI async SQLAlchemy)
* Access to Azure SQL Database and Microsoft Fabric tenant with a Service Principal.

### 2. Docker Commands (Redis Message Broker)

Redis acts as the message broker and Celery result backend (`redis://localhost:6379/0`).

```powershell
# Start Redis container in background
docker compose -f backend/docker-compose.yml up -d

# Verify Redis is running and healthy
docker ps --filter "name=fabric_monitor_redis"
docker exec -it fabric_monitor_redis redis-cli ping
# Output: PONG

# Stop Redis container
docker compose -f backend/docker-compose.yml down

# (Optional) Build backend container image
docker build -t fabric-monitor-backend backend/
```

### 3. Celery Worker Commands (Background Task Processing)

Celery offloads background tasks, asynchronous Fabric synchronizations, and heavy background workloads from the FastAPI main loop.

> **Windows Note**: Celery defaults to the `prefork` pool, which is unsupported on Windows. On Windows, you **must** use the thread pool (`-P threads`) or solo pool (`--pool=solo`).

```powershell
# Option A: Windows Automated Batch Script (Recommended for Windows)
cd backend
.\run_celery.bat

# Option B: Manual CLI Execution (Windows - PowerShell / CMD inside venv)
cd backend
.\venv\Scripts\activate
celery -A app.core.celery_app.celery_app worker -P threads --concurrency=4 --loglevel=info

# Option C: Linux / Docker Container Execution
celery -A app.core.celery_app.celery_app worker --loglevel=info --concurrency=4

# Inspect worker status and active tasks
celery -A app.core.celery_app.celery_app status
celery -A app.core.celery_app.celery_app inspect active
```

### 4. Running the Azure Function Watchdog Appliance
```powershell
cd azure_function
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt

# Run with Uvicorn (FastAPI runner on port 8001)
uvicorn function_app:fastapi_app --port 8001 --reload

# Or run with Azure Functions Core Tools
func start
```

### 5. Running the Application Backend
```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt

# Start FastAPI server on port 8000
uvicorn app.main:app --port 8000 --reload
```

### 6. Running the Frontend Dashboard
```powershell
cd frontend
npm install
npm run dev
# Dashboard launches at http://localhost:5173
```

### 7. Recommended Local Startup Sequence

For full local development with all background components active, open separate terminal windows in this sequence:

| Step | Component | Directory | Command |
| :---: | :--- | :--- | :--- |
| **1** | **Redis Broker** | Root / `backend/` | `docker compose -f backend/docker-compose.yml up -d` |
| **2** | **Celery Worker** | `backend/` | `.\run_celery.bat` |
| **3** | **FastAPI Backend** | `backend/` | `uvicorn app.main:app --port 8000 --reload` |
| **4** | **Watchdog Appliance** | `azure_function/` | `uvicorn function_app:fastapi_app --port 8001 --reload` |
| **5** | **React Frontend** | `frontend/` | `npm run dev` (Access at `http://localhost:5173`) |

---

## License & Operational Support
Maintained for enterprise Microsoft Fabric operations. For support, escalate via designated L1/L2 contacts or review system health via `GET /api/health`.
