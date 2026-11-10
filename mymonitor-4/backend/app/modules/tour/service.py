from sqlalchemy.ext.asyncio import AsyncSession
from .repository import TourRepository
from .schema import TourProgressUpdate, TourProgressResponse

class TourService:
    def __init__(self, db: AsyncSession):
        self.repo = TourRepository(db)

    async def get_progress(self, user_email: str) -> TourProgressResponse:
        record = await self.repo.get_progress(user_email)
        if not record:
            return TourProgressResponse(
                user_email=user_email,
                has_seen_welcome=False,
                completed=False,
                current_track="full",
                current_step_index=0,
                completed_tracks=[],
                last_completed_at=None
            )
        return TourProgressResponse(
            user_email=record.user_email,
            has_seen_welcome=record.has_seen_welcome,
            completed=record.completed,
            current_track=record.current_track,
            current_step_index=record.current_step_index,
            completed_tracks=record.completed_tracks or [],
            last_completed_at=record.last_completed_at
        )

    async def save_progress(self, user_email: str, update: TourProgressUpdate) -> TourProgressResponse:
        record = await self.repo.upsert_progress(user_email, update)
        return TourProgressResponse(
            user_email=record.user_email,
            has_seen_welcome=record.has_seen_welcome,
            completed=record.completed,
            current_track=record.current_track,
            current_step_index=record.current_step_index,
            completed_tracks=record.completed_tracks or [],
            last_completed_at=record.last_completed_at
        )

    async def reset_progress(self, user_email: str) -> None:
        await self.repo.reset_progress(user_email)

