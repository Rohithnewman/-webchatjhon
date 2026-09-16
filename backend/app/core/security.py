import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from app.core.config import settings

MAX_PASSWORD_BYTES = 72


class TokenError(Exception):
    pass


def hash_password(plain: str) -> str:
    if len(plain.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ValueError("password exceeds bcrypt's 72-byte limit")
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


DUMMY_PASSWORD_HASH = hash_password(uuid.uuid4().hex)


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _encode(
    claims: dict[str, Any], *, token_type: str, lifetime: timedelta
) -> tuple[str, datetime]:
    issued_at = datetime.now(timezone.utc)
    expires_at = issued_at + lifetime
    payload = {
        **claims,
        "type": token_type,
        "iat": issued_at,
        "exp": expires_at,
        "jti": str(uuid.uuid4()),
    }
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return token, expires_at


def create_access_token(*, sub: str, email: str, workspace_id: str | None) -> str:
    """`workspace_id` is `None` for a superadmin (D1): the platform account
    carries no tenancy, so the claim is emitted as JSON `null`."""
    token, _ = _encode(
        {"sub": sub, "email": email, "workspace_id": workspace_id},
        token_type="access",
        lifetime=timedelta(minutes=settings.ACCESS_TOKEN_MINUTES),
    )
    return token


def create_refresh_token(
    *, sub: str, workspace_id: str | None, family_id: str
) -> tuple[str, datetime]:
    return _encode(
        {"sub": sub, "workspace_id": workspace_id, "family_id": family_id},
        token_type="refresh",
        lifetime=timedelta(days=settings.REFRESH_TOKEN_DAYS),
    )


def create_widget_token(*, conversation_id: str, workspace_id: str) -> str:
    """Session token for the public chat widget.

    Scoped to a single conversation — it authorizes nothing else. 24 hours
    covers any realistic visitor session without leaving a durable credential
    in the visitor's browser.
    """
    token, _ = _encode(
        {"conversation_id": conversation_id, "workspace_id": workspace_id},
        token_type="widget",
        lifetime=timedelta(hours=24),
    )
    return token


def decode_token(token: str, *, expected_type: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )
    except jwt.PyJWTError as exc:
        raise TokenError(str(exc)) from exc
    if payload.get("type") != expected_type:
        raise TokenError(f"expected a {expected_type} token")
    return payload
