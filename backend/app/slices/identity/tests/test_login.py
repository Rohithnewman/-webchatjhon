import pytest
from sqlalchemy import text

from app.core import security
from app.core.config import settings
from app.core.errors import AppError
from app.slices.identity.use_cases.login import login
from app.slices.identity.use_cases.register import register


async def _registered(session):
    return await register(
        session,
        email="a@b.com",
        password="Secret123",
        full_name="A",
        org_name="Acme",
    )


async def test_login_issues_tokens_and_resets_failure_count(session):
    created = await _registered(session)
    await session.execute(
        text("UPDATE users SET failed_login_count=2 WHERE id=:id"),
        {"id": created.user_id},
    )
    bundle = await login(session, email="A@B.COM", password="Secret123")
    assert bundle.user_id == created.user_id
    count = await session.execute(
        text("SELECT failed_login_count FROM users WHERE id=:id"),
        {"id": created.user_id},
    )
    assert count.scalar_one() == 0


async def test_unknown_email_still_runs_bcrypt_and_is_audited(session, monkeypatch):
    calls = []
    original = security.verify_password

    def _spy(plain, hashed):
        calls.append(hashed)
        return original(plain, hashed)

    monkeypatch.setattr(security, "verify_password", _spy)
    with pytest.raises(AppError) as error:
        await login(session, email="missing@x.com", password="Secret123")
    assert error.value.code == "INVALID_CREDENTIALS"
    assert calls == [security.DUMMY_PASSWORD_HASH]
    audit = await session.execute(
        text(
            "SELECT count(*) FROM audit_logs WHERE action='auth.login_failed' "
            "AND workspace_id IS NULL"
        )
    )
    assert audit.scalar_one() == 1


async def test_failed_attempts_accumulate_then_lock_account(session):
    await _registered(session)
    for _ in range(settings.LOGIN_MAX_FAILURES):
        with pytest.raises(AppError) as error:
            await login(session, email="a@b.com", password="wrong")
        assert error.value.code == "INVALID_CREDENTIALS"
    with pytest.raises(AppError) as locked:
        await login(session, email="a@b.com", password="Secret123")
    assert locked.value.code == "ACCOUNT_LOCKED"
    assert locked.value.status_code == 423
