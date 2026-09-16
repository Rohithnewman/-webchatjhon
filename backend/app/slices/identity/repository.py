import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.slices.identity.models import RefreshToken, User


async def select_user_by_email(
    session: AsyncSession, email: str, *, for_update: bool = False
) -> User | None:
    statement = select(User).where(User.email == email, User.deleted_at.is_(None))
    if for_update:
        statement = statement.with_for_update()
    return (await session.execute(statement)).scalar_one_or_none()


async def select_user(
    session: AsyncSession, user_id: uuid.UUID, *, for_update: bool = False
) -> User | None:
    statement = select(User).where(User.id == user_id, User.deleted_at.is_(None))
    if for_update:
        statement = statement.with_for_update()
    return (await session.execute(statement)).scalar_one_or_none()


async def insert_user(
    session: AsyncSession, *, email: str, password_hash: str, full_name: str
) -> User:
    user = User(email=email, password_hash=password_hash, full_name=full_name)
    session.add(user)
    await session.flush()
    return user


async def insert_refresh_token(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    workspace_id: uuid.UUID | None,
    family_id: uuid.UUID,
    token_hash: str,
    expires_at: datetime,
) -> RefreshToken:
    token = RefreshToken(
        user_id=user_id,
        workspace_id=workspace_id,
        family_id=family_id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    session.add(token)
    await session.flush()
    return token


async def select_refresh_token(
    session: AsyncSession, *, token_hash: str, for_update: bool = False
) -> RefreshToken | None:
    statement = select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    if for_update:
        statement = statement.with_for_update()
    return (await session.execute(statement)).scalar_one_or_none()


async def revoke_refresh_token(session: AsyncSession, *, token: RefreshToken) -> None:
    token.revoked_at = datetime.now(timezone.utc)
    await session.flush()


async def revoke_refresh_family(
    session: AsyncSession, *, family_id: uuid.UUID
) -> int:
    statement = (
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(timezone.utc))
    )
    result = await session.execute(statement)
    return result.rowcount or 0


async def select_users(
    session: AsyncSession, user_ids: list[uuid.UUID]
) -> list[User]:
    if not user_ids:
        return []
    statement = select(User).where(User.id.in_(user_ids), User.deleted_at.is_(None))
    return list((await session.execute(statement)).scalars().all())


async def select_all_users(session: AsyncSession) -> list[User]:
    statement = select(User).where(User.deleted_at.is_(None)).order_by(User.created_at, User.id)
    return list((await session.execute(statement)).scalars().all())
