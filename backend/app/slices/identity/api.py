"""Published interface for the identity slice."""

import uuid
from dataclasses import dataclass

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.errors import AppError
from app.slices.identity import repository


@dataclass(frozen=True)
class UserSummary:
    id: uuid.UUID
    email: str
    is_active: bool
    full_name: str = ""


def _summary(user) -> UserSummary:
    return UserSummary(
        id=user.id, email=user.email, is_active=user.is_active, full_name=user.full_name
    )


async def get_active_user(
    session: AsyncSession, *, user_id: uuid.UUID
) -> UserSummary | None:
    user = await repository.select_user(session, user_id)
    return None if user is None else _summary(user)


async def get_user_by_email(
    session: AsyncSession, *, email: str
) -> UserSummary | None:
    user = await repository.select_user_by_email(session, email.strip().lower())
    return None if user is None else _summary(user)


async def create_user(
    session: AsyncSession, *, email: str, password: str, full_name: str
) -> UserSummary:
    """Create a login for someone added to a workspace by an admin."""
    try:
        user = await repository.insert_user(
            session,
            email=email.strip().lower(),
            password_hash=security.hash_password(password),
            full_name=full_name.strip(),
        )
    except IntegrityError as exc:
        await session.rollback()
        raise AppError(
            code="EMAIL_TAKEN", message="Email already registered", status_code=400
        ) from exc
    return _summary(user)


async def list_users(
    session: AsyncSession, *, user_ids: list[uuid.UUID]
) -> dict[uuid.UUID, UserSummary]:
    return {user.id: _summary(user) for user in await repository.select_users(session, user_ids)}


from app.slices.identity.dependencies import get_current_principal  # noqa: E402

__all__ = [
    "UserSummary",
    "create_user",
    "get_active_user",
    "get_current_principal",
    "get_user_by_email",
    "list_users",
]
