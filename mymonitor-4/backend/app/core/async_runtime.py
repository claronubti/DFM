"""Per-process asyncio runtime for Celery workers.

The application's data layer (async SQLAlchemy, httpx) is fully asynchronous.
Celery tasks are synchronous callables, so each worker process keeps a single
long-lived event loop running on a background thread. All task coroutines are
submitted to that one loop, which keeps the module-level async DB engine bound
to a stable loop and avoids "attached to a different loop" errors that occur
when using a fresh ``asyncio.run`` per task.
"""

import asyncio
import threading
from typing import Any, Coroutine

_loop: asyncio.AbstractEventLoop | None = None
_loop_lock = threading.Lock()


def _ensure_loop() -> asyncio.AbstractEventLoop:
    """Return the shared background event loop, starting it on first use."""
    global _loop
    if _loop is None or _loop.is_closed():
        with _loop_lock:
            if _loop is None or _loop.is_closed():
                _loop = asyncio.new_event_loop()
                thread = threading.Thread(
                    target=_loop.run_forever,
                    name="celery-async-loop",
                    daemon=True,
                )
                thread.start()
    return _loop


def run_async(coro: Coroutine) -> Any:
    """Run an async coroutine to completion on the shared worker loop."""
    loop = _ensure_loop()
    future = asyncio.run_coroutine_threadsafe(coro, loop)
    return future.result()
