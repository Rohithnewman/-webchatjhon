"""Published interface for chatbot and flow data."""

import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.slices.chatbots.models import Chatbot
from app.slices.chatbots.repository import select_current_flow
from app.slices.chatbots.schemas import FlowDocument, NodeType


@dataclass(frozen=True)
class PublishedChatbot:
    id: uuid.UUID
    workspace_id: uuid.UUID
    name: str


@dataclass(frozen=True)
class CurrentFlow:
    version: int
    definition: dict[str, Any]


async def get_published_chatbot(
    session: AsyncSession, *, chatbot_id: uuid.UUID
) -> PublishedChatbot | None:
    """Public widget lookup — no workspace filter, by design.

    A visitor's script tag knows only the chatbot id; the workspace comes from
    the chatbot row itself. Only `published` bots are ever returned.
    """
    chatbot = (
        await session.execute(
            select(Chatbot).where(
                Chatbot.id == chatbot_id,
                Chatbot.status == "published",
                Chatbot.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if chatbot is None:
        return None
    return PublishedChatbot(
        id=chatbot.id, workspace_id=chatbot.workspace_id, name=chatbot.name
    )


async def get_current_flow(
    session: AsyncSession, *, workspace_id: uuid.UUID, chatbot_id: uuid.UUID
) -> CurrentFlow | None:
    flow = await select_current_flow(
        session, workspace_id=workspace_id, chatbot_id=chatbot_id
    )
    if flow is None:
        return None
    return CurrentFlow(version=flow.version, definition=flow.definition)


__all__ = [
    "CurrentFlow",
    "FlowDocument",
    "NodeType",
    "PublishedChatbot",
    "get_current_flow",
    "get_published_chatbot",
]
