"""Workspace membership management (Phase 1b, demo scope).

Composes identity (users) and tenancy (memberships, roles) through their
published APIs. Lives in its own slice because the layer contract forbids
tenancy from importing identity.
"""

import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.envelope import success
from app.core.errors import AppError
from app.shared import permissions
from app.shared.context import WorkspaceContext
from app.slices.audit import api as audit_api
from app.slices.authz import api as authz_api
from app.slices.identity import api as identity_api
from app.slices.members.schemas import (
    MemberAdd,
    MemberOut,
    MemberRoleUpdate,
    RoleCreate,
    RoleUpdate,
)
from app.slices.tenancy import api as tenancy_api

router = APIRouter(prefix="/api/v1/workspace", tags=["workspace"])

read_context = authz_api.require_permission(permissions.FEATURES_READ)
manage_context = authz_api.require_permission(permissions.MEMBERS_MANAGE)


async def _members(session: AsyncSession, workspace_id: uuid.UUID) -> list[dict]:
    rows = await tenancy_api.list_memberships(session, workspace_id=workspace_id)
    users = await identity_api.list_users(session, user_ids=[row.user_id for row in rows])
    out = []
    for row in rows:
        user = users.get(row.user_id)
        if user is None:
            continue
        out.append(
            MemberOut(
                user_id=row.user_id,
                email=user.email,
                full_name=user.full_name,
                role=row.role_name,
                role_id=row.role_id,
                joined_at=row.joined_at,
            ).model_dump(mode="json")
        )
    return out


async def _organization(session: AsyncSession, ctx: WorkspaceContext) -> tenancy_api.OrganizationView:
    organization = await tenancy_api.get_organization_of_workspace(session, workspace_id=ctx.workspace_id)
    if organization is None:
        raise AppError(code="NOT_FOUND", message="Organization not found", status_code=404)
    return organization


async def _resolve_role_id(
    session: AsyncSession, organization: tenancy_api.OrganizationView, name: str
) -> uuid.UUID:
    """D3: the organisation's own roles first, then the system roles — the
    same 400 VALIDATION_ERROR an unrecognised role name has always raised
    here, now for either kind of role."""
    role = await tenancy_api.resolve_role(session, organization_id=organization.id, name=name)
    if role is None:
        raise AppError(code="VALIDATION_ERROR", message=f"Unknown role: {name}", status_code=400)
    return role.id


def _role_out(role: tenancy_api.RoleView) -> dict:
    return {
        "id": str(role.id),
        "name": role.name,
        "permissions": list(role.permissions),
        "organization_id": str(role.organization_id) if role.organization_id else None,
        "is_system": role.is_system,
        "in_use": role.in_use,
    }


def _forbid_self(ctx: WorkspaceContext, user_id: uuid.UUID) -> None:
    if user_id == ctx.user_id:
        raise AppError(
            code="CANNOT_EDIT_SELF",
            message="You cannot change or remove your own membership",
            status_code=400,
        )


