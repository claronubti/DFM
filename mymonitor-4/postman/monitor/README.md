# Postman Guide — Microsoft Fabric Monitoring Application Platform APIs

This folder contains the complete Postman collection and environment to test the interactive **Microsoft Fabric Monitoring Application Platform** (FastAPI backend on port `8000`).

---

## Files Included

1. **`Fabric_Monitor_Application.postman_collection.json`** *(alias: `collection.json`)*:
   - Contains all **11 domain modules** structured logically:
     - `00. Health & System Diagnostics`
     - `01. Authentication & RBAC (Admin, L1, L2)`
     - `02. Microsoft Entra ID Directory (People Search)`
     - `03. Admin Setup - Users & Role Management`
     - `04. Workspace & Data Pipeline Catalogs`
     - `05. Pipeline-Level SLA & Domain Configuration`
     - `06. Real-Time Monitoring & Adaptive Poller`
     - `07. SLA Incidents & Lifecycle Tracking`
     - `08. Azure OpenAI GPT-4o Error Diagnostics`
     - `09. Lakehouse & Warehouse Audit Logs (Direct T-SQL)`
     - `10. WebSocket Streaming Protocol`
2. **`Fabric_Monitor_Application.postman_environment.json`** *(alias: `environment.json`)*:
   - Pre-configured variables: `baseUrl = http://localhost:8000`, `wsBaseUrl = ws://localhost:8000`, test credentials, token containers, and sample IDs.

---

## How to Import and Use in Postman

1. Open **Postman**.
2. Click **Import** (top left).
3. Select both files:
   - `Fabric_Monitor_Application.postman_collection.json`
   - `Fabric_Monitor_Application.postman_environment.json`
4. In the top-right environment selector dropdown, select: **Fabric Monitor Application - Environment**.

---

## Step-by-Step Execution Guide

### 1. Verify Health
* Run **`00. Health & System Diagnostics` $\rightarrow$ `1. System Health Check`**:
  * `GET {{baseUrl}}/health`
  * Confirms that the FastAPI backend is running and healthy.

### 2. Authenticate
* Run **`01. Authentication & RBAC` $\rightarrow$ `1. Admin Login (Password Auth)`**:
  * `POST {{baseUrl}}/api/auth/jwt/login`
  * **Automated Script**: Automatically extracts `access_token` and saves it into `{{token}}`. All subsequent requests authenticate with this bearer token automatically.
* Run **`2. Current User Profile (/me)`**:
  * `GET {{baseUrl}}/api/auth/me`
  * Inspects effective role (`admin`), `is_admin: true`, and access scope.

### 3. Microsoft Entra ID (Graph Directory Search)
* Run **`02. Entra ID Directory Search` $\rightarrow$ `1. Search Entra ID Users (Directory Service)`**:
  * `GET {{baseUrl}}/api/directory/users?query=support&top=15`
  * Searches the organization's Microsoft Entra ID tenant via Microsoft Graph API by display name, email, or UPN.
* Run **`2. Search Entra ID Users (Prefix Search)`**:
  * `GET {{baseUrl}}/api/directory/users/search?q=support&limit=15`
  * Rapid prefix-based directory lookup used by the Fluent `FabricPeoplePicker` UI component.

### 4. Admin Setup — Users & Role Management
* Run **`03. Admin Setup - Users & Role Management` $\rightarrow$ `1. List Configurable Roles`**:
  * `GET {{baseUrl}}/api/roles`
  * Returns available support roles (`l1`, `l2`).
* Run **`2. List Configured Users`**:
  * `GET {{baseUrl}}/api/admin/users`
  * Lists registered platform support personnel, admin flags, and assigned support roles.
* Run **`3. Add L1 Support User`** or **`4. Add L2 Escalation Owner`**:
  * `POST {{baseUrl}}/api/admin/users`
  * Adds an Entra ID user to the support roster with role `l1` or `l2`.
* Run **`5. Update User Support Role`**:
  * `POST {{baseUrl}}/api/admin/users/role`
  * Promotes or changes support role (`{"email": "{{l1Email}}", "role_id": "l2"}`).
* Run **`6. List All Workspace Assignments`**:
  * `GET {{baseUrl}}/api/admin/assignments`
  * Displays tenant-wide pipeline assignments from the `sla_configs` database table across all workspaces.
* Run **`7. Remove User from Support Roster`**:
  * `DELETE {{baseUrl}}/api/admin/users/{{l1Email}}`
  * Removes support user from the platform roster.

### 5. Workspace & Pipeline Catalogs
* Run **`04. Workspaces & Pipelines Catalog` $\rightarrow$ `1. List Accessible Workspaces`**:
  * `GET {{baseUrl}}/api/workspaces`
  * Automatically stores the first workspace ID into `{{workspaceId}}`.
