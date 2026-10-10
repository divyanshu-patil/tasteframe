"""Song search + square cover artwork (for album-cover layouts and the cover sticker)."""

from fastapi import APIRouter, Depends, Path, Query, Response

from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.core.security import rate_limit, require_session
from app.schemas.api import TrackSearchOut
from app.services.music.itunes import fetch_artwork, search_tracks

router = APIRouter(prefix="/v1/music", tags=["music"])

# Tests swap this for an httpx.MockTransport.
music_transport = None


@router.get(
    "/search",
    response_model=TrackSearchOut,
    dependencies=[
        Depends(require_session),
        Depends(rate_limit("music", "rate_limit_search_per_min", 60)),
    ],
)
async def search(
    q: str = Query(min_length=2, max_length=80), settings: Settings = Depends(get_settings)
) -> TrackSearchOut:
    tracks = await search_tracks(q.strip(), settings, transport=music_transport)
    return TrackSearchOut(query=q, tracks=tracks)  # type: ignore[arg-type]


@router.get(
    "/artwork/{track_id}",
    response_class=Response,
    responses={200: {"content": {"image/jpeg": {}, "image/png": {}}}},
    dependencies=[
        Depends(require_session),
        Depends(rate_limit("artwork", "rate_limit_search_per_min", 60)),
    ],
)
async def artwork(
    track_id: int = Path(ge=1, le=10**12), settings: Settings = Depends(get_settings)
) -> Response:
    """Cover image proxied same-origin so the Story canvas stays exportable."""
    found = await fetch_artwork(track_id, settings, transport=music_transport)
    if not found:
        raise AppError("ARTWORK_NOT_FOUND", "No cover artwork for that song.", 404)
    data, ctype = found
    return Response(data, media_type=ctype, headers={"Cache-Control": "private, max-age=86400"})
