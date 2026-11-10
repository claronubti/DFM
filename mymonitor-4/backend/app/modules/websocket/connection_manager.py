from typing import Dict, Set, List
from fastapi import WebSocket
import json
import logging

from app.core.config import settings

logger = logging.getLogger("fabric_monitor.ws")


class WorkspaceConnectionManager:
    """
    Multiplexes WebSocket connections by workspace ID.
    Enables 50+ users watching 10 workspaces to receive pushed updates
    with zero extra Fabric API calls.
    """
    def __init__(self):
        """Initialize workspace connection room dictionaries tracking active client WebSockets."""
        # workspace_id -> set of active WebSockets
        self.rooms: Dict[str, Set[WebSocket]] = {}

    async def connect(self, workspace_id: str, websocket: WebSocket):
        """Accepts and registers a new client WebSocket into the workspace room."""
        await websocket.accept()
        if workspace_id not in self.rooms:
            self.rooms[workspace_id] = set()
        self.rooms[workspace_id].add(websocket)
        logger.info(f"WebSocket client connected to workspace {workspace_id}. Total viewers: {len(self.rooms[workspace_id])}")

    def disconnect(self, workspace_id: str, websocket: WebSocket):
        """Removes a client WebSocket from the workspace room."""
        if workspace_id in self.rooms:
            self.rooms[workspace_id].discard(websocket)
            if not self.rooms[workspace_id]:
                del self.rooms[workspace_id]
                logger.info(f"Workspace {workspace_id} has 0 viewers. Room closed.")
            else:
                logger.info(f"WebSocket client disconnected from workspace {workspace_id}. Viewers left: {len(self.rooms[workspace_id])}")

    def get_active_workspace_ids(self) -> List[str]:
        """Returns all workspaces that currently have at least 1 active viewer."""
        return list(self.rooms.keys())

    def get_viewer_count(self, workspace_id: str) -> int:
        """Returns the current number of active viewers in a workspace room."""
        return len(self.rooms.get(workspace_id, set()))

    async def broadcast_to_workspace(self, workspace_id: str, message: dict):
        """Broadcasts a JSON message to all clients viewing the specified workspace.

        When Celery is enabled the event is published onto the Redis event bus so
        that messages produced inside worker processes reach the FastAPI-held
        sockets. Otherwise the message is delivered directly to local clients.
        """
        if settings.CELERY_ENABLED:
            from app.core.event_bus import event_bus
            await event_bus.publish(workspace_id, message)
            return
        await self.local_broadcast(workspace_id, message)

    async def local_broadcast(self, workspace_id: str, message: dict):
        """Delivers a JSON message directly to locally-connected workspace clients."""
        if workspace_id not in self.rooms:
            return

        dead_connections = set()
        payload = json.dumps(message)

        for ws in self.rooms[workspace_id]:
            try:
                await ws.send_text(payload)
            except Exception as e:
                logger.warning(f"Error broadcasting to client in {workspace_id}: {e}")
                dead_connections.add(ws)

        for dead in dead_connections:
            self.disconnect(workspace_id, dead)


connection_manager = WorkspaceConnectionManager()
