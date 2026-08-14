import uuid

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.slices.tenancy.models import Membership, Organization, Role, Workspace


async def insert_organization(session: AsyncSession, *, name: str) -> Organization:
    organization = Organization(name=name)
    session.add(organization)
    await session.flush()
    return organization


async def insert_workspace(
    session: AsyncSession, *, organization_id: uuid.UUID, name: str
) -> Workspace:
    workspace = Workspace(organization_id=organization_id, name=name)
    session.add(workspace)
    await session.flush()
    return workspace


async def seed_roles(
    session: AsyncSession,
    roles: tuple[tuple[str, tuple[str, ...]], ...],
) -> None:
    statement = pg_insert(Role).values(
        [
            {"name": name, "permissions": list(permissions), "is_system": True}
            for name, permissions in roles
        ]
    )
    statement = statement.on_conflict_do_nothing(
        index_elements=[Role.name], index_where=text("is_system")
    )
    await session.execute(statement)
    await session.flush()


async def select_role_by_name(session: AsyncSession, name: str) -> Role | None:
    statement = select(Role).where(Role.name == name, Role.is_system.is_(True))
    return (await session.execute(statement)).scalar_one_or_none()


async def insert_membership(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    workspace_id: uuid.UUID,
    role_id: uuid.UUID,
) -> Membership:
    membership = Membership(
        user_id=user_id, workspace_id=workspace_id, role_id=role_id
    )
    session.add(membership)
    await session.flush()
    return membership


async def select_active_membership_with_role(
    session: AsyncSession, *, user_id: uuid.UUID, workspace_id: uuid.UUID
) -> tuple[Membership, Role] | None:
    statement = (
        select(Membership, Role)
        .join(Role, Role.id == Membership.role_id)
        .where(
            Membership.user_id == user_id,
            Membership.workspace_id == workspace_id,
            Membership.deleted_at.is_(None),
        )
    )
    row = (await session.execute(statement)).first()
    return (row[0], row[1]) if row else None


async def select_earliest_workspace_id(
    session: AsyncSession, *, user_id: uuid.UUID
) -> uuid.UUID | None:
    statement = (
        select(Membership.workspace_id)
        .where(Membership.user_id == user_id, Membership.deleted_at.is_(None))
        .order_by(Membership.created_at, Membership.id)
        .limit(1)
    )
    return (await session.execute(statement)).scalars().first()
