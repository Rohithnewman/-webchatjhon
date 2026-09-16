"""Platform superadmin surface. Reads and writes only tenancy and identity
metadata — never tenant content — through the published `platform_*` APIs."""

import uuid
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.envelope import success
from app.core.errors import AppError
from app.shared.context import Principal
from app.slices.admin.schemas import SubscriptionUpdate, UserFlagsUpdate
from app.slices.audit import api as audit_api
from app.slices.chatbots import api as chatbots_api
from app.slices.conversations import api as conversations_api
from app.slices.identity import api as identity_api
from app.slices.tenancy import api as tenancy_api

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


async def require_superadmin(
    principal: Principal = Depends(identity_api.get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> identity_api.UserSummary:
    user = await identity_api.get_active_user(session, user_id=principal.user_id)
    if user is None or not user.is_active:
        raise AppError(code="UNAUTHENTICATED", message="User is inactive", status_code=401)
    if not user.is_superadmin:
        raise AppError(code="FORBIDDEN", message="Superadmin only", status_code=403)
    return user


def _organization(summary: tenancy_api.OrganizationSummary, chatbots_used: int) -> dict:
    return {
        "id": str(summary.id),
        "name": summary.name,
        "plan": summary.plan,
        "created_at": summary.created_at.isoformat(),
        "workspace_count": summary.workspace_count,
        "member_count": summary.member_count,
        "subscription": tenancy_api.subscription_dict(summary.subscription, chatbots_used=chatbots_used),
    }


async def _chatbots_used(session: AsyncSession, *, organization_id: uuid.UUID) -> int:
    workspace_ids = await tenancy_api.list_org_workspace_ids(session, organization_id=organization_id)
    return await chatbots_api.count_for_workspaces(session, workspace_ids=workspace_ids)


def _user(summary: identity_api.UserSummary, organizations: list[str]) -> dict:
    return {
        "id": str(summary.id),
        "email": summary.email,
        "full_name": summary.full_name,
        "is_active": summary.is_active,
        "is_superadmin": summary.is_superadmin,
        "created_at": summary.created_at.isoformat() if summary.created_at else None,
        "organizations": organizations,
    }


@router.get("/stats")
async def stats(
    _: identity_api.UserSummary = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    counts = await tenancy_api.platform_counts(session)
    return success(
        {
            **counts,
            "users": len(await identity_api.platform_list_users(session)),
            "chatbots": await chatbots_api.platform_count(session),
            "conversations": await conversations_api.platform_count(session),
            "locked_organizations": await tenancy_api.count_locked_organizations(session),
        }
    )


@router.get("/organizations")
async def list_organizations(
    _: identity_api.UserSummary = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    summaries = await tenancy_api.platform_list_organizations(session)
    return success(
        [_organization(o, await _chatbots_used(session, organization_id=o.id)) for o in summaries]
    )


@router.patch("/organizations/{organization_id}")
async def update_subscription(
    organization_id: uuid.UUID,
    body: SubscriptionUpdate,
    admin: identity_api.UserSummary = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    fields_set = body.model_fields_set
    ends_at_kwargs = {"ends_at": body.ends_at} if "ends_at" in fields_set else {}
    sub = await tenancy_api.set_subscription(
        session,
        organization_id=organization_id,
        plan=body.plan,
        status=body.status,
        starts_at=body.starts_at,
        **ends_at_kwargs,
    )
    if sub is None:
        raise AppError(code="NOT_FOUND", message="Organization not found", status_code=404)
    summary = await tenancy_api.get_organization_summary(session, organization_id=organization_id)
    assert summary is not None
    chatbots_used = await _chatbots_used(session, organization_id=organization_id)

    def _jsonable(value: object) -> object:
        return value.isoformat() if isinstance(value, date) else value

    await audit_api.record(
        session,
        action=audit_api.actions.ADMIN_ORGANIZATION_SUBSCRIPTION_CHANGED,
        actor_id=admin.id,
        target_type="organization",
        target_id=str(organization_id),
        metadata={field: _jsonable(getattr(body, field)) for field in fields_set},
    )
    await session.commit()
    return success(_organization(summary, chatbots_used))


@router.get("/users")
async def list_users(
    _: identity_api.UserSummary = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    organizations = await tenancy_api.platform_user_organizations(session)
    return success(
        [_user(u, organizations.get(u.id, [])) for u in await identity_api.platform_list_users(session)]
    )


@router.patch("/users/{user_id}")
async def update_user(
    user_id: uuid.UUID,
    body: UserFlagsUpdate,
    admin: identity_api.UserSummary = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    if user_id == admin.id:
        raise AppError(code="CANNOT_EDIT_SELF", message="You cannot change your own flags", status_code=400)
    if body.is_superadmin:
        memberships = await tenancy_api.list_user_workspaces(session, user_id=user_id)
        if memberships:
            raise AppError(
                code="USER_IS_TENANT_MEMBER",
                message="This user belongs to an organisation; remove their memberships before promoting them",
                status_code=409,
            )
    updated = await identity_api.set_user_flags(
        session, user_id=user_id, is_active=body.is_active, is_superadmin=body.is_superadmin
    )
    if updated is None:
        raise AppError(code="NOT_FOUND", message="User not found", status_code=404)
    await audit_api.record(
        session,
        action=audit_api.actions.ADMIN_USER_UPDATED,
        actor_id=admin.id,
        target_type="user",
        target_id=str(user_id),
        metadata={"is_active": body.is_active, "is_superadmin": body.is_superadmin},
    )
    await session.commit()
    organizations = await tenancy_api.platform_user_organizations(session)
    return success(_user(updated, organizations.get(user_id, [])))
