import uuid
from typing import Any

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.shared.mixins import CreatedAtMixin, TimestampMixin, uuid_pk

CONVERSATION_STATUSES = ("active", "handoff", "closed")
MESSAGE_ROLES = ("visitor", "bot", "agent", "system")


class Conversation(TimestampMixin, Base):
    __tablename__ = "conversations"
    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'handoff', 'closed')", name="ck_conversations_status"
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False, index=True
    )
    chatbot_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("chatbots.id"), nullable=False, index=True
    )
    flow_version: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="active", index=True
    )
    current_node_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    variables: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb"), default=dict
    )
    visitor_label: Mapped[str] = mapped_column(String(40), nullable=False)


class ConversationMessage(CreatedAtMixin, Base):
    __tablename__ = "conversation_messages"
    __table_args__ = (
        CheckConstraint(
            "role IN ('visitor', 'bot', 'agent', 'system')",
            name="ck_conversation_messages_role",
        ),
        Index(
            "uq_conversation_message_ordinal",
            "conversation_id",
            "ordinal",
            unique=True,
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False, index=True
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("conversations.id"), nullable=False, index=True
    )
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)
    role: Mapped[str] = mapped_column(String(10), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    node_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    meta: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
