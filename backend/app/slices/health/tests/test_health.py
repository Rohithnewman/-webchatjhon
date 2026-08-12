from httpx import ASGITransport, AsyncClient

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
