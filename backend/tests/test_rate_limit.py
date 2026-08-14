from app.core import rate_limit as rate_limit_module
from app.core.rate_limit import InProcessRateLimiter


def test_in_process_limiter_enforces_its_window():
    limiter = InProcessRateLimiter(limit=2)
    assert limiter.hit("login:127.0.0.1") is True
    assert limiter.hit("login:127.0.0.1") is True
    assert limiter.hit("login:127.0.0.1") is False


async def test_login_route_returns_429(client, monkeypatch):
    monkeypatch.setattr(
        rate_limit_module, "limiter", InProcessRateLimiter(limit=1)
    )
    first = await client.post(
        "/api/v1/auth/login",
        json={"email": "missing@x.com", "password": "wrong"},
    )
    second = await client.post(
        "/api/v1/auth/login",
        json={"email": "missing@x.com", "password": "wrong"},
    )
    assert first.status_code == 401
    assert second.status_code == 429
    assert second.json()["error"] == "RATE_LIMITED"
