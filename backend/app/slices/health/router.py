from fastapi import APIRouter

from app.core.envelope import success

router = APIRouter(prefix="/api/v1/health", tags=["health"])


@router.get("")
async def liveness() -> dict:
    """Liveness only — deliberately does not touch the database.
    Readiness (which does) is added in Task 2."""
    return success({"status": "ok"})
