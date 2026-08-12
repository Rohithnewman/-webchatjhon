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
def test_cors_origins_accepts_comma_separated_and_json(raw, expected):
    """pydantic-settings parses list[str] env vars as JSON; a bare
    comma-separated value would otherwise raise at import."""
    assert Settings(CORS_ORIGINS=raw).CORS_ORIGINS == expected


def test_production_rejects_the_development_jwt_secret():
    with pytest.raises(ValueError):
        Settings(ENVIRONMENT="production", JWT_SECRET="dev-only-change-me")


def test_production_accepts_a_real_jwt_secret():
    assert Settings(ENVIRONMENT="production", JWT_SECRET="a-real-secret").JWT_SECRET
