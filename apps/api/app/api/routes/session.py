from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.core.security import new_session_token, rate_limit
from app.schemas.api import SessionOut

router = APIRouter(prefix="/v1", tags=["session"])


@router.post(
    "/session",
    response_model=SessionOut,
    dependencies=[Depends(rate_limit("session", "rate_limit_presign_per_10min", 600))],
)
def create_session(settings: Settings = Depends(get_settings)) -> SessionOut:
    """Anonymous guest session. The token scopes uploads; no account needed."""
    return SessionOut(session_token=new_session_token(settings))
