"""Published interface for the identity slice."""

import uuid
from dataclasses import dataclass
from datetime import datetime

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
    is_superadmin: bool = False
    created_at: datetime | None = None


def _summary(user) -> UserSummary:
    return UserSummary(
        id=user.id,
        email=user.email,
        is_active=user.is_active,
        full_name=user.full_name,
        is_superadmin=user.is_superadmin,
        created_at=user.created_at,
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


async def platform_list_users(session: AsyncSession) -> list[UserSummary]:
    """Superadmin only: every live user on the platform."""
    return [_summary(user) for user in await repository.select_all_users(session)]


async def set_user_flags(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    is_active: bool | None = None,
    is_superadmin: bool | None = None,
) -> UserSummary | None:
    user = await repository.select_user(session, user_id, for_update=True)
    if user is None:
        return None
    if is_active is not None:
        user.is_active = is_active
    if is_superadmin is not None:
        user.is_superadmin = is_superadmin
    await session.flush()
    return _summary(user)


async def ensure_superadmin(
    session: AsyncSession, *, email: str, password: str, full_name: str
) -> UserSummary:
    """Create the user if needed, then make sure the flag is set. Idempotent."""
    existing = await repository.select_user_by_email(session, email.strip().lower(), for_update=True)
    if existing is None:
        created = await create_user(session, email=email, password=password, full_name=full_name)
        user_id = created.id
    else:
        user_id = existing.id
    summary = await set_user_flags(session, user_id=user_id, is_superadmin=True)
    assert summary is not None
    return summary


from app.slices.identity.dependencies import get_current_principal  # noqa: E402

__all__ = [
    "UserSummary",
    "create_user",
    "ensure_superadmin",
    "get_active_user",
    "get_current_principal",
    "get_user_by_email",
    "list_users",
    "platform_list_users",
    "set_user_flags",
]
