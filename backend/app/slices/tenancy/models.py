import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, Index, Integer, String, text
from sqlalchemy.dialects.postgresql import ARRAY, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.shared.mixins import CreatedAtMixin, TimestampMixin, uuid_pk


class Organization(TimestampMixin, Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    plan: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="free"
    )
    subscription_status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="active"
    )
    subscription_starts_at: Mapped[date] = mapped_column(
        Date, nullable=False, server_default=text("CURRENT_DATE")
    )
    subscription_ends_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    # D2: overrides of the plan default, set by the superadmin. NULL = use
    # the plan default (see tenancy.api.PLAN_LIMITS / effective_limits).
    seat_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    chatbot_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    conversation_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)


class Workspace(TimestampMixin, Base):
    __tablename__ = "workspaces"

    id: Mapped[uuid.UUID] = uuid_pk()
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    timezone: Mapped[str] = mapped_column(
        String(64), nullable=False, server_default="UTC"
    )


class Role(CreatedAtMixin, Base):
    __tablename__ = "roles"
    __table_args__ = (
        Index(
            "uq_role_system_name",
            "name",
            unique=True,
            postgresql_where=text("is_system"),
        ),
        Index(
            "uq_role_organization_name",
            "organization_id",
            "name",
            unique=True,
            postgresql_where=text("organization_id IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    # D3: NULL for the four system roles (every organisation's template
    # set); set for an organisation's own role. See migration 0014 part B.
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    permissions: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, server_default=text("'{}'::varchar[]")
    )
    is_system: Mapped[bool] = mapped_column(
        nullable=False, server_default=text("false")
    )


class Membership(TimestampMixin, Base):
    __tablename__ = "memberships"
    __table_args__ = (
        Index(
            "uq_membership_active",
            "user_id",
            "workspace_id",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False, index=True
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("roles.id"), nullable=False, index=True
    )
