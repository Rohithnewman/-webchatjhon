from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    plan: Literal["free", "pro", "enterprise"] = "free"
    workspace_name: str = Field(default="Default", min_length=1, max_length=200)


class SubscriptionUpdate(BaseModel):
    plan: Literal["free", "pro", "enterprise"] | None = None
    status: Literal["active", "suspended"] | None = None
    starts_at: date | None = None
    ends_at: date | None = None  # explicit null clears the expiry, but only when the key is present
    # D2: limit overrides. Explicit null restores the plan default; omitted
    # (not in model_fields_set) leaves the override unchanged.
    seat_limit: int | None = Field(default=None, ge=0)
    chatbot_limit: int | None = Field(default=None, ge=0)
    conversation_limit: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def require_change(self) -> "SubscriptionUpdate":
        if not self.model_fields_set:
            raise ValueError(
                "supply at least one of plan, status, starts_at, ends_at, "
                "seat_limit, chatbot_limit, conversation_limit"
            )
        return self


class UserFlagsUpdate(BaseModel):
    is_active: bool | None = None
    is_superadmin: bool | None = None

    @model_validator(mode="after")
    def require_change(self) -> "UserFlagsUpdate":
        if self.is_active is None and self.is_superadmin is None:
            raise ValueError("supply is_active and/or is_superadmin")
        return self


class UserPasswordReset(BaseModel):
    password: str = Field(min_length=8, max_length=128)
