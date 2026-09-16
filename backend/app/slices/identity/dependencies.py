import uuid

from fastapi import Header

from app.core import security
from app.core.errors import AppError
from app.shared.context import Principal


def _unauthenticated(message: str) -> AppError:
    return AppError(code="UNAUTHENTICATED", message=message, status_code=401)


async def get_current_principal(authorization: str = Header(default="")) -> Principal:
    scheme, _, raw_token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not raw_token.strip():
        raise _unauthenticated("Missing bearer token")
    try:
        payload = security.decode_token(raw_token.strip(), expected_type="access")
        workspace_id_claim = payload.get("workspace_id")
        return Principal(
            user_id=uuid.UUID(payload["sub"]),
            email=str(payload.get("email", "")),
            workspace_id=(
                uuid.UUID(workspace_id_claim) if workspace_id_claim else None
            ),
        )
    except (security.TokenError, KeyError, TypeError, ValueError) as exc:
        raise _unauthenticated("Invalid or expired token") from exc
