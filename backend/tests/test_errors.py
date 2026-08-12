import pytest
from fastapi import APIRouter
from httpx import ASGITransport, AsyncClient
from pydantic import BaseModel

from app.core.errors import AppError
from app.main import create_app


class _Body(BaseModel):
    count: int


def _app_with_probe_routes():
    app = create_app()
    router = APIRouter()

    @router.get("/api/v1/_probe/boom")
    async def boom():
        raise AppError(code="NOPE", message="nope happened", status_code=403)

    @router.post("/api/v1/_probe/validate")
    async def validate(body: _Body):
        return {"ok": body.count}

    app.include_router(router)
    return app


async def test_app_error_renders_error_envelope():
    async with AsyncClient(
        transport=ASGITransport(app=_app_with_probe_routes()), base_url="http://t"
    ) as ac:
        resp = await ac.get("/api/v1/_probe/boom")

    assert resp.status_code == 403
    assert resp.json() == {
        "success": False,
        "error": "NOPE",
        "message": "nope happened",
        "details": None,
    }


async def test_validation_error_renders_400_envelope():
    async with AsyncClient(
        transport=ASGITransport(app=_app_with_probe_routes()), base_url="http://t"
    ) as ac:
        resp = await ac.post("/api/v1/_probe/validate", json={"count": "not-a-number"})

    assert resp.status_code == 400
    body = resp.json()
    assert body["success"] is False
    assert body["error"] == "VALIDATION_ERROR"
    assert "errors" in body["details"]