* Run **`2. List Master & Independent Pipelines`**:
  * `GET {{baseUrl}}/api/workspaces/{{workspaceId}}/pipelines?parent_only=true`
  * Lists top-level pipelines (filtering out embedded child sub-pipelines) with SLA and health summaries.
* Run **`3. List All Pipelines (Including Sub-Pipelines)`**:
  * `GET {{baseUrl}}/api/workspaces/{{workspaceId}}/pipelines?parent_only=false`
  * Flat catalog of every DataPipeline item in the workspace.
* Run **`4. List Parent Pipelines with SLA Config`**:
  * `GET {{baseUrl}}/api/workspaces/{{workspaceId}}/parent-pipelines`
  * Parent pipelines enriched with domain and SLA configuration.
* Run **`5. List Pipeline Team & Domain Assignments`**:
  * `GET {{baseUrl}}/api/workspaces/{{workspaceId}}/pipeline-assignments`
  * Workspace-scoped pipeline roster showing configured L1/L2 assignees and SLA windows.
* Run **`6. List Workspace Pipeline Schedules`**:
  * `GET {{baseUrl}}/api/workspaces/{{workspaceId}}/schedules`
  * Discovers cron schedules across all pipelines in the workspace.

### 6. Pipeline SLA & Domain Configuration
* Run **`05. SLA & Domain Configuration` $\rightarrow$ `1. Configure Pipeline SLA & Domain`**:
  * `POST {{baseUrl}}/api/workspaces/{{workspaceId}}/pipelines/{{pipelineId}}/sla`
  * **Payload Configuration**:
    ```json
    {
      "pipelineName": "{{pipelineName}}",
      "l1Email": "{{l1Email}}",
      "l1Name": "L1 Support Specialist",
      "l2Email": "{{l2Email}}",
      "l2Name": "L2 Escalation Manager",
      "sla1Minutes": 30,
      "sla2Minutes": 60,
      "domain": "{{domain}}",
      "assignedBy": "Admin"
    }
    ```
  * **Flexibility Features**:
    * **L1 and L2 Same Person**: You can set both `l1Email` and `l2Email` to the same engineer. Notification services automatically de-duplicate recipients so only 1 email is sent.
    * **Admin Assigned to L1**: Assigning an administrator email (`mohammedabdulmalik.m@ubtiinc.com`) to L1 preserves their administrator privileges upon login, allowing them to test notifications while retaining full visibility across all workspaces.
* Run **`2. Get Pipeline SLA & Domain Config`**:
  * `GET {{baseUrl}}/api/workspaces/{{workspaceId}}/pipelines/{{pipelineId}}/sla`
* Run **`3. Send Pipeline Test Alert Email`**:
  * `POST {{baseUrl}}/api/workspaces/{{workspaceId}}/pipelines/{{pipelineId}}/test-email`

### 7. Real-Time Monitoring & Execution Snapshots
* Run **`06. Pipeline Execution & Real-Time Monitoring` $\rightarrow$ `1. Trigger Pipeline Run On-Demand`**:
  * `POST {{baseUrl}}/api/workspaces/{{workspaceId}}/pipelines/{{pipelineId}}/run`
  * Triggers an immediate execution job instance on Microsoft Fabric with instant live broadcast.
* Run **`2. Get Snapshot: Latest Runs Preset`**:
  * `GET {{baseUrl}}/api/workspaces/{{workspaceId}}/snapshot?date_preset=latest`
  * Returns real-time snapshot with hierarchical tree nesting, metrics, and KPI counts.
* Run **`3. Get Snapshot Filter: Today`**, **`4. Yesterday`**, **`5. Past 7 Days`**, **`6. Past 30 Days`**, or **`7. Custom Range`**:
  * Queries snapshot filtered by target date preset window.
* Run **`8. Get Hierarchical Run Tree`**:
  * `GET {{baseUrl}}/api/workspaces/{{workspaceId}}/tree`
  * Returns parent-child pipeline tree with nested container and ExecutePipeline activities.
* Run **`9. Get Chronological Pipeline Run History`**:
  * `GET {{baseUrl}}/api/workspaces/{{workspaceId}}/pipelines/{{pipelineId}}/history`
  * Chronological execution history for the selected pipeline.
* Run **`10. Get Granular Activity Runs`**:
  * `GET {{baseUrl}}/api/workspaces/{{workspaceId}}/pipelines/{{pipelineId}}/runs/{{runId}}/activities`
  * Granular activity executions and step-level diagnostics.
