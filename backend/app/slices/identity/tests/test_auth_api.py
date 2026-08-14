from app.core.config import settings
from app.core.rate_limit import limiter

REGISTRATION = {
    "email": "a@b.com",
    "password": "Secret123",
    "full_name": "A",
    "org_name": "Acme",
}


async def test_register_returns_201_and_standard_envelope(client):
    response = await client.post("/api/v1/auth/register", json=REGISTRATION)
    assert response.status_code == 201
    body = response.json()
    assert body["success"] is True
    assert body["data"]["access_token"]
    assert body["data"]["refresh_token"]


async def test_full_login_refresh_logout_flow(client):
    await client.post("/api/v1/auth/register", json=REGISTRATION)
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "a@b.com", "password": "Secret123"},
    )
    assert login.status_code == 200
    first = login.json()["data"]["refresh_token"]
    rotated = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": first}
    )
    assert rotated.status_code == 200
    second = rotated.json()["data"]["refresh_token"]
    replayed = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": first}
    )
    assert replayed.status_code == 401
    logged_out = await client.post(
        "/api/v1/auth/logout", json={"refresh_token": second}
    )
    assert logged_out.status_code == 200


async def test_validation_and_auth_errors_use_standard_envelope(client):
    short = await client.post(
        "/api/v1/auth/register", json={**REGISTRATION, "password": "short"}
    )
    assert short.status_code == 400
    assert short.json()["error"] == "VALIDATION_ERROR"
    missing = await client.post(
        "/api/v1/auth/switch-workspace",
        json={
            "workspace_id": "11111111-1111-1111-1111-111111111111",
            "refresh_token": "x",
        },
    )
    assert missing.status_code == 401


async def test_account_lockout_surfaces_as_423(client):
    await client.post("/api/v1/auth/register", json=REGISTRATION)
    for _ in range(settings.LOGIN_MAX_FAILURES):
        limiter.reset()
        response = await client.post(
            "/api/v1/auth/login",
            json={"email": "a@b.com", "password": "wrong"},
        )
        assert response.status_code == 401
    limiter.reset()
    locked = await client.post(
        "/api/v1/auth/login",
        json={"email": "a@b.com", "password": "Secret123"},
    )
    assert locked.status_code == 423
    assert locked.json()["error"] == "ACCOUNT_LOCKED"
