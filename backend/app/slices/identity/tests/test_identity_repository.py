from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from app.slices.identity import api as identity_api
from app.slices.identity import repository
from app.slices.tenancy import api as tenancy_api


async def _user(session, email="a@b.com"):
    return await repository.insert_user(
        session, email=email, password_hash="h", full_name="A"
    )


async def test_insert_and_lookup_by_email(session):
    await _user(session)
    found = await repository.select_user_by_email(session, "a@b.com")
    assert found is not None
    assert found.full_name == "A"


async def test_lookup_by_email_is_case_insensitive(session):
    await _user(session, email="Mixed@Case.com")
    assert await repository.select_user_by_email(session, "mixed@case.com") is not None


async def test_soft_deleted_user_is_not_returned(session):
    user = await _user(session)
    user_id = user.id
    await session.execute(
        text("UPDATE users SET deleted_at=now() WHERE id=:id"), {"id": user_id}
    )
    session.expire_all()
    assert await repository.select_user_by_email(session, "a@b.com") is None
    assert await repository.select_user(session, user_id) is None


async def test_refresh_family_revocation_revokes_every_member(session):
    created = await tenancy_api.create_tenant(session, org_name="Acme")
    user = await _user(session)
    expires = datetime.now(timezone.utc) + timedelta(days=1)
    for token_hash in ("hash-a", "hash-b"):
        await repository.insert_refresh_token(
            session,
            user_id=user.id,
            workspace_id=created.workspace_id,
            family_id=user.id,
            token_hash=token_hash,
            expires_at=expires,
        )
    assert await repository.revoke_refresh_family(session, family_id=user.id) == 2
    stored = await repository.select_refresh_token(session, token_hash="hash-a")
    assert stored is not None
    assert stored.revoked_at is not None


async def test_get_active_user_returns_summary_and_respects_is_active(session):
    user = await _user(session)
    user_id = user.id
    summary = await identity_api.get_active_user(session, user_id=user_id)
    assert summary is not None and summary.is_active is True
    await session.execute(
        text("UPDATE users SET is_active=false WHERE id=:id"), {"id": user_id}
    )
    session.expire_all()
    refreshed = await identity_api.get_active_user(session, user_id=user_id)
    assert refreshed is not None and refreshed.is_active is False
