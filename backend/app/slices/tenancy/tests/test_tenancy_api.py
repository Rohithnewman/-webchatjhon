import uuid

from sqlalchemy import text

from app.shared import permissions
from app.slices.tenancy import api as tenancy_api


async def _make_user(session, email: str = "u@x.com") -> uuid.UUID:
    result = await session.execute(
        text(
            "INSERT INTO users (email, password_hash, full_name) "
            "VALUES (:email, 'x', 'U') RETURNING id"
        ),
        {"email": email},
    )
    return result.scalar_one()


async def test_seed_system_roles_is_idempotent(session):
    await tenancy_api.seed_system_roles(session)
    await tenancy_api.seed_system_roles(session)
    rows = await session.execute(text("SELECT name FROM roles WHERE is_system"))
    assert sorted(row[0] for row in rows) == ["admin", "member", "owner", "viewer"]


async def test_owner_role_has_wildcard_permission(session):
    owner = await tenancy_api.get_role_by_name(session, "owner")
    assert owner is not None
    assert owner.permissions == (permissions.ALL,)


async def test_get_role_by_name_returns_none_when_absent(session):
    assert await tenancy_api.get_role_by_name(session, "nope") is None


async def test_create_tenant_makes_org_and_default_workspace(session):
    created = await tenancy_api.create_tenant(session, org_name="Acme")
    name = await session.execute(
        text("SELECT name FROM workspaces WHERE id = :id"),
        {"id": created.workspace_id},
    )
    assert name.scalar_one() == "Default"


async def test_get_active_membership_returns_role_and_permissions(session):
    created = await tenancy_api.create_tenant(session, org_name="Acme")
    owner = await tenancy_api.get_role_by_name(session, "owner")
    assert owner is not None
    user_id = await _make_user(session)
    await tenancy_api.create_membership(
        session, user_id=user_id, workspace_id=created.workspace_id, role_id=owner.id
    )
    view = await tenancy_api.get_active_membership(
        session, user_id=user_id, workspace_id=created.workspace_id
    )
    assert view is not None
    assert view.role_name == "owner"
    assert view.permissions == (permissions.ALL,)


async def test_get_active_membership_ignores_soft_deleted_rows(session):
    created = await tenancy_api.create_tenant(session, org_name="Acme")
    owner = await tenancy_api.get_role_by_name(session, "owner")
    assert owner is not None
    user_id = await _make_user(session)
    membership_id = await tenancy_api.create_membership(
        session, user_id=user_id, workspace_id=created.workspace_id, role_id=owner.id
    )
    await session.execute(
        text("UPDATE memberships SET deleted_at = now() WHERE id = :id"),
        {"id": membership_id},
    )
    assert (
        await tenancy_api.get_active_membership(
            session, user_id=user_id, workspace_id=created.workspace_id
        )
        is None
    )


async def test_get_earliest_workspace_id_is_deterministic(session):
    owner = await tenancy_api.get_role_by_name(session, "owner")
    assert owner is not None
    user_id = await _make_user(session)
    first = await tenancy_api.create_tenant(session, org_name="First")
    second = await tenancy_api.create_tenant(session, org_name="Second")
    await tenancy_api.create_membership(
        session, user_id=user_id, workspace_id=first.workspace_id, role_id=owner.id
    )
    await tenancy_api.create_membership(
        session, user_id=user_id, workspace_id=second.workspace_id, role_id=owner.id
    )
    assert (
        await tenancy_api.get_earliest_workspace_id(session, user_id=user_id)
        == first.workspace_id
    )
