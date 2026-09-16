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
from app.slices.members.schemas import MemberAdd, MemberOut, MemberRoleUpdate
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
                joined_at=row.joined_at,
            ).model_dump(mode="json")
        )
    return out


async def _role_id(session: AsyncSession, name: str) -> uuid.UUID:
    role = await tenancy_api.get_role_by_name(session, name)
    if role is None:
        raise AppError(code="ROLES_NOT_SEEDED", message="System roles are missing", status_code=500)
    return role.id


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
    existing = [
        row for row in await tenancy_api.list_memberships(session, workspace_id=ctx.workspace_id)
        if row.user_id == user.id
    ]
    if existing:
        raise AppError(
            code="ALREADY_MEMBER", message="That person is already in this workspace", status_code=400
        )
    organization = await tenancy_api.get_organization_of_workspace(session, workspace_id=ctx.workspace_id)
    if organization is not None:
        sub = await tenancy_api.get_subscription(session, organization_id=organization.id)
        if sub is not None and sub.seat_limit is not None:
            seats_used = await tenancy_api.count_org_seats(session, organization_id=organization.id)
            if seats_used >= sub.seat_limit:
                raise AppError(
                    code="PLAN_LIMIT",
                    message=f"The {sub.plan} plan allows {sub.seat_limit} members. Upgrade the plan to add more.",
                    status_code=403,
                )
    role_id = await _role_id(session, body.role)
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
    role_id = await _role_id(session, body.role)
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
