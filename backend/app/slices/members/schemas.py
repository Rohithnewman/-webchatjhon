import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.shared import permissions as perms


def _permissions_subset_of_catalogue(value: list[str]) -> list[str]:
    """D3: a role's permissions must be a subset of the fixed catalogue.
    `*` and `features:read` are both outside CATALOGUE — `*` because only
    the system `owner` role may hold it, `features:read` because the server
    always adds it itself (see tenancy.api._with_implied_read)."""
    invalid = sorted(set(value) - set(perms.CATALOGUE))
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
