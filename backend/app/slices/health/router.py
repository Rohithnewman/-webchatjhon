from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.envelope import success
from app.core.errors import AppError

router = APIRouter(prefix="/api/v1/health", tags=["health"])


@router.get("")
async def liveness() -> dict:
    """Liveness only — deliberately does not touch the database, so that a
    database outage does not take the process out of rotation."""
    return success({"status": "ok"})


@router.get("/ready")
async def readiness(session: AsyncSession = Depends(get_session)) -> dict:
    try:
        await session.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001 - any failure means not ready
        raise AppError(
            code="NOT_READY",
            message="Database unreachable",
            status_code=503,
        ) from exc
    return success({"status": "ok", "database": "ok"})
