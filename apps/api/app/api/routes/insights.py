"""Anonymous usage events, Pinterest pin previews and layout requests (public, rate-limited)."""

import hashlib
import hmac
import re
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Query, Response

from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.core.security import rate_limit
from app.schemas.api import EventIn, LayoutRequestIn, PinPreview
from app.services.insights import pins
from app.services.insights.rest import rest

router = APIRouter(prefix="/v1", tags=["insights"])
HOST_RE = re.compile(r"^[a-z0-9.-]{1,120}$")

# Tests swap this for an httpx.MockTransport (Pinterest).
pin_transport = None


def visitor_hash(visitor: str, settings: Settings) -> str:
    """Stable, non-reversible visitor id: HMAC with the server secret, 16 hex chars."""
    key = settings.session_secret.get_secret_value().encode()
    return hmac.new(key, f"visitor:{visitor}".encode(), hashlib.sha256).hexdigest()[:16]


def referrer_host(ref: str | None) -> str | None:
    """Only the referring site's host (no path/query), without www."""
    if not ref:
        return None
    host = (urlparse(ref if "://" in ref else f"https://{ref}").hostname or "").lower()
    host = host.removeprefix("www.")
    return host if HOST_RE.match(host) and "." in host else None


@router.post(
    "/events",
    status_code=204,
    response_class=Response,
    dependencies=[Depends(rate_limit("events", "rate_limit_events_per_min", 60))],
)
async def record_event(body: EventIn, settings: Settings = Depends(get_settings)) -> Response:
    if settings.supabase_enabled:
        row = {
            "type": body.type,
            "visitor": visitor_hash(body.visitor, settings),
            "path": body.path,
            "referrer": referrer_host(body.referrer),
            "layout": body.layout,
            "device": body.device,
        }
        try:
            await rest(settings, "POST", "/events", body=row, prefer="return=minimal")
        except AppError:
            pass  # analytics never breaks the app
    return Response(status_code=204)


@router.get(
    "/pins/preview",
    response_model=PinPreview,
    dependencies=[Depends(rate_limit("pin", "rate_limit_pin_preview_per_min", 60))],
)
async def preview_pin(
    url: str = Query(min_length=6, max_length=300), settings: Settings = Depends(get_settings)
) -> PinPreview:
    pin_id = await pins.resolve_pin_id(url, settings, transport=pin_transport)
    return PinPreview(**await pins.pin_preview(pin_id, settings, transport=pin_transport))


@router.post(
    "/layout-requests",
    status_code=201,
    dependencies=[Depends(rate_limit("request", "rate_limit_requests_per_hour", 3600))],
)
async def request_layout(body: LayoutRequestIn, settings: Settings = Depends(get_settings)) -> dict:
    if not settings.supabase_enabled:
        raise AppError(
            "PERSISTENCE_NOT_CONFIGURED", "Layout requests aren't enabled on this deployment.", 503
        )
    pin_id = await pins.resolve_pin_id(body.pin_url, settings, transport=pin_transport)
    p = await pins.pin_preview(
        pin_id, settings, transport=pin_transport
    )  # must be a real, public pin
    row = {
        "pin_id": p["pin_id"],
        "pin_url": p["pin_url"],
        "pin_title": p["title"],
        "pin_author": p["author"],
        "pin_author_url": p["author_url"],
        "pin_thumb": p["thumbnail_url"],
        "pin_width": p["width"],
        "pin_height": p["height"],
        "note": (body.note or "").strip() or None,
        "email": (body.email or "").strip().lower() or None,
        "referrer": referrer_host(body.referrer),
        "visitor": visitor_hash(body.visitor, settings) if body.visitor else None,
        "device": body.device,
    }
    await rest(settings, "POST", "/layout_requests", body=row, prefer="return=minimal")
    if body.visitor:
        try:
            await rest(
                settings,
                "POST",
                "/events",
                body={
                    "type": "request",
                    "visitor": row["visitor"],
                    "path": "/",
                    "device": body.device,
                },
                prefer="return=minimal",
            )
        except AppError:
            pass
    return {"ok": True, "pin": p}
