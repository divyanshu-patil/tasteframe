from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.schemas.api import FeaturesOut
from app.services.qloo.client import QlooClient

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "tasteframe-api"}


@router.get("/v1/features", response_model=FeaturesOut)
async def features(settings: Settings = Depends(get_settings)) -> FeaturesOut:
    """Which optional integrations are on (booleans only — never values)."""
    return FeaturesOut(
        qloo=await QlooClient(settings).enabled(),
        image_reasoning=settings.ollama_enabled,
        saved_stories=settings.supabase_enabled,
        storage=settings.storage_backend,
    )
