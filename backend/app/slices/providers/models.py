import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.shared.mixins import TimestampMixin, uuid_pk

#: Providers the platform can talk to. Groq, Mistral and Ollama all speak the
#: OpenAI wire format, so they share one adapter.
SUPPORTED_PROVIDERS = ("openai", "anthropic", "gemini", "groq", "mistral", "ollama")


class ProviderCredential(TimestampMixin, Base):
    """A workspace's own API key for one provider (BYOK, architecture D3).

    The platform never holds a shared key: the key is supplied by the customer,
    encrypted at rest, and decrypted in memory only at call time.
    """

    __tablename__ = "provider_credentials"
    __table_args__ = (
        CheckConstraint(
            "provider IN ('openai', 'anthropic', 'gemini', 'groq', 'mistral', 'ollama')",
            name="ck_provider_credentials_provider",
        ),
        # At most one default per provider per workspace, ignoring soft-deleted
        # rows so a replaced key does not block the new default.
        Index(
            "uq_provider_credential_default",
            "workspace_id",
            "provider",
            unique=True,
            postgresql_where=text("is_default AND deleted_at IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False, index=True
    )
    provider: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(120), nullable=False, server_default="")

    #: Fernet ciphertext. Never returned by any endpoint.
    encrypted_key: Mapped[str] = mapped_column(String(1000), nullable=False)
    #: Shown in the UI so a key is identifiable without being readable.
    key_last_four: Mapped[str] = mapped_column(String(4), nullable=False, server_default="")

    #: Ollama runs locally and needs no key; base_url is what matters there.
    base_url: Mapped[str | None] = mapped_column(String(300), nullable=True)

    is_default: Mapped[bool] = mapped_column(
        nullable=False, server_default=text("false"), index=True
    )
