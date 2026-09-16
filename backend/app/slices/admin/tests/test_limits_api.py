"""D2: per-organisation limit overrides (users, bots, conversations per
month), set by the superadmin, defaulting from the plan, with the monthly
conversation cap enforced at widget start."""

import uuid

from sqlalchemy import text

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
    # `ensure_superadmin` (unlike a bare `set_user_flags`) also detaches any
    # memberships, matching production promotion (D1: a superadmin carries
    # no tenancy). The registration token above still carries a
    # `workspace_id` claim minted before the promotion, so log in again for
    # a token that reflects the post-promotion state.
    email = f"root-{uuid.uuid4().hex[:8]}@platform.test"
    await _register(client, email, "Platform")
    await identity_api.ensure_superadmin(
        session, email=email, password="Secret123", full_name="Root"
    )
    await session.commit()
    response = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "Secret123"}
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


async def _org_id(client, root_headers: dict, name: str) -> str:
    orgs = (await client.get("/api/v1/admin/organizations", headers=root_headers)).json()["data"]
    return next(org for org in orgs if org["name"] == name)["id"]


async def _org_row(client, root_headers: dict, name: str) -> dict:
    orgs = (await client.get("/api/v1/admin/organizations", headers=root_headers)).json()["data"]
    return next(org for org in orgs if org["name"] == name)


async def _published_chatbot(client, headers, name: str = "Concierge") -> str:
    created = await client.post("/api/v1/chatbots", json={"name": name}, headers=headers)
    assert created.status_code == 201, created.text
    chatbot_id = created.json()["data"]["id"]
    published = await client.patch(
        f"/api/v1/chatbots/{chatbot_id}", json={"status": "published"}, headers=headers
    )
    assert published.status_code == 200
    return chatbot_id


async def test_limit_overrides_beat_the_plan_default(client, session):
    root = await _superadmin(client, session)
    await _register(client, "owner@overrides.test", "Overrides")
    org_id = await _org_id(client, _headers(root), "Overrides")

    response = await client.patch(
        f"/api/v1/admin/organizations/{org_id}",
        json={"seat_limit": 2, "chatbot_limit": 1, "conversation_limit": 3},
        headers=_headers(root),
    )
    assert response.status_code == 200, response.text
    sub = response.json()["data"]["subscription"]
    assert sub["seat_limit"] == 2
    assert sub["chatbot_limit"] == 1
    assert sub["conversation_limit"] == 3
    assert sub["limits_overridden"] == {"seats": True, "chatbots": True, "conversations": True}

    # And the list endpoint reflects the same effective values.
    row = await _org_row(client, _headers(root), "Overrides")
    assert row["subscription"]["seat_limit"] == 2
    assert row["subscription"]["chatbot_limit"] == 1
    assert row["subscription"]["conversation_limit"] == 3


async def test_null_override_restores_the_plan_default_and_flips_overridden(client, session):
    root = await _superadmin(client, session)
    await _register(client, "owner@restore.test", "Restore")
    org_id = await _org_id(client, _headers(root), "Restore")

    overridden = await client.patch(
        f"/api/v1/admin/organizations/{org_id}",
        json={"seat_limit": 2, "chatbot_limit": 1, "conversation_limit": 3},
        headers=_headers(root),
    )
    assert overridden.status_code == 200, overridden.text
    assert overridden.json()["data"]["subscription"]["limits_overridden"]["seats"] is True

    restored = await client.patch(
        f"/api/v1/admin/organizations/{org_id}",
        json={"seat_limit": None},
        headers=_headers(root),
    )
    assert restored.status_code == 200, restored.text
    sub = restored.json()["data"]["subscription"]
    # Free plan default.
    assert sub["seat_limit"] == 5
    assert sub["limits_overridden"]["seats"] is False
    # The other two overrides are untouched.
    assert sub["chatbot_limit"] == 1
    assert sub["limits_overridden"]["chatbots"] is True
    assert sub["conversation_limit"] == 3
    assert sub["limits_overridden"]["conversations"] is True


async def test_negative_limit_override_is_rejected(client, session):
    root = await _superadmin(client, session)
    await _register(client, "owner@negative.test", "Negative")
    org_id = await _org_id(client, _headers(root), "Negative")

    response = await client.patch(
        f"/api/v1/admin/organizations/{org_id}",
        json={"seat_limit": -1},
        headers=_headers(root),
    )
    assert response.status_code == 400
    assert response.json()["error"] == "VALIDATION_ERROR"


async def test_overridden_seat_and_chatbot_limits_are_enforced(client, session):
    root = await _superadmin(client, session)
    owner = await _register(client, "owner@effective.test", "Effective")
    org_id = await _org_id(client, _headers(root), "Effective")

    patched = await client.patch(
        f"/api/v1/admin/organizations/{org_id}",
        json={"seat_limit": 1, "chatbot_limit": 1},
        headers=_headers(root),
    )
    assert patched.status_code == 200, patched.text

    # Owner already occupies the one seat the override allows.
    blocked_member = await client.post(
        "/api/v1/workspace/members",
        json={"email": "second@effective.test", "full_name": "Second", "password": "MemberPass123", "role": "member"},
        headers=_headers(owner),
    )
    assert blocked_member.status_code == 403
    assert blocked_member.json()["error"] == "PLAN_LIMIT"

    # First chatbot is within the overridden limit of 1...
    first_bot = await client.post("/api/v1/chatbots", json={"name": "First"}, headers=_headers(owner))
    assert first_bot.status_code == 201, first_bot.text

    # ...the second is not.
    blocked_bot = await client.post("/api/v1/chatbots", json={"name": "Second"}, headers=_headers(owner))
    assert blocked_bot.status_code == 403
    assert blocked_bot.json()["error"] == "PLAN_LIMIT"


