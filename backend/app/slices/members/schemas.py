import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.shared import permissions as perms


_ALLOWED_INPUT_PERMISSIONS = frozenset({*perms.CATALOGUE, perms.FEATURES_READ})


def _permissions_subset_of_catalogue(value: list[str]) -> list[str]:
    """D3: a role's permissions must be a subset of the fixed catalogue.
    `*` is refused — only the system `owner` role may hold it. `features:read`
    is tolerated (but not required) in the input even though it is outside
    CATALOGUE: the server always adds it itself (see
    tenancy.api._with_implied_read), and the roles editor round-trips a
    role's GET response — which already includes it — back through PATCH."""
    invalid = sorted(set(value) - _ALLOWED_INPUT_PERMISSIONS)
    if invalid:
        raise ValueError(f"unknown permission(s): {', '.join(invalid)}")
    return value


class MemberAdd(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=8, max_length=200)
    role: str = Field(default="member", min_length=1, max_length=50)


class MemberRoleUpdate(BaseModel):
    role: str = Field(min_length=1, max_length=50)


class MemberOut(BaseModel):
    user_id: uuid.UUID
    email: str
    full_name: str
    role: str
    role_id: uuid.UUID
    joined_at: datetime


class RoleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    permissions: list[str]

    @field_validator("permissions")
    @classmethod
    def _validate_permissions(cls, value: list[str]) -> list[str]:
        return _permissions_subset_of_catalogue(value)


class RoleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    permissions: list[str] | None = None

    @field_validator("permissions")
    @classmethod
    def _validate_permissions(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        return _permissions_subset_of_catalogue(value)

    @model_validator(mode="after")
    def require_change(self) -> "RoleUpdate":
        if self.name is None and self.permissions is None:
            raise ValueError("supply name and/or permissions")
        return self
