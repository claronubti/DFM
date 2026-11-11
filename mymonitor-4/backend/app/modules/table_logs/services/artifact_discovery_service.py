"""
Artifact Discovery Service for Fabric Warehouses and Lakehouses.
"""

import logging
from typing import Any, Dict, List, Optional, Set
import httpx

from app.modules.table_logs.repository import table_log_repository
from app.shared.clients.fabric_client import fabric_client

logger = logging.getLogger("fabric_monitor.table_logs.services.artifacts")


class TableLogArtifactService:
    """Discovers Fabric Warehouses and Lakehouses across workspaces and nested folders."""

    async def get_data_artifacts(self, workspace_id: str) -> List[Dict[str, Any]]:
        """
        Lists all Warehouses and Lakehouses inside the selected workspace
        by querying the Microsoft Fabric REST API.
        Dynamically searches inside workspace folders when the flat listing
        returns nothing (Fabric nests items inside folder hierarchies).
        Falls back to the saved mapping artifact as a last resort.
        """
        headers = await fabric_client._get_headers()
        artifacts = []
        seen_ids: Set[str] = set()

        async with httpx.AsyncClient(timeout=15.0) as client:
            await self._fetch_warehouses(client, headers, workspace_id, artifacts, seen_ids)
            await self._fetch_lakehouses(client, headers, workspace_id, artifacts, seen_ids)

            if not artifacts:
                logger.info(f"No artifacts from flat listing for workspace {workspace_id}. Searching folders...")
                await self._search_folders_for_artifacts(client, headers, workspace_id, artifacts, seen_ids)

        if not artifacts:
            saved = await table_log_repository.get_table_log_mapping(workspace_id)
            if saved and saved.get("artifact_id") and saved["artifact_id"] not in seen_ids:
                artifacts.append({
                    "id": saved["artifact_id"],
                    "displayName": saved.get("artifact_name", "Saved Data Source"),
                    "type": saved.get("artifact_type", "Warehouse"),
                    "description": "(Previously configured – not visible via REST API)",
                    "serverFqdn": saved.get("server_fqdn"),
                    "databaseName": saved.get("database_name"),
                })

        return artifacts

    async def _fetch_warehouses(
        self,
        client: httpx.AsyncClient,
        headers: dict,
        workspace_id: str,
        artifacts: list,
        seen_ids: Set[str],
    ):
        """Fetches available Warehouses in the workspace from Fabric API."""
        wh_url = f"{fabric_client.base_url}/workspaces/{workspace_id}/warehouses"
        try:
            res = await client.get(wh_url, headers=headers)
            if res.status_code == 200:
                for wh in res.json().get("value", []):
                    props = wh.get("properties", {})
                    conn_str = props.get("connectionString") or props.get("connectionInfo")
                    aid = wh.get("id")
                    if aid not in seen_ids:
                        seen_ids.add(aid)
                        artifacts.append({
                            "id": aid,
                            "displayName": wh.get("displayName"),
                            "type": "Warehouse",
                            "description": wh.get("description", ""),
                            "serverFqdn": conn_str,
                            "databaseName": wh.get("displayName"),
                        })
        except Exception as e:
            logger.warning(f"Failed to fetch warehouses for workspace {workspace_id}: {e}")

    async def _fetch_lakehouses(
        self,
        client: httpx.AsyncClient,
        headers: dict,
        workspace_id: str,
        artifacts: list,
        seen_ids: Set[str],
    ):
        """Fetches available Lakehouses in the workspace from Fabric API."""
        lh_url = f"{fabric_client.base_url}/workspaces/{workspace_id}/lakehouses"
        try:
            res = await client.get(lh_url, headers=headers)
            if res.status_code == 200:
                for lh in res.json().get("value", []):
                    props = lh.get("properties", {})
                    sql_props = props.get("sqlEndpointProperties", {})
                    conn_str = sql_props.get("connectionString")
                    aid = lh.get("id")
                    if aid not in seen_ids:
                        seen_ids.add(aid)
                        artifacts.append({
                            "id": aid,
                            "displayName": lh.get("displayName"),
                            "type": "Lakehouse",
                            "description": lh.get("description", ""),
                            "serverFqdn": conn_str,
                            "databaseName": lh.get("displayName"),
                        })
        except Exception as e:
            logger.warning(f"Failed to fetch lakehouses for workspace {workspace_id}: {e}")

    async def _search_folders_for_artifacts(
        self,
        client: httpx.AsyncClient,
        headers: dict,
        workspace_id: str,
        artifacts: list,
        seen_ids: Set[str],
    ):
        """Searches nested workspace folders to discover Warehouses and Lakehouses."""
        try:
            folders_url = f"{fabric_client.base_url}/workspaces/{workspace_id}/folders"
            res = await client.get(folders_url, headers=headers)
            if res.status_code != 200:
                return

            folders = res.json().get("value", [])
            if not folders:
                return

            for folder in folders:
                folder_id = folder.get("id")
                folder_name = folder.get("displayName", "")
                if not folder_id:
                    continue

                for item_type in ["Warehouse", "Lakehouse"]:
                    try:
                        items_url = (
                            f"{fabric_client.base_url}/workspaces/{workspace_id}"
                            f"/items?type={item_type}&folderId={folder_id}"
                        )
                        item_res = await client.get(items_url, headers=headers)
                        if item_res.status_code == 200:
                            for item in item_res.json().get("value", []):
                                aid = item.get("id")
                                if aid and aid not in seen_ids:
                                    seen_ids.add(aid)
                                    conn_str = await self._get_artifact_connection(
                                        client, headers, workspace_id, aid, item_type
                                    )
                                    artifacts.append({
                                        "id": aid,
                                        "displayName": item.get("displayName"),
                                        "type": item_type,
                                        "description": item.get("description", f"Found in folder: {folder_name}"),
                                        "serverFqdn": conn_str,
                                        "databaseName": item.get("displayName"),
                                    })
                    except Exception as e:
                        logger.debug(f"Error querying {item_type} in folder {folder_name}: {e}")
        except Exception as e:
            logger.warning(f"Failed to search folders for artifacts in workspace {workspace_id}: {e}")

    async def _get_artifact_connection(
        self,
        client: httpx.AsyncClient,
        headers: dict,
        workspace_id: str,
        artifact_id: str,
        artifact_type: str,
    ) -> Optional[str]:
        """Extracts the SQL connection string and catalog name for an artifact."""
        try:
            if artifact_type == "Warehouse":
                url = f"{fabric_client.base_url}/workspaces/{workspace_id}/warehouses/{artifact_id}"
                res = await client.get(url, headers=headers)
                if res.status_code == 200:
                    props = res.json().get("properties", {})
                    return props.get("connectionString") or props.get("connectionInfo")
            elif artifact_type == "Lakehouse":
                url = f"{fabric_client.base_url}/workspaces/{workspace_id}/lakehouses/{artifact_id}"
                res = await client.get(url, headers=headers)
                if res.status_code == 200:
                    props = res.json().get("properties", {})
                    sql_props = props.get("sqlEndpointProperties", {})
                    return sql_props.get("connectionString")
        except Exception as e:
            logger.debug(f"Could not fetch connection for {artifact_type} {artifact_id}: {e}")
        return None
