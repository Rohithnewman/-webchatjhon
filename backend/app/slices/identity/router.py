from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.envelope import success
from app.core.errors import AppError
from app.core.rate_limit import rate_limit
from app.shared.context import Principal
from app.slices.chatbots import api as chatbots_api
from app.slices.identity import repository
from app.slices.identity.dependencies import get_current_principal
from app.slices.identity.schemas import (
    LoginIn,
    LogoutIn,
    RefreshIn,
    RegisterIn,
    SwitchWorkspaceIn,
)
from app.slices.identity.use_cases.login import login as login_use_case
from app.slices.identity.use_cases.logout import logout as logout_use_case
from app.slices.identity.use_cases.refresh import refresh as refresh_use_case
from app.slices.identity.use_cases.register import register as register_use_case
from app.slices.identity.use_cases.switch_workspace import (
    switch_workspace as switch_workspace_use_case,
)
from app.slices.identity.use_cases.tokens import TokenBundle
from app.slices.tenancy import api as tenancy_api

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _serialize(bundle: TokenBundle) -> dict:
    return {
        "access_token": bundle.access_token,
        "refresh_token": bundle.refresh_token,
        "user_id": str(bundle.user_id),
        "workspace_id": str(bundle.workspace_id) if bundle.workspace_id else None,
    }


@router.post("/register", dependencies=[Depends(rate_limit("register"))])
async def register(
    body: RegisterIn, session: AsyncSession = Depends(get_session)
) -> JSONResponse:
    bundle = await register_use_case(
        session,
        email=str(body.email),
        password=body.password,
        full_name=body.full_name,
        org_name=body.org_name,
    )
    return JSONResponse(status_code=201, content=success(_serialize(bundle)))


@router.post("/login", dependencies=[Depends(rate_limit("login"))])
async def login(body: LoginIn, session: AsyncSession = Depends(get_session)) -> dict:
    bundle = await login_use_case(
        session, email=str(body.email), password=body.password
    )
    return success(_serialize(bundle))


@router.post("/refresh", dependencies=[Depends(rate_limit("refresh"))])
async def refresh(
    body: RefreshIn, session: AsyncSession = Depends(get_session)
) -> dict:
    bundle = await refresh_use_case(session, refresh_token=body.refresh_token)
    return success(_serialize(bundle))


@router.post("/logout")
async def logout(
    body: LogoutIn, session: AsyncSession = Depends(get_session)
) -> dict:
    await logout_use_case(session, refresh_token=body.refresh_token)
    return success({"logged_out": True})


@router.post("/switch-workspace")
async def switch_workspace(
    body: SwitchWorkspaceIn,
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> dict:
    bundle = await switch_workspace_use_case(
        session,
        user_id=principal.user_id,
        current_workspace_id=principal.workspace_id,
        refresh_token=body.refresh_token,
        target_workspace_id=body.workspace_id,
    )
    return success(_serialize(bundle))


@router.get("/workspaces")
async def my_workspaces(
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> dict:
    rows = await tenancy_api.list_user_workspaces(session, user_id=principal.user_id)
    return success(
        [
            {
                "workspace_id": str(row.workspace_id),
                "workspace_name": row.workspace_name,
                "organization_id": str(row.organization_id),
                "organization_name": row.organization_name,
                "role": row.role_name,
                "is_current": row.workspace_id == principal.workspace_id,
            }
            for row in rows
        ]
    )


@router.get("/me")
async def me(
    principal: Principal = Depends(get_current_principal),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await repository.select_user(session, principal.user_id)
    if user is None or not user.is_active:
        raise AppError(code="UNAUTHENTICATED", message="User is inactive", status_code=401)
    if principal.workspace_id is None:
        # D1: a superadmin has no tenancy.
        return success(
            {
                "user_id": str(user.id),
                "email": user.email,
                "full_name": user.full_name,
                "is_superadmin": user.is_superadmin,
                "workspace_id": None,
                "role": None,
                "permissions": [],
                "subscription": None,
            }
        )
    membership = await tenancy_api.get_active_membership(
        session, user_id=user.id, workspace_id=principal.workspace_id
    )
    sub = await tenancy_api.get_subscription_for_workspace(session, workspace_id=principal.workspace_id)
    subscription = None
    if sub is not None:
        organization = await tenancy_api.get_organization_of_workspace(
            session, workspace_id=principal.workspace_id
        )
        workspace_ids = (
            await tenancy_api.list_org_workspace_ids(session, organization_id=organization.id)
            if organization is not None
            else []
        )
        chatbots_used = await chatbots_api.count_for_workspaces(session, workspace_ids=workspace_ids)
        subscription = tenancy_api.subscription_dict(sub, chatbots_used=chatbots_used)
    return success(
        {
            "user_id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "is_superadmin": user.is_superadmin,
            "workspace_id": str(principal.workspace_id),
            "role": membership.role_name if membership else None,
            "permissions": list(membership.permissions) if membership else [],
            "subscription": subscription,
        }
    )
