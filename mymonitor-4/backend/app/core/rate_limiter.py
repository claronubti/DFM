import asyncio

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings

# ── HTTP endpoint rate limiter (slowapi) ─────────────────────────────
limiter = Limiter(key_func=get_remote_address)


# ── Fabric API concurrency limiter ───────────────────────────────────
class FabricRateLimiter:
    """
    Limits concurrent outgoing HTTP requests to Microsoft Fabric REST APIs
    to avoid HTTP 429 Too Many Requests errors.
    """
    def __init__(self, max_concurrent: int | None = None):
        """Initialize concurrency limiter with an asyncio Semaphore bounded by configuration."""
        self._max_concurrent = max_concurrent
        self._sem_per_loop = {}

    def _get_semaphore(self) -> asyncio.Semaphore:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None
        if loop not in self._sem_per_loop:
            limit = self._max_concurrent or getattr(settings, "MAX_PARALLEL_FABRIC_REQUESTS", 10)
            self._sem_per_loop[loop] = asyncio.Semaphore(limit)
        return self._sem_per_loop[loop]

    async def run(self, coro):
        """Execute a coroutine within the bounded concurrency semaphore to prevent HTTP 429 throttling."""
        sem = self._get_semaphore()
        async with sem:
            return await coro



rate_limiter = FabricRateLimiter()
