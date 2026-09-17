"""Published interface for the tenancy slice."""

import uuid
from dataclasses import dataclass
from datetime import date, datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.shared import permissions as perms
from app.slices.tenancy import repository
from app.slices.tenancy.models import Role
from app.slices.tenancy.seed import SYSTEM_ROLES


@dataclass(frozen=True)
class RoleView:
    id: uuid.UUID
    name: str
    permissions: tuple[str, ...]
    organization_id: uuid.UUID | None = None
    is_system: bool = False
    in_use: int = 0


def _role_view(role: Role, in_use: int = 0) -> RoleView:
    return RoleView(
        id=role.id,
        name=role.name,
        permissions=tuple(role.permissions),
        organization_id=role.organization_id,
        is_system=role.is_system,
        in_use=in_use,
    )


@dataclass(frozen=True)
class MembershipView:
    membership_id: uuid.UUID
    workspace_id: uuid.UUID
    role_id: uuid.UUID
    role_name: str
    permissions: tuple[str, ...]


@dataclass(frozen=True)
class TenantCreated:
    organization_id: uuid.UUID
    workspace_id: uuid.UUID


async def seed_system_roles(session: AsyncSession) -> None:
    await repository.seed_roles(session, SYSTEM_ROLES)


async def get_role_by_name(session: AsyncSession, name: str) -> RoleView | None:
    role = await repository.select_role_by_name(session, name)
    if role is None:
        return None
    return _role_view(role)


async def list_roles(session: AsyncSession, *, organization_id: uuid.UUID) -> list[RoleView]:
    """The system roles plus this organisation's own roles, each with its
    `in_use` membership count within this organisation."""
    rows = await repository.list_roles_for_organization(session, organization_id=organization_id)
    return [_role_view(role, in_use) for role, in_use in rows]


def _with_implied_read(permission_list: list[str]) -> list[str]:
    """features:read is implied for every role (D3) — the server always
    includes it, regardless of what the caller submitted."""
    if perms.FEATURES_READ in permission_list:
        return list(permission_list)
    return [*permission_list, perms.FEATURES_READ]


async def create_role(
    session: AsyncSession, *, organization_id: uuid.UUID, name: str, permissions: list[str]
) -> RoleView:
    try:
        role = await repository.insert_role(
            session,
            organization_id=organization_id,
            name=name,
            permissions=_with_implied_read(permissions),
        )
    except IntegrityError as exc:
        await session.rollback()
        raise AppError(
            code="ROLE_NAME_TAKEN",
            message=f"A role named '{name}' already exists in this organisation",
            status_code=409,
        ) from exc
    return _role_view(role)


async def update_role(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID,
    role_id: uuid.UUID,
    name: str | None = None,
    permissions: list[str] | None = None,
) -> RoleView | None:
    """Returns None when the role does not exist or belongs to a different
    organisation (the router renders that as 404). Raises AppError
    (403 SYSTEM_ROLE) for one of the four system roles."""
    role = await repository.select_role_for_organization(
        session, organization_id=organization_id, role_id=role_id
    )
    if role is None:
        return None
    if role.is_system:
        raise AppError(code="SYSTEM_ROLE", message="System roles cannot be changed", status_code=403)
    new_permissions = _with_implied_read(permissions) if permissions is not None else None
    try:
        role = await repository.update_role(session, role=role, name=name, permissions=new_permissions)
    except IntegrityError as exc:
        await session.rollback()
        raise AppError(
            code="ROLE_NAME_TAKEN",
            message=f"A role named '{name}' already exists in this organisation",
            status_code=409,
        ) from exc
    return _role_view(role)


