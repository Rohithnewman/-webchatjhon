"""Compose slice-owned models into the metadata used by Alembic."""

from app.core.database import Base
from app.slices.audit import models as _audit_models  # noqa: F401
from app.slices.chatbots import models as _chatbot_models  # noqa: F401
from app.slices.identity import models as _identity_models  # noqa: F401
from app.slices.jobs import models as _job_models  # noqa: F401
from app.slices.tenancy import models as _tenancy_models  # noqa: F401
from app.slices.providers import models as _provider_models  # noqa: F401
from app.slices.knowledge import models as _knowledge_models  # noqa: F401

metadata = Base.metadata

__all__ = ["metadata"]
