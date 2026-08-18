"""Add knowledge bases, uploaded documents, and fallback embeddings.

Revision ID: 0007_knowledge_base
Revises: 0006_provider_credentials
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0007_knowledge_base"
down_revision = "0006_provider_credentials"
branch_labels = None
depends_on = None

def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)
    op.create_table("knowledge_bases",
        sa.Column("id", uuid, server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("workspace_id", uuid, nullable=False), sa.Column("name", sa.String(160), nullable=False),
        sa.Column("description", sa.String(500), server_default="", nullable=False),
        sa.Column("embedding_provider", sa.String(30), server_default="local", nullable=False),
        sa.Column("embedding_model", sa.String(120), server_default="local-hash-v1", nullable=False),
        sa.Column("embedding_dimensions", sa.Integer(), server_default=sa.text("32"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True)), sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]), sa.PrimaryKeyConstraint("id"))
    op.create_index("ix_knowledge_bases_workspace_id", "knowledge_bases", ["workspace_id"])
    op.create_table("documents",
        sa.Column("id", uuid, server_default=sa.text("gen_random_uuid()"), nullable=False), sa.Column("workspace_id", uuid, nullable=False),
        sa.Column("knowledge_base_id", uuid, nullable=False), sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("content_type", sa.String(120), nullable=False), sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column("storage_path", sa.String(500), nullable=False), sa.Column("status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("error", sa.String(2000)), sa.Column("chunk_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False), sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("status IN ('pending', 'processing', 'ready', 'failed')", name="ck_documents_status"), sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]), sa.ForeignKeyConstraint(["knowledge_base_id"], ["knowledge_bases.id"]), sa.PrimaryKeyConstraint("id"))
    op.create_index("ix_documents_workspace_id", "documents", ["workspace_id"]); op.create_index("ix_documents_knowledge_base_id", "documents", ["knowledge_base_id"]); op.create_index("ix_documents_status", "documents", ["status"])
    op.create_table("document_chunks",
        sa.Column("id", uuid, server_default=sa.text("gen_random_uuid()"), nullable=False), sa.Column("workspace_id", uuid, nullable=False), sa.Column("document_id", uuid, nullable=False), sa.Column("knowledge_base_id", uuid, nullable=False), sa.Column("ordinal", sa.Integer(), nullable=False), sa.Column("content", sa.Text(), nullable=False), sa.Column("token_count", sa.Integer(), nullable=False), sa.Column("embedding", postgresql.ARRAY(sa.DOUBLE_PRECISION), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False), sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]), sa.ForeignKeyConstraint(["document_id"], ["documents.id"]), sa.ForeignKeyConstraint(["knowledge_base_id"], ["knowledge_bases.id"]), sa.PrimaryKeyConstraint("id"))
    for name, cols in (("ix_document_chunks_workspace_id", ["workspace_id"]), ("ix_document_chunks_document_id", ["document_id"]), ("ix_document_chunks_knowledge_base_id", ["knowledge_base_id"]), ("uq_document_chunk_ordinal", ["document_id", "ordinal"])):
        op.create_index(name, "document_chunks", cols, unique=name.startswith("uq_"))
    for table in ("knowledge_bases", "documents", "document_chunks"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"CREATE POLICY {table}_tenant_isolation ON {table} USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)")
    op.execute("GRANT SELECT ON knowledge_bases, documents, document_chunks TO app_restricted")

def downgrade() -> None:
    op.execute("REVOKE ALL ON knowledge_bases, documents, document_chunks FROM app_restricted")
    for table in ("document_chunks", "documents", "knowledge_bases"):
        op.execute(f"DROP POLICY IF EXISTS {table}_tenant_isolation ON {table}"); op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
    op.drop_table("document_chunks"); op.drop_table("documents"); op.drop_table("knowledge_bases")
