from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_async_session
from app.modules.auth.dependency import get_current_user
from app.modules.auth.schema import UserProfile
from .schema import TourProgressUpdate, TourProgressResponse, TourAnalyticsEvent
from .service import TourService

router = APIRouter(prefix="/tour", tags=["Product Tour"])

@router.get("/progress", response_model=TourProgressResponse)
async def get_tour_progress(
    user: UserProfile = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session)
):
    service = TourService(db)
    return await service.get_progress(user.email)

@router.post("/progress", response_model=TourProgressResponse)
async def save_tour_progress(
    payload: TourProgressUpdate,
    user: UserProfile = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session)
):
    service = TourService(db)
    return await service.save_progress(user.email, payload)

@router.post("/reset")
async def reset_tour_progress(
    user: UserProfile = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session)
):
    service = TourService(db)
    await service.reset_progress(user.email)
    return {"status": "ok", "message": "Tour progress reset successfully"}

@router.post("/analytics")
async def track_tour_analytics(
    event: TourAnalyticsEvent
):
    return {"status": "recorded"}

