from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.main import create_app


async def test_health_returns_success_envelope():
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        resp = await ac.get("/api/v1/health")

    assert resp.status_code == 200
    assert resp.json() == {
        "success": True,
        "data": {"status": "ok"},
        "message": None,
        "pagination": None,
    }


async def test_readiness_reports_ok_when_db_reachable(db_engine):
    app = create_app()

    async def _override():
        async with AsyncSession(db_engine) as session:
            yield session

    app.dependency_overrides[get_session] = _override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        resp = await ac.get("/api/v1/health/ready")

    assert resp.status_code == 200
    assert resp.json()["data"]["database"] == "ok"


async def test_readiness_reports_503_when_db_unreachable():
    app = create_app()

    async def _override():
        class _Broken:
            async def execute(self, *_args, **_kwargs):
                raise RuntimeError("connection refused")

        yield _Broken()

    app.dependency_overrides[get_session] = _override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        resp = await ac.get("/api/v1/health/ready")

    assert resp.status_code == 503
    assert resp.json()["error"] == "NOT_READY"
