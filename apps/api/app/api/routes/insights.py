"""Usage events, Pinterest pin previews and layout requests (public, rate-limited)."""

import hashlib
import hmac
import re
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Path, Query, Response

from app.core.auth import AuthUser, optional_user
from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.core.security import rate_limit
from app.schemas.api import (
    EventIn,
    LayoutId,
    LayoutRequestIn,
    LikeIn,
    LikeOut,
    LikesOut,
    PinPreview,
)
from app.services.insights import likes, pins
from app.services.insights.rest import rest
from app.services.recommendations.layouts import (
    ADDED,
    CATALOGUE,
    LAUNCH,
    TEMPLATES_BY_ID,
    new_layout_ids,
)

router = APIRouter(prefix="/v1", tags=["insights"])
HOST_RE = re.compile(r"^[a-z0-9.-]{1,120}$")

# Tests swap this for an httpx.MockTransport (Pinterest).
pin_transport = None


def visitor_hash(visitor: str, settings: Settings) -> str:
    """Stable, non-reversible visitor id: HMAC with the server secret, 16 hex chars."""
    key = settings.session_secret.get_secret_value().encode()
    return hmac.new(key, f"visitor:{visitor}".encode(), hashlib.sha256).hexdigest()[:16]


# Android apps open links with an android-app://<package>/ referrer; name the common ones.
APPS = {
    "com.whatsapp": "whatsapp",
    "com.whatsapp.w4b": "whatsapp",
    "org.telegram.messenger": "telegram",
    "com.instagram.android": "instagram",
    "com.facebook.katana": "facebook",
    "com.facebook.orca": "messenger",
    "com.snapchat.android": "snapchat",
    "com.linkedin.android": "linkedin",
    "com.twitter.android": "x.com",
    "com.google.android.gm": "gmail",
    "com.reddit.frontpage": "reddit",
}
SOURCE_RE = re.compile(r"^[a-z0-9_-]{2,40}$")


def referrer_host(ref: str | None) -> str | None:
    """Where a visit came from: the referring site's host (no path/query, no www), an app name
    (android-app:// referrers, in-app browsers) or a ?utm_source / ?ref tag like "whatsapp"."""
    if not ref:
        return None
    ref = ref.strip().lower()
    if SOURCE_RE.match(ref):
        return ref
    url = urlparse(ref if "://" in ref else f"https://{ref}")
    host = (url.hostname or "").removeprefix("www.")
    if url.scheme == "android-app":
        return APPS.get(host, host if HOST_RE.match(host) else None)
    return host if HOST_RE.match(host) and "." in host else None


@router.post(
    "/events",
    status_code=204,
    response_class=Response,
    dependencies=[Depends(rate_limit("events", "rate_limit_events_per_min", 60))],
)
async def record_event(
    body: EventIn,
    settings: Settings = Depends(get_settings),
    user: AuthUser | None = Depends(optional_user),
) -> Response:
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
            # Signed in: sent as the user, so the row's user_id defaults to auth.uid() (RLS
            # only accepts your own id) and the admin "Users" tab can count per account.
            await rest(
                settings,
                "POST",
                "/events",
                token=user.token if user else None,
                body=row,
                prefer="return=minimal",
            )
        except AppError:
            pass  # analytics never breaks the app
    return Response(status_code=204)


@router.get("/layouts/likes", response_model=LikesOut)
async def layout_likes(
    visitor: str = Query(pattern=r"^[A-Za-z0-9_-]{8,64}$"),
    user: AuthUser | None = Depends(optional_user),
    settings: Settings = Depends(get_settings),
) -> LikesOut:
    """Like counts for every layout, which of them this visitor/account liked, and what's new."""
    new = new_layout_ids()
    added = {t.id: ADDED.get(t.id, LAUNCH).isoformat() for t in CATALOGUE}
    if not settings.supabase_enabled:
        return LikesOut(enabled=False, counts={}, liked=[], new=new, added=added)
    counts = await likes.like_counts(settings)
    try:
        mine = await likes.my_likes(
            settings, visitor_hash(visitor, settings), user.token if user else None
        )
    except AppError:
        mine = []
    known = set(TEMPLATES_BY_ID)
    return LikesOut(
        enabled=True,
        counts=counts,
        liked=[x for x in mine if x in known],  # type: ignore[misc]
        new=new,  # type: ignore[arg-type]
        added=added,
    )


@router.post(
    "/layouts/{layout}/like",
    response_model=LikeOut,
    dependencies=[Depends(rate_limit("like", "rate_limit_likes_per_min", 60))],
)
async def like_layout(
    body: LikeIn,
    layout: LayoutId = Path(),
    user: AuthUser | None = Depends(optional_user),
    settings: Settings = Depends(get_settings),
) -> LikeOut:
    """Like or unlike a layout — as the signed-in account, or anonymously as this browser."""
    if not settings.supabase_enabled:
        raise AppError(
            "PERSISTENCE_NOT_CONFIGURED", "Likes aren't enabled on this deployment.", 503
        )
    n = await likes.set_like(
        settings,
        layout,
        visitor_hash(body.visitor, settings),
        body.liked,
        user.token if user else None,
    )
    return LikeOut(layout=layout, likes=n, liked=body.liked)


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
