"""Published interface for the identity slice."""

import uuid
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.slices.identity import repository


@dataclass(frozen=True)
class UserSummary:
    id: uuid.UUID
    email: str
    is_active: bool


async def get_active_user(
    session: AsyncSession, *, user_id: uuid.UUID
) -> UserSummary | None:
    user = await repository.select_user(session, user_id)
    if user is None:
        return None
    return UserSummary(id=user.id, email=user.email, is_active=user.is_active)


from app.slices.identity.dependencies import get_current_principal  # noqa: E402

__all__ = ["UserSummary", "get_active_user", "get_current_principal"]