async def delete_role(
    session: AsyncSession, *, organization_id: uuid.UUID, role_id: uuid.UUID
) -> RoleView | None:
    """Returns the deleted role's view, or None if it does not exist or
    belongs to a different organisation (404). Raises AppError for a system
    role (403 SYSTEM_ROLE) or a role still assigned to a member (409
    ROLE_IN_USE).

    The role row is locked FOR UPDATE before the membership count: Postgres
    takes a matching key-share lock on it for every concurrent INSERT into
    memberships that references it via the role_id foreign key, so this
    blocks a concurrent add-member from landing between the count and the
    delete. The delete is also wrapped so a FK violation that slips through
    anyway (belt and suspenders) still comes back as ROLE_IN_USE, not 500."""
    role = await repository.select_role_for_organization(
        session, organization_id=organization_id, role_id=role_id, for_update=True
    )
    if role is None:
        return None
    if role.is_system:
        raise AppError(code="SYSTEM_ROLE", message="System roles cannot be deleted", status_code=403)
    in_use = await repository.count_memberships_with_role(session, role_id=role.id)
    if in_use > 0:
        raise AppError(
            code="ROLE_IN_USE",
            message="This role is assigned to one or more members and cannot be deleted",
            status_code=409,
        )
    view = _role_view(role)
    try:
        await repository.delete_role(session, role=role)
    except IntegrityError as exc:
        await session.rollback()
        raise AppError(
            code="ROLE_IN_USE",
            message="This role is assigned to one or more members and cannot be deleted",
            status_code=409,
        ) from exc
    return view


async def resolve_role(
    session: AsyncSession, *, organization_id: uuid.UUID, name: str
) -> RoleView | None:
    """The organisation's own role by this name, else the matching system
    role — used to assign a role to a member by name (D3: organisation
    roles first, then system roles)."""
    role = await repository.select_role_by_name_for_organization(
        session, organization_id=organization_id, name=name
    )
    if role is None:
        role = await repository.select_role_by_name(session, name)
    if role is None:
        return None
    return _role_view(role)


async def create_tenant(
    session: AsyncSession, *, org_name: str, workspace_name: str = "Default"
) -> TenantCreated:
    organization = await repository.insert_organization(session, name=org_name)
    workspace = await repository.insert_workspace(
        session, organization_id=organization.id, name=workspace_name
    )
    return TenantCreated(
        organization_id=organization.id, workspace_id=workspace.id
    )


async def create_membership(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    workspace_id: uuid.UUID,
    role_id: uuid.UUID,
) -> uuid.UUID:
    membership = await repository.insert_membership(
        session, user_id=user_id, workspace_id=workspace_id, role_id=role_id
    )
    return membership.id


async def get_active_membership(
    session: AsyncSession, *, user_id: uuid.UUID, workspace_id: uuid.UUID
) -> MembershipView | None:
    found = await repository.select_active_membership_with_role(
        session, user_id=user_id, workspace_id=workspace_id
    )
    if found is None:
        return None
    membership, role = found
    return MembershipView(
        membership_id=membership.id,
        workspace_id=membership.workspace_id,
        role_id=role.id,
        role_name=role.name,
        permissions=tuple(role.permissions),
    )


async def get_earliest_workspace_id(
    session: AsyncSession, *, user_id: uuid.UUID
) -> uuid.UUID | None:
    return await repository.select_earliest_workspace_id(session, user_id=user_id)


@dataclass(frozen=True)
class WorkspaceView:
    id: uuid.UUID
    name: str
    organization_name: str
    organization_id: uuid.UUID


@dataclass(frozen=True)
class MemberRow:
    user_id: uuid.UUID
    role_id: uuid.UUID
    role_name: str
    joined_at: datetime


