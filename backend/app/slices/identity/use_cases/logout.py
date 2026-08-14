from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.slices.audit import api as audit_api
from app.slices.identity import repository


async def logout(session: AsyncSession, *, refresh_token: str) -> None:
    stored = await repository.select_refresh_token(
        session,
        token_hash=security.sha256(refresh_token),
        for_update=True,
    )
    if stored is not None and stored.revoked_at is None:
        await repository.revoke_refresh_token(session, token=stored)
        await audit_api.record(
            session,
            action=audit_api.actions.LOGOUT,
            workspace_id=stored.workspace_id,
            actor_id=stored.user_id,
        )
    await session.commit()
