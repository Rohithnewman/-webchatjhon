"""Published interface of the providers slice.

Other slices reach LLM capability through `get_provider(...)` and never import
an adapter, an SDK, or the credential model directly.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import crypto
from app.core.errors import AppError
from app.slices.providers import repository
from app.slices.providers.adapters.anthropic_adapter import AnthropicProvider
from app.slices.providers.adapters.base import LLMProvider
from app.slices.providers.adapters.gemini import GeminiProvider
from app.slices.providers.adapters.openai_compatible import OpenAICompatibleProvider
from app.slices.providers.models import SUPPORTED_PROVIDERS

#: Four of the six providers speak the OpenAI wire format and share one adapter.
_OPENAI_COMPATIBLE = frozenset({"openai", "groq", "mistral", "ollama"})

#: Ollama runs locally and authenticates nothing.
_KEYLESS = frozenset({"ollama"})


@dataclass(frozen=True)
class CredentialView:
    """A credential as the API may expose it. Deliberately carries no secret."""

    id: uuid.UUID
    provider: str
    label: str
    key_last_four: str
    base_url: str | None
    is_default: bool


def _view(credential) -> CredentialView:
    return CredentialView(
        id=credential.id,
        provider=credential.provider,
        label=credential.label,
        key_last_four=credential.key_last_four,
        base_url=credential.base_url,
        is_default=credential.is_default,
    )


async def store_credential(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    provider: str,
    api_key: str,
    label: str = "",
    base_url: str | None = None,
    make_default: bool = True,
) -> CredentialView:
    """Encrypt and store a workspace's own provider key (BYOK)."""
    if provider not in SUPPORTED_PROVIDERS:
        raise AppError(
            code="UNSUPPORTED_PROVIDER",
            message=f"{provider!r} is not a supported provider",
            status_code=400,
        )
    if not api_key and provider not in _KEYLESS:
        raise AppError(
            code="MISSING_API_KEY",
            message=f"{provider} requires an API key",
            status_code=400,
        )

    if make_default:
        # Demote the incumbent first; the partial unique index permits only one.
        await repository.clear_default(session, workspace_id=workspace_id, provider=provider)

    try:
        credential = await repository.insert(
            session,
            workspace_id=workspace_id,
            provider=provider,
            label=label,
            encrypted_key=crypto.encrypt(api_key),
            key_last_four=crypto.last_four(api_key),
            base_url=base_url,
            is_default=make_default,
        )
    except IntegrityError as exc:
        await session.rollback()
        raise AppError(
            code="DEFAULT_ALREADY_SET",
            message=f"A default {provider} credential already exists",
            status_code=400,
        ) from exc

    return _view(credential)


async def list_credentials(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> list[CredentialView]:
    return [_view(c) for c in await repository.select_all(session, workspace_id=workspace_id)]


async def delete_credential(
    session: AsyncSession, *, workspace_id: uuid.UUID, credential_id: uuid.UUID
) -> bool:
    return await repository.soft_delete(
        session, workspace_id=workspace_id, credential_id=credential_id
    )


async def get_provider(
    session: AsyncSession, *, workspace_id: uuid.UUID, provider: str
) -> LLMProvider:
    """Build a ready-to-call provider from the workspace's default credential.

    The key is decrypted in memory here and handed straight to the adapter; it
    is never returned, logged, or written anywhere outside `encrypted_key`.
    """
    if provider not in SUPPORTED_PROVIDERS:
        raise AppError(
            code="UNSUPPORTED_PROVIDER",
            message=f"{provider!r} is not a supported provider",
            status_code=400,
        )

    credential = await repository.select_default(
        session, workspace_id=workspace_id, provider=provider
    )
    if credential is None:
        raise AppError(
            code="NO_PROVIDER_CREDENTIAL",
            message=f"This workspace has no {provider} credential configured",
            status_code=400,
        )

    api_key = crypto.decrypt(credential.encrypted_key)

    if provider in _OPENAI_COMPATIBLE:
        return OpenAICompatibleProvider(
            name=provider, api_key=api_key, base_url=credential.base_url
        )
    if provider == "anthropic":
        return AnthropicProvider(api_key=api_key, base_url=credential.base_url)
    if provider == "gemini":
        return GeminiProvider(api_key=api_key, base_url=credential.base_url)

    # Unreachable while SUPPORTED_PROVIDERS and this mapping agree; a new
    # provider added to one but not the other lands here loudly.
    raise AppError(
        code="UNSUPPORTED_PROVIDER",
        message=f"No adapter is registered for {provider!r}",
        status_code=500,
    )
