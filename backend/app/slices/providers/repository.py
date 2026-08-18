import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.slices.providers.models import ProviderCredential


async def insert(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    provider: str,
    label: str,
    encrypted_key: str,
    key_last_four: str,
    base_url: str | None,
    is_default: bool,
) -> ProviderCredential:
    credential = ProviderCredential(
        workspace_id=workspace_id,
        provider=provider,
        label=label,
        encrypted_key=encrypted_key,
        key_last_four=key_last_four,
        base_url=base_url,
        is_default=is_default,
    )
    session.add(credential)
    await session.flush()
    return credential


async def clear_default(
    session: AsyncSession, *, workspace_id: uuid.UUID, provider: str
) -> None:
    """Demote the current default so a new one can take the partial index."""
    await session.execute(
        update(ProviderCredential)
        .where(
            ProviderCredential.workspace_id == workspace_id,
            ProviderCredential.provider == provider,
            ProviderCredential.is_default.is_(True),
            ProviderCredential.deleted_at.is_(None),
        )
        .values(is_default=False)
    )


async def select_default(
    session: AsyncSession, *, workspace_id: uuid.UUID, provider: str
) -> ProviderCredential | None:
    stmt = select(ProviderCredential).where(
        ProviderCredential.workspace_id == workspace_id,
        ProviderCredential.provider == provider,
        ProviderCredential.is_default.is_(True),
        ProviderCredential.deleted_at.is_(None),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def select_one(
    session: AsyncSession, *, workspace_id: uuid.UUID, credential_id: uuid.UUID
) -> ProviderCredential | None:
    stmt = select(ProviderCredential).where(
        ProviderCredential.id == credential_id,
        ProviderCredential.workspace_id == workspace_id,
        ProviderCredential.deleted_at.is_(None),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def select_all(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> list[ProviderCredential]:
    stmt = (
        select(ProviderCredential)
        .where(
            ProviderCredential.workspace_id == workspace_id,
            ProviderCredential.deleted_at.is_(None),
        )
        .order_by(ProviderCredential.provider, ProviderCredential.created_at)
    )
    return list((await session.execute(stmt)).scalars().all())


async def soft_delete(
    session: AsyncSession, *, workspace_id: uuid.UUID, credential_id: uuid.UUID
) -> bool:
    from sqlalchemy import func

    result = await session.execute(
        update(ProviderCredential)
        .where(
            ProviderCredential.id == credential_id,
            ProviderCredential.workspace_id == workspace_id,
            ProviderCredential.deleted_at.is_(None),
        )
        .values(deleted_at=func.now(), is_default=False)
    )
    return (result.rowcount or 0) > 0
