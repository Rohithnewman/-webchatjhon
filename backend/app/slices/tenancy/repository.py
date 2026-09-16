import uuid
from datetime import date, datetime, timezone

from sqlalchemy import func, select, text, update
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


async def select_workspace_with_organization(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> tuple[Workspace, Organization] | None:
    statement = (
        select(Workspace, Organization)
        .join(Organization, Organization.id == Workspace.organization_id)
        .where(Workspace.id == workspace_id, Workspace.deleted_at.is_(None))
    )
    row = (await session.execute(statement)).first()
    return (row[0], row[1]) if row else None


async def list_memberships_with_roles(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> list[tuple[Membership, Role]]:
    statement = (
        select(Membership, Role)
        .join(Role, Role.id == Membership.role_id)
        .where(Membership.workspace_id == workspace_id, Membership.deleted_at.is_(None))
        .order_by(Membership.created_at, Membership.id)
    )
    return [(row[0], row[1]) for row in (await session.execute(statement)).all()]


async def select_membership(
    session: AsyncSession, *, workspace_id: uuid.UUID, user_id: uuid.UUID
) -> Membership | None:
    statement = select(Membership).where(
        Membership.workspace_id == workspace_id,
        Membership.user_id == user_id,
        Membership.deleted_at.is_(None),
    )
    return (await session.execute(statement)).scalar_one_or_none()


async def soft_delete_membership(session: AsyncSession, *, membership: Membership) -> None:
    membership.deleted_at = datetime.now(timezone.utc)
    await session.flush()


async def soft_delete_all_memberships_for_user(
    session: AsyncSession, *, user_id: uuid.UUID
) -> int:
    statement = (
        update(Membership)
        .where(Membership.user_id == user_id, Membership.deleted_at.is_(None))
        .values(deleted_at=datetime.now(timezone.utc))
    )
    result = await session.execute(statement)
    await session.flush()
    return result.rowcount or 0


async def list_organizations_with_counts(
    session: AsyncSession,
) -> list[tuple[Organization, int, int]]:
    workspace_count = (
        select(Workspace.organization_id, func.count().label("n"))
        .where(Workspace.deleted_at.is_(None))
        .group_by(Workspace.organization_id)
        .subquery()
    )
    member_count = (
        select(Workspace.organization_id, func.count(func.distinct(Membership.user_id)).label("n"))
        .join(Membership, Membership.workspace_id == Workspace.id)
        .where(Workspace.deleted_at.is_(None), Membership.deleted_at.is_(None))
        .group_by(Workspace.organization_id)
        .subquery()
    )
    statement = (
        select(
            Organization,
            func.coalesce(workspace_count.c.n, 0),
            func.coalesce(member_count.c.n, 0),
        )
        .outerjoin(workspace_count, workspace_count.c.organization_id == Organization.id)
        .outerjoin(member_count, member_count.c.organization_id == Organization.id)
        .where(Organization.deleted_at.is_(None))
        .order_by(Organization.created_at, Organization.id)
    )
    return [(row[0], int(row[1]), int(row[2])) for row in (await session.execute(statement)).all()]


async def select_organization(
    session: AsyncSession, *, organization_id: uuid.UUID, for_update: bool = False
) -> Organization | None:
    statement = select(Organization).where(
        Organization.id == organization_id, Organization.deleted_at.is_(None)
    )
    if for_update:
        statement = statement.with_for_update()
    return (await session.execute(statement)).scalar_one_or_none()


async def count_organizations_and_workspaces(session: AsyncSession) -> tuple[int, int]:
    organizations = (
        await session.execute(select(func.count()).select_from(Organization).where(Organization.deleted_at.is_(None)))
    ).scalar_one()
    workspaces = (
        await session.execute(select(func.count()).select_from(Workspace).where(Workspace.deleted_at.is_(None)))
    ).scalar_one()
    return int(organizations), int(workspaces)


async def list_user_organization_names(session: AsyncSession) -> list[tuple[uuid.UUID, str]]:
    statement = (
        select(Membership.user_id, Organization.name)
        .join(Workspace, Workspace.id == Membership.workspace_id)
        .join(Organization, Organization.id == Workspace.organization_id)
        .where(Membership.deleted_at.is_(None))
        .distinct()
        .order_by(Organization.name)
    )
    return [(row[0], row[1]) for row in (await session.execute(statement)).all()]


async def list_workspaces_with_member_counts(
    session: AsyncSession, *, organization_id: uuid.UUID
) -> list[tuple[Workspace, int]]:
    members = (
        select(Membership.workspace_id, func.count().label("n"))
        .where(Membership.deleted_at.is_(None))
        .group_by(Membership.workspace_id)
        .subquery()
    )
    statement = (
        select(Workspace, func.coalesce(members.c.n, 0))
        .outerjoin(members, members.c.workspace_id == Workspace.id)
        .where(Workspace.organization_id == organization_id, Workspace.deleted_at.is_(None))
        .order_by(Workspace.created_at, Workspace.id)
    )
    return [(row[0], int(row[1])) for row in (await session.execute(statement)).all()]


async def select_workspace(
    session: AsyncSession, *, workspace_id: uuid.UUID, for_update: bool = False
) -> Workspace | None:
    statement = select(Workspace).where(Workspace.id == workspace_id, Workspace.deleted_at.is_(None))
    if for_update:
        statement = statement.with_for_update()
    return (await session.execute(statement)).scalar_one_or_none()


async def select_subscription_status_for_workspace(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> tuple[str, date | None] | None:
    """Just the two columns `effective_status` needs — no membership/seat
    joins. Used on the request guard, which runs on nearly every request."""
    statement = (
        select(Organization.subscription_status, Organization.subscription_ends_at)
        .select_from(Workspace)
        .join(Organization, Organization.id == Workspace.organization_id)
        .where(Workspace.id == workspace_id, Workspace.deleted_at.is_(None))
    )
    row = (await session.execute(statement)).first()
    return (row[0], row[1]) if row else None


async def select_conversation_cap_for_workspace(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> tuple[uuid.UUID, str, int | None] | None:
    """Just the columns the monthly conversation cap check needs — the
    organisation id (to list its workspaces), plan, and raw
    `conversation_limit` override — via one workspace-joined-to-organization
    query, no seat counting. Used on the widget's public start path."""
    statement = (
        select(Organization.id, Organization.plan, Organization.conversation_limit)
        .select_from(Workspace)
        .join(Organization, Organization.id == Workspace.organization_id)
        .where(Workspace.id == workspace_id, Workspace.deleted_at.is_(None))
    )
    row = (await session.execute(statement)).first()
    return (row[0], row[1], row[2]) if row else None


async def count_org_seats(session: AsyncSession, *, organization_id: uuid.UUID) -> int:
    statement = (
        select(func.count(func.distinct(Membership.user_id)))
        .select_from(Membership)
        .join(Workspace, Workspace.id == Membership.workspace_id)
        .where(
            Workspace.organization_id == organization_id,
            Workspace.deleted_at.is_(None),
            Membership.deleted_at.is_(None),
        )
    )
    return int((await session.execute(statement)).scalar_one())


async def list_org_workspace_ids(session: AsyncSession, *, organization_id: uuid.UUID) -> list[uuid.UUID]:
    statement = select(Workspace.id).where(
        Workspace.organization_id == organization_id, Workspace.deleted_at.is_(None)
    )
    return [row[0] for row in (await session.execute(statement)).all()]


async def list_user_workspaces(
    session: AsyncSession, *, user_id: uuid.UUID
) -> list[tuple[Workspace, Organization, Role]]:
    statement = (
        select(Workspace, Organization, Role)
        .join(Membership, Membership.workspace_id == Workspace.id)
        .join(Organization, Organization.id == Workspace.organization_id)
        .join(Role, Role.id == Membership.role_id)
        .where(Membership.user_id == user_id, Membership.deleted_at.is_(None), Workspace.deleted_at.is_(None))
        .order_by(Organization.name, Workspace.created_at)
    )
    return [(row[0], row[1], row[2]) for row in (await session.execute(statement)).all()]
