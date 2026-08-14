"""Published FastAPI authorization dependencies."""

from app.slices.authz.dependencies import get_workspace_context, require_permission

__all__ = ["get_workspace_context", "require_permission"]
