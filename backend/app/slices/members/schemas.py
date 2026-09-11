import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

RoleName = Literal["owner", "admin", "member", "viewer"]


class MemberAdd(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=8, max_length=200)
    role: RoleName = "member"


class MemberRoleUpdate(BaseModel):
    role: RoleName


class MemberOut(BaseModel):
    user_id: uuid.UUID
    email: str
    full_name: str
    role: str
    joined_at: datetime
