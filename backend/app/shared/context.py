import uuid
from dataclasses import dataclass


@dataclass(frozen=True)
class Principal:
    user_id: uuid.UUID
    email: str
    workspace_id: uuid.UUID | None  # None for a superadmin (D1: no tenancy)


@dataclass(frozen=True)
class WorkspaceContext:
    user_id: uuid.UUID
    email: str
    workspace_id: uuid.UUID
    role: str
    permissions: tuple[str, ...]
