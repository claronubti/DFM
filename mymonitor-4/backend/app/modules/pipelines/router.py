from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Query
from app.modules.pipelines.schema import PipelineSchedule
from app.modules.pipelines.service import pipeline_service

router = APIRouter(prefix="/api/workspaces/{workspace_id}", tags=["pipelines"])


@router.get("/pipelines", response_model=List[Dict[str, Any]])
async def list_pipelines(workspace_id: str, parent_only: bool = True):
    """Returns Data Pipelines inside the selected workspace.
    By default returns parent (master) and independent pipelines (is_master=1).
    Pass parent_only=False to retrieve all pipelines including child pipelines.
    """
    return await pipeline_service.list_pipelines(workspace_id, parent_only=parent_only)


@router.get("/parent-pipelines", response_model=List[Dict[str, Any]])
async def list_parent_pipelines(workspace_id: str, force_sync: bool = False):
    """Returns parent (master) pipelines for a workspace with their SLA1/SLA2 config."""
    return await pipeline_service.list_parent_pipelines(workspace_id, force_sync=force_sync)


@router.get("/snapshot")
async def get_workspace_snapshot(
    workspace_id: str,
    force_sync: bool = False,
    date_preset: Optional[str] = "latest",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    """Returns the real-time hierarchical pipeline and activity runs tree with date filtering."""
    return await pipeline_service.get_workspace_snapshot(
        workspace_id=workspace_id,
        force_sync=force_sync,
        date_preset=date_preset,
        start_date=start_date,
        end_date=end_date,
    )


@router.get("/tree")
async def get_workspace_tree(workspace_id: str):
    """Retrieve the latest parent-child pipeline tree for the workspace."""
    return await pipeline_service.get_workspace_tree(workspace_id)


@router.post("/pipelines/{pipeline_id}/run")
async def run_pipeline(workspace_id: str, pipeline_id: str, payload: Optional[Dict[str, Any]] = None):
    """Triggers an on-demand execution of the pipeline in Microsoft Fabric and pushes live updates."""
    return await pipeline_service.run_pipeline(workspace_id, pipeline_id, payload)


@router.get("/pipelines/{pipeline_id}/history")
async def get_pipeline_history(
    workspace_id: str,
    pipeline_id: str,
    page: Optional[int] = Query(None, ge=1, description="Page number (1-based)"),
    page_size: Optional[int] = Query(None, ge=1, le=100, description="Items per page"),
):
    """Get chronological run history for a pipeline with optional server-side pagination."""
    return await pipeline_service.get_pipeline_history(
        workspace_id, pipeline_id, page=page, page_size=page_size
    )


@router.get("/pipelines/{pipeline_id}/runs/{run_id}/activities")
async def get_run_activities(workspace_id: str, pipeline_id: str, run_id: str):
    """Retrieve granular activity executions for a specific pipeline execution run."""
    return await pipeline_service.get_run_activities(workspace_id, pipeline_id, run_id)


@router.get("/pipelines/{pipeline_id}/schedule")
async def get_pipeline_schedule(workspace_id: str, pipeline_id: str):
    """Get schedule configurations for a specific pipeline."""
    return await pipeline_service.get_pipeline_schedule(workspace_id, pipeline_id)


@router.get("/pipelines/{pipeline_id}/schedules")
async def get_pipeline_schedules(workspace_id: str, pipeline_id: str):
    """Alias for schedules configured for a specific pipeline."""
    return await pipeline_service.get_pipeline_schedule(workspace_id, pipeline_id)


@router.get("/schedules", response_model=List[PipelineSchedule])
async def get_workspace_schedules(workspace_id: str):
    """Get all configured pipeline schedules across a workspace."""
    return await pipeline_service.get_workspace_schedules(workspace_id)


@router.get("/pipeline-assignments")
async def get_workspace_pipeline_assignments(workspace_id: str, force_sync: bool = False):
    """Returns all parent pipelines with their per-pipeline L1 and L2 assignees."""
    return await pipeline_service.get_workspace_pipeline_assignments(workspace_id, force_sync=force_sync)
