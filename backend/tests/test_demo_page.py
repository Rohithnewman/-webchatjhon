async def test_demo_page_embeds_widget_for_requested_bot(client):
    response = await client.get("/demo?chatbot_id=11111111-1111-1111-1111-111111111111")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    body = response.text
    assert "/widget.js" in body
    assert 'data-chatbot-id="11111111-1111-1111-1111-111111111111"' in body


async def test_demo_page_without_bot_explains_itself(client):
    response = await client.get("/demo")
    assert response.status_code == 200
    assert "chatbot_id" in response.text


async def test_demo_page_escapes_injection(client):
    response = await client.get('/demo?chatbot_id=<script>alert(1)</script>')
    assert "<script>alert(1)</script>" not in response.text
