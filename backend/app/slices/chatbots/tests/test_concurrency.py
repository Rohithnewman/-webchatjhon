import asyncio
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.slices.chatbots import service
from app.slices.chatbots.models import Flow
from app.slices.chatbots.schemas import FlowDocument
from app.slices.identity.use_cases.register import register


async def test_concurrent_saves_receive_distinct_versions(db_engine: AsyncEngine):
    async with AsyncSession(db_engine, expire_on_commit=False) as session:
        identity = await register(
            session,
            email=f"flow-race-{uuid.uuid4().hex}@x.com",
            password="Secret123",
            full_name="Race",
            org_name="Race",
        )
        chatbot, _ = await service.create_chatbot(
            session,
            workspace_id=identity.workspace_id,
            actor_id=identity.user_id,
            name="Concurrent",
            description="",
        )

    async def save(message: str):
        document = service.DEFAULT_FLOW.model_copy(deep=True)
        document.nodes[1].data["message"] = message
        async with AsyncSession(db_engine, expire_on_commit=False) as session:
            return await service.save_flow(
                session,
                workspace_id=identity.workspace_id,
                actor_id=identity.user_id,
                chatbot_id=chatbot.id,
                definition=FlowDocument.model_validate(document.model_dump()),
            )

    results = await asyncio.gather(save("A"), save("B"))
    assert sorted(flow.version for flow in results) == [2, 3]
    async with AsyncSession(db_engine) as session:
        rows = await session.execute(
            select(Flow.version, Flow.is_current).where(Flow.chatbot_id == chatbot.id)
        )
        versions = list(rows)
        assert sorted(row[0] for row in versions) == [1, 2, 3]
        assert sum(row[1] for row in versions) == 1
