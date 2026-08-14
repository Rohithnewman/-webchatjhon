from httpx import ASGITransport, AsyncClient

from app.core.database import get_session
from app.core.security import create_access_token, decode_token
from app.main import create_app
from app.slices.identity.use_cases.refresh import refresh
from app.slices.identity.use_cases.register import register


async def test_user_cannot_switch_into_foreign_workspace(client):
    alice = (
        await client.post(
            "/api/v1/auth/register",
            json={
                "email": "alice@a.com",
                "password": "Secret123",
                "full_name": "Alice",
                "org_name": "Acme",
            },
        )
    ).json()["data"]
    bob = (
        await client.post(
            "/api/v1/auth/register",
            json={
                "email": "bob@b.com",
                "password": "Secret123",
                "full_name": "Bob",
                "org_name": "Beta",
            },
        )
    ).json()["data"]
    response = await client.post(
        "/api/v1/auth/switch-workspace",
        json={
            "workspace_id": bob["workspace_id"],
            "refresh_token": alice["refresh_token"],
        },
        headers={"Authorization": f"Bearer {alice['access_token']}"},
    )
    assert response.status_code == 403
    assert response.json()["error"] == "FORBIDDEN"


async def test_forged_foreign_workspace_token_is_rejected(session):
    alice = await register(
        session,
        email="alice@a.com",
        password="Secret123",
        full_name="Alice",
        org_name="Acme",
    )
    bob = await register(
        session,
        email="bob@b.com",
        password="Secret123",
        full_name="Bob",
        org_name="Beta",
    )
    forged = create_access_token(
        sub=str(alice.user_id),
        email="alice@a.com",
        workspace_id=str(bob.workspace_id),
    )
    app = create_app()

    async def _override():
        yield session

    app.dependency_overrides[get_session] = _override
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/v1/auth/switch-workspace",
            json={
                "workspace_id": str(bob.workspace_id),
                "refresh_token": alice.refresh_token,
            },
            headers={"Authorization": f"Bearer {forged}"},
        )
    assert response.status_code == 401


async def test_refresh_rotation_stays_in_original_workspace(session):
    alice = await register(
        session,
        email="alice@a.com",
        password="Secret123",
        full_name="Alice",
        org_name="Acme",
    )
    await register(
        session,
        email="bob@b.com",
        password="Secret123",
        full_name="Bob",
        org_name="Beta",
    )
    rotated = await refresh(session, refresh_token=alice.refresh_token)
    payload = decode_token(rotated.access_token, expected_type="access")
    assert payload["sub"] == str(alice.user_id)
    assert payload["workspace_id"] == str(alice.workspace_id)
