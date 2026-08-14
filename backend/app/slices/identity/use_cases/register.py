from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.errors import AppError
from app.slices.audit import api as audit_api
from app.slices.identity import repository
from app.slices.identity.use_cases.tokens import TokenBundle, issue_tokens
from app.slices.tenancy import api as tenancy_api


async def register(
    session: AsyncSession,
    *,
    email: str,
    password: str,
    full_name: str,
    org_name: str,
) -> TokenBundle:
    normalized_email = email.strip().lower()

    try:
        user = await repository.insert_user(
            session,
            email=normalized_email,
            password_hash=security.hash_password(password),
            full_name=full_name.strip(),
        )
    except IntegrityError as exc:
        await session.rollback()
        raise AppError(
            code="EMAIL_TAKEN",
            message="Email already registered",
            status_code=400,
        ) from exc

    try:
        tenant = await tenancy_api.create_tenant(
            session, org_name=org_name.strip()
        )
        owner_role = await tenancy_api.get_role_by_name(session, "owner")
        if owner_role is None:
            raise AppError(
                code="ROLES_NOT_SEEDED",
                message="System roles are missing",
                status_code=500,
            )
        await tenancy_api.create_membership(
            session,
            user_id=user.id,
            workspace_id=tenant.workspace_id,
            role_id=owner_role.id,
        )
        user.last_workspace_id = tenant.workspace_id
        bundle = await issue_tokens(
            session,
            user_id=user.id,
            email=user.email,
            workspace_id=tenant.workspace_id,
        )
        await audit_api.record(
            session,
            action=audit_api.actions.REGISTER,
            workspace_id=tenant.workspace_id,
            actor_id=user.id,
            target_type="user",
            target_id=str(user.id),
            metadata={"organization_id": str(tenant.organization_id)},
        )
        await session.commit()
        return bundle
    except Exception:
        await session.rollback()
        raise
