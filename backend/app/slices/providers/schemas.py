import uuid

from pydantic import BaseModel, Field, model_validator

from app.slices.providers.models import SUPPORTED_PROVIDERS


class CredentialCreate(BaseModel):
    provider: str = Field(min_length=1, max_length=30)
    api_key: str = Field(default="", max_length=2000)
    label: str = Field(default="", max_length=120)
    base_url: str | None = Field(default=None, max_length=300)
    make_default: bool = True

    @model_validator(mode="after")
    def validate_provider(self) -> "CredentialCreate":
        if self.provider not in SUPPORTED_PROVIDERS:
            raise ValueError("unsupported provider")
        if self.provider != "ollama" and not self.api_key:
            raise ValueError("api_key is required for this provider")
        return self


class CredentialOut(BaseModel):
    id: uuid.UUID
    provider: str
    label: str
    key_last_four: str
    base_url: str | None
    is_default: bool
