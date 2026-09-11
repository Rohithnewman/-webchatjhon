async def _register(client, email: str, org: str) -> dict:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Secret123", "full_name": "Owner", "org_name": org},
    )
    assert response.status_code == 201
    return response.json()["data"]


def _headers(bundle: dict) -> dict:
    return {"Authorization": f"Bearer {bundle['access_token']}"}


async def test_owner_sees_newest_first_with_actor_email(client):
    owner = await _register(client, "trail@acme.test", "Acme")
    created = await client.post("/api/v1/chatbots", json={"name": "Bot"}, headers=_headers(owner))
    assert created.status_code == 201

    response = await client.get("/api/v1/audit-logs", headers=_headers(owner))
    assert response.status_code == 200
    rows = response.json()["data"]
    assert rows[0]["action"] == "chatbot.created"
    assert rows[0]["actor_email"] == "trail@acme.test"
    assert rows[-1]["action"] == "auth.register"
    assert "created_at" in rows[0]


async def test_limit_is_honoured_and_bounded(client):
    owner = await _register(client, "limit@acme.test", "Acme")
    for name in ("A", "B", "C"):
        await client.post("/api/v1/chatbots", json={"name": name}, headers=_headers(owner))
    response = await client.get("/api/v1/audit-logs?limit=2", headers=_headers(owner))
    assert len(response.json()["data"]) == 2
    too_many = await client.get("/api/v1/audit-logs?limit=999", headers=_headers(owner))
    assert too_many.status_code == 400


async def test_plain_member_cannot_read_audit_logs(client):
    owner = await _register(client, "own2@acme.test", "Acme")
    added = await client.post(
        "/api/v1/workspace/members",
        json={"email": "m@acme.test", "full_name": "M", "password": "MemberPass1", "role": "member"},
        headers=_headers(owner),
    )
    assert added.status_code == 201
    login = await client.post("/api/v1/auth/login", json={"email": "m@acme.test", "password": "MemberPass1"})
    response = await client.get("/api/v1/audit-logs", headers=_headers(login.json()["data"]))
    assert response.status_code == 403


async def test_audit_logs_are_workspace_scoped(client):
    owner_a = await _register(client, "a2@acme.test", "A")
    owner_b = await _register(client, "b2@acme.test", "B")
    await client.post("/api/v1/chatbots", json={"name": "Only in A"}, headers=_headers(owner_a))
    rows = (await client.get("/api/v1/audit-logs", headers=_headers(owner_b))).json()["data"]
    assert all(row["action"] != "chatbot.created" for row in rows)
