import json
from typing import Annotated

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

_DEV_SECRET = "dev-only-change-me-use-at-least-32-bytes"

# A valid Fernet key so local development works out of the box. Production is
# blocked from using it by the validator below.
# Generate a real one with:
#   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
_DEV_ENCRYPTION_KEY = "ZGV2LW9ubHktY2hhbmdlLW1lLTMyYnl0ZXNsb25nISE="


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
    CORS_ORIGINS: Annotated[list[str], NoDecode] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    # Symmetric key protecting per-workspace provider credentials at rest.
    # Rotating it makes every stored credential undecryptable, so it is
    # deployment state, not a per-release value.
    ENCRYPTION_KEY: str = _DEV_ENCRYPTION_KEY

    # The embeddable widget runs on arbitrary customer origins, so its routes
    # must be reachable cross-origin. Safe with bearer-token auth: no request
    # is cookie-authenticated, so echoing the Origin grants nothing by itself.
    WIDGET_CORS_ALL_ORIGINS: bool = True

    LOGIN_MAX_FAILURES: int = 5
    LOCKOUT_MINUTES: int = 15
    RATE_LIMIT_PER_MINUTE: int = 20

    # The install-verification host allow-list. Deliberately NOT derived from
    # the inbound request's Host header, which is client-controlled and has
    # no TrustedHostMiddleware guarding it here — an attacker could otherwise
    # send an arbitrary Host to smuggle an internal/link-local URL past the
    # SSRF check in app.slices.chatbots.install.
    PUBLIC_BASE_URL: str = "http://127.0.0.1:8000"

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
        if self.ENVIRONMENT != "production":
            return self

        if self.JWT_SECRET == _DEV_SECRET or len(self.JWT_SECRET.encode("utf-8")) < 32:
            raise ValueError(
                "JWT_SECRET must be a real secret of at least 32 bytes in production"
            )
        if self.ENCRYPTION_KEY == _DEV_ENCRYPTION_KEY:
            raise ValueError(
                "ENCRYPTION_KEY must be set in production; the development key is public"
            )
        return self


settings = Settings()
