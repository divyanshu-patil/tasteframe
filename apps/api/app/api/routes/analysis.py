import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.api.routes.taste import get_qloo
from app.core.auth import AuthUser, optional_user
from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.core.security import assert_owns_key, rate_limit, require_session
from app.schemas.api import AnalysisIn
from app.services.analysis import run_analysis
from app.services.qloo.client import QlooClient
from app.services.storage.store import Storage, get_storage

router = APIRouter(prefix="/v1", tags=["analysis"])


@router.post(
    "/analysis",
    dependencies=[Depends(rate_limit("analysis", "rate_limit_analysis_per_10min", 600))],
    response_description="NDJSON stream: {stage} events, then {result: AnalysisOut} or {error}",
)
async def analysis(
    body: AnalysisIn,
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

    async def lines():
        async for event in run_analysis(body, settings, storage, qloo):
            yield json.dumps(event) + "\n"

    return StreamingResponse(
        lines(), media_type="application/x-ndjson", headers={"Cache-Control": "no-store"}
    )
