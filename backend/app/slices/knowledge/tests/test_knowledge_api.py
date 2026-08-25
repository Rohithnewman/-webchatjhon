import uuid

from sqlalchemy import text


async def _auth(client, email: str, org: str) -> dict:
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "Secret123",
            "full_name": "Knowledge Tester",
            "org_name": org,
        },
    )
    assert response.status_code == 201
    data = response.json()["data"]
    return {"Authorization": f"Bearer {data['access_token']}"}


async def test_knowledge_base_lifecycle(client, session):
    headers = await _auth(client, "kb@x.com", "Acme")

    created = await client.post(
        "/api/v1/knowledge-bases",
        json={"name": "Docs", "description": "Product docs"},
        headers=headers,
    )
    assert created.status_code == 201
    base = created.json()["data"]

    listed = await client.get("/api/v1/knowledge-bases", headers=headers)
    assert [row["id"] for row in listed.json()["data"]] == [base["id"]]

    updated = await client.patch(
        f"/api/v1/knowledge-bases/{base['id']}",
        json={"name": "Product docs"},
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["data"]["name"] == "Product docs"

    deleted = await client.delete(
        f"/api/v1/knowledge-bases/{base['id']}", headers=headers
    )
    assert deleted.status_code == 200

    # Soft-deleted bases disappear from every read path.
    assert (await client.get("/api/v1/knowledge-bases", headers=headers)).json()[
        "data"
    ] == []
    gone = await client.get(
        f"/api/v1/knowledge-bases/{base['id']}/documents", headers=headers
    )
    assert gone.status_code == 404

    audit = await session.execute(
        text("SELECT action FROM audit_logs WHERE action LIKE 'knowledge_base.%' ORDER BY created_at")
    )
    assert [row[0] for row in audit] == [
        "knowledge_base.created",
        "knowledge_base.updated",
        "knowledge_base.deleted",
    ]


async def test_document_upload_enqueues_ingestion_and_delete_removes_it(client, session):
    headers = await _auth(client, "docs@x.com", "Acme")
    base = (
        await client.post(
            "/api/v1/knowledge-bases", json={"name": "Docs"}, headers=headers
        )
    ).json()["data"]

    uploaded = await client.post(
        f"/api/v1/knowledge-bases/{base['id']}/documents",
        files={"file": ("guide.txt", b"hello knowledge world", "text/plain")},
        headers=headers,
    )
    assert uploaded.status_code == 202
    document = uploaded.json()["data"]
    assert document["status"] == "pending"

    job = await session.execute(
        text("SELECT kind, status, payload FROM jobs WHERE kind = 'ingest_document'")
    )
    kind, status, payload = job.one()
    assert (kind, status) == ("ingest_document", "queued")
    assert payload["document_id"] == document["id"]

    removed = await client.delete(
        f"/api/v1/knowledge-bases/{base['id']}/documents/{document['id']}",
        headers=headers,
    )
    assert removed.status_code == 200
    assert (
        await client.get(
            f"/api/v1/knowledge-bases/{base['id']}/documents", headers=headers
        )
    ).json()["data"] == []


async def test_empty_and_oversized_uploads_are_rejected(client):
    headers = await _auth(client, "size@x.com", "Acme")
    base = (
        await client.post(
            "/api/v1/knowledge-bases", json={"name": "Docs"}, headers=headers
        )
    ).json()["data"]

    empty = await client.post(
        f"/api/v1/knowledge-bases/{base['id']}/documents",
        files={"file": ("empty.txt", b"", "text/plain")},
        headers=headers,
    )
    assert empty.status_code == 400
    assert empty.json()["error"] == "INVALID_DOCUMENT"


async def test_workspaces_cannot_see_each_others_knowledge(client):
    headers_a = await _auth(client, "a@x.com", "OrgA")
    headers_b = await _auth(client, "b@x.com", "OrgB")

    base = (
        await client.post(
            "/api/v1/knowledge-bases", json={"name": "Secrets"}, headers=headers_a
        )
    ).json()["data"]

    assert (await client.get("/api/v1/knowledge-bases", headers=headers_b)).json()[
        "data"
    ] == []
    for method, url in [
        ("get", f"/api/v1/knowledge-bases/{base['id']}/documents"),
        ("patch", f"/api/v1/knowledge-bases/{base['id']}"),
        ("delete", f"/api/v1/knowledge-bases/{base['id']}"),
    ]:
        response = await getattr(client, method)(
            url,
            headers=headers_b,
            **({"json": {"name": "Stolen"}} if method == "patch" else {}),
        )
        assert response.status_code == 404, url

    search = await client.post(
        f"/api/v1/knowledge-bases/{base['id']}/search",
        json={"query": "anything"},
        headers=headers_b,
    )
    assert search.status_code == 404
