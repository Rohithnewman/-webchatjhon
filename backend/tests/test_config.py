import pytest

from app.core.config import Settings


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("http://a.com,http://b.com", ["http://a.com", "http://b.com"]),
        ("http://a.com, http://b.com ", ["http://a.com", "http://b.com"]),
        ('["http://a.com"]', ["http://a.com"]),
    ],
)
def test_cors_origins_parses_values_sourced_from_the_environment(
    monkeypatch, raw, expected
):
    """MUST go through the environment, not a constructor kwarg.

    A kwarg bypasses EnvSettingsSource entirely, which is the only place the
    JSON pre-decode happens — so a kwarg-based test passes even when the real
    startup path raises SettingsError.
    """
    monkeypatch.setenv("CORS_ORIGINS", raw)
    assert Settings(_env_file=None).CORS_ORIGINS == expected


def test_development_cors_allows_both_loopback_hostnames(monkeypatch):
    monkeypatch.delenv("CORS_ORIGINS", raising=False)

    assert Settings(_env_file=None).CORS_ORIGINS == [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]


def test_production_rejects_the_development_jwt_secret():
    with pytest.raises(ValueError):
        Settings(
            ENVIRONMENT="production",
            JWT_SECRET="dev-only-change-me-use-at-least-32-bytes",
        )


def test_production_rejects_a_short_jwt_secret():
    with pytest.raises(ValueError):
        Settings(ENVIRONMENT="production", JWT_SECRET="too-short")


def test_production_accepts_a_real_jwt_secret():
    secret = "a-real-production-secret-with-32-bytes"
    assert Settings(ENVIRONMENT="production", JWT_SECRET=secret).JWT_SECRET == secret