async def get_workspace(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> WorkspaceView | None:
    found = await repository.select_workspace_with_organization(
        session, workspace_id=workspace_id
    )
    if found is None:
        return None
    workspace, organization = found
    return WorkspaceView(
        id=workspace.id,
        name=workspace.name,
        organization_name=organization.name,
        organization_id=organization.id,
    )


async def list_memberships(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> list[MemberRow]:
    rows = await repository.list_memberships_with_roles(session, workspace_id=workspace_id)
    return [
        MemberRow(
            user_id=membership.user_id,
            role_id=role.id,
            role_name=role.name,
            joined_at=membership.created_at,
        )
        for membership, role in rows
    ]


async def set_membership_role(
    session: AsyncSession, *, workspace_id: uuid.UUID, user_id: uuid.UUID, role_id: uuid.UUID
) -> bool:
    membership = await repository.select_membership(
        session, workspace_id=workspace_id, user_id=user_id
    )
    if membership is None:
        return False
    membership.role_id = role_id
    await session.flush()
    return True


async def remove_membership(
    session: AsyncSession, *, workspace_id: uuid.UUID, user_id: uuid.UUID
) -> bool:
    membership = await repository.select_membership(
        session, workspace_id=workspace_id, user_id=user_id
    )
    if membership is None:
        return False
    await repository.soft_delete_membership(session, membership=membership)
    return True


async def remove_all_memberships(session: AsyncSession, *, user_id: uuid.UUID) -> int:
    """Soft-delete every active membership of the user, across every
    workspace. Used when promoting a superadmin (D1: no tenancy) — the
    account must carry no organisation, no workspace, no membership."""
    return await repository.soft_delete_all_memberships_for_user(
        session, user_id=user_id
    )


PLANS = ("free", "pro", "enterprise")

SUBSCRIPTION_STATUSES = ("active", "suspended")

PLAN_LIMITS: dict[str, dict[str, int | None]] = {
    "free": {"seats": 5, "chatbots": 3, "conversations": 200},
    "pro": {"seats": 25, "chatbots": 25, "conversations": 5000},
    "enterprise": {"seats": None, "chatbots": None, "conversations": None},  # None = unlimited
}

# The three limit keys, in the order every override/effective/overridden
# dict below lists them.
LIMIT_KEYS = ("seats", "chatbots", "conversations")


def effective_limits(plan: str, overrides: dict[str, int | None]) -> dict[str, int | None]:
    """Effective value per limit key: the override when set (not None), else
    the plan default. `overrides` may be a partial mapping — a missing key
    is treated the same as an unset (None) override."""
    defaults = PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])
    return {
        key: overrides.get(key) if overrides.get(key) is not None else defaults[key]
        for key in LIMIT_KEYS
    }


@dataclass(frozen=True)
class SubscriptionView:
    plan: str
    status: str  # stored: active | suspended
    effective_status: str  # active | suspended | expired
    starts_at: date
    ends_at: date | None
    seat_limit: int | None  # effective: override if set, else the plan default
    chatbot_limit: int | None
    conversation_limit: int | None
    seats_used: int  # distinct active members across the org's live workspaces
    limits_overridden: dict[str, bool]  # {"seats": ..., "chatbots": ..., "conversations": ...}
    chatbots_used: int = 0  # live chatbots across the org's workspaces; filled in by the caller
    conversations_used: int = 0  # conversations started this calendar month; filled in by the caller


def effective_status(status: str, ends_at: date | None, today: date | None = None) -> str:
    """"expired" if `ends_at` has passed, else the stored status."""
    if ends_at is not None and ends_at < (today or date.today()):
        return "expired"
    return status


def _subscription_view(organization, seats_used: int) -> SubscriptionView:
    overrides = {
        "seats": organization.seat_limit,
        "chatbots": organization.chatbot_limit,
        "conversations": organization.conversation_limit,
    }
    limits = effective_limits(organization.plan, overrides)
    return SubscriptionView(
        plan=organization.plan,
        status=organization.subscription_status,
        effective_status=effective_status(
            organization.subscription_status, organization.subscription_ends_at
        ),
        starts_at=organization.subscription_starts_at,
        ends_at=organization.subscription_ends_at,
        seat_limit=limits["seats"],
        chatbot_limit=limits["chatbots"],
        conversation_limit=limits["conversations"],
        seats_used=seats_used,
        limits_overridden={key: overrides[key] is not None for key in LIMIT_KEYS},
    )


