from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.config import settings
from app.core.errors import AppError
from app.slices.audit import api as audit_api
from app.slices.identity import repository
from app.slices.identity.models import User
from app.slices.identity.use_cases.tokens import TokenBundle, issue_tokens
from app.slices.tenancy import api as tenancy_api


def _invalid_credentials() -> AppError:
    return AppError(
        code="INVALID_CREDENTIALS",
        message="Invalid email or password",
        status_code=401,
    )


async def _record_failure(
    session: AsyncSession, *, user: User | None, now: datetime
) -> None:
    if user is None:
        await audit_api.record(session, action=audit_api.actions.LOGIN_FAILED)
        return
    user.failed_login_count += 1
    locked = user.failed_login_count >= settings.LOGIN_MAX_FAILURES
    if locked:
        user.locked_until = now + timedelta(minutes=settings.LOCKOUT_MINUTES)
    await audit_api.record(
        session,
        action=(
            audit_api.actions.ACCOUNT_LOCKED
            if locked
            else audit_api.actions.LOGIN_FAILED
        ),
        workspace_id=user.last_workspace_id,
        actor_id=user.id,
        metadata={"failed_login_count": user.failed_login_count},
    )


async def login(session: AsyncSession, *, email: str, password: str) -> TokenBundle:
    normalized_email = email.strip().lower()
    user = await repository.select_user_by_email(
        session, normalized_email, for_update=True
    )
    now = datetime.now(timezone.utc)

    if user is not None and user.locked_until is not None and user.locked_until > now:
        raise AppError(
            code="ACCOUNT_LOCKED",
            message="Account is temporarily locked. Try again later.",
            status_code=423,
        )

    password_ok = security.verify_password(
        password,
        user.password_hash if user is not None else security.DUMMY_PASSWORD_HASH,
    )
    if user is None or not password_ok or not user.is_active:
        await _record_failure(session, user=user, now=now)
        await session.commit()
        raise _invalid_credentials()

    if user.is_superadmin:
        # D1: a superadmin has no tenancy — issue a token with no workspace,
        # ignoring any memberships (the bootstrap script detaches them, but
        # this skips the resolution entirely regardless).
        user.failed_login_count = 0
        user.locked_until = None
        bundle = await issue_tokens(
            session, user_id=user.id, email=user.email, workspace_id=None
        )
        await audit_api.record(
            session,
            action=audit_api.actions.LOGIN,
            workspace_id=None,
            actor_id=user.id,
        )
        await session.commit()
        return bundle

    workspace_id = user.last_workspace_id
    if workspace_id is None:
        workspace_id = await tenancy_api.get_earliest_workspace_id(
            session, user_id=user.id
        )
    if workspace_id is None:
        raise AppError(
            code="NO_WORKSPACE",
            message="User has no workspace access",
            status_code=403,
        )
    membership = await tenancy_api.get_active_membership(
        session, user_id=user.id, workspace_id=workspace_id
    )
    if membership is None:
        raise AppError(
            code="NO_WORKSPACE",
            message="User has no workspace access",
            status_code=403,
        )

    user.failed_login_count = 0
    user.locked_until = None
    user.last_workspace_id = workspace_id
    bundle = await issue_tokens(
        session, user_id=user.id, email=user.email, workspace_id=workspace_id
    )
    await audit_api.record(
        session,
        action=audit_api.actions.LOGIN,
        workspace_id=workspace_id,
        actor_id=user.id,
    )
    await session.commit()
    return bundle
