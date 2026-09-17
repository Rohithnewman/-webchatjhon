"""D3: organisation-defined roles from the permission catalogue.

CRUD; isolation between organisations; system roles are immutable; a role
still assigned to a member cannot be deleted; `*` is refused; `features:read`
is always added server-side; a custom role can be assigned by name; and a
member holding only a custom role is gated purely by that role's
permissions, not by its name.
"""

ROLES_URL = "/api/v1/workspace/roles"

HANDOFF_FLOW = {
    "nodes": [
        {"id": "s", "type": "start", "position": {"x": 0, "y": 0}, "data": {}},
        {
            "id": "q",
            "type": "question",
            "position": {"x": 0, "y": 0},
            "data": {"prompt": "How can we help?", "variable": "issue"},
        },
        {
            "id": "h",
            "type": "handoff",
            "position": {"x": 0, "y": 0},
            "data": {"message": "An agent will be right with you."},
        },
    ],
    "edges": [
        {"id": "e1", "source": "s", "target": "q"},
        {"id": "e2", "source": "q", "target": "h"},
    ],
    "viewport": {"x": 0, "y": 0, "zoom": 1},
}


async def _register(client, email: str, org: str) -> dict:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Secret123", "full_name": "Owner", "org_name": org},
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


def _headers(bundle: dict) -> dict:
    return {"Authorization": f"Bearer {bundle['access_token']}"}


async def _add_member(client, owner: dict, *, email: str, role: str) -> dict:
    added = await client.post(
        "/api/v1/workspace/members",
        json={"email": email, "full_name": "Teammate", "password": "TeammatePass1", "role": role},
        headers=_headers(owner),
    )
    assert added.status_code == 201, added.text
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": "TeammatePass1"})
    assert login.status_code == 200, login.text
    return login.json()["data"]


async def _handoff_conversation(client, owner: dict) -> str:
    created = await client.post("/api/v1/chatbots", json={"name": "Concierge"}, headers=_headers(owner))
    chatbot_id = created.json()["data"]["id"]
    saved = await client.put(
        f"/api/v1/chatbots/{chatbot_id}/flow", json=HANDOFF_FLOW, headers=_headers(owner)
    )
    assert saved.status_code == 200
    published = await client.patch(
        f"/api/v1/chatbots/{chatbot_id}", json={"status": "published"}, headers=_headers(owner)
    )
    assert published.status_code == 200

    started = await client.post("/api/v1/widget/conversations", json={"chatbot_id": chatbot_id})
    data = started.json()["data"]
    conversation_id = data["conversation"]["id"]
    widget_headers = {"Authorization": f"Bearer {data['token']}"}
    answered = await client.post(
        f"/api/v1/widget/conversations/{conversation_id}/messages",
        json={"content": "My invoice is wrong"},
        headers=widget_headers,
    )
    assert answered.json()["data"]["status"] == "handoff"
    return conversation_id


async def test_role_crud(client):
    owner = await _register(client, "owner@roles.test", "RolesOrg")

    created = await client.post(
        ROLES_URL,
        json={"name": "Support agent", "permissions": ["inbox:reply", "analytics:read"]},
        headers=_headers(owner),
    )
    assert created.status_code == 201, created.text
    role = created.json()["data"]
    assert role["is_system"] is False
    assert role["in_use"] == 0
    assert set(role["permissions"]) == {"inbox:reply", "analytics:read", "features:read"}

    listed = await client.get(ROLES_URL, headers=_headers(owner))
    assert listed.status_code == 200
    names = {r["name"] for r in listed.json()["data"]}
    assert {"owner", "admin", "member", "viewer", "Support agent"} <= names

    renamed = await client.patch(
        f"{ROLES_URL}/{role['id']}",
        json={"name": "Support", "permissions": ["inbox:reply"]},
        headers=_headers(owner),
    )
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["data"]["name"] == "Support"
    assert set(renamed.json()["data"]["permissions"]) == {"inbox:reply", "features:read"}

    deleted = await client.delete(f"{ROLES_URL}/{role['id']}", headers=_headers(owner))
    assert deleted.status_code == 200, deleted.text

    listed_after = await client.get(ROLES_URL, headers=_headers(owner))
    assert "Support" not in {r["name"] for r in listed_after.json()["data"]}


async def test_duplicate_role_name_is_rejected(client):
    owner = await _register(client, "dupname@roles.test", "DupNameOrg")
    first = await client.post(
        ROLES_URL, json={"name": "Agent", "permissions": ["inbox:reply"]}, headers=_headers(owner)
    )
    assert first.status_code == 201, first.text

    second = await client.post(
        ROLES_URL, json={"name": "Agent", "permissions": ["analytics:read"]}, headers=_headers(owner)
    )
    assert second.status_code == 409
    assert second.json()["error"] == "ROLE_NAME_TAKEN"


