import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.slices.audit import api as audit_api
from app.slices.chatbots import repository
from app.slices.chatbots.models import Chatbot, Flow
from app.slices.chatbots.schemas import FlowDocument


def _not_found() -> AppError:
    return AppError(code="NOT_FOUND", message="Chatbot not found", status_code=404)


DEFAULT_FLOW = FlowDocument.model_validate(
    {
        "nodes": [
            {
                "id": "start",
                "type": "start",
                "position": {"x": 80, "y": 180},
                "data": {"label": "Start"},
            },
            {
                "id": "welcome",
                "type": "message",
                "position": {"x": 360, "y": 180},
                "data": {"label": "Welcome", "message": "Hello! How can I help?"},
            },
            {
                "id": "end",
                "type": "end",
                "position": {"x": 660, "y": 180},
                "data": {"label": "End"},
            },
        ],
        "edges": [
            {"id": "start-welcome", "source": "start", "target": "welcome"},
            {"id": "welcome-end", "source": "welcome", "target": "end"},
        ],
        "viewport": {"x": 0, "y": 0, "zoom": 1},
    }
)


async def create_chatbot(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    actor_id: uuid.UUID,
    name: str,
    description: str,
) -> tuple[Chatbot, Flow]:
    chatbot = await repository.insert_chatbot(
        session,
        workspace_id=workspace_id,
        name=name.strip(),
        description=description.strip(),
    )
    flow = await repository.insert_next_flow_version(
        session,
        workspace_id=workspace_id,
        chatbot_id=chatbot.id,
        created_by=actor_id,
        definition=DEFAULT_FLOW.model_dump(mode="json"),
    )
    await audit_api.record(
        session,
        action=audit_api.actions.CHATBOT_CREATED,
        workspace_id=workspace_id,
        actor_id=actor_id,
        target_type="chatbot",
        target_id=str(chatbot.id),
        metadata={"name": chatbot.name},
    )
    await session.commit()
    return chatbot, flow


async def update_chatbot(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    actor_id: uuid.UUID,
    chatbot_id: uuid.UUID,
    changes: dict[str, str],
) -> Chatbot:
    chatbot = await repository.select_chatbot(
        session,
        workspace_id=workspace_id,
        chatbot_id=chatbot_id,
        for_update=True,
    )
    if chatbot is None:
        raise _not_found()
    await repository.update_chatbot(chatbot, **changes)
    await audit_api.record(
        session,
        action=audit_api.actions.CHATBOT_UPDATED,
        workspace_id=workspace_id,
        actor_id=actor_id,
        target_type="chatbot",
        target_id=str(chatbot.id),
        metadata={"fields": sorted(changes)},
    )
    await session.commit()
    await session.refresh(chatbot)
    return chatbot


async def delete_chatbot(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    actor_id: uuid.UUID,
    chatbot_id: uuid.UUID,
) -> None:
    chatbot = await repository.select_chatbot(
        session,
        workspace_id=workspace_id,
        chatbot_id=chatbot_id,
        for_update=True,
    )
    if chatbot is None:
        raise _not_found()
    await repository.soft_delete_chatbot(session, chatbot=chatbot)
    await audit_api.record(
        session,
        action=audit_api.actions.CHATBOT_DELETED,
        workspace_id=workspace_id,
        actor_id=actor_id,
        target_type="chatbot",
        target_id=str(chatbot.id),
    )
    await session.commit()


async def save_flow(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    actor_id: uuid.UUID,
    chatbot_id: uuid.UUID,
    definition: FlowDocument,
    action: str = "save",
) -> Flow:
    chatbot = await repository.select_chatbot(
        session,
        workspace_id=workspace_id,
        chatbot_id=chatbot_id,
        for_update=True,
    )
    if chatbot is None:
        raise _not_found()
    flow = await repository.insert_next_flow_version(
        session,
        workspace_id=workspace_id,
        chatbot_id=chatbot_id,
        created_by=actor_id,
        definition=definition.model_dump(mode="json"),
    )
    await audit_api.record(
        session,
        action=(
            audit_api.actions.FLOW_RESTORED
            if action == "restore"
            else audit_api.actions.FLOW_SAVED
        ),
        workspace_id=workspace_id,
        actor_id=actor_id,
        target_type="flow",
        target_id=str(flow.id),
        metadata={"chatbot_id": str(chatbot_id), "version": flow.version},
    )
    await session.commit()
    return flow


async def restore_flow(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    actor_id: uuid.UUID,
    chatbot_id: uuid.UUID,
    version: int,
) -> Flow:
    source = await repository.select_flow_version(
        session,
        workspace_id=workspace_id,
        chatbot_id=chatbot_id,
        version=version,
    )
    if source is None:
        raise AppError(code="NOT_FOUND", message="Flow version not found", status_code=404)
    return await save_flow(
        session,
        workspace_id=workspace_id,
        actor_id=actor_id,
        chatbot_id=chatbot_id,
        definition=FlowDocument.model_validate(source.definition),
        action="restore",
    )
