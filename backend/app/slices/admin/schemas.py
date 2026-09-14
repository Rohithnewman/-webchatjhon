from typing import Literal

from pydantic import BaseModel, model_validator


class PlanUpdate(BaseModel):
    plan: Literal["free", "pro", "enterprise"]


class UserFlagsUpdate(BaseModel):
    is_active: bool | None = None
    is_superadmin: bool | None = None

    @model_validator(mode="after")
    def require_change(self) -> "UserFlagsUpdate":
        if self.is_active is None and self.is_superadmin is None:
            raise ValueError("supply is_active and/or is_superadmin")
        return self
