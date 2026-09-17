import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.shared.mixins import TimestampMixin, uuid_pk


class Chatbot(TimestampMixin, Base):
    __tablename__ = "chatbots"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'published', 'archived')",
            name="ck_chatbots_status",
        ),
        CheckConstraint(
            "platform IN ('website', 'whatsapp', 'instagram', 'facebook', 'telegram')",
            name="ck_chatbots_platform",
        ),
        CheckConstraint(
            "use_case IS NULL OR use_case IN ('leads', 'support', 'sales', 'appointment', 'other')",
            name="ck_chatbots_use_case",
        ),
        CheckConstraint(
            "install_format IS NULL OR install_format IN ('chat_button', 'landing_page', 'mobile_app', 'embedded')",
            name="ck_chatbots_install_format",
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(
        String(500), nullable=False, server_default=""
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="draft", index=True
    )
    platform: Mapped[str] = mapped_column(String(20), nullable=False, server_default="website")
    use_case: Mapped[str | None] = mapped_column(String(20), nullable=True)
    use_case_note: Mapped[str | None] = mapped_column(String(200), nullable=True)
    install_format: Mapped[str | None] = mapped_column(String(20), nullable=True)
    installed_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    installed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Flow(TimestampMixin, Base):
    __tablename__ = "flows"
    __table_args__ = (
        Index(
            "uq_flow_active_version",
            "chatbot_id",
            "version",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index(
            "uq_flow_current",
            "chatbot_id",
            unique=True,
            postgresql_where=text("is_current AND deleted_at IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False, index=True
    )
    chatbot_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("chatbots.id"), nullable=False, index=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    definition: Mapped[dict] = mapped_column(JSONB, nullable=False)
    is_current: Mapped[bool] = mapped_column(
        nullable=False, server_default=text("true"), index=True
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
