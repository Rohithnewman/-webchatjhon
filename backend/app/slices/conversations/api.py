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
    session: AsyncSession, *, workspace_id: uuid.UUID, since: datetime | None = None
) -> dict[str, int]:
    """Conversations per status, optionally restricted to those started
    since `since`. `since=None` (the default) counts all-time, preserving
    the behaviour of existing callers."""
    conditions = [
        Conversation.workspace_id == workspace_id,
        Conversation.deleted_at.is_(None),
    ]
    if since is not None:
        conditions.append(Conversation.created_at >= since)
    rows = await session.execute(
        select(Conversation.status, func.count())
        .where(*conditions)
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


async def count_started_since_for_workspaces(
    session: AsyncSession, *, workspace_ids: list[uuid.UUID], since: datetime
) -> int:
    """Conversations started (created_at >= since) across the given
    workspaces — used to enforce the organisation's monthly conversation
    plan limit, and to report usage in the admin/owner subscription views.
    """
    if not workspace_ids:
        return 0
    return int(
        (
            await session.execute(
                select(func.count())
                .select_from(Conversation)
                .where(
                    Conversation.workspace_id.in_(workspace_ids),
                    Conversation.created_at >= since,
                    Conversation.deleted_at.is_(None),
                )
            )
        ).scalar_one()
    )


async def platform_count(session: AsyncSession) -> int:
    """Superadmin only: conversations across every workspace."""
    return int(
        (
            await session.execute(
                select(func.count()).select_from(Conversation).where(Conversation.deleted_at.is_(None))
            )
        ).scalar_one()
    )
