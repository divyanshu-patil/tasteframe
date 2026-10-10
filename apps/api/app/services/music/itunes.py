"""Track-metadata fallback via Apple's public iTunes Search API (metadata + store link only).

Qloo has no track entity type, so Qloo supplies the *artist*; this only looks up a top song
by that exact artist. No audio is downloaded or redistributed.
"""

import logging
import unicodedata

import httpx

from app.core.config import Settings

log = logging.getLogger("tasteframe.music")
ITUNES_URL = "https://itunes.apple.com/search"


def _norm(s: str) -> str:
    return unicodedata.normalize("NFKC", s).casefold().strip()


async def find_track(
    artist: str,
    settings: Settings,
    country: str = "US",
    transport: httpx.AsyncBaseTransport | None = None,
) -> tuple[str, str | None] | None:
    """Return (track title, store url) for an exact artist-name match, else None."""
    if settings.music_metadata_provider != "itunes":
        return None
    params = {
        "term": artist,
        "entity": "song",
        "attribute": "artistTerm",
        "limit": 10,
        "country": country,
    }
    try:
        async with httpx.AsyncClient(
            timeout=settings.music_timeout_seconds, transport=transport
        ) as client:
            resp = await client.get(ITUNES_URL, params=params)
            resp.raise_for_status()
            results = resp.json().get("results", [])
    except (httpx.HTTPError, ValueError, AttributeError):
        log.warning("itunes lookup failed")
        return None
    for r in results if isinstance(results, list) else []:
        if (
            isinstance(r, dict)
            and isinstance(r.get("artistName"), str)
            and _norm(r["artistName"]) == _norm(artist)
            and isinstance(r.get("trackName"), str)
        ):
            url = r.get("trackViewUrl")
            ok = isinstance(url, str) and url.startswith("https://music.apple.com/")
            return r["trackName"], url if ok else None
    return None
