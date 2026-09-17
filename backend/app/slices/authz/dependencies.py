from collections.abc import Callable

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.errors import AppError
from app.shared import permissions as perms
from app.shared.context import Principal, WorkspaceContext
from app.slices.identity import api as identity_api
from app.slices.tenancy import api as tenancy_api


async def get_workspace_context(
    principal: Principal = Depends(identity_api.get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> WorkspaceContext:
    user = await identity_api.get_active_user(session, user_id=principal.user_id)
    if user is None or not user.is_active:
        raise AppError(
            code="UNAUTHENTICATED",
            message="User is inactive or no longer exists",
            status_code=401,
        )
    if user.is_superadmin:
        # D1: a superadmin has no tenancy — every workspace-scoped route
        # refuses it outright.
        raise AppError(
            code="SUPERADMIN_HAS_NO_WORKSPACE",
            message="Superadmins manage the platform and have no workspace",
            status_code=403,
        )
    if principal.workspace_id is None:
        raise AppError(
            code="NO_WORKSPACE",
            message="This session has no workspace",
            status_code=403,
        )
    membership = await tenancy_api.get_active_membership(
        session, user_id=principal.user_id, workspace_id=principal.workspace_id
    )
    if membership is None:
        raise AppError(
            code="FORBIDDEN",
            message="No active membership for this workspace",
            status_code=403,
        )
    status = await tenancy_api.get_subscription_status_for_workspace(
        session, workspace_id=principal.workspace_id
    )
    if status is not None and status != "active":
        raise AppError(
            code="SUBSCRIPTION_LOCKED",
            message=f"This organisation's subscription is {status}. Contact the platform administrator.",
            status_code=403,
        )
    return WorkspaceContext(
        user_id=user.id,
        email=user.email,
        workspace_id=principal.workspace_id,
        role=membership.role_name,
        permissions=membership.permissions,
    )


def require_permission(permission: str) -> Callable:
    async def _guard(
        ctx: WorkspaceContext = Depends(get_workspace_context),
    ) -> WorkspaceContext:
        # D3: features:read is implied by any active membership, regardless
        # of what the role's own permission list contains — no role can
        # ever lock a member out of a read route.
        if permission == perms.FEATURES_READ:
            return ctx
        if perms.ALL not in ctx.permissions and permission not in ctx.permissions:
            raise AppError(
                code="FORBIDDEN",
                message="Insufficient permissions",
                status_code=403,
            )
        return ctx

    return _guard
