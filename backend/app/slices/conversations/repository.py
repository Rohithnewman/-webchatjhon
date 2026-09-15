import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.slices.conversations.models import Conversation, ConversationMessage


async def insert_conversation(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    chatbot_id: uuid.UUID,
    flow_version: int,
    visitor_label: str,
) -> Conversation:
    conversation = Conversation(
        workspace_id=workspace_id,
        chatbot_id=chatbot_id,
        flow_version=flow_version,
        visitor_label=visitor_label,
        variables={},
    )
    session.add(conversation)
    await session.flush()
    return conversation


async def select_conversation(
    session: AsyncSession, *, workspace_id: uuid.UUID, conversation_id: uuid.UUID
) -> Conversation | None:
    return (
        await session.execute(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.workspace_id == workspace_id,
                Conversation.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()


async def list_conversations(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    chatbot_id: uuid.UUID | None = None,
    status: str | None = None,
    limit: int = 100,
) -> list[Conversation]:
    query = (
        select(Conversation)
        .where(
            Conversation.workspace_id == workspace_id,
            Conversation.deleted_at.is_(None),
        )
        .order_by(Conversation.updated_at.desc())
        .limit(limit)
    )
    if chatbot_id is not None:
        query = query.where(Conversation.chatbot_id == chatbot_id)
    if status is not None:
        query = query.where(Conversation.status == status)
    return list((await session.execute(query)).scalars().all())


def apply_engine_state(
    conversation: Conversation,
    *,
    status: str,
    current_node_id: str | None,
    variables: dict[str, Any],
) -> None:
    conversation.status = status
    conversation.current_node_id = current_node_id
    conversation.variables = variables
    # JSONB columns don't detect in-place mutation; the dict is rebuilt each
    # turn, but flag anyway so a same-identity assignment still persists.
    flag_modified(conversation, "variables")


async def append_message(
    session: AsyncSession,
    *,
    conversation: Conversation,
    role: str,
    content: str,
    node_id: str | None = None,
    meta: dict[str, Any] | None = None,
) -> ConversationMessage:
    next_ordinal = (
        await session.execute(
            select(func.coalesce(func.max(ConversationMessage.ordinal), 0) + 1).where(
                ConversationMessage.conversation_id == conversation.id
            )
        )
    ).scalar_one()
    message = ConversationMessage(
        workspace_id=conversation.workspace_id,
        conversation_id=conversation.id,
        ordinal=next_ordinal,
        role=role,
        content=content,
        node_id=node_id,
        meta=meta or {},
    )
    session.add(message)
    await session.flush()
    return message


async def list_messages(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    conversation_id: uuid.UUID,
    after_ordinal: int = 0,
) -> list[ConversationMessage]:
    return list(
        (
            await session.execute(
                select(ConversationMessage)
                .where(
                    ConversationMessage.workspace_id == workspace_id,
                    ConversationMessage.conversation_id == conversation_id,
                    ConversationMessage.ordinal > after_ordinal,
                )
                .order_by(ConversationMessage.ordinal)
            )
        )
        .scalars()
        .all()
    )


async def last_messages(
    session: AsyncSession, *, workspace_id: uuid.UUID, conversation_ids: list[uuid.UUID]
) -> dict[uuid.UUID, ConversationMessage]:
    """Latest message per conversation, for list previews."""
    if not conversation_ids:
        return {}
    rows = (
        (
            await session.execute(
                select(ConversationMessage)
                .where(
                    ConversationMessage.workspace_id == workspace_id,
                    ConversationMessage.conversation_id.in_(conversation_ids),
                )
                .order_by(
                    ConversationMessage.conversation_id,
                    ConversationMessage.ordinal.desc(),
                )
                .distinct(ConversationMessage.conversation_id)
            )
        )
        .scalars()
        .all()
    )
    return {row.conversation_id: row for row in rows}
