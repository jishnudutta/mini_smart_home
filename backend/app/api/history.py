from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app.database import get_session
from app.services import device_manager

router = APIRouter(prefix="/api/devices", tags=["history"])


@router.get("/{device_id}/history")
def device_history(
    device_id: str,
    hours: int = Query(default=24, ge=1, le=168),
    session: Session = Depends(get_session),
):
    """Time-series readings for a sensor, bounded for charting."""
    return device_manager.get_history(session, device_id, hours=hours)
