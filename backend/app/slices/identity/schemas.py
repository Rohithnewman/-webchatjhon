import uuid
from typing import Annotated

from pydantic import AfterValidator, BaseModel, EmailStr, Field

MAX_PASSWORD_BYTES = 72


def _reject_beyond_bcrypt_limit(value: str) -> str:
    if len(value.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ValueError("password must be at most 72 bytes when UTF-8 encoded")
    return value


Password = Annotated[
    str, Field(min_length=8), AfterValidator(_reject_beyond_bcrypt_limit)
]
LoginPassword = Annotated[str, AfterValidator(_reject_beyond_bcrypt_limit)]


class RegisterIn(BaseModel):
    email: EmailStr
    password: Password
    full_name: str = Field(min_length=1, max_length=200)
    org_name: str = Field(min_length=1, max_length=200)


class LoginIn(BaseModel):
    email: EmailStr
    password: LoginPassword


class RefreshIn(BaseModel):
    refresh_token: str = Field(min_length=1)


class LogoutIn(BaseModel):
    refresh_token: str = Field(min_length=1)


class SwitchWorkspaceIn(BaseModel):
    workspace_id: uuid.UUID
    refresh_token: str = Field(min_length=1)
