import uuid
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.slices.identity import repository


@dataclass(frozen=True)
class TokenBundle:
    access_token: str
    refresh_token: str
    user_id: uuid.UUID
    workspace_id: uuid.UUID


async def issue_tokens(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    email: str,
    workspace_id: uuid.UUID,
    family_id: uuid.UUID | None = None,
) -> TokenBundle:
    family = family_id or uuid.uuid4()
    access_token = security.create_access_token(
        sub=str(user_id), email=email, workspace_id=str(workspace_id)
    )
    refresh_token, expires_at = security.create_refresh_token(
        sub=str(user_id), workspace_id=str(workspace_id), family_id=str(family)
    )
    await repository.insert_refresh_token(
        session,
        user_id=user_id,
        workspace_id=workspace_id,
        family_id=family,
        token_hash=security.sha256(refresh_token),
        expires_at=expires_at,
    )
    return TokenBundle(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=user_id,
        workspace_id=workspace_id,
    )