@router.get("")
async def workspace_profile(
    ctx: WorkspaceContext = Depends(read_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    workspace = await tenancy_api.get_workspace(session, workspace_id=ctx.workspace_id)
    if workspace is None:
        raise AppError(code="NOT_FOUND", message="Workspace not found", status_code=404)
    return success(
        {
            "id": str(workspace.id),
            "name": workspace.name,
            "organization_name": workspace.organization_name,
            "your_role": ctx.role,
        }
    )


@router.get("/members")
async def list_members(
    ctx: WorkspaceContext = Depends(read_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    return success(await _members(session, ctx.workspace_id))


@router.post("/members", status_code=201)
async def add_member(
    body: MemberAdd,
    ctx: WorkspaceContext = Depends(manage_context),
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    user = await identity_api.get_user_by_email(session, email=str(body.email))
    created_login = user is None
    if user is None:
        user = await identity_api.create_user(
            session, email=str(body.email), password=body.password, full_name=body.full_name
        )
    elif user.is_superadmin:
        raise AppError(
            code="SUPERADMIN_CANNOT_JOIN",
            message="Superadmins manage the platform and cannot join a workspace",
            status_code=400,
        )
    existing = [
        row for row in await tenancy_api.list_memberships(session, workspace_id=ctx.workspace_id)
        if row.user_id == user.id
    ]
    if existing:
        raise AppError(
            code="ALREADY_MEMBER", message="That person is already in this workspace", status_code=400
        )
    organization = await _organization(session, ctx)
    sub = await tenancy_api.get_subscription(session, organization_id=organization.id)
    if sub is not None and sub.seat_limit is not None:
        seats_used = await tenancy_api.count_org_seats(session, organization_id=organization.id)
        if seats_used >= sub.seat_limit:
            raise AppError(
                code="PLAN_LIMIT",
                message=f"The {sub.plan} plan allows {sub.seat_limit} members. Upgrade the plan to add more.",
                status_code=403,
            )
    role_id = await _resolve_role_id(session, organization, body.role)
    await tenancy_api.create_membership(
        session, user_id=user.id, workspace_id=ctx.workspace_id, role_id=role_id
    )
    await audit_api.record(
        session,
        action=audit_api.actions.MEMBER_ADDED,
        workspace_id=ctx.workspace_id,
        actor_id=ctx.user_id,
        target_type="user",
        target_id=str(user.id),
        metadata={"email": user.email, "role": body.role, "created_login": created_login},
    )
    await session.commit()
    member = next(m for m in await _members(session, ctx.workspace_id) if m["user_id"] == str(user.id))
    return JSONResponse(status_code=201, content=success(member))


@router.patch("/members/{user_id}")
async def change_role(
    user_id: uuid.UUID,
    body: MemberRoleUpdate,
    ctx: WorkspaceContext = Depends(manage_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    _forbid_self(ctx, user_id)
    organization = await _organization(session, ctx)
    role_id = await _resolve_role_id(session, organization, body.role)
    changed = await tenancy_api.set_membership_role(
        session, workspace_id=ctx.workspace_id, user_id=user_id, role_id=role_id
    )
    if not changed:
        raise AppError(code="NOT_FOUND", message="Member not found", status_code=404)
    await audit_api.record(
        session,
        action=audit_api.actions.MEMBER_ROLE_CHANGED,
        workspace_id=ctx.workspace_id,
        actor_id=ctx.user_id,
        target_type="user",
        target_id=str(user_id),
        metadata={"role": body.role},
    )
    await session.commit()
    member = next(m for m in await _members(session, ctx.workspace_id) if m["user_id"] == str(user_id))
    return success(member)


@router.delete("/members/{user_id}")
async def remove_member(
    user_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(manage_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    _forbid_self(ctx, user_id)
    removed = await tenancy_api.remove_membership(
        session, workspace_id=ctx.workspace_id, user_id=user_id
    )
    if not removed:
        raise AppError(code="NOT_FOUND", message="Member not found", status_code=404)
    await audit_api.record(
        session,
        action=audit_api.actions.MEMBER_REMOVED,
        workspace_id=ctx.workspace_id,
        actor_id=ctx.user_id,
        target_type="user",
        target_id=str(user_id),
    )
    await session.commit()
    return success({"removed": True})


@router.get("/roles")
async def list_roles(
    ctx: WorkspaceContext = Depends(read_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    organization = await _organization(session, ctx)
    roles = await tenancy_api.list_roles(session, organization_id=organization.id)
    return success([_role_out(role) for role in roles])


@router.post("/roles", status_code=201)
async def create_role(
    body: RoleCreate,
    ctx: WorkspaceContext = Depends(manage_context),
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    organization = await _organization(session, ctx)
    role = await tenancy_api.create_role(
        session, organization_id=organization.id, name=body.name, permissions=body.permissions
    )
    await audit_api.record(
        session,
        action=audit_api.actions.ROLE_CREATED,
        workspace_id=ctx.workspace_id,
        actor_id=ctx.user_id,
        target_type="role",
        target_id=str(role.id),
        metadata={"name": role.name, "permissions": list(role.permissions)},
    )
    await session.commit()
    return JSONResponse(status_code=201, content=success(_role_out(role)))


@router.patch("/roles/{role_id}")
async def update_role(
    role_id: uuid.UUID,
    body: RoleUpdate,
    ctx: WorkspaceContext = Depends(manage_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    organization = await _organization(session, ctx)
    role = await tenancy_api.update_role(
        session,
        organization_id=organization.id,
        role_id=role_id,
        name=body.name,
        permissions=body.permissions,
    )
    if role is None:
        raise AppError(code="NOT_FOUND", message="Role not found", status_code=404)
    await audit_api.record(
        session,
        action=audit_api.actions.ROLE_UPDATED,
        workspace_id=ctx.workspace_id,
        actor_id=ctx.user_id,
        target_type="role",
        target_id=str(role.id),
        metadata={"name": role.name, "permissions": list(role.permissions)},
    )
    await session.commit()
    return success(_role_out(role))


@router.delete("/roles/{role_id}")
async def delete_role(
    role_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(manage_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    organization = await _organization(session, ctx)
    deleted = await tenancy_api.delete_role(session, organization_id=organization.id, role_id=role_id)
    if deleted is None:
        raise AppError(code="NOT_FOUND", message="Role not found", status_code=404)
    await audit_api.record(
        session,
        action=audit_api.actions.ROLE_DELETED,
        workspace_id=ctx.workspace_id,
        actor_id=ctx.user_id,
        target_type="role",
        target_id=str(role_id),
        metadata={"name": deleted.name},
    )
    await session.commit()
    return success({"deleted": True})
