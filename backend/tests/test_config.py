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


def test_production_rejects_the_development_jwt_secret():
    with pytest.raises(ValueError):
        Settings(ENVIRONMENT="production", JWT_SECRET="dev-only-change-me")


def test_production_accepts_a_real_jwt_secret():
    assert Settings(ENVIRONMENT="production", JWT_SECRET="a-real-secret").JWT_SECRET
