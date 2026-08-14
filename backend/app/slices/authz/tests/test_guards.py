from fastapi import APIRouter, Depends
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.core.database import get_session
from app.main import create_app
from app.shared import permissions
from app.shared.context import WorkspaceContext
from app.slices.authz.dependencies import get_workspace_context, require_permission
from app.slices.identity.use_cases.register import register
from app.slices.tenancy import api as tenancy_api


def _app(session):
    app = create_app()
    router = APIRouter()

    @router.get("/api/v1/_probe/whoami")
    async def whoami(ctx: WorkspaceContext = Depends(get_workspace_context)):
        return {"role": ctx.role}

    @router.get("/api/v1/_probe/manage")
    async def manage(
        ctx: WorkspaceContext = Depends(
            require_permission(permissions.WORKSPACE_MANAGE)
        ),
    ):
        return {"role": ctx.role}

    app.include_router(router)

    async def _override():
        yield session

    app.dependency_overrides[get_session] = _override
    return app


async def _get(session, path, token):
    async with AsyncClient(
        transport=ASGITransport(app=_app(session)), base_url="http://test"
    ) as client:
        return await client.get(
            path, headers={"Authorization": f"Bearer {token}"}
        )


async def test_owner_is_allowed_through_real_http(session):
    bundle = await register(
        session,
        email="a@b.com",
        password="Secret123",
        full_name="A",
        org_name="Acme",
    )
    response = await _get(session, "/api/v1/_probe/manage", bundle.access_token)
    assert response.status_code == 200


async def test_role_change_takes_effect_on_next_request(session):
    bundle = await register(
        session,
        email="a@b.com",
        password="Secret123",
        full_name="A",
        org_name="Acme",
    )
    viewer = await tenancy_api.get_role_by_name(session, "viewer")
    assert viewer is not None
    await session.execute(
        text("UPDATE memberships SET role_id=:role WHERE user_id=:user"),
        {"role": viewer.id, "user": bundle.user_id},
    )
    response = await _get(session, "/api/v1/_probe/manage", bundle.access_token)
    assert response.status_code == 403
    assert response.json()["error"] == "FORBIDDEN"


async def test_removed_membership_is_forbidden_immediately(session):
    bundle = await register(
        session,
        email="a@b.com",
        password="Secret123",
        full_name="A",
        org_name="Acme",
    )
    await session.execute(
        text("UPDATE memberships SET deleted_at=now() WHERE user_id=:user"),
        {"user": bundle.user_id},
    )
    response = await _get(session, "/api/v1/_probe/whoami", bundle.access_token)
    assert response.status_code == 403


async def test_deactivated_user_is_unauthenticated_immediately(session):
    bundle = await register(
        session,
        email="a@b.com",
        password="Secret123",
        full_name="A",
        org_name="Acme",
    )
    await session.execute(
        text("UPDATE users SET is_active=false WHERE id=:user"),
        {"user": bundle.user_id},
    )
    session.expire_all()
    response = await _get(session, "/api/v1/_probe/whoami", bundle.access_token)
    assert response.status_code == 401


async def test_refresh_token_is_rejected_as_bearer(session):
    bundle = await register(
        session,
        email="a@b.com",
        password="Secret123",
        full_name="A",
        org_name="Acme",
    )
    response = await _get(session, "/api/v1/_probe/whoami", bundle.refresh_token)
    assert response.status_code == 401