def subscription_dict(
    sub: SubscriptionView, *, chatbots_used: int | None = None, conversations_used: int | None = None
) -> dict:
    return {
        "plan": sub.plan,
        "status": sub.status,
        "effective_status": sub.effective_status,
        "starts_at": sub.starts_at.isoformat(),
        "ends_at": sub.ends_at.isoformat() if sub.ends_at is not None else None,
        "seat_limit": sub.seat_limit,
        "chatbot_limit": sub.chatbot_limit,
        "conversation_limit": sub.conversation_limit,
        "seats_used": sub.seats_used,
        "chatbots_used": sub.chatbots_used if chatbots_used is None else chatbots_used,
        "conversations_used": sub.conversations_used if conversations_used is None else conversations_used,
        "limits_overridden": dict(sub.limits_overridden),
    }


def current_month_start(now: datetime | None = None) -> datetime:
    """First day of the current calendar month, 00:00 UTC — the rolling
    window for the monthly conversation limit and its usage counts."""
    moment = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    return moment.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


async def get_subscription(
    session: AsyncSession, *, organization_id: uuid.UUID
) -> SubscriptionView | None:
    organization = await repository.select_organization(session, organization_id=organization_id)
    if organization is None:
        return None
    seats_used = await repository.count_org_seats(session, organization_id=organization_id)
    return _subscription_view(organization, seats_used)