async def test_monthly_conversation_cap_blocks_the_next_widget_start(client, session):
    root = await _superadmin(client, session)
    owner = await _register(client, "owner@convcap.test", "ConvCap")
    chatbot_id = await _published_chatbot(client, _headers(owner))
    org_id = await _org_id(client, _headers(root), "ConvCap")

    capped = await client.patch(
        f"/api/v1/admin/organizations/{org_id}", json={"conversation_limit": 1}, headers=_headers(root)
    )
    assert capped.status_code == 200, capped.text

    first = await client.post("/api/v1/widget/conversations", json={"chatbot_id": chatbot_id})
    assert first.status_code == 201, first.text

    second = await client.post("/api/v1/widget/conversations", json={"chatbot_id": chatbot_id})
    assert second.status_code == 403
    body = second.json()
    assert body["error"] == "PLAN_LIMIT"
    assert "1 conversations per month" in body["message"]

    # The cap is only enforced at widget start, not on the (unauthenticated,
    # pre-open) profile fetch the widget also makes.
    profile = await client.get(f"/api/v1/widget/chatbots/{chatbot_id}")
    assert profile.status_code == 200

    # The plan's message endpoint (mid-conversation) is likewise unaffected —
    # only starting a *new* conversation is capped.
    conversation_id = first.json()["data"]["conversation"]["id"]
    token = first.json()["data"]["token"]
    reply = await client.post(
        f"/api/v1/widget/conversations/{conversation_id}/messages",
        json={"content": "hello"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert reply.status_code != 403


async def test_backdated_conversation_does_not_count_towards_the_monthly_cap(client, session):
    root = await _superadmin(client, session)
    owner = await _register(client, "owner@backdate.test", "Backdate")
    chatbot_id = await _published_chatbot(client, _headers(owner))
    org_id = await _org_id(client, _headers(root), "Backdate")

    capped = await client.patch(
        f"/api/v1/admin/organizations/{org_id}", json={"conversation_limit": 1}, headers=_headers(root)
    )
    assert capped.status_code == 200, capped.text

    started = await client.post("/api/v1/widget/conversations", json={"chatbot_id": chatbot_id})
    assert started.status_code == 201, started.text
    conversation_id = started.json()["data"]["conversation"]["id"]

    # Push it into last month — it must stop counting towards this month's cap.
    await session.execute(
        text("UPDATE conversations SET created_at = created_at - interval '40 days' WHERE id = :id"),
        {"id": conversation_id},
    )

    now_allowed = await client.post("/api/v1/widget/conversations", json={"chatbot_id": chatbot_id})
    assert now_allowed.status_code == 201, now_allowed.text

    # This month now has exactly one conversation (the second one) — the
    # cap of 1 is reached again.
    blocked_again = await client.post("/api/v1/widget/conversations", json={"chatbot_id": chatbot_id})
    assert blocked_again.status_code == 403
    assert blocked_again.json()["error"] == "PLAN_LIMIT"


async def test_admin_organizations_reports_conversations_used(client, session):
    root = await _superadmin(client, session)
    owner = await _register(client, "owner@usage.test", "Usage")
    chatbot_id = await _published_chatbot(client, _headers(owner))

    for _ in range(2):
        started = await client.post("/api/v1/widget/conversations", json={"chatbot_id": chatbot_id})
        assert started.status_code == 201, started.text

    row = await _org_row(client, _headers(root), "Usage")
    assert row["subscription"]["conversations_used"] == 2
    assert row["subscription"]["conversation_limit"] == 200  # free plan default


async def test_auth_me_reports_conversation_limit_fields(client, session):
    root = await _superadmin(client, session)
    owner = await _register(client, "owner@me-limits.test", "MeLimits")
    chatbot_id = await _published_chatbot(client, _headers(owner))
    org_id = await _org_id(client, _headers(root), "MeLimits")

    overridden = await client.patch(
        f"/api/v1/admin/organizations/{org_id}", json={"conversation_limit": 7}, headers=_headers(root)
    )
    assert overridden.status_code == 200, overridden.text

    started = await client.post("/api/v1/widget/conversations", json={"chatbot_id": chatbot_id})
    assert started.status_code == 201, started.text

    me = await client.get("/api/v1/auth/me", headers=_headers(owner))
    assert me.status_code == 200, me.text
    sub = me.json()["data"]["subscription"]
    assert sub["conversation_limit"] == 7
    assert sub["limits_overridden"]["conversations"] is True
    assert sub["conversations_used"] == 1


async def test_organization_profile_reports_conversation_limit_fields(client, session):
    root = await _superadmin(client, session)
    owner = await _register(client, "owner@org-limits.test", "OrgLimits")
    chatbot_id = await _published_chatbot(client, _headers(owner))
    org_id = await _org_id(client, _headers(root), "OrgLimits")

    overridden = await client.patch(
        f"/api/v1/admin/organizations/{org_id}", json={"conversation_limit": 9}, headers=_headers(root)
    )
    assert overridden.status_code == 200, overridden.text

    started = await client.post("/api/v1/widget/conversations", json={"chatbot_id": chatbot_id})
    assert started.status_code == 201, started.text

    organization = await client.get("/api/v1/organization", headers=_headers(owner))
    assert organization.status_code == 200, organization.text
    sub = organization.json()["data"]["subscription"]
    assert sub["conversation_limit"] == 9
    assert sub["limits_overridden"]["conversations"] is True
    assert sub["conversations_used"] == 1
