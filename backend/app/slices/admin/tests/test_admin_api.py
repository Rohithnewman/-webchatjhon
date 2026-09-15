import uuid

from app.slices.identity import api as identity_api


async def _register(client, email: str, org: str) -> dict:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Secret123", "full_name": "Owner", "org_name": org},
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


def _headers(bundle: dict) -> dict:
    return {"Authorization": f"Bearer {bundle['access_token']}"}


async def _superadmin(client, session) -> dict:
    bundle = await _register(client, "root@platform.test", "Platform")
    await identity_api.set_user_flags(
        session, user_id=uuid.UUID(bundle["user_id"]), is_superadmin=True
    )
    await session.flush()
    return bundle


async def test_me_reports_role_and_superadmin_flag(client, session):
    owner = await _register(client, "me@acme.test", "Acme")
    me = await client.get("/api/v1/auth/me", headers=_headers(owner))
    assert me.status_code == 200
    data = me.json()["data"]
    assert data["email"] == "me@acme.test"
    assert data["role"] == "owner"
    assert data["is_superadmin"] is False
    assert "*" in data["permissions"]

    root = await _superadmin(client, session)
    me = await client.get("/api/v1/auth/me", headers=_headers(root))
    assert me.json()["data"]["is_superadmin"] is True


async def test_admin_routes_are_superadmin_only(client, session):
    owner = await _register(client, "plain@acme.test", "Acme")
    for path in ("/api/v1/admin/stats", "/api/v1/admin/organizations", "/api/v1/admin/users"):
        response = await client.get(path, headers=_headers(owner))
        assert response.status_code == 403, path
    anonymous = await client.get("/api/v1/admin/stats")
    assert anonymous.status_code == 401


async def test_stats_and_organizations_span_every_tenant(client, session):
    root = await _superadmin(client, session)

    # The test database is shared and session-scoped; other tests (e.g.
    # tests/test_concurrency.py) commit real rows on raw sessions that are
    # never rolled back. So this asserts deltas around the actions below,
    # not exact platform-wide totals.
    before = (await client.get("/api/v1/admin/stats", headers=_headers(root))).json()["data"]
    before_orgs = (await client.get("/api/v1/admin/organizations", headers=_headers(root))).json()["data"]

    acme = await _register(client, "a@acme.test", "Acme")
    await _register(client, "b@bolt.test", "Bolt")
    await client.post("/api/v1/chatbots", json={"name": "Bot"}, headers=_headers(acme))

    after = (await client.get("/api/v1/admin/stats", headers=_headers(root))).json()["data"]
    assert after["organizations"] - before["organizations"] == 2  # Acme, Bolt
    assert after["workspaces"] - before["workspaces"] == 2
    assert after["users"] - before["users"] == 2
    assert after["chatbots"] - before["chatbots"] == 1
    assert after["conversations"] - before["conversations"] == 0

    orgs = (await client.get("/api/v1/admin/organizations", headers=_headers(root))).json()["data"]
    by_name = {org["name"]: org for org in orgs}
    assert {"Platform", "Acme", "Bolt"} <= set(by_name)
    assert by_name["Acme"]["workspace_count"] == 1
    assert by_name["Acme"]["member_count"] == 1
    assert by_name["Acme"]["plan"] == "free"


async def test_change_plan_and_user_flags(client, session):
    root = await _superadmin(client, session)
    acme = await _register(client, "owner@acme.test", "Acme")
    orgs = (await client.get("/api/v1/admin/organizations", headers=_headers(root))).json()["data"]
    acme_org = next(org for org in orgs if org["name"] == "Acme")

    changed = await client.patch(
        f"/api/v1/admin/organizations/{acme_org['id']}", json={"plan": "pro"}, headers=_headers(root)
    )
    assert changed.status_code == 200
    assert changed.json()["data"]["plan"] == "pro"
    bad = await client.patch(
        f"/api/v1/admin/organizations/{acme_org['id']}", json={"plan": "gold"}, headers=_headers(root)
    )
    assert bad.status_code == 400

    users = (await client.get("/api/v1/admin/users", headers=_headers(root))).json()["data"]
    acme_user = next(u for u in users if u["email"] == "owner@acme.test")
    assert acme_user["organizations"] == ["Acme"]

    deactivated = await client.patch(
        f"/api/v1/admin/users/{acme_user['id']}", json={"is_active": False}, headers=_headers(root)
    )
    assert deactivated.status_code == 200
    assert deactivated.json()["data"]["is_active"] is False
    # A deactivated user is rejected on the very next request — no JWT window.
    denied = await client.get("/api/v1/chatbots", headers=_headers(acme))
    assert denied.status_code == 401

    promoted = await client.patch(
        f"/api/v1/admin/users/{acme_user['id']}", json={"is_superadmin": True, "is_active": True}, headers=_headers(root)
    )
    assert promoted.json()["data"]["is_superadmin"] is True

    self_edit = await client.patch(
        f"/api/v1/admin/users/{root['user_id']}", json={"is_superadmin": False}, headers=_headers(root)
    )
    assert self_edit.status_code == 400
    assert self_edit.json()["error"] == "CANNOT_EDIT_SELF"


async def test_admin_mutations_are_audited_without_workspace(client, session):
    from sqlalchemy import text

    root = await _superadmin(client, session)
    acme = await _register(client, "audit@acme.test", "Acme")
    await client.patch(f"/api/v1/admin/users/{acme['user_id']}", json={"is_active": False}, headers=_headers(root))
    rows = await session.execute(
        text("SELECT action, workspace_id FROM audit_logs WHERE action = 'admin.user_updated'")
    )
    row = rows.first()
    assert row is not None and row[1] is None


async def test_ensure_superadmin_creates_then_promotes(session):
    created = await identity_api.ensure_superadmin(
        session, email="boot@platform.test", password="BootPass123", full_name="Boot"
    )
    assert created.is_superadmin is True
    again = await identity_api.ensure_superadmin(
        session, email="boot@platform.test", password="ignored", full_name="Boot"
    )
    assert again.id == created.id and again.is_superadmin is True
