from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app.core import security
from app.core.config import settings


def test_password_hash_roundtrip():
    hashed = security.hash_password("Secret123")
    assert hashed != "Secret123"
    assert security.verify_password("Secret123", hashed) is True
    assert security.verify_password("wrong", hashed) is False


def test_verify_password_is_false_for_malformed_hash():
    assert security.verify_password("Secret123", "not-a-bcrypt-hash") is False


def test_dummy_hash_is_verifiable_but_never_matches_real_input():
    assert security.DUMMY_PASSWORD_HASH.startswith("$2")
    assert security.verify_password("anything", security.DUMMY_PASSWORD_HASH) is False


def test_sha256_is_stable_and_64_hex_chars():
    assert security.sha256("abc") == security.sha256("abc")
    assert len(security.sha256("abc")) == 64


def test_access_token_carries_identity_only():
    token = security.create_access_token(
        sub="u1", email="a@b.com", workspace_id="w1"
    )
    payload = security.decode_token(token, expected_type="access")
    assert payload["sub"] == "u1"
    assert payload["email"] == "a@b.com"
    assert payload["workspace_id"] == "w1"
    assert "role" not in payload
    assert "permissions" not in payload


def test_refresh_token_carries_family_and_returns_expiry():
    token, expires_at = security.create_refresh_token(
        sub="u1", workspace_id="w1", family_id="f1"
    )
    payload = security.decode_token(token, expected_type="refresh")
    assert payload["family_id"] == "f1"
    assert expires_at > datetime.now(timezone.utc)


def test_refresh_token_is_rejected_as_access_token():
    token, _ = security.create_refresh_token(
        sub="u1", workspace_id="w1", family_id="f1"
    )
    with pytest.raises(security.TokenError):
        security.decode_token(token, expected_type="access")


def test_garbage_token_raises_token_error():
    with pytest.raises(security.TokenError):
        security.decode_token("not-a-token", expected_type="access")


def test_expired_token_raises_token_error():
    token = jwt.encode(
        {
            "sub": "u1",
            "type": "access",
            "exp": datetime.now(timezone.utc) - timedelta(seconds=1),
        },
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )
    with pytest.raises(security.TokenError):
        security.decode_token(token, expected_type="access")


def test_token_signed_with_another_secret_raises_token_error():
    token = jwt.encode(
        {"sub": "u1", "type": "access"},
        "another-secret-that-is-at-least-32-bytes",
        algorithm="HS256",
    )
    with pytest.raises(security.TokenError):
        security.decode_token(token, expected_type="access")
