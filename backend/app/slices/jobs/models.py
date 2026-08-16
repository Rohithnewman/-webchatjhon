import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.shared.mixins import TimestampMixin, uuid_pk


class Job(TimestampMixin, Base):
    """A unit of background work.

    Replaces the Celery + Redis queue from architecture section 3.7: Redis has
    no official Windows build and Docker is unavailable on the target machine.
    Keeping the queue in Postgres also puts jobs under the same RLS as every
    other tenant row and makes them inspectable with SQL.
    """

    __tablename__ = "jobs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('queued', 'running', 'succeeded', 'failed')",
            name="ck_jobs_status",
        ),
        # The claim query filters on status + run_after and orders by the same;
        # this index is what keeps claiming O(1) as completed jobs accumulate.
        Index("ix_jobs_claimable", "status", "run_after"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    # Nullable: platform-level work has no tenant to attribute it to. RLS
    # excludes NULL rows from tenant-scoped reads, which is the intent.
    workspace_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=True, index=True
    )
    kind: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="queued", index=True
    )
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("3"))
    error: Mapped[str | None] = mapped_column(String(2000), nullable=True)

    run_after: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    locked_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
