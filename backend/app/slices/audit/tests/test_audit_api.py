from sqlalchemy import text

from app.slices.audit import api as audit_api
from app.slices.tenancy import api as tenancy_api


async def test_record_writes_a_row_with_metadata(session):
    created = await tenancy_api.create_tenant(session, org_name="Acme")
    await audit_api.record(
        session,
        action=audit_api.actions.REGISTER,
        workspace_id=created.workspace_id,
        target_type="user",
        target_id="abc",
        metadata={"source": "test"},
    )
    await session.flush()
    row = await session.execute(
        text("SELECT action, metadata, target_id FROM audit_logs WHERE workspace_id=:w"),
        {"w": created.workspace_id},
    )
    action, metadata, target_id = row.one()
    assert action == audit_api.actions.REGISTER
    assert metadata == {"source": "test"}
    assert target_id == "abc"


async def test_record_allows_platform_events_without_workspace_or_actor(session):
    await audit_api.record(session, action=audit_api.actions.LOGIN_FAILED)
    await session.flush()
    row = await session.execute(
        text(
            "SELECT count(*) FROM audit_logs WHERE action=:action "
            "AND workspace_id IS NULL AND actor_id IS NULL"
        ),
        {"action": audit_api.actions.LOGIN_FAILED},
    )
    assert row.scalar_one() == 1


async def test_record_does_not_commit(session):
    await audit_api.record(session, action=audit_api.actions.LOGIN_FAILED)
    assert session.in_transaction() is True
