"""
Aggregator repository facade for the pipelines module.
Combines sub-repositories for pipeline definitions, execution runs, schedules, and hierarchy trees.
"""

import logging
from app.modules.pipelines.repositories.base import normalize_iso_utc
from app.modules.pipelines.repositories.pipeline_def_repo import PipelineDefRepository
from app.modules.pipelines.repositories.pipeline_run_repo import PipelineRunRepository
from app.modules.pipelines.repositories.pipeline_schedule_repo import PipelineScheduleRepository
from app.modules.pipelines.repositories.pipeline_tree_repo import PipelineTreeRepository

logger = logging.getLogger("fabric_monitor.pipelines.repo")


class PipelineRepository(
    PipelineDefRepository,
    PipelineRunRepository,
    PipelineScheduleRepository,
    PipelineTreeRepository,
):
    """
    Data access layer for Fabric pipelines, execution runs, activities, and schedules.
    Aggregates sub-repositories to provide a unified interface while keeping logic modular.
    """

    def __init__(self):
        super().__init__()


# Global singleton instance for backwards compatibility
pipeline_repository = PipelineRepository()

__all__ = [
    "normalize_iso_utc",
    "PipelineRepository",
    "pipeline_repository",
    "PipelineDefRepository",
    "PipelineRunRepository",
    "PipelineScheduleRepository",
    "PipelineTreeRepository",
]
