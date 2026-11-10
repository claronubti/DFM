from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Boolean, DateTime, JSON
from app.db.base import Base

class UserTourProgress(Base):
    __tablename__ = "user_tour_progress"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_email = Column(String(255), unique=True, index=True, nullable=False)
    has_seen_welcome = Column(Boolean, default=False, nullable=False)
    completed = Column(Boolean, default=False, nullable=False)
    current_track = Column(String(50), default="full", nullable=False)
    current_step_index = Column(Integer, default=0, nullable=False)
    completed_tracks = Column(JSON, default=list, nullable=False)
    last_completed_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

