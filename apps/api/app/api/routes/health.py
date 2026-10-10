from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.schemas.api import FeaturesOut

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "tasteframe-api"}


@router.get("/v1/features", response_model=FeaturesOut)
def features(settings: Settings = Depends(get_settings)) -> FeaturesOut:
    """Which optional integrations are configured (booleans only — never values)."""
    return FeaturesOut(
        qloo=settings.qloo_enabled,
        saved_stories=settings.supabase_enabled,
        storage=settings.storage_backend,
    )
