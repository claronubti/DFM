"""
Table Log Configuration and Schema-Mapping Service.
"""

import datetime
import logging
from typing import Any, Dict, Optional

from app.modules.table_logs.repository import table_log_repository
from app.modules.table_logs.schema import SaveTableLogMappingRequest

logger = logging.getLogger("fabric_monitor.table_logs.services.mapping")


class TableLogMappingService:
    """Manages workspace-level metadata mappings between Lakehouse/Warehouse tables and monitor telemetry."""

    async def get_table_log_mapping(self, workspace_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve persisted table log column mappings for a workspace."""
        return await table_log_repository.get_table_log_mapping(workspace_id)

    async def save_table_log_mapping(
        self,
        workspace_id: str,
        payload: SaveTableLogMappingRequest,
    ) -> Dict[str, Any]:
        """Save or update table log column configuration for a workspace."""
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        await table_log_repository.save_table_log_mapping(
            workspace_id=workspace_id,
            artifact_type=payload.artifactType or payload.artifact_type or "",
            artifact_id=payload.artifactId or payload.artifact_id or "",
            artifact_name=payload.artifactName or payload.artifact_name or "",
            server_fqdn=payload.serverFqdn or payload.server_fqdn or "",
            database_name=payload.databaseName or payload.database_name or "",
            batch_header_schema=payload.batchHeaderSchema or payload.batch_header_schema or "",
            batch_header_table=payload.batchHeaderTable or payload.batch_header_table or "",
            batch_header_mapping=payload.batchHeaderMapping or payload.batch_header_mapping or {},
            bronze_schema=payload.bronzeSchema or payload.bronze_schema or "",
            bronze_table=payload.bronzeTable or payload.bronze_table or "",
            bronze_mapping=payload.bronzeMapping or payload.bronze_mapping or {},
            silver_schema=payload.silverSchema or payload.silver_schema or "",
            silver_table=payload.silverTable or payload.silver_table or "",
            silver_mapping=payload.silverMapping or payload.silver_mapping or {},
            updated_at=now_iso,
        )
        return {"status": "success", "workspaceId": workspace_id, "updatedAt": now_iso}

    async def delete_table_log_mapping(self, workspace_id: str) -> Dict[str, Any]:
        """Clear table log configuration mapping for a workspace."""
        await table_log_repository.delete_table_log_mapping(workspace_id)
        return {"status": "success", "message": "Mapping cleared successfully."}
