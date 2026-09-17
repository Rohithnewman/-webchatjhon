"""D3: the permission catalogue actually gates the routes it claims to.

One behavioural test per system role: a member can do what bots:manage,
inbox:reply and knowledge:manage allow; a viewer is refused every write but
still reads analytics (analytics:read); an admin can manage members and the
organisation (members:manage, workspace:manage)."""

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
    assert login.status_code == 200
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


async def test_member_can_create_a_bot_and_reply(client):
    owner = await _register(client, "owner@catalogue.test", "Catalogue")
    conversation_id = await _handoff_conversation(client, owner)
    member = await _add_member(client, owner, email="member@catalogue.test", role="member")

    created = await client.post(
        "/api/v1/chatbots", json={"name": "Member's bot"}, headers=_headers(member)
    )
    assert created.status_code == 201, created.text

    reply = await client.post(
        f"/api/v1/conversations/{conversation_id}/messages",
        json={"content": "I can help with that."},
        headers=_headers(member),
    )
    assert reply.status_code == 200, reply.text


async def test_viewer_is_refused_every_write_but_reads_analytics(client):
    owner = await _register(client, "owner@readonly.test", "ReadOnly")
    conversation_id = await _handoff_conversation(client, owner)
    viewer = await _add_member(client, owner, email="viewer@readonly.test", role="viewer")

    bot_create = await client.post(
        "/api/v1/chatbots", json={"name": "Denied"}, headers=_headers(viewer)
    )
    assert bot_create.status_code == 403

    reply = await client.post(
        f"/api/v1/conversations/{conversation_id}/messages",
        json={"content": "Denied"},
        headers=_headers(viewer),
    )
    assert reply.status_code == 403

    knowledge_write = await client.post(
        "/api/v1/knowledge-bases", json={"name": "Denied"}, headers=_headers(viewer)
    )
    assert knowledge_write.status_code == 403

    analytics = await client.get("/api/v1/analytics/overview", headers=_headers(viewer))
    assert analytics.status_code == 200


async def test_admin_can_manage_members_and_organisation(client):
    owner = await _register(client, "owner@admin.test", "AdminOrg")
    admin = await _add_member(client, owner, email="admin@admin.test", role="admin")

    added = await client.post(
        "/api/v1/workspace/members",
        json={"email": "third@admin.test", "full_name": "Third", "password": "ThirdPass123", "role": "viewer"},
        headers=_headers(admin),
    )
    assert added.status_code == 201, added.text

    renamed = await client.patch(
        "/api/v1/organization", json={"name": "AdminOrg Ltd"}, headers=_headers(admin)
    )
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["data"]["name"] == "AdminOrg Ltd"
