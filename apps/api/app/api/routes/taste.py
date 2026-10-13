from fastapi import APIRouter, Depends, Query

from app.core.auth import AuthUser, optional_user
from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.core.security import rate_limit, require_session
from app.schemas.api import TasteCandidate, TasteSearchOut, TasteType
from app.services.qloo.client import QlooClient

router = APIRouter(prefix="/v1/taste", tags=["taste"])


def get_qloo(settings: Settings = Depends(get_settings)) -> QlooClient:
    return QlooClient(settings)


@router.get(
    "/search",
    response_model=TasteSearchOut,
    dependencies=[
        Depends(require_session),
        Depends(rate_limit("search", "rate_limit_search_per_min", 60)),
    ],
)
async def search(
    q: str = Query(min_length=2, max_length=80),
    type: TasteType = Query("artist"),
    qloo: QlooClient = Depends(get_qloo),
    settings: Settings = Depends(get_settings),
    user: AuthUser | None = Depends(optional_user),
) -> TasteSearchOut:
    """Resolve a user-typed favorite into Qloo entities for the user to confirm."""
    # Favourites are a signed-in feature (when accounts exist on this deployment).
    if settings.supabase_enabled and not user:
        raise AppError("AUTH_REQUIRED", "Log in to add favourite artists.", 401)
    found = await qloo.search_entities(q.strip(), type)
    return TasteSearchOut(
        query=q,
        entity_type=type,
        candidates=[
            TasteCandidate(
                entity_id=e.entity_id,
                name=e.name,
                entity_type=type,
                disambiguation=e.descriptor,
                image_url=e.image_url,
            )
            for e in found
        ],
    )
