"""Organisation-level administration for the caller's own organisation.

"Organisation admin" is not a separate role: it is anyone holding
WORKSPACE_MANAGE (owner or admin) in the workspace they are currently in.
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
from app.slices.chatbots import api as chatbots_api
from app.slices.conversations import api as conversations_api
from app.slices.organizations.schemas import NameUpdate, WorkspaceCreate
from app.slices.tenancy import api as tenancy_api

router = APIRouter(prefix="/api/v1/organization", tags=["organization"])

read_context = authz_api.require_permission(permissions.FEATURES_READ)
manage_context = authz_api.require_permission(permissions.WORKSPACE_MANAGE)


async def _organization(session: AsyncSession, ctx: WorkspaceContext) -> tenancy_api.OrganizationView:
    organization = await tenancy_api.get_organization_of_workspace(session, workspace_id=ctx.workspace_id)
    if organization is None:
        raise AppError(code="NOT_FOUND", message="Organization not found", status_code=404)
    return organization


def _workspace(summary: tenancy_api.WorkspaceSummary, current: uuid.UUID) -> dict:
    return {
        "id": str(summary.id),
        "name": summary.name,
        "member_count": summary.member_count,
        "created_at": summary.created_at.isoformat(),
        "is_current": summary.id == current,
    }


async def _profile(session: AsyncSession, ctx: WorkspaceContext, organization: tenancy_api.OrganizationView) -> dict:
    workspaces = await tenancy_api.list_workspaces(session, organization_id=organization.id)
    sub = await tenancy_api.get_subscription(session, organization_id=organization.id)
    subscription = None
    if sub is not None:
        workspace_ids = [w.id for w in workspaces]
        chatbots_used = await chatbots_api.count_for_workspaces(session, workspace_ids=workspace_ids)
        conversations_used = await conversations_api.count_started_since_for_workspaces(
            session, workspace_ids=workspace_ids, since=tenancy_api.current_month_start()
        )
        subscription = tenancy_api.subscription_dict(
            sub, chatbots_used=chatbots_used, conversations_used=conversations_used
        )
    return {
        "id": str(organization.id),
        "name": organization.name,
        "plan": organization.plan,
        "workspaces": [_workspace(w, ctx.workspace_id) for w in workspaces],
        "subscription": subscription,
    }


@router.get("")
async def get_organization(
    ctx: WorkspaceContext = Depends(read_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    organization = await _organization(session, ctx)
    return success(await _profile(session, ctx, organization))


@router.patch("")
async def rename_organization(
    body: NameUpdate,
    ctx: WorkspaceContext = Depends(manage_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    organization = await _organization(session, ctx)
    renamed = await tenancy_api.rename_organization(session, organization_id=organization.id, name=body.name)
    assert renamed is not None
    await audit_api.record(
        session,
        action=audit_api.actions.ORGANIZATION_RENAMED,
        workspace_id=ctx.workspace_id,
        actor_id=ctx.user_id,
        target_type="organization",
        target_id=str(organization.id),
        metadata={"name": body.name},
    )
    await session.commit()
    return success(await _profile(session, ctx, renamed))


@router.post("/workspaces", status_code=201)
async def create_workspace(
    body: WorkspaceCreate,
    ctx: WorkspaceContext = Depends(manage_context),
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    organization = await _organization(session, ctx)
    workspace = await tenancy_api.create_workspace(session, organization_id=organization.id, name=body.name)
    owner = await tenancy_api.get_role_by_name(session, "owner")
    if owner is None:
        raise AppError(code="ROLES_NOT_SEEDED", message="System roles are missing", status_code=500)
    await tenancy_api.create_membership(session, user_id=ctx.user_id, workspace_id=workspace.id, role_id=owner.id)
    await audit_api.record(
        session,
        action=audit_api.actions.WORKSPACE_CREATED,
        workspace_id=workspace.id,
        actor_id=ctx.user_id,
        target_type="workspace",
        target_id=str(workspace.id),
        metadata={"name": body.name, "organization_id": str(organization.id)},
    )
    await session.commit()
    created = tenancy_api.WorkspaceSummary(id=workspace.id, name=workspace.name, member_count=1, created_at=workspace.created_at)
    return JSONResponse(status_code=201, content=success(_workspace(created, ctx.workspace_id)))


@router.patch("/workspaces/{workspace_id}")
async def rename_workspace(
    workspace_id: uuid.UUID,
    body: NameUpdate,
    ctx: WorkspaceContext = Depends(manage_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    organization = await _organization(session, ctx)
    renamed = await tenancy_api.rename_workspace(
        session, organization_id=organization.id, workspace_id=workspace_id, name=body.name
    )
    if renamed is None:
        raise AppError(code="NOT_FOUND", message="Workspace not found in this organization", status_code=404)
    await audit_api.record(
        session,
        action=audit_api.actions.WORKSPACE_RENAMED,
        workspace_id=workspace_id,
        actor_id=ctx.user_id,
        target_type="workspace",
        target_id=str(workspace_id),
        metadata={"name": body.name},
    )
    await session.commit()
    return success(_workspace(renamed, ctx.workspace_id))
