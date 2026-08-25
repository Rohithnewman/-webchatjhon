import uuid

from sqlalchemy import text


async def _auth(client, email: str, org: str) -> dict:
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "Secret123",
            "full_name": "Agent",
            "org_name": org,
        },
    )
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['data']['access_token']}"}


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


async def _published_chatbot(client, headers, flow=None) -> str:
    created = await client.post(
        "/api/v1/chatbots", json={"name": "Concierge"}, headers=headers
    )
    chatbot_id = created.json()["data"]["id"]
    if flow is not None:
        saved = await client.put(
            f"/api/v1/chatbots/{chatbot_id}/flow", json=flow, headers=headers
        )
        assert saved.status_code == 200
    published = await client.patch(
        f"/api/v1/chatbots/{chatbot_id}",
        json={"status": "published"},
        headers=headers,
    )
    assert published.status_code == 200
    return chatbot_id


async def test_widget_runs_default_flow_to_completion(client):
    headers = await _auth(client, "owner@x.com", "Acme")
    chatbot_id = await _published_chatbot(client, headers)

    started = await client.post(
        "/api/v1/widget/conversations", json={"chatbot_id": chatbot_id}
    )
    assert started.status_code == 201
    data = started.json()["data"]
    # Default flow: welcome message then end.
    assert data["conversation"]["status"] == "closed"
    assert [m["role"] for m in data["messages"]] == ["bot"]
    assert data["token"]
    assert data["chatbot_name"] == "Concierge"


async def test_widget_rejects_unpublished_chatbots(client):
    headers = await _auth(client, "draft@x.com", "Acme")
    created = await client.post(
        "/api/v1/chatbots", json={"name": "Draft bot"}, headers=headers
    )
    chatbot_id = created.json()["data"]["id"]

    started = await client.post(
        "/api/v1/widget/conversations", json={"chatbot_id": chatbot_id}
    )
    assert started.status_code == 404


async def test_widget_turn_token_scoping_and_handoff_console(client, session):
    headers = await _auth(client, "agent@x.com", "Acme")
    chatbot_id = await _published_chatbot(client, headers, HANDOFF_FLOW)

    started = await client.post(
        "/api/v1/widget/conversations", json={"chatbot_id": chatbot_id}
    )
    data = started.json()["data"]
    conversation_id = data["conversation"]["id"]
    widget_headers = {"Authorization": f"Bearer {data['token']}"}
    assert data["conversation"]["status"] == "active"
    assert data["messages"][-1]["content"] == "How can we help?"

    # No token → 401. A token for another conversation → 403.
    no_token = await client.post(
        f"/api/v1/widget/conversations/{conversation_id}/messages",
        json={"content": "hi"},
    )
    assert no_token.status_code == 401
    other = await client.post(
        "/api/v1/widget/conversations", json={"chatbot_id": chatbot_id}
    )
    wrong_token = {"Authorization": f"Bearer {other.json()['data']['token']}"}
    crossed = await client.post(
        f"/api/v1/widget/conversations/{conversation_id}/messages",
        json={"content": "hi"},
        headers=wrong_token,
    )
    assert crossed.status_code == 403

    # The visitor answers; the flow hands off.
    answered = await client.post(
        f"/api/v1/widget/conversations/{conversation_id}/messages",
        json={"content": "My invoice is wrong"},
        headers=widget_headers,
    )
    turn = answered.json()["data"]
    assert turn["status"] == "handoff"
    assert turn["messages"][-1]["content"] == "An agent will be right with you."

    # During handoff a visitor message is stored but the engine stays parked.
    waiting = await client.post(
        f"/api/v1/widget/conversations/{conversation_id}/messages",
        json={"content": "Are you there?"},
        headers=widget_headers,
    )
    assert waiting.json()["data"]["status"] == "handoff"
    assert [m["role"] for m in waiting.json()["data"]["messages"]] == ["visitor"]

    # The agent sees the conversation, replies, and the visitor polls it down.
    inbox = await client.get("/api/v1/conversations?status=handoff", headers=headers)
    listed = inbox.json()["data"]
    assert [c["id"] for c in listed] == [conversation_id]
    assert listed[0]["last_message"]["content"] == "Are you there?"

    last_seen = waiting.json()["data"]["messages"][-1]["ordinal"]
    replied = await client.post(
        f"/api/v1/conversations/{conversation_id}/messages",
        json={"content": "Yes — looking at your invoice now."},
        headers=headers,
    )
    assert replied.status_code == 200

    polled = await client.get(
        f"/api/v1/widget/conversations/{conversation_id}/messages?after={last_seen}",
        headers=widget_headers,
    )
    poll = polled.json()["data"]
    assert [m["role"] for m in poll["messages"]] == ["agent"]

    # Close from the console; the widget can no longer post.
    closed = await client.post(
        f"/api/v1/conversations/{conversation_id}/close", headers=headers
    )
    assert closed.json()["data"]["status"] == "closed"
    rejected = await client.post(
        f"/api/v1/widget/conversations/{conversation_id}/messages",
        json={"content": "hello?"},
        headers=widget_headers,
    )
    assert rejected.status_code == 409

    audit = await session.execute(
        text("SELECT action FROM audit_logs WHERE action LIKE 'conversation.%' ORDER BY created_at")
    )
    assert [row[0] for row in audit] == [
        "conversation.agent_replied",
        "conversation.closed",
    ]


async def test_agent_reply_requires_handoff(client):
    headers = await _auth(client, "eager@x.com", "Acme")
    chatbot_id = await _published_chatbot(client, headers, HANDOFF_FLOW)
    started = await client.post(
        "/api/v1/widget/conversations", json={"chatbot_id": chatbot_id}
    )
    conversation_id = started.json()["data"]["conversation"]["id"]

    early = await client.post(
        f"/api/v1/conversations/{conversation_id}/messages",
        json={"content": "Barging in"},
        headers=headers,
    )
    assert early.status_code == 409
    assert early.json()["error"] == "NOT_IN_HANDOFF"


async def test_conversations_are_workspace_isolated(client):
    headers_a = await _auth(client, "a@x.com", "OrgA")
    headers_b = await _auth(client, "b@x.com", "OrgB")
    chatbot_id = await _published_chatbot(client, headers_a)
    started = await client.post(
        "/api/v1/widget/conversations", json={"chatbot_id": chatbot_id}
    )
    conversation_id = started.json()["data"]["conversation"]["id"]

    assert (
        await client.get("/api/v1/conversations", headers=headers_b)
    ).json()["data"] == []
    denied = await client.get(
        f"/api/v1/conversations/{conversation_id}", headers=headers_b
    )
    assert denied.status_code == 404
    barred = await client.post(
        f"/api/v1/conversations/{conversation_id}/close", headers=headers_b
    )
    assert barred.status_code == 404
