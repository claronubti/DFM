import asyncio
import datetime
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.modules.websocket.connection_manager import connection_manager

logger = logging.getLogger("fabric_monitor.ws")
router = APIRouter(tags=["websockets"])


@router.websocket("/ws/workspaces/{workspace_id}")
async def workspace_websocket_endpoint(websocket: WebSocket, workspace_id: str):
    """Handles real-time WebSocket connections for workspace telemetry and status broadcasts."""
    from app.modules.pipelines.service import leased_poller

    await connection_manager.connect(workspace_id, websocket)
    try:
        # Send an immediate snapshot right upon connection so user sees instant state
        from app.modules.pipelines.repository import pipeline_repository
        initial_tree = await pipeline_repository.get_workspace_tree_by_date(workspace_id, date_preset="latest")
        has_cached_data = bool(initial_tree.get("pipelines"))

        if not has_cached_data:
            await leased_poller.sync_workspace_with_fabric(workspace_id)
            initial_tree = await pipeline_repository.get_workspace_tree_by_date(workspace_id, date_preset="latest")
            has_cached_data = bool(initial_tree.get("pipelines"))

        await websocket.send_json({
            "type": "FULL_SNAPSHOT",
            "workspaceId": workspace_id,
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "viewersCount": connection_manager.get_viewer_count(workspace_id),
            "data": initial_tree.get("pipelines", []),
            "metrics": initial_tree.get("metrics"),
            "isSyncComplete": has_cached_data,
        })

        # Only trigger background sync if the workspace has NO cached pipelines in DB yet
        if not has_cached_data and workspace_id not in leased_poller._sync_in_progress:
            asyncio.create_task(leased_poller._background_sync(workspace_id))

        # Keep connection open and listen for client messages / heartbeats
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")

    except WebSocketDisconnect:
        connection_manager.disconnect(workspace_id, websocket)
    except Exception as e:
        logger.error(f"WebSocket error in workspace {workspace_id}: {e}")
        connection_manager.disconnect(workspace_id, websocket)
