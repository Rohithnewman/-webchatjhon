import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import ARRAY, DOUBLE_PRECISION, JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.shared.mixins import CreatedAtMixin, TimestampMixin, uuid_pk


class KnowledgeBase(TimestampMixin, Base):
    __tablename__ = "knowledge_bases"
    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False, server_default="")
    embedding_provider: Mapped[str] = mapped_column(String(30), nullable=False, server_default="local")
    embedding_model: Mapped[str] = mapped_column(String(120), nullable=False, server_default="local-hash-v1")
    embedding_dimensions: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("32"))


class Document(TimestampMixin, Base):
    __tablename__ = "documents"
    __table_args__ = (CheckConstraint("status IN ('pending', 'processing', 'ready', 'failed')", name="ck_documents_status"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False, index=True)
    knowledge_base_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("knowledge_bases.id"), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="pending", index=True)
    error: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    chunk_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))


class DocumentChunk(CreatedAtMixin, Base):
    __tablename__ = "document_chunks"
    __table_args__ = (Index("uq_document_chunk_ordinal", "document_id", "ordinal", unique=True),)
    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False, index=True)
    document_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("documents.id"), nullable=False, index=True)
    knowledge_base_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("knowledge_bases.id"), nullable=False, index=True)
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    token_count: Mapped[int] = mapped_column(Integer, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(ARRAY(DOUBLE_PRECISION), nullable=False)