* Run **`11. Get Pipeline Schedule`** / **`12. Get Pipeline Schedules (Alias)`**:
  * `GET {{baseUrl}}/api/workspaces/{{workspaceId}}/pipelines/{{pipelineId}}/schedule`

### 8. SLA Incidents & Escalation Workflow
* Run **`07. SLA Incidents & Escalation Workflow` $\rightarrow$ `1. List Workspace Incidents`**:
  * `GET {{baseUrl}}/api/workspaces/{{workspaceId}}/incidents`
  * Returns active, escalated, and resolved incidents for the workspace.
* Run **`2. Resolve Workspace Incident`**:
  * `POST {{baseUrl}}/api/workspaces/{{workspaceId}}/incidents/{{incidentId}}/resolve`
  * Marks an active or escalated incident as resolved, stopping further alert reminders.
* Run **`3. List All Active Incidents (Cross-Workspace)`**:
  * `GET {{baseUrl}}/api/workspaces/incidents`
  * Tenant-wide overview of active SLA warnings and escalated breaches.
* Run **`4. Resolve Global Incident`**:
  * `POST {{baseUrl}}/api/workspaces/incidents/{{incidentId}}/resolve`

### 9. AI Diagnostics (Azure OpenAI GPT-4o)
* Run **`08. AI Diagnostics` $\rightarrow$ `1. Diagnose Pipeline Error with Azure OpenAI GPT-4o`**:
  * `POST {{baseUrl}}/api/diagnostics/ai-fix`
  * Sends Fabric error codes and logs to Azure OpenAI GPT-4o, returning root cause analysis, severity assessment, remediation checklist, and copyable SQL/PySpark fix code.
* Run **`2. Workspace-Scoped AI Diagnostics`**:
  * `POST {{baseUrl}}/api/workspaces/{{workspaceId}}/diagnostics/ai-fix`

### 10. Lakehouse Table Logs & SQL Metadata
* Run **`09. Lakehouse Table Logs & SQL Metadata` $\rightarrow$ `1. List Workspace Data Artifacts`**:
  * `GET {{baseUrl}}/api/workspaces/{{workspaceId}}/data-artifacts`
  * Discovers all Warehouses and Lakehouses inside the workspace with SQL connection endpoints.
* Run **`2. Discover Lakehouse Delta Tables`**:
  * `GET {{baseUrl}}/api/workspaces/{{workspaceId}}/table-logs/tables?refresh=true`
* Run **`3. List SQL Endpoint Schemas & Tables`**:
  * `POST {{baseUrl}}/api/workspaces/{{workspaceId}}/sql-metadata/tables`
* Run **`4. List SQL Table Columns & Data Types`**:
  * `POST {{baseUrl}}/api/workspaces/{{workspaceId}}/sql-metadata/columns`
* Run **`5. Test SQL Endpoint Connection`**:
  * `POST {{baseUrl}}/api/workspaces/{{workspaceId}}/table-logs/test-connection`
* Run **`6. Get Table Log Mapping Config`** / **`7. Save Table Log Mapping Config`** / **`8. Delete Table Log Mapping`**:
  * `GET / POST / DELETE {{baseUrl}}/api/workspaces/{{workspaceId}}/table-log-mapping`
* Run **`9. Get Table Log Storage Config`** / **`10. Save Table Log Storage Config`**:
  * `GET / POST {{baseUrl}}/api/workspaces/{{workspaceId}}/table-logs/config`
* Run **`11. Query Table-Level Logs (KPIs & Lineage)`**:
  * `GET {{baseUrl}}/api/workspaces/{{workspaceId}}/table-logs?batch_id={{batchId}}`
* Run **`12. Get Batch Execution Headers`** & **`13. Force Refresh Batch Headers`**:
  * `GET / POST {{baseUrl}}/api/workspaces/{{workspaceId}}/table-logs/headers`
* Run **`14. Get Batch Activity Details & Step Metrics`**:
  * `GET {{baseUrl}}/api/workspaces/{{workspaceId}}/table-logs/details?batch_id={{batchId}}&limit=100`
* Run **`15. Preview Table Rows`**:
  * `GET {{baseUrl}}/api/workspaces/{{workspaceId}}/table-logs/table-preview?table_name={{tableName}}&limit=10`
* Run **`16. Table Log Diagnostic & Health Check`**:
  * `GET {{baseUrl}}/api/workspaces/{{workspaceId}}/table-logs/diagnostic`

### 11. WebSocket Real-Time Telemetry
* Connect to:
  * `ws://localhost:8000/ws/workspaces/{{workspaceId}}`
  * Immediately receives `FULL_SNAPSHOT` upon handshake, followed by live status updates, duration counter ticks, and incident notifications.
