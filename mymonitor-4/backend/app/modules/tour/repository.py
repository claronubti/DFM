from typing import Optional
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from .models.tour_progress import UserTourProgress
from .schema import TourProgressUpdate

class TourRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_progress(self, user_email: str) -> Optional[UserTourProgress]:
        result = await self.db.execute(
            select(UserTourProgress).filter(UserTourProgress.user_email == user_email)
        )
        return result.scalars().first()

    async def upsert_progress(self, user_email: str, update: TourProgressUpdate) -> UserTourProgress:
        record = await self.get_progress(user_email)
        now = datetime.now(timezone.utc)

        if not record:
            record = UserTourProgress(
                user_email=user_email,
                has_seen_welcome=bool(update.hasSeenWelcome),
                completed=bool(update.completed),
                current_track=update.trackId or "full",
                current_step_index=update.stepIndex or 0,
                completed_tracks=[update.trackId] if update.completed and update.trackId else [],
                last_completed_at=now if update.completed else None
            )
            self.db.add(record)
        else:
            if update.hasSeenWelcome is not None:
                record.has_seen_welcome = update.hasSeenWelcome
            if update.trackId is not None:
                record.current_track = update.trackId
            if update.stepIndex is not None:
                record.current_step_index = update.stepIndex
            if update.completed:
                record.completed = True
                record.last_completed_at = now
                tracks = list(record.completed_tracks or [])
                if update.trackId and update.trackId not in tracks:
                    tracks.append(update.trackId)
                    record.completed_tracks = tracks

        await self.db.commit()
        await self.db.refresh(record)
        return record

    async def reset_progress(self, user_email: str) -> None:
        record = await self.get_progress(user_email)
        if record:
            record.completed = False
            record.current_step_index = 0
            record.completed_tracks = []
            await self.db.commit()

