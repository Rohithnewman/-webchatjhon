import uuid

import pytest

from app.core.config import settings
from app.core.errors import AppError
from app.slices.chatbots import install

REGISTRATION = {"email": "verify@x.com", "password": "Secret123", "full_name": "V", "org_name": "Acme"}
SCRIPT = '<script src="http://test/widget.js" data-chatbot-id="{id}" data-api="http://test/api/v1" async></script>'


async def _bot(client):
    auth = (await client.post("/api/v1/auth/register", json=REGISTRATION)).json()["data"]
    headers = {"Authorization": f"Bearer {auth['access_token']}"}
    bot = (await client.post("/api/v1/chatbots", json={"name": "Shop bot"}, headers=headers)).json()["data"]
    return bot, headers


async def test_private_url_is_rejected(client):
    bot, headers = await _bot(client)
    response = await client.post(
        f"/api/v1/chatbots/{bot['id']}/install/verify", json={"url": "http://10.0.0.1/"}, headers=headers
    )
    assert response.status_code == 400
    assert response.json()["error"] == "VALIDATION_ERROR"
    fetched = (await client.get(f"/api/v1/chatbots/{bot['id']}", headers=headers)).json()["data"]
    assert fetched["installed_url"] is None
    # the app's own origin is always allowed, so the built-in /demo page verifies
    origin = install.Origin(scheme="http", host="test", port=80)
    await install.check_url("http://test/demo?chatbot_id=x", allowed_origin=origin)
    with pytest.raises(AppError):
        await install.check_url("http://localhost/demo", allowed_origin=origin)
    # same host but a different port is NOT the app's origin, and localhost is internal
    with pytest.raises(AppError):
        await install.check_url("http://test:9999/demo", allowed_origin=origin)


async def test_page_with_this_bots_script_connects(client, monkeypatch):
    monkeypatch.setattr(settings, "PUBLIC_BASE_URL", "http://test")
    bot, headers = await _bot(client)

    async def fake_fetch(url, *, allowed_origin):
        return ("http://test/demo?chatbot_id=" + bot["id"], "<html>" + SCRIPT.format(id=bot["id"]) + "</html>")

    monkeypatch.setattr(install, "fetch_page", fake_fetch)
    response = await client.post(
        f"/api/v1/chatbots/{bot['id']}/install/verify",
        json={"url": f"http://test/demo?chatbot_id={bot['id']}"},
        headers=headers,
    )
    data = response.json()["data"]
    assert data["connected"] is True
    assert data["url"].endswith(bot["id"])
    fetched = (await client.get(f"/api/v1/chatbots/{bot['id']}", headers=headers)).json()["data"]
    assert fetched["installed_url"] == data["url"]
    assert fetched["installed_at"] is not None


async def test_page_with_another_bots_script_is_wrong_chatbot(client, monkeypatch):
    monkeypatch.setattr(settings, "PUBLIC_BASE_URL", "http://test")
    bot, headers = await _bot(client)

    async def fake_fetch(url, *, allowed_origin):
        return ("http://test/demo", "<html>" + SCRIPT.format(id=uuid.uuid4()) + "</html>")

    monkeypatch.setattr(install, "fetch_page", fake_fetch)
    response = await client.post(
        f"/api/v1/chatbots/{bot['id']}/install/verify", json={"url": "http://test/demo"}, headers=headers
    )
    assert response.json()["data"] == {"connected": False, "reason": "wrong_chatbot"}
    fetched = (await client.get(f"/api/v1/chatbots/{bot['id']}", headers=headers)).json()["data"]
    assert fetched["installed_url"] is None
