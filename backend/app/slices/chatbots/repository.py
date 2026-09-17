import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.slices.chatbots.models import Chatbot, Flow


async def list_chatbots(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> list[tuple[Chatbot, int | None]]:
    statement = (
        select(Chatbot, Flow.version)
        .outerjoin(
            Flow,
            (Flow.chatbot_id == Chatbot.id)
            & (Flow.workspace_id == workspace_id)
            & Flow.is_current.is_(True)
            & Flow.deleted_at.is_(None),
        )
        .where(
            Chatbot.workspace_id == workspace_id,
            Chatbot.deleted_at.is_(None),
        )
        .order_by(Chatbot.updated_at.desc(), Chatbot.id)
    )
    return [(row[0], row[1]) for row in (await session.execute(statement)).all()]


async def count_for_workspaces(session: AsyncSession, *, workspace_ids: list[uuid.UUID]) -> int:
    if not workspace_ids:
        return 0
    statement = (
        select(func.count())
        .select_from(Chatbot)
        .where(Chatbot.workspace_id.in_(workspace_ids), Chatbot.deleted_at.is_(None))
    )
    return int((await session.execute(statement)).scalar_one())


async def select_chatbot(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    chatbot_id: uuid.UUID,
    for_update: bool = False,
) -> Chatbot | None:
    statement = select(Chatbot).where(
        Chatbot.id == chatbot_id,
        Chatbot.workspace_id == workspace_id,
        Chatbot.deleted_at.is_(None),
    )
    if for_update:
        statement = statement.with_for_update()
    return (await session.execute(statement)).scalar_one_or_none()


async def insert_chatbot(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    name: str,
    description: str,
    platform: str = "website",
    use_case: str | None = None,
    use_case_note: str | None = None,
) -> Chatbot:
    chatbot = Chatbot(
        workspace_id=workspace_id,
        name=name,
        description=description,
        platform=platform,
        use_case=use_case,
        use_case_note=use_case_note,
    )
    session.add(chatbot)
    await session.flush()
    return chatbot


async def update_chatbot(chatbot: Chatbot, **changes: object) -> None:
    for field, value in changes.items():
        setattr(chatbot, field, value)


async def soft_delete_chatbot(
    session: AsyncSession, *, chatbot: Chatbot
) -> None:
    now = datetime.now(timezone.utc)
    chatbot.deleted_at = now
    await session.execute(
        update(Flow)
        .where(
            Flow.chatbot_id == chatbot.id,
            Flow.workspace_id == chatbot.workspace_id,
            Flow.deleted_at.is_(None),
        )
        .values(deleted_at=now, is_current=False)
    )


async def select_current_flow(
    session: AsyncSession, *, workspace_id: uuid.UUID, chatbot_id: uuid.UUID
) -> Flow | None:
    statement = select(Flow).where(
        Flow.chatbot_id == chatbot_id,
        Flow.workspace_id == workspace_id,
        Flow.is_current.is_(True),
        Flow.deleted_at.is_(None),
    )
    return (await session.execute(statement)).scalar_one_or_none()


async def select_flow_version(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    chatbot_id: uuid.UUID,
    version: int,
) -> Flow | None:
    statement = select(Flow).where(
        Flow.chatbot_id == chatbot_id,
        Flow.workspace_id == workspace_id,
        Flow.version == version,
        Flow.deleted_at.is_(None),
    )
    return (await session.execute(statement)).scalar_one_or_none()


async def list_flow_versions(
    session: AsyncSession, *, workspace_id: uuid.UUID, chatbot_id: uuid.UUID
) -> list[Flow]:
    statement = (
        select(Flow)
        .where(
            Flow.chatbot_id == chatbot_id,
            Flow.workspace_id == workspace_id,
            Flow.deleted_at.is_(None),
        )
        .order_by(Flow.version.desc())
    )
    return list((await session.execute(statement)).scalars().all())


async def insert_next_flow_version(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    chatbot_id: uuid.UUID,
    created_by: uuid.UUID,
    definition: dict,
) -> Flow:
    maximum = await session.execute(
        select(func.max(Flow.version)).where(
            Flow.chatbot_id == chatbot_id,
            Flow.workspace_id == workspace_id,
            Flow.deleted_at.is_(None),
        )
    )
    next_version = (maximum.scalar_one() or 0) + 1
    await session.execute(
        update(Flow)
        .where(
            Flow.chatbot_id == chatbot_id,
            Flow.workspace_id == workspace_id,
            Flow.is_current.is_(True),
            Flow.deleted_at.is_(None),
        )
        .values(is_current=False)
    )
    flow = Flow(
        workspace_id=workspace_id,
        chatbot_id=chatbot_id,
        version=next_version,
        definition=definition,
        is_current=True,
        created_by=created_by,
    )
    session.add(flow)
    await session.flush()
    return flow
