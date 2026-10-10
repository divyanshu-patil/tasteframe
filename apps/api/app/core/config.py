"""Central settings. Loaded from environment variables and `apps/api/.env`."""

import logging
from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

log = logging.getLogger("tasteframe")

ALLOWED_CONTENT_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["development", "production", "test"] = "development"
    api_host: str = "127.0.0.1"
    api_port: int = 8000
    # Public base URL of this API as seen by the browser (used for local-storage upload URLs).
    public_api_url: str = "http://localhost:3000/api"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    # HMAC secret for guest session tokens and local upload signatures.
    session_secret: SecretStr = SecretStr("dev-only-insecure-secret-change-me")

    qloo_api_key: SecretStr | None = None
    qloo_base_url: str = "https://hackathon.api.qloo.com"
    qloo_timeout_seconds: float = 8.0
    qloo_max_retries: int = 2

    storage_backend: Literal["s3", "local"] = "local"
    aws_region: str = "us-east-1"
    aws_s3_bucket: str | None = None
    aws_access_key_id: SecretStr | None = None
    aws_secret_access_key: SecretStr | None = None
    s3_presigned_url_ttl_seconds: int = Field(300, ge=30, le=900)
    s3_upload_max_bytes: int = Field(10 * 1024 * 1024, ge=1024)
    local_storage_dir: str = ".uploads"

    max_image_pixels: int = 40_000_000
    music_metadata_provider: Literal["itunes", "none"] = "itunes"
    music_timeout_seconds: float = 5.0

    rate_limit_presign_per_10min: int = 20
    rate_limit_analysis_per_10min: int = 12
    rate_limit_search_per_min: int = 40

    @property
    def qloo_enabled(self) -> bool:
        return bool(self.qloo_api_key and self.qloo_api_key.get_secret_value())

    def missing_required(self) -> list[str]:
        """Names (never values) of variables required for the configured mode."""
        missing = []
        if self.storage_backend == "s3" and not self.aws_s3_bucket:
            missing.append("AWS_S3_BUCKET")
        if self.environment == "production":
            if self.session_secret.get_secret_value().startswith("dev-only"):
                missing.append("SESSION_SECRET")
            if self.storage_backend != "s3":
                missing.append("STORAGE_BACKEND=s3")
        return missing


@lru_cache
def get_settings() -> Settings:
    return Settings()


def check_settings(settings: Settings) -> None:
    missing = settings.missing_required()
    if missing:
        raise RuntimeError(f"Missing/invalid required configuration: {', '.join(missing)}")
    if not settings.qloo_enabled:
        log.warning("QLOO_API_KEY not set: cultural recommendations will be unavailable.")
