import datetime
import logging
import time
from typing import Any, Dict, List, Optional
import httpx
from core.config import settings

logger = logging.getLogger("azure_watchdog.fabric")
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)


class FabricService:
    """
    Microsoft Fabric REST API Client for Azure Functions Watchdog.
    
    Handles:
    - OAuth2 Service Principal client credentials authentication and automatic token caching.
    - Capacity-assigned workspace discovery with continuation token pagination.
    - Fetching recent pipeline execution job instances.
    - Extracting granular failure diagnostics and activity error logs.
    """

    def __init__(self):
        self.tenant_id = settings.AZURE_TENANT_ID
        self.client_id = settings.AZURE_CLIENT_ID
        self.client_secret = settings.AZURE_CLIENT_SECRET
        self.base_url = settings.FABRIC_API_BASE_URL
        self._token: Optional[str] = None
        self._token_expiry: float = 0.0

    async def get_token(self) -> str:
        """
        Acquires or returns a cached OAuth2 access token for Microsoft Fabric REST APIs.
        Tokens are cached until 120 seconds before their expiration.
        """
        now = time.time()
        if self._token and now < self._token_expiry - 120:
            return self._token

        token_url = f"https://login.microsoftonline.com/{self.tenant_id}/oauth2/v2.0/token"
        data = {
            "grant_type": "client_credentials",
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "scope": "https://api.fabric.microsoft.com/.default",
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(token_url, data=data)
                resp.raise_for_status()
                res_json = resp.json()
                self._token = res_json["access_token"]
                self._token_expiry = now + res_json.get("expires_in", 3600)
                logger.info("Successfully acquired new Fabric OAuth2 Service Principal access token.")
                return self._token
        except Exception as e:
            logger.error(f"Failed to acquire Fabric OAuth2 access token: {e}")
            return self._token or ""

    async def get_headers(self) -> Dict[str, str]:
        """
        Builds standard HTTP Authorization headers with the bearer token for Fabric API requests.
        """
        token = await self.get_token()
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    async def get_capacity_workspaces(self) -> List[Dict[str, Any]]:
        """
        Discovers all capacity-assigned workspaces across the Microsoft Fabric tenant.
        Handles API pagination via continuation tokens to ensure all workspaces are retrieved,
        then strictly filters for workspaces with an assigned Fabric capacity (non-empty capacityId).
        """
        headers = await self.get_headers()
        url = f"{self.base_url}/workspaces"
        all_workspaces: List[Dict[str, Any]] = []

        try:
            async with httpx.AsyncClient(timeout=25.0) as client:
                current_url: Optional[str] = url
                while current_url:
                    res = await client.get(current_url, headers=headers)
                    if res.status_code != 200:
                        logger.error(f"Fabric list workspaces failed with status {res.status_code}: {res.text}")
                        break

                    data = res.json()
                    page_items = data.get("value", [])
                    all_workspaces.extend(page_items)

                    continuation_token = data.get("continuationToken")
                    if continuation_token:
                        current_url = f"{url}?continuationToken={continuation_token}"
                    else:
                        current_url = None

            capacity_workspaces = [
                ws for ws in all_workspaces
                if ws.get("capacityId")
                and str(ws.get("capacityId")).strip() != ""
                and str(ws.get("capacityId")).lower() != "00000000-0000-0000-0000-000000000000"
            ]

            logger.info(
                f"Discovered {len(capacity_workspaces)} capacity-assigned workspace(s) "
                f"out of {len(all_workspaces)} total workspace(s) in tenant."
            )
            return capacity_workspaces
        except Exception as e:
            logger.error(f"Error discovering capacity workspaces from Fabric: {e}")
            return []

    async def get_recent_pipeline_runs(
        self, workspace_id: str, pipeline_id: str, pipeline_name: str = "", limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Fetches recent job execution instances for a configured pipeline from Fabric REST API.
        Returns instances sorted chronologically descending by execution start/end time.
        """
        headers = await self.get_headers()
        url = f"{self.base_url}/workspaces/{workspace_id}/items/{pipeline_id}/jobs/instances"

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.get(url, headers=headers)
                if res.status_code != 200:
                    return []

                instances = res.json().get("value", [])
                if not instances:
                    return []

                def _sort_key(run: Dict[str, Any]) -> str:
                    return str(
                        run.get("startTimeUtc")
                        or run.get("startTime")
                        or run.get("endTimeUtc")
                        or run.get("endTime")
                        or ""
                    )

                sorted_instances = sorted(instances, key=_sort_key, reverse=True)
                for run in sorted_instances[:limit]:
                    run["pipelineId"] = pipeline_id
                    run["pipelineName"] = pipeline_name or run.get("itemDisplayName", "Data Pipeline")
                    run["workspaceId"] = workspace_id
                return sorted_instances[:limit]
        except Exception as e:
            logger.debug(f"Failed to fetch job instances for pipeline {pipeline_id}: {e}")
            return []

    async def query_failure_diagnostics(
        self, workspace_id: str, pipeline_id: str, run_id: str
    ) -> Dict[str, Any]:
        """
        Extracts granular error codes and failure diagnostics for a failed pipeline run
        by querying the pipeline's activity execution runs.
        """
        headers = await self.get_headers()
        now = datetime.datetime.now(datetime.timezone.utc)
        last_updated_after = (now - datetime.timedelta(days=7)).strftime("%Y-%m-%dT00:00:00Z")
        last_updated_before = (now + datetime.timedelta(days=1)).strftime("%Y-%m-%dT23:59:59Z")

        payload = {
            "lastUpdatedAfter": last_updated_after,
            "lastUpdatedBefore": last_updated_before,
            "filters": [],
            "orderBy": [{"orderBy": "ActivityRunStart", "order": "DESC"}],
        }

        url1 = f"{self.base_url}/workspaces/{workspace_id}/datapipelines/pipelineruns/{run_id}/queryactivityruns"
        url2 = f"{self.base_url}/workspaces/{workspace_id}/datapipelines/{pipeline_id}/pipelineruns/{run_id}/queryActivityRuns"

        for url in [url1, url2]:
            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    res = await client.post(url, headers=headers, json=payload)
                    if res.status_code == 200:
                        activities = res.json().get("value", [])
                        for act in activities:
                            if act.get("status") == "Failed" or act.get("error"):
                                err = act.get("error") or {}
                                return {
                                    "errorCode": str(err.get("errorCode") or "Failed"),
                                    "message": err.get("message") or "Activity execution failed.",
                                    "target": err.get("target") or act.get("activityName", "Activity"),
                                    "failureType": err.get("failureType") or "UserError",
                                    "rawError": err,
                                }
            except Exception:
                continue

        return {
            "errorCode": "PipelineFailure",
            "message": "Pipeline execution completed with status Failed.",
            "target": pipeline_id,
            "failureType": "SystemError",
            "rawError": {},
        }


fabric_service = FabricService()
