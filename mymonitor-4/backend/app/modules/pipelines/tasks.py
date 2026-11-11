"""Celery tasks for offloading heavy Fabric pipeline synchronization.

These tasks run inside the Celery worker process so the FastAPI event loop stays
free to answer client requests. WebSocket telemetry produced here is relayed back
to the API process via the Redis event bus.
"""

import datetime
import logging

from app.core.async_runtime import run_async
from app.core.celery_app import celery_app
from app.core.event_bus import event_bus

logger = logging.getLogger("fabric_monitor.pipelines.tasks")


async def _poll_workspace(workspace_id: str, force: bool) -> bool:
    """Synchronize a workspace with Fabric and broadcast a fresh snapshot."""
    lock_key = f"poll:{workspace_id}"
    acquired = await event_bus.acquire_lock(lock_key, ttl=180)
    if not acquired:
        # Another worker is already syncing this workspace; skip to avoid pile-up.
        return False
    try:
        from app.modules.pipelines.repository import pipeline_repository
        from app.modules.pipelines.service import leased_poller
        from app.modules.websocket.connection_manager import connection_manager
        from app.shared.clients.fabric_client import fabric_client

        ws_name = await fabric_client.resolve_workspace_name(workspace_id)
        logger.info(f"\033[96m[{ws_name}]\033[0m 🚀 Celery polling task running")
        cached = await pipeline_repository.get_workspace_latest_tree(workspace_id)
        await connection_manager.broadcast_to_workspace(workspace_id, {
            "type": "SYNC_PROGRESS",
            "workspaceId": workspace_id,
            "stage": "connecting",
            "message": "Connecting to Microsoft Fabric and discovering pipelines...",
            "percent": 15,
        })

        await leased_poller.sync_workspace_with_fabric(workspace_id, force_sync=force)
        leased_poller._last_workspace_sync[workspace_id] = datetime.datetime.now(datetime.timezone.utc).timestamp()
        return True

    except Exception as exc:
        logger.error(f"Error during _poll_workspace for {workspace_id}: {exc}", exc_info=True)
        from app.modules.websocket.connection_manager import connection_manager
        await connection_manager.broadcast_to_workspace(workspace_id, {
            "type": "SYNC_ERROR",
            "workspaceId": workspace_id,
            "message": f"Sync failed: {str(exc)}",
        })
        return False
    finally:
        await event_bus.release_lock(lock_key)


@celery_app.task(name="pipelines.poll_workspace", bind=True, max_retries=0)
def poll_workspace_task(self, workspace_id: str, force: bool = False) -> bool:
    """Sync a single workspace and push its latest snapshot to viewers."""
    try:
        return run_async(_poll_workspace(workspace_id, bool(force)))
    except Exception as exc:
        logger.error(f"poll_workspace_task failed for {workspace_id}: {exc}", exc_info=True)
        return False
