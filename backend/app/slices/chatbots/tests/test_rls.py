from sqlalchemy import text

from app.slices.chatbots import service
from app.slices.identity.use_cases.register import register


async def test_rls_hides_foreign_workspace_chatbots_and_flows(session):
    alice = await register(
        session,
        email="alice-builder@x.com",
        password="Secret123",
        full_name="Alice",
        org_name="Alpha",
    )
    bob = await register(
        session,
        email="bob-builder@x.com",
        password="Secret123",
        full_name="Bob",
        org_name="Beta",
    )
    await service.create_chatbot(
        session,
        workspace_id=alice.workspace_id,
        actor_id=alice.user_id,
        name="Alice bot",
        description="",
    )
    await service.create_chatbot(
        session,
        workspace_id=bob.workspace_id,
        actor_id=bob.user_id,
        name="Bob bot",
        description="",
    )
    await session.execute(text("SET LOCAL ROLE app_restricted"))
    await session.execute(
        text("SELECT set_config('app.workspace_id', :workspace, true)"),
        {"workspace": str(alice.workspace_id)},
    )
    chatbots = await session.execute(text("SELECT name FROM chatbots"))
    assert [row[0] for row in chatbots] == ["Alice bot"]
    flows = await session.execute(text("SELECT count(*) FROM flows"))
    assert flows.scalar_one() == 1
