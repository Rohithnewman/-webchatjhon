from sqlalchemy import text


async def _auth(client, email: str, org: str) -> dict:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Secret123", "full_name": "Owner", "org_name": org},
    )
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['data']['access_token']}"}


async def _published_chatbot(client, headers, name: str) -> str:
    created = await client.post("/api/v1/chatbots", json={"name": name}, headers=headers)
    chatbot_id = created.json()["data"]["id"]
    published = await client.patch(
        f"/api/v1/chatbots/{chatbot_id}", json={"status": "published"}, headers=headers
    )
    assert published.status_code == 200
    return chatbot_id


async def test_overview_counts_conversations_per_day_and_per_bot(client):
    headers = await _auth(client, "stats@x.com", "Acme")
    faq = await _published_chatbot(client, headers, "FAQ Bot")
    sales = await _published_chatbot(client, headers, "Sales Bot")
    for chatbot_id in (faq, faq, sales):
        started = await client.post("/api/v1/widget/conversations", json={"chatbot_id": chatbot_id})
        assert started.status_code == 201

    response = await client.get("/api/v1/analytics/overview?days=7", headers=headers)
    assert response.status_code == 200
    data = response.json()["data"]

    assert data["days"] == 7
    assert data["totals"]["conversations"] == 3
    assert data["totals"]["chatbots"] == 2
    # The default flow is welcome → end, so every conversation closes at once.
    assert data["totals"]["closed"] == 3
    assert data["totals"]["messages"] == 3
    assert len(data["daily"]) == 1
    assert data["daily"][0]["conversations"] == 3
    by_name = {row["name"]: row["conversations"] for row in data["by_chatbot"]}
    assert by_name == {"FAQ Bot": 2, "Sales Bot": 1}


async def test_overview_is_workspace_scoped(client):
    headers_a = await _auth(client, "a@x.com", "A")
    headers_b = await _auth(client, "b@x.com", "B")
    bot_a = await _published_chatbot(client, headers_a, "A bot")
    await client.post("/api/v1/widget/conversations", json={"chatbot_id": bot_a})

    response = await client.get("/api/v1/analytics/overview", headers=headers_b)
    assert response.status_code == 200
    assert response.json()["data"]["totals"]["conversations"] == 0
    assert response.json()["data"]["by_chatbot"] == []


async def test_overview_rejects_bad_window(client):
    headers = await _auth(client, "window@x.com", "Acme")
    response = await client.get("/api/v1/analytics/overview?days=0", headers=headers)
    # The global handler renders validation failures as 400 VALIDATION_ERROR.
    assert response.status_code == 400
    assert response.json()["error"] == "VALIDATION_ERROR"


async def test_overview_totals_are_window_scoped(client, session):
    headers = await _auth(client, "aged@x.com", "Acme")
    bot = await _published_chatbot(client, headers, "Old Bot")
    started = await client.post("/api/v1/widget/conversations", json={"chatbot_id": bot})
    assert started.status_code == 201

    # Backdate the conversation past the 7-day window but still inside 90.
    await session.execute(
        text(
            "UPDATE conversations SET created_at = now() - interval '40 days' "
            "WHERE chatbot_id = :chatbot_id"
        ),
        {"chatbot_id": bot},
    )

    narrow = await client.get("/api/v1/analytics/overview?days=7", headers=headers)
    assert narrow.status_code == 200
    narrow_totals = narrow.json()["data"]["totals"]
    assert narrow_totals["conversations"] == 0
    assert narrow_totals["closed"] == 0
    assert narrow.json()["data"]["by_chatbot"] == []

    wide = await client.get("/api/v1/analytics/overview?days=90", headers=headers)
    assert wide.status_code == 200
    assert wide.json()["data"]["totals"]["conversations"] == 1
