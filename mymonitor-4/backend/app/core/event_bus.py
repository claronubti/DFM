"""Redis-backed event bus for cross-process WebSocket fan-out.

When Celery is enabled the heavy work (Fabric sync, SMTP) runs inside separate
worker processes that have no direct access to the FastAPI WebSocket
connections. Those workers publish telemetry/incident events onto a Redis
pub/sub channel; the FastAPI process subscribes and relays each event to its
locally-connected clients.

Everything degrades gracefully: if Redis is unreachable, ``publish`` falls back
to a direct in-process broadcast so the application keeps functioning.
"""

import asyncio
import json
import logging
from typing import Any, Dict

from app.core.config import settings

logger = logging.getLogger("fabric_monitor.event_bus")

WS_EVENT_CHANNEL = "fabric:ws_events"


class RedisEventBus:
    """Thin async wrapper around Redis pub/sub used to relay WebSocket events."""

    def __init__(self) -> None:
        """Initialize Redis event bus state, connection locks, and availability flags."""
        self._redis = None
        self._lock = None
        self._redis_available = True
        self._last_redis_check = 0.0

    def _get_lock(self) -> asyncio.Lock:
        if self._lock is None:
            self._lock = asyncio.Lock()
        return self._lock

    async def _client(self):
        """Lazily create (and cache) an async Redis client bound to the current loop."""
        import time
        now = time.time()
        if not self._redis_available and (now - self._last_redis_check) < 60.0:
            return None

        if self._redis is None:
            lock = self._get_lock()
            async with lock:
                if self._redis is None:
                    try:
                        import redis.asyncio as aioredis

                        self._redis = aioredis.from_url(
                            settings.REDIS_URL,
                            encoding="utf-8",
                            decode_responses=True,
                            socket_connect_timeout=1,
                            socket_timeout=1,
                            health_check_interval=30,
                        )
                    except Exception as e:
                        logger.debug(f"Redis connection failed: {e}")
                        self._redis_available = False
                        self._last_redis_check = time.time()
                        return None
        return self._redis

    async def publish(self, workspace_id: str, message: Dict[str, Any]) -> None:
        """Publish a WebSocket event. Relays via Redis when Celery + Redis is enabled.

        Falls back to a direct local broadcast if Redis is unavailable so no
        event is ever silently dropped.
        """
        import time
        if settings.CELERY_ENABLED and self._redis_available:
            try:
                client = await self._client()
                if client is not None:
                    payload = json.dumps({"workspaceId": workspace_id, "message": message})
                    await client.publish(WS_EVENT_CHANNEL, payload)
                    return
            except Exception as exc:  # pragma: no cover - resilience path
                self._redis_available = False
                self._last_redis_check = time.time()
                logger.debug(f"Redis event bus unavailable ({exc}); falling back to local broadcast.")

        from app.modules.websocket.connection_manager import connection_manager
        await connection_manager.local_broadcast(workspace_id, message)

    async def subscribe_and_relay(self) -> None:
        """Long-running FastAPI task: relay Redis WS events to local clients."""
        import redis.asyncio as aioredis

        from app.modules.websocket.connection_manager import connection_manager

        while True:
            client = None
            pubsub = None
            try:
                # Dedicated connection WITHOUT socket_timeout: a pub/sub listener
                # blocks waiting for messages, so a read timeout would spuriously
                # fire. We poll with an explicit per-call timeout instead.
                client = aioredis.from_url(
                    settings.REDIS_URL,
                    encoding="utf-8",
                    decode_responses=True,
                    socket_connect_timeout=5,
                    health_check_interval=30,
                )
                pubsub = client.pubsub()
                await pubsub.subscribe(WS_EVENT_CHANNEL)
                logger.info("Event bus subscriber connected to Redis channel '%s'.", WS_EVENT_CHANNEL)
                while True:
                    raw = await pubsub.get_message(ignore_subscribe_messages=True, timeout=5.0)
                    if raw is None or raw.get("type") != "message":
                        continue
                    try:
                        data = json.loads(raw["data"])
                        ws_id = data.get("workspaceId")
                        message = data.get("message")
                        if ws_id and message is not None:
                            # Worker processes can't know the live viewer count; fill it
                            # in from the API process which actually holds the sockets.
                            if isinstance(message, dict) and message.get("type") == "FULL_SNAPSHOT":
                                message["viewersCount"] = connection_manager.get_viewer_count(ws_id)
                            await connection_manager.local_broadcast(ws_id, message)
                    except Exception as exc:
                        logger.warning(f"Failed to relay bus event: {exc}")
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error(f"Event bus subscriber error (retrying in 3s): {exc}")
                await asyncio.sleep(3.0)
            finally:
                try:
                    if pubsub is not None:
                        await pubsub.aclose()
                    if client is not None:
                        await client.aclose()
                except Exception:
                    pass

    async def is_locked(self, key: str) -> bool:
        """Return True if a work lock is currently held (best-effort)."""
        if not settings.CELERY_ENABLED:
            return False
        try:
            client = await self._client()
            return bool(await client.exists(f"lock:{key}"))
        except Exception:
            return False

    async def acquire_lock(self, key: str, ttl: int = 120) -> bool:
        """Acquire a short-lived distributed lock. Returns True if acquired."""
        if not settings.CELERY_ENABLED:
            return True
        try:
            client = await self._client()
            return bool(await client.set(f"lock:{key}", "1", nx=True, ex=ttl))
        except Exception:
            # If Redis is down, don't block work from running.
            return True

    async def release_lock(self, key: str) -> None:
        """Release a previously acquired lock."""
        if not settings.CELERY_ENABLED:
            return
        try:
            client = await self._client()
            await client.delete(f"lock:{key}")
        except Exception:
            pass


event_bus = RedisEventBus()
