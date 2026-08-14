import pytest
from sqlalchemy import text

from app.core.errors import AppError
from app.core.security import decode_token
from app.slices.identity.use_cases.register import register


async def test_register_creates_tenant_membership_tokens_and_audit(session):
    bundle = await register(
        session,
        email=" A@B.com ",
        password="Secret123",
        full_name="A",
        org_name="Acme",
    )
    payload = decode_token(bundle.access_token, expected_type="access")
    assert payload["workspace_id"] == str(bundle.workspace_id)
    assert "permissions" not in payload
    row = await session.execute(
        text(
            "SELECT u.email, r.name FROM users u "
            "JOIN memberships m ON m.user_id=u.id "
            "JOIN roles r ON r.id=m.role_id WHERE u.id=:user_id"
        ),
        {"user_id": bundle.user_id},
    )
    assert row.one() == ("a@b.com", "owner")
    audit_count = await session.execute(
        text("SELECT count(*) FROM audit_logs WHERE actor_id=:user_id"),
        {"user_id": bundle.user_id},
    )
    assert audit_count.scalar_one() == 1


async def test_duplicate_email_is_rejected_by_database_constraint(session):
    await register(
        session,
        email="a@b.com",
        password="Secret123",
        full_name="A",
        org_name="Acme",
    )
    with pytest.raises(AppError) as error:
        await register(
            session,
            email="A@B.COM",
            password="Secret123",
            full_name="B",
            org_name="Beta",
        )
    assert error.value.code == "EMAIL_TAKEN"
    orphan = await session.execute(
        text("SELECT count(*) FROM organizations WHERE name='Beta'")
    )
    assert orphan.scalar_one() == 0


async def test_failure_after_user_insert_rolls_back_all_rows(session, monkeypatch):
    from app.slices.identity.use_cases import register as register_module

    async def _boom(*_args, **_kwargs):
        raise RuntimeError("membership failed")

    monkeypatch.setattr(register_module.tenancy_api, "create_membership", _boom)
    with pytest.raises(RuntimeError):
        await register(
            session,
            email="atomic@x.com",
            password="Secret123",
            full_name="A",
            org_name="Atomic",
        )
    users = await session.execute(
        text("SELECT count(*) FROM users WHERE email='atomic@x.com'")
    )
    orgs = await session.execute(
        text("SELECT count(*) FROM organizations WHERE name='Atomic'")
    )
    assert users.scalar_one() == 0
    assert orgs.scalar_one() == 0
