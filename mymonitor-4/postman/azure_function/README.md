# Postman Guide — 24/7 Azure Function Watchdog & Microsoft Fabric APIs

This folder contains the complete, battle-tested Postman collection and environment to test:
1. **Azure Function Watchdog APIs (FastAPI)**: Health check, capacity workspace discovery, on-demand sweep triggers, active incident queries, and test email delivery.
2. **Underlying Microsoft Fabric REST APIs**: Step-by-step raw Fabric APIs used by the Azure Function appliance to discover items, inspect execution runs, and query granular activity diagnostics.

---

## Files Included

1. **`Azure_Watchdog_Function.postman_collection.json`**:
   - Structured into 2 logical folders:
     - `1. Azure Function Watchdog Endpoints`
     - `2. Underlying Microsoft Fabric REST APIs`
2. **`Azure_Watchdog_Function.postman_environment.json`**:
   - Pre-configured environment variables including Service Principal credentials (`tenant_id`, `client_id`, `client_secret`), `base_url`, `fabric_base_url`, and auto-updating dynamic variables (`fabric_token`, `workspace_id`, `pipeline_id`, `run_id`).

---

## How to Import and Use in Postman

1. Open Postman.
2. Click **Import** (top left).
3. Select both files:
   - `Azure_Watchdog_Function.postman_collection.json`
   - `Azure_Watchdog_Function.postman_environment.json`
4. In the top-right environment dropdown, select: **Azure Watchdog Function - Environment**.

---

## Endpoints Breakdown

### Folder 1: Azure Function Watchdog Endpoints

#### 1. `GET {{base_url}}/api/health` — Health Check & Fabric Auth Status
* **Purpose**: Validates that the Azure Function appliance is operational.
* **Checks**:
  * Verifies that the Service Principal token can be acquired from Microsoft Entra ID.
  * Checks tenant ID, client ID, database configuration status, and configured cron schedule.

#### 2. `GET {{base_url}}/api/workspaces/capacity` — List Capacity-Assigned Workspaces
* **Purpose**: Sweeps the Fabric tenant and returns only workspaces assigned to a dedicated Fabric capacity (~30 workspaces).
* **Filters**: Ignores personal, trial, or unassigned workspaces to focus compute resources.

#### 3. `POST {{base_url}}/api/sweep/trigger` — Trigger 24/7 Autonomous Sweep (On-Demand)
* **Purpose**: Executes an immediate autonomous sweep scoped strictly to pipelines configured with L1 or L2 support in Azure SQL `sla_configs`.
* **Execution Logic & Cases Handled**:
  * **Targeted Database Scope**: Directly queries `sla_configs` in Azure SQL. Since workspace IDs and pipeline IDs are already stored in the configuration table, redundant tenant-wide workspace pagination is eliminated, completely preventing Fabric HTTP 429 rate limiting.
  * **ODBC Driver 18 Standardization**: Connects using `ODBC Driver 18 for SQL Server` with normalized connection strings (`TrustServerCertificate=yes` and standard encryption).
  * **Failure Detection**: Dispatches **exactly 1 L1 failure alert email** on initial failure, records `ACTIVE` incident, and calculates `slaTargetTime`.
  * **Silent Rerun**: If a broken pipeline re-runs and fails again while an incident is open, silently updates the incident record in Azure SQL without duplicate spam emails.
  * **Auto-Recovery**: If a broken pipeline re-runs and succeeds, marks incident `RESOLVED` and dispatches green recovery emails to **both L1 and L2**.
  * **Intermediate Success**: If a pipeline succeeded between two failures, automatically resolves the prior incident and starts a clean, fresh failure cycle.
  * **SLA1 Escalation**: When `now >= sla1_target_time`, escalates status to `ESCALATED_L2` and dispatches an escalation email to the **L2 Owner only**.
  * **SLA2 Critical Breach**: When `now >= sla2_target_time`, escalates status to `CRITICAL_UNRESOLVED` and sends critical alerts to **both L1 and L2**.
  * **30-Min Reminders**: For incidents remaining in `CRITICAL_UNRESOLVED`, sends recurring reminders every 30 minutes to **both L1 and L2**.
  * **De-Duplication**: Automatically de-duplicates recipients when L1 and L2 share the same email address.
* **Response**: Returns full execution metrics:
  ```json
  {
    "status": "success",
    "message": "Watchdog sweep executed successfully.",
    "report": {
      "timestamp": "2026-10-09T15:20:00.000Z",
      "pipelinesConfiguredInDB": 6,
      "pipelinesChecked": 6,
      "failedPipelinesDetected": 1,
      "newL1AlertsSent": 0,
      "rerunFailuresDetected": 1,
      "l2EscalationsTriggered": 0,
      "sla2BreachesTriggered": 0,
      "criticalRemindersSent": 0,
      "recoveriesResolved": 0,
      "durationMs": 285
    }
  }
  ```

#### 4. `GET {{base_url}}/api/incidents/active` — Get Active & Escalated Incidents
* **Purpose**: Returns all unresolved incidents (`ACTIVE`, `ESCALATED_L2`, `CRITICAL_UNRESOLVED`) from the database with timestamps, error messages, and SLA deadlines.

#### 5. `POST {{base_url}}/api/test-email` — Send Test Verification Email
* **Purpose**: Verifies SMTP connectivity and alert deliverability for designated engineers.
* **Payload**:
  ```json
  {
    "email": "{{test_recipient_email}}",
    "role": "L1 Support Lead",
    "pipelineName": "Telemetry Verification Pipeline"
  }
  ```

#### 6. `GET {{base_url}}/openapi.json` — OpenAPI Specification
* **Purpose**: Returns the raw OpenAPI 3.0 specification generated by FastAPI for automated client generation.

---

### Folder 2: Underlying Microsoft Fabric REST APIs (Raw API Testing)

These requests execute raw Microsoft Fabric REST calls directly, with automated test scripts that link steps sequentially:

1. **Step 1: Acquire Fabric OAuth2 Token (Service Principal)**:
   * `POST https://login.microsoftonline.com/{{tenant_id}}/oauth2/v2.0/token`
   * *Automated Script*: Extracts `access_token` and saves it into `{{fabric_token}}`.
2. **Step 2: List Workspaces (Inspect Capacity IDs)**:
   * `GET {{fabric_base_url}}/workspaces`
   * *Automated Script*: Filters for capacity-assigned workspaces and auto-sets `{{workspace_id}}`.
3. **Step 3: List Data Pipelines in Workspace**:
   * `GET {{fabric_base_url}}/workspaces/{{workspace_id}}/items?type=DataPipeline`
   * *Automated Script*: Extracts the first pipeline ID and auto-sets `{{pipeline_id}}`.
4. **Step 4: Get Pipeline Execution Runs (Job Instances)**:
   * `GET {{fabric_base_url}}/workspaces/{{workspace_id}}/items/{{pipeline_id}}/jobs/instances`
   * *Automated Script*: Extracts the latest run ID and auto-sets `{{run_id}}`.
5. **Step 5: Query Activity Runs & Error Diagnostics**:
   * `POST {{fabric_base_url}}/workspaces/{{workspace_id}}/datapipelines/pipelineruns/{{run_id}}/queryactivityruns`
   * Retrieves granular inner activity runs, status, and failure error messages.
