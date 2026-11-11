from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field


class ActivityError(BaseModel):
    """Normalized error details payload for failed pipeline activities or runs."""
    errorCode: Optional[str] = None
    message: Optional[str] = None
    failureType: Optional[str] = None
    target: Optional[str] = None
    rawError: Optional[Any] = None


class ActivityRun(BaseModel):
    """Schema representing an individual activity execution within a pipeline run."""
    activityRunId: Optional[str] = None
    activityName: str
    activityType: str
    status: str  # InProgress, Succeeded, Failed, Queued
    activityRunStart: Optional[str] = None
    activityRunEnd: Optional[str] = None
    durationInMs: Optional[int] = None
    error: Optional[ActivityError] = None
    output: Optional[Dict[str, Any]] = None
    childPipeline: Optional[Any] = None
    innerActivities: Optional[List['ActivityRun']] = None


ActivityRun.model_rebuild()



class PipelineRun(BaseModel):
    """Schema representing a Fabric pipeline run instance including nested activities and children."""
    id: str
    pipelineId: str
    pipelineName: str
    workspaceId: str
    status: str  # InProgress, Completed, Failed, Cancelled, NotStarted
    startTime: Optional[str] = None
    endTime: Optional[str] = None
    durationInMs: Optional[int] = None
    invokeType: Optional[str] = None
    isChild: bool = False
    parentRunId: Optional[str] = None
    parentActivityName: Optional[str] = None
    error: Optional[ActivityError] = None
    activities: List[ActivityRun] = Field(default_factory=list)
    childPipelines: List['PipelineRun'] = Field(default_factory=list)


class PipelineSchedule(BaseModel):
    """Schema representing automated execution triggers and schedules configured for a pipeline."""
    pipelineId: str
    pipelineName: str
    enabled: bool
    scheduleType: Optional[str] = None
    nextRunTime: Optional[str] = None
    timeZone: Optional[str] = None
    schedules: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    rawConfiguration: Optional[Dict[str, Any]] = None
