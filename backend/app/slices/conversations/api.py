"""Published interface of the conversations slice.

Phase 5 analytics reads conversation activity through here; nothing else is
exposed.
"""

import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.slices.conversations.models import Conversation, ConversationMessage


async def daily_counts(
    session: AsyncSession, *, workspace_id: uuid.UUID, since: datetime
) -> list[dict]:
    """Conversations and messages per day since `since`, oldest first."""
    conversation_rows = await session.execute(
        select(
            func.date_trunc("day", Conversation.created_at).label("day"),
            func.count(),
        )
        .where(
            Conversation.workspace_id == workspace_id,
            Conversation.created_at >= since,
            Conversation.deleted_at.is_(None),
        )
        .group_by("day")
    )
    message_rows = await session.execute(
        select(
            func.date_trunc("day", ConversationMessage.created_at).label("day"),
            func.count(),
        )
        .where(
            ConversationMessage.workspace_id == workspace_id,
            ConversationMessage.created_at >= since,
        )
        .group_by("day")
    )
    conversations = {row[0]: row[1] for row in conversation_rows}
    messages = {row[0]: row[1] for row in message_rows}
    return [
        {
            "day": day.date().isoformat(),
            "conversations": conversations.get(day, 0),
            "messages": messages.get(day, 0),
        }
        for day in sorted(set(conversations) | set(messages))
    ]


async def status_counts(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> dict[str, int]:
    rows = await session.execute(
        select(Conversation.status, func.count())
        .where(
            Conversation.workspace_id == workspace_id,
            Conversation.deleted_at.is_(None),
        )
        .group_by(Conversation.status)
    )
    return {status: count for status, count in rows}


async def counts_by_chatbot(
    session: AsyncSession, *, workspace_id: uuid.UUID, since: datetime
) -> list[tuple[uuid.UUID, int]]:
    """Conversations started per chatbot since `since`, most active first."""
    rows = await session.execute(
        select(Conversation.chatbot_id, func.count())
        .where(
            Conversation.workspace_id == workspace_id,
            Conversation.created_at >= since,
            Conversation.deleted_at.is_(None),
        )
        .group_by(Conversation.chatbot_id)
        .order_by(func.count().desc())
    )
    return [(chatbot_id, count) for chatbot_id, count in rows]
