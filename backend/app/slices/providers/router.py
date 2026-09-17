import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.envelope import success
from app.shared import permissions
from app.shared.context import WorkspaceContext
from app.slices.audit import api as audit_api
from app.slices.authz import api as authz_api
from app.slices.providers import api as providers_api
from app.slices.providers.schemas import CredentialCreate, CredentialOut

router = APIRouter(prefix="/api/v1/provider-credentials", tags=["providers"])

read_context = authz_api.require_permission(permissions.FEATURES_READ)
write_context = authz_api.require_permission(permissions.KNOWLEDGE_MANAGE)


def _serialize(view: providers_api.CredentialView) -> dict:
    return CredentialOut(
        id=view.id,
        provider=view.provider,
        label=view.label,
        key_last_four=view.key_last_four,
        base_url=view.base_url,
        is_default=view.is_default,
    ).model_dump(mode="json")


@router.get("")
async def list_credentials(
    ctx: WorkspaceContext = Depends(read_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    views = await providers_api.list_credentials(session, workspace_id=ctx.workspace_id)
    return success([_serialize(view) for view in views])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_credential(
    body: CredentialCreate,
    ctx: WorkspaceContext = Depends(write_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    view = await providers_api.store_credential(
        session,
        workspace_id=ctx.workspace_id,
        provider=body.provider,
        api_key=body.api_key,
        label=body.label,
        base_url=body.base_url,
        make_default=body.make_default,
    )
    await audit_api.record(
        session,
        action=audit_api.actions.CREDENTIAL_STORED,
        workspace_id=ctx.workspace_id,
        actor_id=ctx.user_id,
        target_type="provider_credential",
        target_id=str(view.id),
        metadata={"provider": view.provider, "label": view.label},
    )
    await session.commit()
    return success(_serialize(view))


@router.delete("/{credential_id}")
async def delete_credential(
    credential_id: uuid.UUID,
    ctx: WorkspaceContext = Depends(write_context),
    session: AsyncSession = Depends(get_session),
) -> dict:
    deleted = await providers_api.delete_credential(
        session, workspace_id=ctx.workspace_id, credential_id=credential_id
    )
    if not deleted:
        from app.core.errors import AppError

        raise AppError(code="NOT_FOUND", message="Credential not found", status_code=404)
    await audit_api.record(
        session,
        action=audit_api.actions.CREDENTIAL_DELETED,
        workspace_id=ctx.workspace_id,
        actor_id=ctx.user_id,
        target_type="provider_credential",
        target_id=str(credential_id),
    )
    await session.commit()
    return success({"deleted": True})
