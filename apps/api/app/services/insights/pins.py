"""Pinterest links → a verified pin preview, via Pinterest's official oEmbed endpoint.

Only Pinterest hosts are ever contacted: share links (pin.it) are resolved by following
redirects one hop at a time, and each hop must stay on Pinterest. The thumbnail must be served
from i.pinimg.com. Nothing is downloaded or stored besides these links and the creator credit.
"""

import logging
import re
from urllib.parse import urlparse

import httpx

from app.core.config import Settings
from app.core.errors import AppError

log = logging.getLogger("tasteframe.pins")
PIN_HOST = re.compile(
    r"^(?:[a-z]{2,3}\.)?pinterest\.(?:com|ca|fr|de|es|it|jp|ru|se|at|ch|nz|ie|pt|dk|cl|ph|co\.(?:uk|kr|in)|com\.(?:au|mx|br|pe))$"
)
SHORT_HOST = {"pin.it"}
PIN_PATH = re.compile(r"^/pin/(?:[^/]*?-)?(\d{5,25})(?:/.*)?$")  # share links add /sent/…
OEMBED = "https://www.pinterest.com/oembed.json"


def bad_link() -> AppError:
    return AppError(
        "PIN_INVALID", "Paste a link to a Pinterest pin (pinterest.com/pin/… or pin.it/…).", 422
    )


def pin_id_from(url: str) -> str | None:
    u = urlparse(url.strip())
    if (
        u.scheme not in ("http", "https")
        or not u.hostname
        or not PIN_HOST.match(u.hostname.lower())
    ):
        return None
    m = PIN_PATH.match(u.path)
    return m.group(1) if m else None


async def resolve_pin_id(
    url: str, settings: Settings, transport: httpx.AsyncBaseTransport | None = None
) -> str:
    url = url.strip()
    if len(url) > 300:
        raise bad_link()
    if pid := pin_id_from(url):
        return pid
    u = urlparse(url if "://" in url else f"https://{url}")
    if (u.hostname or "").lower() not in SHORT_HOST:
        raise bad_link()
    current = u._replace(scheme="https").geturl()
    async with httpx.AsyncClient(
        timeout=settings.music_timeout_seconds, transport=transport, follow_redirects=False
    ) as c:
        for _ in range(4):
            try:
                resp = await c.get(current, headers={"User-Agent": "tasteframe/1.0"})
            except httpx.HTTPError:
                raise AppError(
                    "PIN_UNAVAILABLE", "Couldn't reach Pinterest. Try again.", 503, True
                ) from None
            loc = resp.headers.get("location")
            if resp.status_code not in (301, 302, 303, 307, 308) or not loc:
                break
            nxt = urlparse(httpx.URL(current).join(loc).__str__())
            host = (nxt.hostname or "").lower()
            if not (PIN_HOST.match(host) or host in SHORT_HOST):
                raise bad_link()  # never follow a short link off Pinterest
            if pid := pin_id_from(nxt.geturl()):
                return pid
            current = nxt.geturl()
    raise bad_link()


async def pin_preview(
    pin_id: str, settings: Settings, transport: httpx.AsyncBaseTransport | None = None
) -> dict:
    canonical = f"https://www.pinterest.com/pin/{pin_id}/"
    try:
        async with httpx.AsyncClient(
            timeout=settings.music_timeout_seconds, transport=transport
        ) as c:
            resp = await c.get(
                OEMBED, params={"url": canonical}, headers={"User-Agent": "tasteframe/1.0"}
            )
    except httpx.HTTPError:
        raise AppError(
            "PIN_UNAVAILABLE", "Couldn't reach Pinterest. Try again.", 503, True
        ) from None
    if resp.status_code == 404:
        raise AppError("PIN_NOT_FOUND", "That pin doesn't exist or isn't public.", 404)
    try:
        m = resp.json() if resp.status_code == 200 else None
    except ValueError:
        m = None
    if not isinstance(m, dict):
        log.warning("pinterest oembed status=%d", resp.status_code)
        raise AppError(
            "PIN_UNAVAILABLE", "Couldn't read that pin from Pinterest. Try again.", 503, True
        )
    thumb = m.get("thumbnail_url")
    if not (isinstance(thumb, str) and thumb.startswith("https://i.pinimg.com/")):
        raise AppError("PIN_NOT_FOUND", "That pin has no public image.", 404)
    author_url = m.get("author_url")
    return {
        "pin_id": pin_id,
        "pin_url": canonical,
        "title": (m.get("title") or "").strip()[:200] or None,
        "author": (m.get("author_name") or "")[:120] or None,
        "author_url": author_url
        if isinstance(author_url, str) and author_url.startswith("https://www.pinterest.com/")
        else None,
        # 236px oEmbed thumbnail → the 736px rendition for a crisp preview.
        "thumbnail_url": thumb.replace("/236x/", "/736x/"),
        "width": int(m.get("thumbnail_width") or 236),
        "height": int(m.get("thumbnail_height") or 419),
    }
