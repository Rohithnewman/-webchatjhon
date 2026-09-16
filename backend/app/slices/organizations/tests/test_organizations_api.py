async def _register(client, email: str, org: str) -> dict:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Secret123", "full_name": "Owner", "org_name": org},
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


def _headers(bundle: dict) -> dict:
    return {"Authorization": f"Bearer {bundle['access_token']}"}


async def test_organization_profile_lists_workspaces(client):
    owner = await _register(client, "org@acme.test", "Acme")
    response = await client.get("/api/v1/organization", headers=_headers(owner))
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["name"] == "Acme" and data["plan"] == "free"
    assert [w["name"] for w in data["workspaces"]] == ["Default"]
    assert data["workspaces"][0]["is_current"] is True
    assert data["workspaces"][0]["member_count"] == 1


async def test_rename_organization_requires_manage_permission(client):
    owner = await _register(client, "own@acme.test", "Acme")
    renamed = await client.patch("/api/v1/organization", json={"name": "Acme Ltd"}, headers=_headers(owner))
    assert renamed.status_code == 200 and renamed.json()["data"]["name"] == "Acme Ltd"

    added = await client.post(
        "/api/v1/workspace/members",
        json={"email": "v@acme.test", "full_name": "V", "password": "ViewerPass1", "role": "viewer"},
        headers=_headers(owner),
    )
    assert added.status_code == 201
    viewer = (await client.post("/api/v1/auth/login", json={"email": "v@acme.test", "password": "ViewerPass1"})).json()["data"]
    denied = await client.patch("/api/v1/organization", json={"name": "Nope"}, headers=_headers(viewer))
    assert denied.status_code == 403


async def test_rename_organization_rejects_blank_name(client):
    owner = await _register(client, "blank@acme.test", "Acme")
    response = await client.patch("/api/v1/organization", json={"name": "   "}, headers=_headers(owner))
    assert response.status_code == 400
    assert response.json()["error"] == "VALIDATION_ERROR"


async def test_create_workspace_makes_caller_owner_and_is_switchable(client):
    owner = await _register(client, "multi@acme.test", "Acme")
    created = await client.post("/api/v1/organization/workspaces", json={"name": "Sales"}, headers=_headers(owner))
    assert created.status_code == 201, created.text
    sales_id = created.json()["data"]["id"]

    mine = await client.get("/api/v1/auth/workspaces", headers=_headers(owner))
    assert mine.status_code == 200
    rows = {w["workspace_name"]: w for w in mine.json()["data"]}
    assert set(rows) == {"Default", "Sales"}
    assert rows["Sales"]["role"] == "owner"

    switched = await client.post(
        "/api/v1/auth/switch-workspace",
        json={"refresh_token": owner["refresh_token"], "workspace_id": sales_id},
        headers=_headers(owner),
    )
    assert switched.status_code == 200
    assert switched.json()["data"]["workspace_id"] == sales_id

    # Chatbots are per workspace: the new one is empty even though the org is the same.
    bots = await client.get("/api/v1/chatbots", headers=_headers(switched.json()["data"]))
    assert bots.json()["data"] == []
    profile = await client.get("/api/v1/organization", headers=_headers(switched.json()["data"]))
    current = [w for w in profile.json()["data"]["workspaces"] if w["is_current"]]
    assert current[0]["name"] == "Sales"


async def test_rename_workspace_is_organization_scoped(client):
    acme = await _register(client, "a@acme.test", "Acme")
    bolt = await _register(client, "b@bolt.test", "Bolt")
    renamed = await client.patch(
        f"/api/v1/organization/workspaces/{acme['workspace_id']}", json={"name": "HQ"}, headers=_headers(acme)
    )
    assert renamed.status_code == 200 and renamed.json()["data"]["name"] == "HQ"
    foreign = await client.patch(
        f"/api/v1/organization/workspaces/{acme['workspace_id']}", json={"name": "Hijack"}, headers=_headers(bolt)
    )
    assert foreign.status_code == 404


async def test_organization_mutations_are_audited(client, session):
    from sqlalchemy import text

    owner = await _register(client, "aud@acme.test", "Acme")
    await client.patch("/api/v1/organization", json={"name": "Acme 2"}, headers=_headers(owner))
    await client.post("/api/v1/organization/workspaces", json={"name": "Ops"}, headers=_headers(owner))
    rows = await session.execute(
        text("SELECT action FROM audit_logs WHERE action LIKE 'organization.%' OR action = 'workspace.created' ORDER BY created_at")
    )
    assert [r[0] for r in rows] == ["organization.renamed", "workspace.created"]


async def test_rename_workspace_audits_under_the_renamed_workspace_not_the_caller_s(client, session):
    from sqlalchemy import text

    owner = await _register(client, "cross@acme.test", "Acme")
    created = await client.post(
        "/api/v1/organization/workspaces", json={"name": "Ops"}, headers=_headers(owner)
    )
    assert created.status_code == 201, created.text
    ops_id = created.json()["data"]["id"]

    # Caller is still in the Default workspace context but renames Ops, a
    # different workspace in the same organization.
    renamed = await client.patch(
        f"/api/v1/organization/workspaces/{ops_id}", json={"name": "Operations"}, headers=_headers(owner)
    )
    assert renamed.status_code == 200 and renamed.json()["data"]["name"] == "Operations"

    rows = (
        await session.execute(
            text("SELECT workspace_id, target_id FROM audit_logs WHERE action = 'workspace.renamed'")
        )
    ).all()
    assert len(rows) == 1
    workspace_id, target_id = rows[0]
    assert str(workspace_id) == ops_id
    assert target_id == ops_id
