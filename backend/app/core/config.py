import json
from typing import Annotated

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

_DEV_SECRET = "dev-only-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ENVIRONMENT: str = "development"

    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/webchatbots"

    JWT_SECRET: str = _DEV_SECRET
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_MINUTES: int = 15
    REFRESH_TOKEN_DAYS: int = 7

    # NoDecode is load-bearing. Without it, pydantic-settings runs json.loads()
    # on the raw env value inside EnvSettingsSource and raises SettingsError
    # BEFORE any field validator runs — so the validator below would be dead
    # code and `CORS_ORIGINS=http://a.com,http://b.com` would crash at import.
    CORS_ORIGINS: Annotated[list[str], NoDecode] = ["http://localhost:5173"]

    LOGIN_MAX_FAILURES: int = 5
    LOCKOUT_MINUTES: int = 15
    RATE_LIMIT_PER_MINUTE: int = 20

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _parse_origins(cls, value: object) -> object:
        """Accept either a comma-separated string or a JSON array."""
        if not isinstance(value, str):
            return value
        text = value.strip()
        if text.startswith("["):
            return json.loads(text)
        return [item.strip() for item in text.split(",") if item.strip()]

    @model_validator(mode="after")
    def _reject_dev_secret_in_production(self) -> "Settings":
        if self.ENVIRONMENT == "production" and self.JWT_SECRET == _DEV_SECRET:
            raise ValueError("JWT_SECRET must be set to a real secret in production")
        return self


settings = Settings()
