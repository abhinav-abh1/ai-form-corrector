"""
Centralized application settings.

Why this exists: scattering `os.getenv("SOME_VAR")` calls throughout the codebase makes it
impossible to know, at a glance, what configuration the app actually needs, and it gives you
no validation (a missing or malformed env var fails silently at the point of use, often deep
in unrelated code). Pydantic's BaseSettings fixes both problems: every setting is declared
once, typed, and validated at startup — the app refuses to start with bad config instead of
failing confusingly at request time.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    database_url: str = "postgresql://formcorrector:changeme_local_dev_only@db:5432/formcorrector"
    backend_cors_origins: str = "http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.backend_cors_origins.split(",") if origin.strip()]


# A single, module-level instance — imported wherever config is needed, e.g.:
#   from app.core.config import settings
settings = Settings()
