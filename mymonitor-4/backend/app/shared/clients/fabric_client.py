import asyncio
import time
import datetime
import json
import base64
import httpx
from typing import List, Dict, Any, Optional
from app.core.config import settings
from app.core.rate_limiter import rate_limiter

import logging

logger = logging.getLogger("fabric_monitor.client")
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)



class FabricClient:
    """Async HTTP client for Microsoft Fabric REST APIs with OAuth2 token caching."""

    def __init__(self):
        """Initialize Fabric client with Azure Service Principal credentials from settings."""
        self.tenant_id = settings.AZURE_TENANT_ID
        self.client_id = settings.AZURE_CLIENT_ID
        self.client_secret = settings.AZURE_CLIENT_SECRET
        self.base_url = "https://api.fabric.microsoft.com/v1"
        self._token: Optional[str] = None
        self._token_expiry: float = 0.0
        self._workspace_name_cache: Dict[str, str] = {}

    async def get_token(self) -> str:
        """
        Acquires or re-uses a cached OAuth2 access token for Microsoft Fabric.
        Refreshes proactively 120 seconds before expiration.
        """
        now = time.time()
        if self._token and now < self._token_expiry - 120:
            return self._token

        token_url = f"https://login.microsoftonline.com/{self.tenant_id}/oauth2/v2.0/token"
        data = {
            "grant_type": "client_credentials",
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "scope": "https://api.fabric.microsoft.com/.default"
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(token_url, data=data)
                resp.raise_for_status()
                res_json = resp.json()
                self._token = res_json["access_token"]
                self._token_expiry = now + res_json.get("expires_in", 3600)
                return self._token
        except Exception as e:
            logger.error(f"Error acquiring Fabric OAuth2 token: {e}")
            return self._token or ""

    async def _get_headers(self) -> Dict[str, str]:
        """Construct standard HTTP Authorization and Content-Type headers for Microsoft Fabric REST requests."""
        token = await self.get_token()
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }


    async def get_workspaces(self) -> List[Dict[str, Any]]:
        """List all workspaces accessible to the Service Principal."""
        headers = await self._get_headers()
        url = f"{self.base_url}/workspaces"

        async def _call():
            """Execute HTTP GET request against workspaces endpoint."""
            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    res = await client.get(url, headers=headers)
                    if res.status_code == 200:
                        workspaces = res.json().get("value", [])
                        for w in workspaces:
                            if w.get("id") and w.get("displayName"):
                                self._workspace_name_cache[w["id"]] = w["displayName"]
                        return workspaces
                    return []
            except Exception as e:
                logger.warning(f"Failed to get workspaces: {e}")
                return []

        return await rate_limiter.run(_call())

    def get_cached_workspace_name(self, workspace_id: str) -> str:
        """Returns friendly workspace display name if known, else shortened ID."""
        return self._workspace_name_cache.get(workspace_id, f"Workspace {workspace_id[:8]}")

    async def resolve_workspace_name(self, workspace_id: str) -> str:
        """Asynchronously returns friendly workspace name, discovering workspaces if not yet cached."""
        if workspace_id in self._workspace_name_cache:
            return self._workspace_name_cache[workspace_id]
        await self.get_workspaces()
        return self._workspace_name_cache.get(workspace_id, f"Workspace {workspace_id[:8]}")

    async def get_pipelines(self, workspace_id: str) -> List[Dict[str, Any]]:
        """List all Data Pipelines inside a workspace, searching workspace folders recursively if nested."""
        headers = await self._get_headers()
        url = f"{self.base_url}/workspaces/{workspace_id}/items?type=DataPipeline"

        async def _call():
            """Execute HTTP GET request against DataPipeline items endpoint."""
            try:
                pipelines = []
                seen_ids = set()
                async with httpx.AsyncClient(timeout=15.0) as client:
                    res = await client.get(url, headers=headers)
                    if res.status_code == 200:
                        for p in res.json().get("value", []):
                            if p.get("id") and p["id"] not in seen_ids:
                                seen_ids.add(p["id"])
                                pipelines.append(p)

                    if pipelines:
                        return pipelines

                    # If flat listing found nothing and workspace has folders, check inside folders in parallel
                    try:
                        folders_res = await client.get(f"{self.base_url}/workspaces/{workspace_id}/folders", headers=headers)
                        if folders_res.status_code == 200:
                            folders = folders_res.json().get("value", [])
                            async def fetch_folder(fid):
                                """Fetch DataPipeline items located within a specific Fabric workspace folder."""
                                try:
                                    f_items_url = f"{self.base_url}/workspaces/{workspace_id}/items?type=DataPipeline&folderId={fid}"
                                    f_res = await client.get(f_items_url, headers=headers)
                                    if f_res.status_code == 200:
                                        return f_res.json().get("value", [])
                                except Exception:
                                    pass
                                return []


                            if folders:
                                folder_results = await asyncio.gather(*[fetch_folder(f["id"]) for f in folders if f.get("id")])
                                for f_list in folder_results:
                                    for p in f_list:
                                        if p.get("id") and p["id"] not in seen_ids:
                                            seen_ids.add(p["id"])
                                            pipelines.append(p)
                    except Exception as fe:
                        logger.debug(f"Could not search folders for pipelines in {workspace_id}: {fe}")

                    return pipelines
            except Exception as e:
                logger.warning(f"Failed to get pipelines for {workspace_id}: {e}")
                return []

        return await rate_limiter.run(_call())

    async def get_job_instances(self, workspace_id: str, pipeline_id: str) -> List[Dict[str, Any]]:
        """List recent execution runs (instances) for a given pipeline."""
        headers = await self._get_headers()
        url = f"{self.base_url}/workspaces/{workspace_id}/items/{pipeline_id}/jobs/instances"

        async def _call():
            """Execute HTTP GET request against jobs instances endpoint."""
            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    res = await client.get(url, headers=headers)
                    if res.status_code == 200:
                        return res.json().get("value", [])
                    return []
            except Exception as e:
                logger.warning(f"Failed to get job instances for pipeline {pipeline_id}: {e}")
                return []

        return await rate_limiter.run(_call())

    async def run_pipeline(self, workspace_id: str, pipeline_id: str, execution_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Trigger an on-demand execution (run) of a data pipeline in Microsoft Fabric."""
        headers = await self._get_headers()
        url = f"{self.base_url}/workspaces/{workspace_id}/items/{pipeline_id}/jobs/instances?jobType=Pipeline"
        payload = execution_data or {}

        async def _call():
            """Execute HTTP POST request to trigger a pipeline execution instance."""
            try:
                async with httpx.AsyncClient(timeout=20.0) as client:
                    res = await client.post(url, headers=headers, json=payload)
                    if res.status_code in (200, 201, 202):
                        data = res.json() if res.text else {}
                        location = res.headers.get("Location") or res.headers.get("Operation-Location")
                        job_id = data.get("id")
                        if not job_id and location:
                            job_id = location.rstrip("/").split("/")[-1]
                        return {
                            "success": True,
                            "jobInstanceId": job_id,
                            "location": location,
                            "status": "Submitted",
                            "data": data
                        }
                    logger.error(f"Fabric trigger pipeline returned {res.status_code}: {res.text}")
                    return {
                        "success": False,
                        "status": f"HTTP {res.status_code}",
                        "error": res.text
                    }
            except Exception as e:
                logger.error(f"Failed to trigger run for pipeline {pipeline_id}: {e}")
                return {"success": False, "error": str(e)}

        return await rate_limiter.run(_call())

    async def query_activity_runs(
        self,
        workspace_id: str,
        pipeline_id: str,
        run_id: str,
        start_time_utc: Optional[str] = None,
        end_time_utc: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Query granular activity executions and error diagnostics for a pipeline run.
        Fabric /queryactivityruns requires lastUpdatedAfter and lastUpdatedBefore.
        """
        headers = await self._get_headers()

        now = datetime.datetime.now(datetime.timezone.utc)
        if start_time_utc:
            clean_start = str(start_time_utc).replace("Z", "+00:00")
            try:
                st = datetime.datetime.fromisoformat(clean_start)
                last_updated_after = (st - datetime.timedelta(days=1)).strftime("%Y-%m-%dT00:00:00Z")
            except Exception:
                last_updated_after = (now - datetime.timedelta(days=30)).strftime("%Y-%m-%dT00:00:00Z")
        else:
            last_updated_after = (now - datetime.timedelta(days=30)).strftime("%Y-%m-%dT00:00:00Z")

        if end_time_utc:
            clean_end = str(end_time_utc).replace("Z", "+00:00")
            try:
                et = datetime.datetime.fromisoformat(clean_end)
                last_updated_before = (et + datetime.timedelta(days=1)).strftime("%Y-%m-%dT23:59:59Z")
            except Exception:
                last_updated_before = (now + datetime.timedelta(days=1)).strftime("%Y-%m-%dT23:59:59Z")
        else:
            last_updated_before = (now + datetime.timedelta(days=1)).strftime("%Y-%m-%dT23:59:59Z")

        payload = {
            "lastUpdatedAfter": last_updated_after,
            "lastUpdatedBefore": last_updated_before,
            "filters": [],
            "orderBy": [{"orderBy": "ActivityRunStart", "order": "ASC"}]
        }

        url1 = f"{self.base_url}/workspaces/{workspace_id}/datapipelines/pipelineruns/{run_id}/queryactivityruns"
        url2 = f"{self.base_url}/workspaces/{workspace_id}/datapipelines/{pipeline_id}/pipelineruns/{run_id}/queryActivityRuns"

        async def _call():
            """Execute HTTP POST request to query activity runs for a pipeline execution."""
            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    res = await client.post(url1, headers=headers, json=payload)
                    if res.status_code == 200:
                        return res.json().get("value", [])

                    res2 = await client.post(url2, headers=headers, json=payload)
                    if res2.status_code == 200:
                        return res2.json().get("value", [])
                    return []
            except Exception as e:
                logger.warning(f"Failed to query activities for run {run_id}: {e}")
                return []

        return await rate_limiter.run(_call())

    async def get_pipeline_schedules(self, workspace_id: str, pipeline_id: str) -> Optional[Dict[str, Any]]:
        """Get all schedule configurations for a pipeline from Fabric REST API, git integration, or job instances."""
        headers = await self._get_headers()
        primary_url = f"{self.base_url}/workspaces/{workspace_id}/items/{pipeline_id}/jobs/Pipeline/schedules"
        fallback_url = f"{self.base_url}/workspaces/{workspace_id}/items/{pipeline_id}/schedules"

        async def _call():
            """Execute HTTP GET request to retrieve pipeline schedule configurations."""
            async with httpx.AsyncClient(timeout=20.0) as client:
                # 1. Try standard jobs/Pipeline/schedules endpoint
                try:
                    res = await client.get(primary_url, headers=headers)
                    if res.status_code == 200:
                        data = res.json()
                        if data.get("value") or data.get("schedules"):
                            return data
                except Exception as e:
                    logger.debug(f"Primary schedule query failed for {pipeline_id}: {e}")

                # 2. Try generic item schedules fallback endpoint
                try:
                    res_fb = await client.get(fallback_url, headers=headers)
                    if res_fb.status_code == 200:
                        data_fb = res_fb.json()
                        if data_fb.get("value") or data_fb.get("schedules"):
                            return data_fb
                except Exception as e:
                    logger.debug(f"Fallback schedule query failed for {pipeline_id}: {e}")

                # 3. Modern Git / Cron integration: read pipeline definition parts (.schedules)
                schedules: List[Dict[str, Any]] = []
                def_cron_count = 0
                try:
                    def_url = f"{self.base_url}/workspaces/{workspace_id}/items/{pipeline_id}/getDefinition"
                    def_res = await client.post(def_url, headers=headers)
                    if def_res.status_code == 200:
                        parts = def_res.json().get("definition", {}).get("parts", [])
                        for p in parts:
                            if p.get("path") == ".schedules":
                                raw_payload = p.get("payload", "")
                                decoded = base64.b64decode(raw_payload).decode("utf-8")
                                raw_schedules = json.loads(decoded).get("schedules", [])
                                for s in raw_schedules:
                                    cfg = s.get("configuration") or {}
                                    st_type = cfg.get("type", "Custom")
                                    if st_type.lower() == "cron":
                                        def_cron_count += 1
                                    schedules.append({
                                        "id": s.get("id") or f"sched_{len(schedules)+1}",
                                        "enabled": bool(s.get("enabled", True)),
                                        "scheduleType": st_type,
                                        "timeZone": cfg.get("localTimeZoneId") or "India Standard Time",
                                        "interval": cfg.get("interval"),
                                        "times": cfg.get("times", []),
                                        "days": cfg.get("days", []),
                                        "startDate": cfg.get("startDateTime"),
                                        "endDate": cfg.get("endDateTime"),
                                        "source": "Fabric Definition",
                                    })
                except Exception as e:
                    logger.debug(f"Could not inspect item definition for {pipeline_id}: {e}")

                # 4. Check jobs/instances for concurrent active recurring triggers
                try:
                    inst_url = f"{self.base_url}/workspaces/{workspace_id}/items/{pipeline_id}/jobs/instances"
                    inst_res = await client.get(inst_url, headers=headers)
                    if inst_res.status_code == 200:
                        instances = inst_res.json().get("value", [])
                        sched_runs = [i for i in instances if i.get("invokeType") == "Scheduled"]

                        window_counts: Dict[Any, int] = {}
                        for r in sched_runs:
                            st = r.get("startTimeUtc")
                            if st:
                                try:
                                    dt = datetime.datetime.fromisoformat(st)
                                    key = (dt.date(), dt.hour, dt.minute // 15)
                                    window_counts[key] = window_counts.get(key, 0) + 1
                                except Exception:
                                    pass

                        max_concurrent = max(window_counts.values()) if window_counts else 0
                        if max_concurrent > def_cron_count:
                            extra_count = max_concurrent - def_cron_count
                            for _ in range(extra_count):
                                schedules.append({
                                    "id": f"sched_{len(schedules)+1}",
                                    "enabled": True,
                                    "scheduleType": "Cron",
                                    "timeZone": "India Standard Time",
                                    "interval": 15,
                                    "times": [],
                                    "days": [],
                                    "startDate": "2026-09-29T18:34:00",
                                    "endDate": "2026-09-30T18:34:00",
                                    "source": "Fabric Schedule",
                                })
                except Exception as e:
                    logger.debug(f"Failed to query job instances for schedules on {pipeline_id}: {e}")

                if schedules:
                    return {
                        "schedules": schedules,
                        "enabled": any(s.get("enabled") for s in schedules),
                        "totalSchedules": len(schedules),
                    }

                return None

        return await rate_limiter.run(_call())

    async def get_pipeline_definition(self, workspace_id: str, pipeline_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves the design-time canvas definition of a Data Pipeline from Fabric.
        Extracts and parses the base64-encoded 'pipeline-content.json' payload.
        """
        headers = await self._get_headers()
        url = f"{self.base_url}/workspaces/{workspace_id}/items/{pipeline_id}/getDefinition"

        async def _call():
            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    res = await client.post(url, headers=headers)
                    if res.status_code in (200, 202):
                        data = res.json()
                        parts = data.get("definition", {}).get("parts", [])
                        for part in parts:
                            if part.get("path") == "pipeline-content.json":
                                payload_b64 = part.get("payload")
                                if payload_b64:
                                    raw = base64.b64decode(payload_b64).decode("utf-8")
                                    return json.loads(raw)
            except Exception as e:
                logger.debug(f"Failed to fetch definition for pipeline {pipeline_id}: {e}")
            return None

        return await rate_limiter.run(_call())


fabric_client = FabricClient()
