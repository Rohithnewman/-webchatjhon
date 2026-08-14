import uuid

from sqlalchemy import text

from app.core.security import create_access_token
from app.slices.identity.use_cases.register import register
from app.slices.tenancy import api as tenancy_api


REGISTRATION = {
    "email": "builder@x.com",
    "password": "Secret123",
    "full_name": "Builder",
    "org_name": "Acme",
}


async def _auth(client):
    response = await client.post("/api/v1/auth/register", json=REGISTRATION)
    assert response.status_code == 201
    return response.json()["data"]


async def test_chatbot_crud_and_flow_version_lifecycle(client, session):
    auth = await _auth(client)
    headers = {"Authorization": f"Bearer {auth['access_token']}"}
    created = await client.post(
        "/api/v1/chatbots",
        json={"name": "Support concierge", "description": "Front-line support"},
        headers=headers,
    )
    assert created.status_code == 201
    chatbot = created.json()["data"]
    assert chatbot["current_version"] == 1

    listed = await client.get("/api/v1/chatbots", headers=headers)
    assert [item["id"] for item in listed.json()["data"]] == [chatbot["id"]]

    current = await client.get(
        f"/api/v1/chatbots/{chatbot['id']}/flow", headers=headers
    )
    definition = current.json()["data"]["definition"]
    definition["nodes"][1]["data"]["message"] = "Welcome to Acme support."
    saved = await client.put(
        f"/api/v1/chatbots/{chatbot['id']}/flow",
        json=definition,
        headers=headers,
    )
    assert saved.status_code == 200
    assert saved.json()["data"]["version"] == 2

    versions = await client.get(
        f"/api/v1/chatbots/{chatbot['id']}/flow/versions", headers=headers
    )
    assert [item["version"] for item in versions.json()["data"]] == [2, 1]
    restored = await client.post(
        f"/api/v1/chatbots/{chatbot['id']}/flow/versions/1/restore",
        headers=headers,
    )
    assert restored.json()["data"]["version"] == 3

    updated = await client.patch(
        f"/api/v1/chatbots/{chatbot['id']}",
        json={"status": "published", "name": "Support assistant"},
        headers=headers,
    )
    assert updated.json()["data"]["status"] == "published"

    audit = await session.execute(
        text(
            "SELECT action FROM audit_logs WHERE target_id=:target "
            "OR metadata->>'chatbot_id'=:target ORDER BY created_at"
        ),
        {"target": chatbot["id"]},
    )
    actions = [row[0] for row in audit]
    assert "chatbot.created" in actions
    assert "flow.saved" in actions
    assert "flow.restored" in actions

    deleted = await client.delete(
        f"/api/v1/chatbots/{chatbot['id']}", headers=headers
    )
    assert deleted.status_code == 200
    missing = await client.get(
        f"/api/v1/chatbots/{chatbot['id']}", headers=headers
    )
    assert missing.status_code == 404


async def test_viewer_can_read_but_cannot_create(client, session):
    auth = await _auth(client)
    viewer = await tenancy_api.get_role_by_name(session, "viewer")
    assert viewer is not None
    await session.execute(
        text("UPDATE memberships SET role_id=:role WHERE user_id=:user"),
        {"role": viewer.id, "user": uuid.UUID(auth["user_id"])},
    )
    headers = {"Authorization": f"Bearer {auth['access_token']}"}
    assert (await client.get("/api/v1/chatbots", headers=headers)).status_code == 200
    denied = await client.post(
        "/api/v1/chatbots", json={"name": "Denied"}, headers=headers
    )
    assert denied.status_code == 403


async def test_invalid_import_is_rejected(client):
    auth = await _auth(client)
    headers = {"Authorization": f"Bearer {auth['access_token']}"}
    chatbot = (
        await client.post(
            "/api/v1/chatbots", json={"name": "Import test"}, headers=headers
        )
    ).json()["data"]
    response = await client.put(
        f"/api/v1/chatbots/{chatbot['id']}/flow",
        json={
            "nodes": [
                {
                    "id": "message",
                    "type": "message",
                    "position": {"x": 0, "y": 0},
                    "data": {},
                }
            ],
            "edges": [],
        },
        headers=headers,
    )
    assert response.status_code == 400
    assert response.json()["error"] == "VALIDATION_ERROR"


async def test_same_user_cannot_cross_workspace_ids(client, session):
    first = await register(
        session,
        email="multi@x.com",
        password="Secret123",
        full_name="Multi",
        org_name="First",
    )
    second = await tenancy_api.create_tenant(session, org_name="Second")
    owner = await tenancy_api.get_role_by_name(session, "owner")
    assert owner is not None
    await tenancy_api.create_membership(
        session,
        user_id=first.user_id,
        workspace_id=second.workspace_id,
        role_id=owner.id,
    )
    await session.commit()
    second_token = create_access_token(
        sub=str(first.user_id),
        email="multi@x.com",
        workspace_id=str(second.workspace_id),
    )
    created = await client.post(
        "/api/v1/chatbots",
        json={"name": "Second workspace bot"},
        headers={"Authorization": f"Bearer {second_token}"},
    )
    chatbot_id = created.json()["data"]["id"]
    hidden = await client.get(
        f"/api/v1/chatbots/{chatbot_id}",
        headers={"Authorization": f"Bearer {first.access_token}"},
    )
    assert hidden.status_code == 404
