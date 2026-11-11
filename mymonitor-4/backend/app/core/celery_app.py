"""Celery application for offloading heavy Fabric sync and SMTP work via Redis.

Requires Redis running as message broker and result backend (default: redis://localhost:6379/0).
Run a worker with:

    celery -A app.core.celery_app.celery_app worker -P threads --concurrency=4 --loglevel=info

On Windows the ``threads`` pool (or ``--pool=solo``) is required because the
default ``prefork`` pool is unsupported there.
"""

import logging
from celery import Celery

from celery.signals import after_setup_logger, after_setup_task_logger

from app.core.config import settings

# Silence noisy raw HTTP request logs from httpx/httpcore in Celery worker
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)


@after_setup_logger.connect
@after_setup_task_logger.connect
def setup_celery_loggers(logger, *args, **kwargs):
    """Ensure child process loggers in Celery worker remain silent for raw HTTP calls."""
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


celery_app = Celery(
    "fabric_monitor",
    broker=settings.celery_broker,
    backend=settings.celery_backend,
    include=[
        "app.modules.pipelines.tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    broker_connection_retry_on_startup=True,
    broker_transport_options={"visibility_timeout": 3600},
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    result_expires=3600,
    task_default_queue="fabric_monitor",
    task_always_eager=getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False),
    task_eager_propagates=True,
)
