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
from app.slices.admin.schemas import (
    OrganizationCreate,
    SubscriptionUpdate,
    UserFlagsUpdate,
    UserPasswordReset,
)
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


def _organization(summary: tenancy_api.OrganizationSummary, chatbots_used: int, conversations_used: int) -> dict:
    return {
        "id": str(summary.id),
        "name": summary.name,
        "plan": summary.plan,
        "created_at": summary.created_at.isoformat(),
        "workspace_count": summary.workspace_count,
        "member_count": summary.member_count,
        "subscription": tenancy_api.subscription_dict(
            summary.subscription, chatbots_used=chatbots_used, conversations_used=conversations_used
        ),
    }


async def _chatbots_used(session: AsyncSession, *, organization_id: uuid.UUID) -> int:
    workspace_ids = await tenancy_api.list_org_workspace_ids(session, organization_id=organization_id)
    return await chatbots_api.count_for_workspaces(session, workspace_ids=workspace_ids)


async def _conversations_used(session: AsyncSession, *, organization_id: uuid.UUID) -> int:
    workspace_ids = await tenancy_api.list_org_workspace_ids(session, organization_id=organization_id)
    since = tenancy_api.current_month_start()
    return await conversations_api.count_started_since_for_workspaces(
        session, workspace_ids=workspace_ids, since=since
    )


def _user(
    summary: identity_api.UserSummary,
    organizations: list[str],
    roles: list[str] | None = None,
) -> dict:
    roles_list = roles or []
    is_org_admin = any(r.lower() in ("owner", "admin") for r in roles_list)
    return {
        "id": str(summary.id),
        "email": summary.email,
        "full_name": summary.full_name,
        "is_active": summary.is_active,
        "is_superadmin": summary.is_superadmin,
        "is_org_admin": is_org_admin,
        "roles": roles_list,
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
        [
            _organization(
                o,
                await _chatbots_used(session, organization_id=o.id),
                await _conversations_used(session, organization_id=o.id),
            )
            for o in summaries
        ]
    )


@router.post("/organizations", status_code=201)
async def create_organization(
    body: OrganizationCreate,
    admin: identity_api.UserSummary = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    name = body.name.strip()
    if not name:
        raise AppError(code="VALIDATION_ERROR", message="Organization name cannot be blank", status_code=400)
    summary = await tenancy_api.create_organization_with_defaults(
        session, name=name, plan=body.plan, workspace_name=body.workspace_name
    )
    await audit_api.record(
        session,
        action=audit_api.actions.ADMIN_ORGANIZATION_CREATED,
        actor_id=admin.id,
        target_type="organization",
        target_id=str(summary.id),
        metadata={"name": name, "plan": body.plan},
    )
    return success(_organization(summary, chatbots_used=0, conversations_used=0))


@router.delete("/organizations/{organization_id}")
async def delete_organization(
    organization_id: uuid.UUID,
    admin: identity_api.UserSummary = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    deleted = await tenancy_api.delete_organization(session, organization_id=organization_id)
    if not deleted:
        raise AppError(code="NOT_FOUND", message="Organization not found", status_code=404)
    await audit_api.record(
        session,
        action=audit_api.actions.ADMIN_ORGANIZATION_DELETED,
        actor_id=admin.id,
        target_type="organization",
        target_id=str(organization_id),
        metadata={},
    )
    await session.commit()
    return success({"deleted": True, "id": str(organization_id)})


@router.patch("/organizations/{organization_id}")
async def update_subscription(
    organization_id: uuid.UUID,
    body: SubscriptionUpdate,
    admin: identity_api.UserSummary = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    fields_set = body.model_fields_set
    unset_kwargs = {
        field: getattr(body, field)
        for field in ("ends_at", "seat_limit", "chatbot_limit", "conversation_limit")
        if field in fields_set
    }
    sub = await tenancy_api.set_subscription(
        session,
        organization_id=organization_id,
        plan=body.plan,
        status=body.status,
        starts_at=body.starts_at,
        **unset_kwargs,
    )
    if sub is None:
        raise AppError(code="NOT_FOUND", message="Organization not found", status_code=404)
    summary = await tenancy_api.get_organization_summary(session, organization_id=organization_id)
    assert summary is not None
    chatbots_used = await _chatbots_used(session, organization_id=organization_id)
    conversations_used = await _conversations_used(session, organization_id=organization_id)

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
    return success(_organization(summary, chatbots_used, conversations_used))


@router.get("/users")
async def list_users(
    _: identity_api.UserSummary = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    memberships = await tenancy_api.platform_user_memberships_summary(session)
    return success(
        [
            _user(
                u,
                memberships.get(u.id, {}).get("organizations", []),
                memberships.get(u.id, {}).get("roles", []),
            )
            for u in await identity_api.platform_list_users(session)
        ]
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
        metadata={
            k: v
            for k, v in {"is_active": body.is_active, "is_superadmin": body.is_superadmin}.items()
            if v is not None
        },
    )
    await session.commit()
    memberships = await tenancy_api.platform_user_memberships_summary(session)
    return success(
        _user(
            updated,
            memberships.get(user_id, {}).get("organizations", []),
            memberships.get(user_id, {}).get("roles", []),
        )
    )


@router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: uuid.UUID,
    body: UserPasswordReset,
    admin: identity_api.UserSummary = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    success_reset = await identity_api.reset_user_password(
        session, user_id=user_id, new_password=body.password
    )
    if not success_reset:
        raise AppError(code="NOT_FOUND", message="User not found", status_code=404)
    await audit_api.record(
        session,
        action=audit_api.actions.ADMIN_USER_PASSWORD_RESET,
        actor_id=admin.id,
        target_type="user",
        target_id=str(user_id),
    )
    await session.commit()
    return success({"message": "Password reset successfully"})


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: uuid.UUID,
    admin: identity_api.UserSummary = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    if user_id == admin.id:
        raise AppError(code="CANNOT_DELETE_SELF", message="You cannot delete yourself", status_code=400)
    deleted = await identity_api.delete_user(session, user_id=user_id)
    if not deleted:
        raise AppError(code="NOT_FOUND", message="User not found", status_code=404)
    await audit_api.record(
        session,
        action=audit_api.actions.ADMIN_USER_DELETED,
        actor_id=admin.id,
        target_type="user",
        target_id=str(user_id),
    )
    await session.commit()
    return success({"deleted": True})