async def test_patch_round_trips_the_get_response(client):
    """The roles editor seeds its edit form from GET's `permissions` (which
    already includes the server-added `features:read`) and PATCHes that
    array straight back unchanged apart from a new name. That must not be
    rejected as an unknown permission."""
    owner = await _register(client, "roundtrip@roles.test", "RoundTripOrg")
    created = await client.post(
        ROLES_URL, json={"name": "Agent", "permissions": ["inbox:reply"]}, headers=_headers(owner)
    )
    assert created.status_code == 201, created.text
    role_id = created.json()["data"]["id"]

    fetched = await client.get(ROLES_URL, headers=_headers(owner))
    role = next(r for r in fetched.json()["data"] if r["id"] == role_id)
    assert "features:read" in role["permissions"]

    patched = await client.patch(
        f"{ROLES_URL}/{role_id}",
        json={"name": "Agent renamed", "permissions": role["permissions"]},
        headers=_headers(owner),
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["data"]["name"] == "Agent renamed"
    assert set(patched.json()["data"]["permissions"]) == {"inbox:reply", "features:read"}


async def test_roles_are_isolated_between_organizations(client):
    owner_a = await _register(client, "a@roles.test", "OrgA")
    owner_b = await _register(client, "b@roles.test", "OrgB")

    created = await client.post(
        ROLES_URL, json={"name": "A Only", "permissions": ["bots:manage"]}, headers=_headers(owner_a)
    )
    assert created.status_code == 201, created.text
    role_id = created.json()["data"]["id"]

    listed_b = await client.get(ROLES_URL, headers=_headers(owner_b))
    assert "A Only" not in {r["name"] for r in listed_b.json()["data"]}

    patched = await client.patch(
        f"{ROLES_URL}/{role_id}", json={"name": "Hijacked"}, headers=_headers(owner_b)
    )
    assert patched.status_code == 404

    deleted = await client.delete(f"{ROLES_URL}/{role_id}", headers=_headers(owner_b))
    assert deleted.status_code == 404


async def test_system_roles_are_immutable(client):
    owner = await _register(client, "sys@roles.test", "SysOrg")
    listed = await client.get(ROLES_URL, headers=_headers(owner))
    owner_role = next(r for r in listed.json()["data"] if r["name"] == "owner" and r["is_system"])

    patched = await client.patch(
        f"{ROLES_URL}/{owner_role['id']}", json={"name": "Nope"}, headers=_headers(owner)
    )
    assert patched.status_code == 403
    assert patched.json()["error"] == "SYSTEM_ROLE"

    deleted = await client.delete(f"{ROLES_URL}/{owner_role['id']}", headers=_headers(owner))
    assert deleted.status_code == 403
    assert deleted.json()["error"] == "SYSTEM_ROLE"


async def test_delete_role_in_use_is_rejected(client):
    owner = await _register(client, "inuse@roles.test", "InUseOrg")
    created = await client.post(
        ROLES_URL, json={"name": "Agent", "permissions": ["inbox:reply"]}, headers=_headers(owner)
    )
    role_id = created.json()["data"]["id"]
    await _add_member(client, owner, email="agent@inuse.test", role="Agent")

    deleted = await client.delete(f"{ROLES_URL}/{role_id}", headers=_headers(owner))
    assert deleted.status_code == 409
    assert deleted.json()["error"] == "ROLE_IN_USE"


async def test_wildcard_permission_is_refused(client):
    owner = await _register(client, "wild@roles.test", "WildOrg")
    response = await client.post(
        ROLES_URL, json={"name": "God mode", "permissions": ["*"]}, headers=_headers(owner)
    )
    assert response.status_code == 400
    assert response.json()["error"] == "VALIDATION_ERROR"


async def test_features_read_is_always_added(client):
    owner = await _register(client, "fr@roles.test", "FrOrg")
    response = await client.post(
        ROLES_URL, json={"name": "Read only", "permissions": []}, headers=_headers(owner)
    )
    assert response.status_code == 201, response.text
    assert response.json()["data"]["permissions"] == ["features:read"]


async def test_assign_custom_role_by_name(client):
    owner = await _register(client, "custom@roles.test", "CustomOrg")
    await client.post(
        ROLES_URL,
        json={"name": "Support agent", "permissions": ["inbox:reply", "analytics:read"]},
        headers=_headers(owner),
    )
    agent = await _add_member(client, owner, email="agent@custom.test", role="Support agent")

    me = await client.get("/api/v1/auth/me", headers=_headers(agent))
    assert me.json()["data"]["role"] == "Support agent"
    assert set(me.json()["data"]["permissions"]) == {"inbox:reply", "analytics:read", "features:read"}


async def test_org_cannot_assign_another_orgs_custom_role(client):
    """Spec §7: org A cannot assign org B's roles. A custom role is scoped to
    the organisation that created it; another organisation naming it in
    POST /workspace/members gets the same "unknown role" error an
    unrecognised name would (resolve_role only looks at its own organisation's
    roles before falling back to the system roles)."""
    owner_a = await _register(client, "isoa@roles.test", "IsoOrgA")
    owner_b = await _register(client, "isob@roles.test", "IsoOrgB")

    created = await client.post(
        ROLES_URL,
        json={"name": "A's Support agent", "permissions": ["inbox:reply", "analytics:read"]},
        headers=_headers(owner_a),
    )
    assert created.status_code == 201, created.text

    added = await client.post(
        "/api/v1/workspace/members",
        json={
            "email": "borrowed@isoorgb.test",
            "full_name": "Teammate",
            "password": "TeammatePass1",
            "role": "A's Support agent",
        },
        headers=_headers(owner_b),
    )
    assert added.status_code == 400
    assert added.json()["error"] == "VALIDATION_ERROR"


async def test_custom_role_gates_by_permission_only(client):
    owner = await _register(client, "gate@roles.test", "GateOrg")
    conversation_id = await _handoff_conversation(client, owner)
    await client.post(
        ROLES_URL, json={"name": "Reply only", "permissions": ["inbox:reply"]}, headers=_headers(owner)
    )
    agent = await _add_member(client, owner, email="reply@gate.test", role="Reply only")

    reply = await client.post(
        f"/api/v1/conversations/{conversation_id}/messages",
        json={"content": "On it."},
        headers=_headers(agent),
    )
    assert reply.status_code == 200, reply.text

    bot_create = await client.post("/api/v1/chatbots", json={"name": "Denied"}, headers=_headers(agent))
    assert bot_create.status_code == 403
