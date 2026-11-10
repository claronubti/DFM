"""
Aggregator domain service facade for Fabric Table Logs.
Combines sub-services for artifact discovery, SQL telemetry queries, and column mappings.
"""

from app.core.config import settings
from app.modules.table_logs.services.artifact_discovery_service import (
    TableLogArtifactService,
)
from app.modules.table_logs.services.sql_query_service import (
    TableLogSqlService,
)
from app.modules.table_logs.services.mapping_service import (
    TableLogMappingService,
)


class TableLogService(
    TableLogArtifactService,
    TableLogSqlService,
    TableLogMappingService,
):
    """
    Unified domain service for discovering Fabric lakehouses/warehouses,
    inspecting SQL schemas, querying live batch execution telemetry, and managing mappings.
    Aggregates modular sub-services for clean separation of concerns.
    """

    def __init__(self):
        super().__init__()
        self.tenant_id = settings.AZURE_TENANT_ID
        self.client_id = settings.AZURE_CLIENT_ID
        self.client_secret = settings.AZURE_CLIENT_SECRET


# Global singleton instance for backwards compatibility
table_log_service = TableLogService()

# Compatibility alias
table_log_domain_service = table_log_service

__all__ = [
    "TableLogService",
    "table_log_service",
    "table_log_domain_service",
    "TableLogArtifactService",
    "TableLogSqlService",
    "TableLogMappingService",
]
