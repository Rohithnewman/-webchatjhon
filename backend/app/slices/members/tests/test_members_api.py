async def _register(client, email: str, org: str) -> dict:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Secret123", "full_name": "Owner", "org_name": org},
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


def _headers(bundle: dict) -> dict:
    return {"Authorization": f"Bearer {bundle['access_token']}"}


NEW_MEMBER = {
    "email": "agent@acme.test",
    "full_name": "Agent Ana",
    "password": "AgentPass123",
    "role": "member",
}


async def test_workspace_profile_shows_name_and_role(client):
    owner = await _register(client, "owner@acme.test", "Acme Corp")
    response = await client.get("/api/v1/workspace", headers=_headers(owner))
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["id"] == owner["workspace_id"]
    assert data["organization_name"] == "Acme Corp"
    assert data["name"] == "Default"
    assert data["your_role"] == "owner"


async def test_owner_is_the_only_member_at_first(client):
    owner = await _register(client, "solo@acme.test", "Acme")
    response = await client.get("/api/v1/workspace/members", headers=_headers(owner))
    assert response.status_code == 200
    members = response.json()["data"]
    assert [m["email"] for m in members] == ["solo@acme.test"]
    assert members[0]["role"] == "owner"


async def test_add_member_creates_user_who_can_log_in(client):
    owner = await _register(client, "boss@acme.test", "Acme")
    created = await client.post("/api/v1/workspace/members", json=NEW_MEMBER, headers=_headers(owner))
    assert created.status_code == 201, created.text
    assert created.json()["data"]["role"] == "member"

    login = await client.post(
        "/api/v1/auth/login", json={"email": NEW_MEMBER["email"], "password": NEW_MEMBER["password"]}
    )
    assert login.status_code == 200
    assert login.json()["data"]["workspace_id"] == owner["workspace_id"]

    # A plain member may read conversations but may not manage members.
    forbidden = await client.get("/api/v1/workspace/members", headers=_headers(login.json()["data"]))
    assert forbidden.status_code == 200
    denied = await client.post(
        "/api/v1/workspace/members",
        json={**NEW_MEMBER, "email": "third@acme.test"},
        headers=_headers(login.json()["data"]),
    )
    assert denied.status_code == 403


async def test_add_existing_user_attaches_without_changing_password(client):
    owner = await _register(client, "own@acme.test", "Acme")
    other = await _register(client, "guest@other.test", "Other Co")
    created = await client.post(
        "/api/v1/workspace/members",
        json={"email": "guest@other.test", "full_name": "x", "password": "ignored-XYZ1", "role": "viewer"},
        headers=_headers(owner),
    )
    assert created.status_code == 201
    login = await client.post(
        "/api/v1/auth/login", json={"email": "guest@other.test", "password": "Secret123"}
    )
    assert login.status_code == 200
    assert login.json()["data"]["user_id"] == other["user_id"]


async def test_add_member_twice_is_rejected(client):
    owner = await _register(client, "dup@acme.test", "Acme")
    first = await client.post("/api/v1/workspace/members", json=NEW_MEMBER, headers=_headers(owner))
    assert first.status_code == 201
    second = await client.post("/api/v1/workspace/members", json=NEW_MEMBER, headers=_headers(owner))
    assert second.status_code == 400
    assert second.json()["error"] == "ALREADY_MEMBER"


async def test_change_role_and_remove(client):
    owner = await _register(client, "lead@acme.test", "Acme")
    created = await client.post("/api/v1/workspace/members", json=NEW_MEMBER, headers=_headers(owner))
    user_id = created.json()["data"]["user_id"]

    promoted = await client.patch(
        f"/api/v1/workspace/members/{user_id}", json={"role": "admin"}, headers=_headers(owner)
    )
    assert promoted.status_code == 200
    assert promoted.json()["data"]["role"] == "admin"

    removed = await client.delete(f"/api/v1/workspace/members/{user_id}", headers=_headers(owner))
    assert removed.status_code == 200
    members = await client.get("/api/v1/workspace/members", headers=_headers(owner))
    assert [m["email"] for m in members.json()["data"]] == ["lead@acme.test"]

    again = await client.delete(f"/api/v1/workspace/members/{user_id}", headers=_headers(owner))
    assert again.status_code == 404


async def test_cannot_edit_yourself(client):
    owner = await _register(client, "me@acme.test", "Acme")
    me = owner["user_id"]
    demote = await client.patch(
        f"/api/v1/workspace/members/{me}", json={"role": "viewer"}, headers=_headers(owner)
    )
    assert demote.status_code == 400
    assert demote.json()["error"] == "CANNOT_EDIT_SELF"
    remove = await client.delete(f"/api/v1/workspace/members/{me}", headers=_headers(owner))
    assert remove.status_code == 400


async def test_unknown_role_is_rejected(client):
    owner = await _register(client, "role@acme.test", "Acme")
    response = await client.post(
        "/api/v1/workspace/members", json={**NEW_MEMBER, "role": "god"}, headers=_headers(owner)
    )
    assert response.status_code == 400
    assert response.json()["error"] == "VALIDATION_ERROR"


async def test_members_are_workspace_scoped(client):
    owner_a = await _register(client, "a@acme.test", "A")
    owner_b = await _register(client, "b@acme.test", "B")
    await client.post("/api/v1/workspace/members", json=NEW_MEMBER, headers=_headers(owner_a))
    members_b = await client.get("/api/v1/workspace/members", headers=_headers(owner_b))
    assert [m["email"] for m in members_b.json()["data"]] == ["b@acme.test"]


async def test_member_mutations_are_audited(client, session):
    from sqlalchemy import text

    owner = await _register(client, "audit@acme.test", "Acme")
    created = await client.post("/api/v1/workspace/members", json=NEW_MEMBER, headers=_headers(owner))
    user_id = created.json()["data"]["user_id"]
    await client.patch(f"/api/v1/workspace/members/{user_id}", json={"role": "admin"}, headers=_headers(owner))
    await client.delete(f"/api/v1/workspace/members/{user_id}", headers=_headers(owner))

    rows = await session.execute(
        text("SELECT action FROM audit_logs WHERE workspace_id = :ws AND action LIKE 'member.%' ORDER BY created_at"),
        {"ws": owner["workspace_id"]},
    )
    assert [row[0] for row in rows] == ["member.added", "member.role_changed", "member.removed"]
