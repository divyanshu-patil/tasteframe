"""Track-metadata fallback via Apple's public iTunes Search API (metadata + store link only).

Qloo has no track entity type, so Qloo supplies the *artist*; this only looks up a top song
by that exact artist. No audio is downloaded or redistributed.

Song covers: square artwork (600×600) for a track, fetched server-side from Apple's image CDN
(mzstatic.com only) so the browser gets it same-origin (canvas-safe). Used to identify/promote
the song in the Story, with "Artwork via Apple Music" attribution in the UI.
"""

import io
import logging
import re
import time
import unicodedata
from urllib.parse import urlparse

import httpx
from PIL import Image

from app.core.config import Settings

log = logging.getLogger("tasteframe.music")
ITUNES_URL = "https://itunes.apple.com/search"
LOOKUP_URL = "https://itunes.apple.com/lookup"
MAX_ART_BYTES = 3 * 1024 * 1024
# iTunes Search allows ~20 calls/min per IP and an artist's top songs barely move in a day.
# ponytail: per-process dict; move to Redis if the API runs on many instances.
_TRACKS: dict[tuple[str, str], tuple[float, list[tuple[str, str | None, int | None]]]] = {}
TRACK_TTL = 24 * 3600


def _norm(s: str) -> str:
    return unicodedata.normalize("NFKC", s).casefold().strip()


def _lead(credit: str) -> str:
    """First credited artist of "A & B" / "A, B & C" / "A feat. B" (the track's lead)."""
    return _norm(re.split(r" & |, | feat\. | ft\. ", credit, maxsplit=1)[0])


async def find_track(
    artist: str,
    settings: Settings,
    country: str = "US",
    transport: httpx.AsyncBaseTransport | None = None,
) -> tuple[str, str | None, int | None] | None:
    """Return (track title, store url, track id) for an exact artist-name match, else None."""
    found = await find_tracks(artist, settings, country, transport)
    return found[0] if found else None


async def find_tracks(
    artist: str,
    settings: Settings,
    country: str = "US",
    transport: httpx.AsyncBaseTransport | None = None,
) -> list[tuple[str, str | None, int | None]]:
    """Top songs (iTunes order, distinct titles) whose artist name matches exactly."""
    if settings.music_metadata_provider != "itunes":
        return []
    hit = _TRACKS.get((_norm(artist), country))
    if hit and time.monotonic() - hit[0] < TRACK_TTL:
        return hit[1]
    params = {
        "term": artist,
        "entity": "song",
        "attribute": "artistTerm",
        "limit": 50,
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
        return []
    out: dict[str, tuple[str, str | None, int | None]] = {}
    for r in results if isinstance(results, list) else []:
        if (
            isinstance(r, dict)
            and isinstance(r.get("artistName"), str)
            and _lead(r["artistName"]) == _norm(artist)
            and isinstance(r.get("trackName"), str)
        ):
            url = r.get("trackViewUrl")
            ok = isinstance(url, str) and url.startswith("https://music.apple.com/")
            tid = r.get("trackId") if isinstance(r.get("trackId"), int) else None
            out.setdefault(_norm(r["trackName"]), (r["trackName"], url if ok else None, tid))
    if out:  # failures and empty answers are retried next time
        _TRACKS[(_norm(artist), country)] = (time.monotonic(), list(out.values()))
    return list(out.values())


async def search_tracks(
    q: str,
    settings: Settings,
    country: str = "US",
    transport: httpx.AsyncBaseTransport | None = None,
) -> list[dict]:
    """Songs matching free text (title and/or artist) — for picking a cover manually."""
    params = {"term": q, "entity": "song", "limit": 8, "country": country}
    try:
        async with httpx.AsyncClient(
            timeout=settings.music_timeout_seconds, transport=transport
        ) as c:
            resp = await c.get(ITUNES_URL, params=params)
            resp.raise_for_status()
            results = resp.json().get("results", [])
    except (httpx.HTTPError, ValueError, AttributeError):
        log.warning("itunes search failed")
        return []
    out = []
    for r in results if isinstance(results, list) else []:
        if not isinstance(r, dict) or not isinstance(r.get("trackId"), int):
            continue
        if not isinstance(r.get("trackName"), str) or not isinstance(r.get("artistName"), str):
            continue
        out.append(
            {
                "track_id": r["trackId"],
                "title": r["trackName"][:120],
                "artist": r["artistName"][:120],
                "album": r["collectionName"][:120]
                if isinstance(r.get("collectionName"), str)
                else None,
                "has_artwork": isinstance(r.get("artworkUrl100"), str),
                "explicit": r.get("trackExplicitness") == "explicit",
            }
        )
    return out[:8]


def _artwork_ok(url: object) -> bool:
    if not isinstance(url, str):
        return False
    u = urlparse(url)
    return u.scheme == "https" and bool(u.hostname) and u.hostname.endswith(".mzstatic.com")


async def fetch_artwork(
    track_id: int,
    settings: Settings,
    country: str = "US",
    transport: httpx.AsyncBaseTransport | None = None,
) -> tuple[bytes, str] | None:
    """600×600 cover for a track id, validated as a real JPEG/PNG. None if unavailable."""
    try:
        async with httpx.AsyncClient(
            timeout=settings.music_timeout_seconds, transport=transport
        ) as c:
            resp = await c.get(LOOKUP_URL, params={"id": track_id, "country": country})
            resp.raise_for_status()
            results = resp.json().get("results", [])
            art = next(
                (
                    r.get("artworkUrl100")
                    for r in results
                    if isinstance(r, dict) and r.get("trackId") == track_id
                ),
                None,
            )
            if not _artwork_ok(art):
                return None
            big = re.sub(r"/\d+x\d+(bb)?\.(jpg|png)$", r"/600x600bb.\2", art)  # type: ignore[arg-type]
            img = await c.get(big if _artwork_ok(big) else art)  # type: ignore[arg-type]
            img.raise_for_status()
    except (httpx.HTTPError, ValueError, AttributeError):
        log.warning("itunes artwork fetch failed")
        return None
    data = img.content
    if not data or len(data) > MAX_ART_BYTES:
        return None
    try:
        with Image.open(io.BytesIO(data)) as im:
            fmt = im.format
            im.verify()
    except Exception:  # noqa: BLE001 — anything undecodable is rejected
        return None
    if fmt not in ("JPEG", "PNG"):
        return None
    return data, "image/jpeg" if fmt == "JPEG" else "image/png"
