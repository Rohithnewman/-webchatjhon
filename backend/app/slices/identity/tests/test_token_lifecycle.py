import pytest
from sqlalchemy import text

from app.core.errors import AppError
from app.core.security import decode_token, sha256
from app.slices.identity.use_cases.logout import logout
from app.slices.identity.use_cases.refresh import refresh
from app.slices.identity.use_cases.register import register
from app.slices.identity.use_cases.switch_workspace import switch_workspace
from app.slices.tenancy import api as tenancy_api


async def _registered(session):
    return await register(
        session,
        email="a@b.com",
        password="Secret123",
        full_name="A",
        org_name="Acme",
    )


async def test_refresh_rotates_within_family_and_hashes_storage(session):
    first = await _registered(session)
    rotated = await refresh(session, refresh_token=first.refresh_token)
    assert rotated.refresh_token != first.refresh_token
    families = await session.execute(
        text("SELECT DISTINCT family_id FROM refresh_tokens WHERE user_id=:user_id"),
        {"user_id": first.user_id},
    )
    assert len(list(families)) == 1
    raw_count = await session.execute(
        text("SELECT count(*) FROM refresh_tokens WHERE token_hash=:raw"),
        {"raw": rotated.refresh_token},
    )
    assert raw_count.scalar_one() == 0


async def test_reusing_superseded_token_revokes_whole_family_and_audits(session):
    first = await _registered(session)
    rotated = await refresh(session, refresh_token=first.refresh_token)
    with pytest.raises(AppError) as reuse:
        await refresh(session, refresh_token=first.refresh_token)
    assert reuse.value.code == "INVALID_REFRESH"
    stored = await session.execute(
        text("SELECT revoked_at FROM refresh_tokens WHERE token_hash=:token_hash"),
        {"token_hash": sha256(rotated.refresh_token)},
    )
    assert stored.scalar_one() is not None
    audit = await session.execute(
        text(
            "SELECT count(*) FROM audit_logs "
            "WHERE action='auth.refresh_reuse_detected' AND actor_id=:actor_id"
        ),
        {"actor_id": first.user_id},
    )
    assert audit.scalar_one() == 1


async def test_logout_is_idempotent_and_revokes_presented_token(session):
    bundle = await _registered(session)
    await logout(session, refresh_token=bundle.refresh_token)
    await logout(session, refresh_token=bundle.refresh_token)
    with pytest.raises(AppError):
        await refresh(session, refresh_token=bundle.refresh_token)


async def test_switch_workspace_requires_current_valid_refresh_token(session):
    bundle = await _registered(session)
    target = await tenancy_api.create_tenant(session, org_name="Second")
    owner = await tenancy_api.get_role_by_name(session, "owner")
    assert owner is not None
    await tenancy_api.create_membership(
        session,
        user_id=bundle.user_id,
        workspace_id=target.workspace_id,
        role_id=owner.id,
    )
    await session.commit()
    with pytest.raises(AppError) as invalid:
        await switch_workspace(
            session,
            user_id=bundle.user_id,
            current_workspace_id=bundle.workspace_id,
            refresh_token="not-a-token",
            target_workspace_id=target.workspace_id,
        )
    assert invalid.value.code == "INVALID_REFRESH"

    switched = await switch_workspace(
        session,
        user_id=bundle.user_id,
        current_workspace_id=bundle.workspace_id,
        refresh_token=bundle.refresh_token,
        target_workspace_id=target.workspace_id,
    )
    assert switched.workspace_id == target.workspace_id
    payload = decode_token(switched.access_token, expected_type="access")
    assert payload["workspace_id"] == str(target.workspace_id)
