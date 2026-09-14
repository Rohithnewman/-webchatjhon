"""Published interface for the tenancy slice."""

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.slices.tenancy import repository
from app.slices.tenancy.seed import SYSTEM_ROLES


@dataclass(frozen=True)
class RoleView:
    id: uuid.UUID
    name: str
    permissions: tuple[str, ...]


@dataclass(frozen=True)
class MembershipView:
    membership_id: uuid.UUID
    workspace_id: uuid.UUID
    role_id: uuid.UUID
    role_name: str
    permissions: tuple[str, ...]


@dataclass(frozen=True)
class TenantCreated:
    organization_id: uuid.UUID
    workspace_id: uuid.UUID


async def seed_system_roles(session: AsyncSession) -> None:
    await repository.seed_roles(session, SYSTEM_ROLES)


async def get_role_by_name(session: AsyncSession, name: str) -> RoleView | None:
    role = await repository.select_role_by_name(session, name)
    if role is None:
        return None
    return RoleView(id=role.id, name=role.name, permissions=tuple(role.permissions))


async def create_tenant(
    session: AsyncSession, *, org_name: str, workspace_name: str = "Default"
) -> TenantCreated:
    organization = await repository.insert_organization(session, name=org_name)
    workspace = await repository.insert_workspace(
        session, organization_id=organization.id, name=workspace_name
    )
    return TenantCreated(
        organization_id=organization.id, workspace_id=workspace.id
    )


async def create_membership(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    workspace_id: uuid.UUID,
    role_id: uuid.UUID,
) -> uuid.UUID:
    membership = await repository.insert_membership(
        session, user_id=user_id, workspace_id=workspace_id, role_id=role_id
    )
    return membership.id


async def get_active_membership(
    session: AsyncSession, *, user_id: uuid.UUID, workspace_id: uuid.UUID
) -> MembershipView | None:
    found = await repository.select_active_membership_with_role(
        session, user_id=user_id, workspace_id=workspace_id
    )
    if found is None:
        return None
    membership, role = found
    return MembershipView(
        membership_id=membership.id,
        workspace_id=membership.workspace_id,
        role_id=role.id,
        role_name=role.name,
        permissions=tuple(role.permissions),
    )


async def get_earliest_workspace_id(
    session: AsyncSession, *, user_id: uuid.UUID
) -> uuid.UUID | None:
    return await repository.select_earliest_workspace_id(session, user_id=user_id)


@dataclass(frozen=True)
class WorkspaceView:
    id: uuid.UUID
    name: str
    organization_name: str


@dataclass(frozen=True)
class MemberRow:
    user_id: uuid.UUID
    role_name: str
    joined_at: datetime


async def get_workspace(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> WorkspaceView | None:
    found = await repository.select_workspace_with_organization(
        session, workspace_id=workspace_id
    )
    if found is None:
        return None
    workspace, organization = found
    return WorkspaceView(
        id=workspace.id, name=workspace.name, organization_name=organization.name
    )


async def list_memberships(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> list[MemberRow]:
    rows = await repository.list_memberships_with_roles(session, workspace_id=workspace_id)
    return [
        MemberRow(user_id=membership.user_id, role_name=role.name, joined_at=membership.created_at)
        for membership, role in rows
    ]


async def set_membership_role(
    session: AsyncSession, *, workspace_id: uuid.UUID, user_id: uuid.UUID, role_id: uuid.UUID
) -> bool:
    membership = await repository.select_membership(
        session, workspace_id=workspace_id, user_id=user_id
    )
    if membership is None:
        return False
    membership.role_id = role_id
    await session.flush()
    return True


async def remove_membership(
    session: AsyncSession, *, workspace_id: uuid.UUID, user_id: uuid.UUID
) -> bool:
    membership = await repository.select_membership(
        session, workspace_id=workspace_id, user_id=user_id
    )
    if membership is None:
        return False
    await repository.soft_delete_membership(session, membership=membership)
    return True


PLANS = ("free", "pro", "enterprise")


@dataclass(frozen=True)
class OrganizationSummary:
    id: uuid.UUID
    name: str
    plan: str
    created_at: datetime
    workspace_count: int
    member_count: int


def _organization_summary(organization, workspace_count: int, member_count: int) -> OrganizationSummary:
    return OrganizationSummary(
        id=organization.id,
        name=organization.name,
        plan=organization.plan,
        created_at=organization.created_at,
        workspace_count=workspace_count,
        member_count=member_count,
    )


async def platform_list_organizations(session: AsyncSession) -> list[OrganizationSummary]:
    """Superadmin only: every organisation with its workspace and member counts."""
    return [
        _organization_summary(organization, workspaces, members)
        for organization, workspaces, members in await repository.list_organizations_with_counts(session)
    ]


async def set_organization_plan(
    session: AsyncSession, *, organization_id: uuid.UUID, plan: str
) -> OrganizationSummary | None:
    if plan not in PLANS:
        raise AppError(code="INVALID_PLAN", message=f"plan must be one of {', '.join(PLANS)}", status_code=400)
    organization = await repository.select_organization(session, organization_id=organization_id, for_update=True)
    if organization is None:
        return None
    organization.plan = plan
    await session.flush()
    rows = await repository.list_organizations_with_counts(session)
    return next(
        _organization_summary(org, workspaces, members)
        for org, workspaces, members in rows
        if org.id == organization_id
    )


async def platform_counts(session: AsyncSession) -> dict[str, int]:
    organizations, workspaces = await repository.count_organizations_and_workspaces(session)
    return {"organizations": organizations, "workspaces": workspaces}


async def platform_user_organizations(session: AsyncSession) -> dict[uuid.UUID, list[str]]:
    out: dict[uuid.UUID, list[str]] = {}
    for user_id, name in await repository.list_user_organization_names(session):
        out.setdefault(user_id, []).append(name)
    return out