async def get_subscription_for_workspace(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> SubscriptionView | None:
    found = await repository.select_workspace_with_organization(session, workspace_id=workspace_id)
    if found is None:
        return None
    _, organization = found
    seats_used = await repository.count_org_seats(session, organization_id=organization.id)
    return _subscription_view(organization, seats_used)


async def get_subscription_status_for_workspace(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> str | None:
    """`effective_status` only, via a single workspace-joined-to-organization
    query with no membership/seat counting — for the request guard
    (`authz.get_workspace_context`) and the widget lock check, which run on
    nearly every request and only ever need this one field."""
    row = await repository.select_subscription_status_for_workspace(session, workspace_id=workspace_id)
    if row is None:
        return None
    status, ends_at = row
    return effective_status(status, ends_at)


async def get_conversation_cap_for_workspace(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> tuple[uuid.UUID, str, int | None] | None:
    """`(organization_id, plan, effective conversation_limit)` — via a
    single workspace-joined-to-organization query with no seat counting —
    for the monthly conversation cap check on the widget's public start
    path, which only ever needs these three values."""
    row = await repository.select_conversation_cap_for_workspace(session, workspace_id=workspace_id)
    if row is None:
        return None
    organization_id, plan, conversation_limit = row
    limit = effective_limits(plan, {"conversations": conversation_limit})["conversations"]
    return organization_id, plan, limit


_UNSET = object()


async def set_subscription(
    session: AsyncSession,
    *,
    organization_id: uuid.UUID,
    plan: str | None = None,
    status: str | None = None,
    starts_at: date | None = None,
    ends_at: date | None = _UNSET,  # type: ignore[assignment]
    seat_limit: int | None = _UNSET,  # type: ignore[assignment]
    chatbot_limit: int | None = _UNSET,  # type: ignore[assignment]
    conversation_limit: int | None = _UNSET,  # type: ignore[assignment]
) -> SubscriptionView | None:
    """`ends_at`, `seat_limit`, `chatbot_limit` and `conversation_limit` each
    default to a private sentinel (not exposed to callers) so "leave
    unchanged" (the kwarg omitted) and "clear it / go back to the plan
    default" (pass the kwarg as `None`) are distinguishable — the router
    only passes one of these at all when the caller's request body
    explicitly set that key."""
    organization = await repository.select_organization(session, organization_id=organization_id, for_update=True)
    if organization is None:
        return None
    if plan is not None and plan not in PLANS:
        raise AppError(
            code="INVALID_SUBSCRIPTION", message=f"plan must be one of {', '.join(PLANS)}", status_code=400
        )
    if status is not None and status not in SUBSCRIPTION_STATUSES:
        raise AppError(
            code="INVALID_SUBSCRIPTION",
            message=f"status must be one of {', '.join(SUBSCRIPTION_STATUSES)}",
            status_code=400,
        )
    for value, label in (
        (seat_limit, "seat_limit"),
        (chatbot_limit, "chatbot_limit"),
        (conversation_limit, "conversation_limit"),
    ):
        if value is not _UNSET and value is not None and value < 0:
            raise AppError(
                code="INVALID_SUBSCRIPTION", message=f"{label} must be >= 0", status_code=400
            )
    new_starts_at = starts_at if starts_at is not None else organization.subscription_starts_at
    new_ends_at = organization.subscription_ends_at if ends_at is _UNSET else ends_at
    if new_ends_at is not None and new_ends_at < new_starts_at:
        raise AppError(
            code="INVALID_SUBSCRIPTION", message="ends_at must not be before starts_at", status_code=400
        )
    if plan is not None:
        organization.plan = plan
    if status is not None:
        organization.subscription_status = status
    if starts_at is not None:
        organization.subscription_starts_at = starts_at
    if ends_at is not _UNSET:
        organization.subscription_ends_at = ends_at
    if seat_limit is not _UNSET:
        organization.seat_limit = seat_limit
    if chatbot_limit is not _UNSET:
        organization.chatbot_limit = chatbot_limit
    if conversation_limit is not _UNSET:
        organization.conversation_limit = conversation_limit
    await session.flush()
    seats_used = await repository.count_org_seats(session, organization_id=organization_id)
    return _subscription_view(organization, seats_used)


async def count_org_seats(session: AsyncSession, *, organization_id: uuid.UUID) -> int:
    return await repository.count_org_seats(session, organization_id=organization_id)


async def list_org_workspace_ids(session: AsyncSession, *, organization_id: uuid.UUID) -> list[uuid.UUID]:
    return await repository.list_org_workspace_ids(session, organization_id=organization_id)


@dataclass(frozen=True)
class OrganizationSummary:
    id: uuid.UUID
    name: str
    plan: str
    created_at: datetime
    workspace_count: int
    member_count: int
    subscription: SubscriptionView


def _organization_summary(organization, workspace_count: int, member_count: int) -> OrganizationSummary:
    return OrganizationSummary(
        id=organization.id,
        name=organization.name,
        plan=organization.plan,
        created_at=organization.created_at,
        workspace_count=workspace_count,
        member_count=member_count,
        # `member_count` is already "distinct users across the org's live
        # workspaces" (see list_organizations_with_counts), i.e. exactly the
        # seat count — reuse it instead of a second query.
        subscription=_subscription_view(organization, member_count),
    )


async def platform_list_organizations(session: AsyncSession) -> list[OrganizationSummary]:
    """Superadmin only: every organisation with its workspace and member counts."""
    return [
        _organization_summary(organization, workspaces, members)
        for organization, workspaces, members in await repository.list_organizations_with_counts(session)
    ]


async def get_organization_summary(
    session: AsyncSession, *, organization_id: uuid.UUID
) -> OrganizationSummary | None:
    rows = await repository.list_organizations_with_counts(session)
    return next(
        (
            _organization_summary(org, workspaces, members)
            for org, workspaces, members in rows
            if org.id == organization_id
        ),
        None,
    )


async def count_locked_organizations(session: AsyncSession) -> int:
    """Superadmin only: organisations whose effective subscription status is
    not "active" (suspended or expired)."""
    summaries = await platform_list_organizations(session)
    return sum(1 for summary in summaries if summary.subscription.effective_status != "active")


async def set_organization_plan(
    session: AsyncSession, *, organization_id: uuid.UUID, plan: str
) -> OrganizationSummary | None:
    sub = await set_subscription(session, organization_id=organization_id, plan=plan)
    if sub is None:
        return None
    return await get_organization_summary(session, organization_id=organization_id)


async def platform_counts(session: AsyncSession) -> dict[str, int]:
    organizations, workspaces = await repository.count_organizations_and_workspaces(session)
    return {"organizations": organizations, "workspaces": workspaces}


async def platform_user_organizations(session: AsyncSession) -> dict[uuid.UUID, list[str]]:
    out: dict[uuid.UUID, list[str]] = {}
    for user_id, name in await repository.list_user_organization_names(session):
        out.setdefault(user_id, []).append(name)
    return out


@dataclass(frozen=True)
class OrganizationView:
    id: uuid.UUID
    name: str
    plan: str


@dataclass(frozen=True)
class WorkspaceSummary:
    id: uuid.UUID
    name: str
    member_count: int
    created_at: datetime


@dataclass(frozen=True)
class UserWorkspace:
    workspace_id: uuid.UUID
    workspace_name: str
    organization_id: uuid.UUID
    organization_name: str
    role_name: str


async def get_organization_of_workspace(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> OrganizationView | None:
    found = await repository.select_workspace_with_organization(session, workspace_id=workspace_id)
    if found is None:
        return None
    _, organization = found
    return OrganizationView(id=organization.id, name=organization.name, plan=organization.plan)


async def list_workspaces(session: AsyncSession, *, organization_id: uuid.UUID) -> list[WorkspaceSummary]:
    return [
        WorkspaceSummary(id=w.id, name=w.name, member_count=n, created_at=w.created_at)
        for w, n in await repository.list_workspaces_with_member_counts(session, organization_id=organization_id)
    ]


async def create_workspace(session: AsyncSession, *, organization_id: uuid.UUID, name: str) -> WorkspaceSummary:
    workspace = await repository.insert_workspace(session, organization_id=organization_id, name=name.strip())
    if workspace.created_at is None:
        # created_at is a server default; insert_workspace only flushes, so on
        # some drivers/configurations the server-generated value isn't loaded
        # back onto the ORM object yet. Refresh to pick it up.
        await session.refresh(workspace)
    return WorkspaceSummary(id=workspace.id, name=workspace.name, member_count=0, created_at=workspace.created_at)


async def rename_organization(
    session: AsyncSession, *, organization_id: uuid.UUID, name: str
) -> OrganizationView | None:
    organization = await repository.select_organization(session, organization_id=organization_id, for_update=True)
    if organization is None:
        return None
    organization.name = name.strip()
    await session.flush()
    return OrganizationView(id=organization.id, name=organization.name, plan=organization.plan)


async def rename_workspace(
    session: AsyncSession, *, organization_id: uuid.UUID, workspace_id: uuid.UUID, name: str
) -> WorkspaceSummary | None:
    workspace = await repository.select_workspace(session, workspace_id=workspace_id, for_update=True)
    if workspace is None or workspace.organization_id != organization_id:
        return None
    workspace.name = name.strip()
    await session.flush()
    rows = await repository.list_workspaces_with_member_counts(session, organization_id=organization_id)
    return next(
        WorkspaceSummary(id=w.id, name=w.name, member_count=n, created_at=w.created_at)
        for w, n in rows
        if w.id == workspace_id
    )


async def list_user_workspaces(session: AsyncSession, *, user_id: uuid.UUID) -> list[UserWorkspace]:
    return [
        UserWorkspace(
            workspace_id=workspace.id,
            workspace_name=workspace.name,
            organization_id=organization.id,
            organization_name=organization.name,
            role_name=role.name,
        )
        for workspace, organization, role in await repository.list_user_workspaces(session, user_id=user_id)
    ]
