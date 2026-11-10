from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel

class TourProgressUpdate(BaseModel):
    trackId: Optional[str] = "full"
    stepIndex: Optional[int] = 0
    hasSeenWelcome: Optional[bool] = None
    completed: Optional[bool] = None
    skipped: Optional[bool] = None
    paused: Optional[bool] = None

class TourProgressResponse(BaseModel):
    user_email: str
    has_seen_welcome: bool
    completed: bool
    current_track: str
    current_step_index: int
    completed_tracks: List[str] = []
    last_completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class TourAnalyticsEvent(BaseModel):
    event: str
    trackId: Optional[str] = None
    stepIndex: Optional[int] = None
    fromIndex: Optional[int] = None
    timestamp: Optional[str] = None

