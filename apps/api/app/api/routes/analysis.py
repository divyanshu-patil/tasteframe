import json
import time

from fastapi import APIRouter, Depends, Path, Request
from fastapi.responses import StreamingResponse

from app.api.routes.taste import get_qloo
from app.core.auth import AuthUser, optional_user, require_user
from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.core.security import assert_owns_key, rate_limit, require_session
from app.schemas.api import AnalysisIn
from app.services.analysis import run_analysis
from app.services.qloo.client import QlooClient
from app.services.region import region_of
from app.services.storage.store import Storage, get_storage

router = APIRouter(prefix="/v1", tags=["analysis"])

# Guests see the top FREE_LAYOUTS; the rest wait here until they log in (shuffle / other layouts).
# ponytail: in-process dict, fine for one uvicorn worker; move to Redis/Supabase if you scale out.
FREE_LAYOUTS = 3
HELD_TTL = 3600
_held: dict[str, tuple[float, str, list[dict]]] = {}


def _hold(analysis_id: str, session_id: str, layouts: list[dict]) -> None:
    now = time.monotonic()
    for k in [k for k, v in _held.items() if v[0] < now]:
        del _held[k]
    if len(_held) >= 2000:  # bound memory: drop the oldest
        del _held[next(iter(_held))]
    _held[analysis_id] = (now + HELD_TTL, session_id, layouts)


@router.post(
    "/analysis",
    dependencies=[Depends(rate_limit("analysis", "rate_limit_analysis_per_10min", 600))],
    response_description="NDJSON stream: {stage} events, then {result: AnalysisOut} or {error}",
)
async def analysis(
    body: AnalysisIn,
    request: Request,
    session_id: str = Depends(require_session),
    settings: Settings = Depends(get_settings),
    storage: Storage = Depends(get_storage),
    qloo: QlooClient = Depends(get_qloo),
    user: AuthUser | None = Depends(optional_user),
) -> StreamingResponse:
    if body.taste_seeds and settings.supabase_enabled and not user:
        raise AppError("AUTH_REQUIRED", "Log in to use favourite artists.", 401)
    for key in body.object_keys:
        assert_owns_key(key, session_id)
    guest = settings.supabase_enabled and not user

    async def lines():
        region = region_of(request, body.region)
        async for event in run_analysis(body, settings, storage, qloo, region=region):
            if guest and "result" in event:
                res = event["result"]
                _hold(res["analysis_id"], session_id, res["layouts"])
                res["locked_layouts"] = max(0, len(res["layouts"]) - FREE_LAYOUTS)
                res["layouts"] = res["layouts"][:FREE_LAYOUTS]
            yield json.dumps(event) + "\n"

    return StreamingResponse(
        lines(), media_type="application/x-ndjson", headers={"Cache-Control": "no-store"}
    )


@router.get("/analysis/{analysis_id}/layouts")
async def all_layouts(
    analysis_id: str = Path(pattern=r"^[A-Za-z0-9_-]{8,32}$"),
    session_id: str = Depends(require_session),
    _user: AuthUser = Depends(require_user),
) -> dict:
    """Every ranked layout for a guest's analysis, once they've logged in."""
    held = _held.get(analysis_id)
    if not held or held[1] != session_id or held[0] < time.monotonic():
        raise AppError("ANALYSIS_EXPIRED", "These suggestions expired. Run the photo again.", 404)
    return {"layouts": held[2]}
