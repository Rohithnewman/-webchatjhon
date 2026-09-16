from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.errors import AppError
from app.slices.audit import api as audit_api
from app.slices.identity import repository
from app.slices.identity.use_cases.tokens import TokenBundle, issue_tokens
from app.slices.tenancy import api as tenancy_api


def _invalid_refresh(message: str = "Invalid refresh token") -> AppError:
    return AppError(code="INVALID_REFRESH", message=message, status_code=401)


def _claims_match(payload: dict, stored) -> bool:
    stored_workspace_id = (
        str(stored.workspace_id) if stored.workspace_id is not None else None
    )
    return (
        payload.get("sub") == str(stored.user_id)
        and payload.get("workspace_id") == stored_workspace_id
        and payload.get("family_id") == str(stored.family_id)
    )


async def refresh(session: AsyncSession, *, refresh_token: str) -> TokenBundle:
    try:
        payload = security.decode_token(refresh_token, expected_type="refresh")
    except security.TokenError as exc:
        raise _invalid_refresh() from exc

    stored = await repository.select_refresh_token(
        session,
        token_hash=security.sha256(refresh_token),
        for_update=True,
    )
    if stored is None or not _claims_match(payload, stored):
        raise _invalid_refresh()
    if stored.revoked_at is not None:
        await repository.revoke_refresh_family(session, family_id=stored.family_id)
        await audit_api.record(
            session,
            action=audit_api.actions.REFRESH_REUSE_DETECTED,
            workspace_id=stored.workspace_id,
            actor_id=stored.user_id,
            metadata={"family_id": str(stored.family_id)},
        )
        await session.commit()
        raise _invalid_refresh("Refresh token reuse detected")
    if stored.expires_at <= datetime.now(timezone.utc):
        raise _invalid_refresh("Refresh token expired")

    user = await repository.select_user(session, stored.user_id)
    if user is None or not user.is_active:
        raise _invalid_refresh()
    if stored.workspace_id is not None:
        membership = await tenancy_api.get_active_membership(
            session, user_id=user.id, workspace_id=stored.workspace_id
        )
        if membership is None:
            raise AppError(
                code="FORBIDDEN",
                message="No active membership for that workspace",
                status_code=403,
            )

    await repository.revoke_refresh_token(session, token=stored)
    bundle = await issue_tokens(
        session,
        user_id=user.id,
        email=user.email,
        workspace_id=stored.workspace_id,
        family_id=stored.family_id,
    )
    await audit_api.record(
        session,
        action=audit_api.actions.REFRESH,
        workspace_id=stored.workspace_id,
        actor_id=user.id,
    )
    await session.commit()
    return bundle
