"""D1: a superadmin has no tenancy. See docs/superpowers/specs/2026-09-16-tenancy-roles-limits-design.md."""

import uuid

from app.slices.identity import api as identity_api

SUPERADMIN_EMAIL = "root@platform.test"
SUPERADMIN_PASSWORD = "RootPass123"


async def _register(client, email: str, org: str, password: str = "Secret123") -> dict:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "full_name": "Owner", "org_name": org},
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


def _headers(bundle: dict) -> dict:
    return {"Authorization": f"Bearer {bundle['access_token']}"}


async def _promote_and_login(client, session, *, email: str = SUPERADMIN_EMAIL) -> dict:
    """Promote via `ensure_superadmin` (which detaches memberships) then log
    in fresh — a token minted before promotion would still carry a
    workspace_id claim."""
    await identity_api.ensure_superadmin(
        session, email=email, password=SUPERADMIN_PASSWORD, full_name="Root"
    )
    await session.commit()
    response = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": SUPERADMIN_PASSWORD}
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


async def test_superadmin_login_has_no_workspace(client, session):
    await _register(client, SUPERADMIN_EMAIL, "Root Org", SUPERADMIN_PASSWORD)
    bundle = await _promote_and_login(client, session)

    assert bundle["workspace_id"] is None

    me = await client.get("/api/v1/auth/me", headers=_headers(bundle))
    assert me.status_code == 200
    data = me.json()["data"]
    assert data["workspace_id"] is None
    assert data["role"] is None
    assert data["permissions"] == []
    assert data["subscription"] is None
    assert data["is_superadmin"] is True

    workspaces = await client.get("/api/v1/auth/workspaces", headers=_headers(bundle))
    assert workspaces.status_code == 200
    assert workspaces.json()["data"] == []


async def test_superadmin_is_refused_on_workspace_routes(client, session):
    await _register(client, SUPERADMIN_EMAIL, "Root Org", SUPERADMIN_PASSWORD)
    bundle = await _promote_and_login(client, session)

    chatbots = await client.get("/api/v1/chatbots", headers=_headers(bundle))
    assert chatbots.status_code == 403
    assert chatbots.json()["error"] == "SUPERADMIN_HAS_NO_WORKSPACE"

    switched = await client.post(
        "/api/v1/auth/switch-workspace",
        json={"workspace_id": str(uuid.uuid4()), "refresh_token": bundle["refresh_token"]},
        headers=_headers(bundle),
    )
    assert switched.status_code == 403
    assert switched.json()["error"] == "SUPERADMIN_HAS_NO_WORKSPACE"


async def test_superadmin_cannot_be_added_as_member(client, session):
    await _register(client, SUPERADMIN_EMAIL, "Root Org", SUPERADMIN_PASSWORD)
    await _promote_and_login(client, session)
    owner = await _register(client, "owner@acme.test", "Acme")

    response = await client.post(
        "/api/v1/workspace/members",
        json={
            "email": SUPERADMIN_EMAIL,
            "full_name": "Root",
            "password": "MemberPass123",
            "role": "member",
        },
        headers=_headers(owner),
    )
    assert response.status_code == 400
    assert response.json()["error"] == "SUPERADMIN_CANNOT_JOIN"


async def test_member_cannot_be_promoted_to_superadmin(client, session):
    await _register(client, SUPERADMIN_EMAIL, "Root Org", SUPERADMIN_PASSWORD)
    root = await _promote_and_login(client, session)
    owner = await _register(client, "owner@acme.test", "Acme")

    response = await client.patch(
        f"/api/v1/admin/users/{owner['user_id']}",
        json={"is_superadmin": True},
        headers=_headers(root),
    )
    assert response.status_code == 409
    assert response.json()["error"] == "USER_IS_TENANT_MEMBER"


async def test_refresh_keeps_null_workspace(client, session):
    await _register(client, SUPERADMIN_EMAIL, "Root Org", SUPERADMIN_PASSWORD)
    bundle = await _promote_and_login(client, session)

    refreshed = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": bundle["refresh_token"]}
    )
    assert refreshed.status_code == 200
    data = refreshed.json()["data"]
    assert data["workspace_id"] is None

    stats = await client.get("/api/v1/admin/stats", headers=_headers(data))
    assert stats.status_code == 200


# test_500_carries_cors_headers (D4) lives in backend/tests/test_errors.py,
# not here: `app.main.create_app()` wires in every slice's router, and
# `backend/tests/` sits outside the `app` package that lint-imports scans, so
# importing it from an `app/slices/identity/tests/` module would break the
# layering/cross-slice import contracts (identity importing chatbots, authz,
# etc. through app.main).
