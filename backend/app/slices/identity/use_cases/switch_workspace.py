import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.errors import AppError
from app.slices.audit import api as audit_api
from app.slices.identity import repository
from app.slices.identity.use_cases.refresh import _claims_match, _invalid_refresh
from app.slices.identity.use_cases.tokens import TokenBundle, issue_tokens
from app.slices.tenancy import api as tenancy_api


async def switch_workspace(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    current_workspace_id: uuid.UUID,
    refresh_token: str,
    target_workspace_id: uuid.UUID,
) -> TokenBundle:
    try:
        payload = security.decode_token(refresh_token, expected_type="refresh")
    except security.TokenError as exc:
        raise _invalid_refresh() from exc
    stored = await repository.select_refresh_token(
        session,
        token_hash=security.sha256(refresh_token),
        for_update=True,
    )
    if (
        stored is None
        or not _claims_match(payload, stored)
        or stored.user_id != user_id
        or stored.workspace_id != current_workspace_id
        or stored.revoked_at is not None
        or stored.expires_at <= datetime.now(timezone.utc)
    ):
        raise _invalid_refresh()

    membership = await tenancy_api.get_active_membership(
        session, user_id=user_id, workspace_id=target_workspace_id
    )
    if membership is None:
        raise AppError(
            code="FORBIDDEN",
            message="Not a member of that workspace",
            status_code=403,
        )
    user = await repository.select_user(session, user_id, for_update=True)
    if user is None or not user.is_active:
        raise AppError(
            code="UNAUTHENTICATED", message="User is not active", status_code=401
        )

    await repository.revoke_refresh_family(session, family_id=stored.family_id)
    user.last_workspace_id = target_workspace_id
    bundle = await issue_tokens(
        session,
        user_id=user.id,
        email=user.email,
        workspace_id=target_workspace_id,
    )
    await audit_api.record(
        session,
        action=audit_api.actions.SWITCH_WORKSPACE,
        workspace_id=target_workspace_id,
        actor_id=user.id,
        metadata={"from_workspace_id": str(current_workspace_id)},
    )
    await session.commit()
    return bundle
