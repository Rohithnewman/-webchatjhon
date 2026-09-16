import uuid
from datetime import date, timedelta

from sqlalchemy import text

from app.slices.identity import api as identity_api

SUBSCRIPTION_KEYS = {
    "plan",
    "status",
    "effective_status",
    "starts_at",
    "ends_at",
    "seat_limit",
    "chatbot_limit",
    "seats_used",
    "chatbots_used",
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


async def _superadmin(client, session) -> dict:
    bundle = await _register(client, f"root-{uuid.uuid4().hex[:8]}@platform.test", "Platform")
    await identity_api.set_user_flags(
        session, user_id=uuid.UUID(bundle["user_id"]), is_superadmin=True
    )
    await session.flush()
    return bundle


async def _org_id(client, root_headers: dict, name: str) -> str:
    orgs = (await client.get("/api/v1/admin/organizations", headers=root_headers)).json()["data"]
    return next(org for org in orgs if org["name"] == name)["id"]


async def _published_chatbot(client, headers) -> str:
    created = await client.post("/api/v1/chatbots", json={"name": "Concierge"}, headers=headers)
    assert created.status_code == 201, created.text
    chatbot_id = created.json()["data"]["id"]
    published = await client.patch(
        f"/api/v1/chatbots/{chatbot_id}", json={"status": "published"}, headers=headers
    )
    assert published.status_code == 200
    return chatbot_id


async def test_superadmin_updates_plan_status_and_period(client, session):
    root = await _superadmin(client, session)
    await _register(client, "owner@acme.test", "Acme")
    acme_id = await _org_id(client, _headers(root), "Acme")

    starts = date.today().isoformat()
    ends = (date.today() + timedelta(days=30)).isoformat()
    response = await client.patch(
        f"/api/v1/admin/organizations/{acme_id}",
        json={"plan": "pro", "status": "suspended", "starts_at": starts, "ends_at": ends},
        headers=_headers(root),
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert SUBSCRIPTION_KEYS <= set(data["subscription"])
    sub = data["subscription"]
    assert sub["plan"] == "pro"
    assert sub["status"] == "suspended"
    assert sub["effective_status"] == "suspended"
    assert sub["starts_at"] == starts
    assert sub["ends_at"] == ends
    assert sub["seat_limit"] == 25
    assert sub["chatbot_limit"] == 25

    rows = await session.execute(
        text(
            "SELECT workspace_id FROM audit_logs "
            "WHERE action = 'admin.organization_subscription_changed' "
            "ORDER BY created_at DESC LIMIT 1"
        )
    )
    row = rows.first()
    assert row is not None
    assert row[0] is None


async def test_expired_ends_at_reports_expired_and_can_be_cleared(client, session):
    root = await _superadmin(client, session)
    await _register(client, "owner@expiry.test", "Expiry")
    org_id = await _org_id(client, _headers(root), "Expiry")

    starts = (date.today() - timedelta(days=60)).isoformat()
    past = (date.today() - timedelta(days=1)).isoformat()
    response = await client.patch(
        f"/api/v1/admin/organizations/{org_id}",
        json={"starts_at": starts, "ends_at": past},
        headers=_headers(root),
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["subscription"]["effective_status"] == "expired"

    cleared = await client.patch(
        f"/api/v1/admin/organizations/{org_id}",
        json={"ends_at": None},
        headers=_headers(root),
    )
    assert cleared.status_code == 200, cleared.text
    sub = cleared.json()["data"]["subscription"]
    assert sub["ends_at"] is None
    assert sub["effective_status"] == "active"


async def test_ends_at_before_starts_at_and_bad_status_are_rejected(client, session):
    root = await _superadmin(client, session)
    await _register(client, "owner@badinput.test", "BadInput")
    org_id = await _org_id(client, _headers(root), "BadInput")

    bad_period = await client.patch(
        f"/api/v1/admin/organizations/{org_id}",
        json={"starts_at": date.today().isoformat(), "ends_at": (date.today() - timedelta(days=5)).isoformat()},
        headers=_headers(root),
    )
    assert bad_period.status_code == 400

    bad_status = await client.patch(
        f"/api/v1/admin/organizations/{org_id}",
        json={"status": "cancelled"},
        headers=_headers(root),
    )
    assert bad_status.status_code == 400

    empty_body = await client.patch(
        f"/api/v1/admin/organizations/{org_id}",
        json={},
        headers=_headers(root),
    )
    assert empty_body.status_code == 400


async def test_suspended_org_locks_owner_out_and_reports_in_stats(client, session):
    root = await _superadmin(client, session)
    owner = await _register(client, "owner@suspend.test", "Suspend")
    org_id = await _org_id(client, _headers(root), "Suspend")

    suspended = await client.patch(
        f"/api/v1/admin/organizations/{org_id}", json={"status": "suspended"}, headers=_headers(root)
    )
    assert suspended.status_code == 200

    locked = await client.get("/api/v1/chatbots", headers=_headers(owner))
    assert locked.status_code == 403
    assert locked.json()["error"] == "SUBSCRIPTION_LOCKED"

    me = await client.get("/api/v1/auth/me", headers=_headers(owner))
    assert me.status_code == 200
    assert me.json()["data"]["subscription"]["effective_status"] == "suspended"

    stats = await client.get("/api/v1/admin/stats", headers=_headers(root))
    assert stats.status_code == 200
    assert stats.json()["data"]["locked_organizations"] >= 1

    reactivated = await client.patch(
        f"/api/v1/admin/organizations/{org_id}", json={"status": "active"}, headers=_headers(root)
    )
    assert reactivated.status_code == 200
    restored = await client.get("/api/v1/chatbots", headers=_headers(owner))
    assert restored.status_code == 200


async def test_suspended_org_locks_the_widget(client, session):
    root = await _superadmin(client, session)
    owner = await _register(client, "owner@widgetlock.test", "WidgetLock")
    chatbot_id = await _published_chatbot(client, _headers(owner))
    org_id = await _org_id(client, _headers(root), "WidgetLock")

    suspended = await client.patch(
        f"/api/v1/admin/organizations/{org_id}", json={"status": "suspended"}, headers=_headers(root)
    )
    assert suspended.status_code == 200

    started = await client.post("/api/v1/widget/conversations", json={"chatbot_id": chatbot_id})
    assert started.status_code == 403
    assert started.json()["error"] == "SUBSCRIPTION_LOCKED"

    profile = await client.get(f"/api/v1/widget/chatbots/{chatbot_id}")
    assert profile.status_code == 403
    assert profile.json()["error"] == "SUBSCRIPTION_LOCKED"


async def test_seat_limit_blocks_the_sixth_seat_until_upgraded(client, session):
    root = await _superadmin(client, session)
    owner = await _register(client, "owner@seats.test", "Seats")
    org_id = await _org_id(client, _headers(root), "Seats")

    # Owner is seat 1. Adding 4 more members reaches the free plan's 5-seat cap.
    for i in range(4):
        added = await client.post(
            "/api/v1/workspace/members",
            json={
                "email": f"member{i}@seats.test",
                "full_name": f"Member {i}",
                "password": "MemberPass123",
                "role": "member",
            },
            headers=_headers(owner),
        )
        assert added.status_code == 201, added.text

    over_limit = await client.post(
        "/api/v1/workspace/members",
        json={"email": "sixth@seats.test", "full_name": "Sixth", "password": "MemberPass123", "role": "member"},
        headers=_headers(owner),
    )
    assert over_limit.status_code == 403
    assert over_limit.json()["error"] == "PLAN_LIMIT"

    upgraded = await client.patch(
        f"/api/v1/admin/organizations/{org_id}", json={"plan": "pro"}, headers=_headers(root)
    )
    assert upgraded.status_code == 200

    now_ok = await client.post(
        "/api/v1/workspace/members",
        json={"email": "sixth@seats.test", "full_name": "Sixth", "password": "MemberPass123", "role": "member"},
        headers=_headers(owner),
    )
    assert now_ok.status_code == 201, now_ok.text


async def test_chatbot_limit_blocks_the_fourth_bot(client, session):
    owner = await _register(client, "owner@bots.test", "Bots")

    for i in range(3):
        created = await client.post(
            "/api/v1/chatbots", json={"name": f"Bot {i}"}, headers=_headers(owner)
        )
        assert created.status_code == 201, created.text

    over_limit = await client.post(
        "/api/v1/chatbots", json={"name": "Bot 4"}, headers=_headers(owner)
    )
    assert over_limit.status_code == 403
    assert over_limit.json()["error"] == "PLAN_LIMIT"


async def test_suspending_one_organization_does_not_lock_another(client, session):
    root = await _superadmin(client, session)
    owner_a = await _register(client, "owner@isolatea.test", "IsolateA")
    owner_b = await _register(client, "owner@isolateb.test", "IsolateB")
    org_a = await _org_id(client, _headers(root), "IsolateA")

    suspended = await client.patch(
        f"/api/v1/admin/organizations/{org_a}", json={"status": "suspended"}, headers=_headers(root)
    )
    assert suspended.status_code == 200

    locked = await client.get("/api/v1/chatbots", headers=_headers(owner_a))
    assert locked.status_code == 403

    still_fine = await client.get("/api/v1/chatbots", headers=_headers(owner_b))
    assert still_fine.status_code == 200


async def test_plan_literal_validation_still_returns_400(client, session):
    root = await _superadmin(client, session)
    await _register(client, "owner@literal.test", "Literal")
    org_id = await _org_id(client, _headers(root), "Literal")

    bad = await client.patch(
        f"/api/v1/admin/organizations/{org_id}", json={"plan": "gold"}, headers=_headers(root)
    )
    assert bad.status_code == 400
