"""Which songs are trending now, to prefer them among the suggested songs.

Instagram publishes no trending-audio API (and scraping it breaks its terms), so two legitimate
signals stand in:
- "chart": Apple's official Apple Music "most played" RSS feed (live, per country, cached 6 h).
- "reels": songs public Reels trend roundups reported as widely used (hand-updated; dated).
"""

import asyncio
import logging
import re
import time
import unicodedata

import httpx

from app.core.config import Settings

log = logging.getLogger("tasteframe.trending")
CHART_URL = "https://rss.marketingtools.apple.com/api/v2/{cc}/music/most-played/100/songs.json"
CHART_TTL = 6 * 3600
CHART_COUNTRIES = {
    "en": ("us", "gb"),
    "hi": ("in",),
    "pa": ("in",),
    "es": ("mx", "es"),
    "ko": ("kr",),
}

# Reported trending on Instagram Reels (SocialPilot weekly, inmagic.ai, Artium roundups;
# Aug–Sep 2026). (artist, title). Refresh when the roundups move on.
REELS_UPDATED = "2026-09"
REELS: tuple[tuple[str, str], ...] = (
    ("Anita Ward", "Ring My Bell"),
    ("Sabrina Carpenter", "Go Go Juice"),
    ("Sabrina Carpenter", "Espresso"),
    ("JENNIE", "Less Than a Lover"),
    ("Tame Impala", "Dracula"),
    ("Billie Eilish", "BIRDS OF A FEATHER"),
    ("Kendrick Lamar", "Not Like Us"),
    ("Tommy Richman", "MILLION DOLLAR BABY"),
    ("Tinashe", "Nasty"),
    ("Chappell Roan", "Femininomenon"),
    ("Hozier", "Too Sweet"),
    ("Anuv Jain", "Arz Kiya Hai"),
)

# ponytail: per-process cache; fine for a few instances, move to Redis if it scales out.
_CHARTS: dict[str, tuple[float, set[tuple[str, str]]]] = {}


def key(artist: str, title: str) -> tuple[str, str]:
    """(lead artist, base title), case/accents/"(feat. …)" insensitive."""

    def norm(s: str) -> str:
        return unicodedata.normalize("NFKC", s).casefold().strip()

    lead = re.split(r" & |, | feat\. | ft\. ", artist, maxsplit=1)[0]
    base = re.sub(r"\s*[(\[].*?[)\]]", "", title)
    return norm(lead), norm(base)


REELS_KEYS = {key(a, t) for a, t in REELS}


async def refresh(
    language: str, settings: Settings, transport: httpx.AsyncBaseTransport | None = None
) -> None:
    """Fetch the language's Apple Music charts into the cache (skips ones still fresh)."""
    if settings.music_metadata_provider != "itunes":
        return
    for cc in CHART_COUNTRIES.get(language, ("us",)):
        hit = _CHARTS.get(cc)
        if hit and time.monotonic() - hit[0] < CHART_TTL:
            continue
        try:
            async with httpx.AsyncClient(timeout=15.0, transport=transport) as c:
                resp = await c.get(CHART_URL.format(cc=cc))
                resp.raise_for_status()
                results = list(resp.json()["feed"]["results"])
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            log.warning("apple chart fetch failed cc=%s", cc)
            continue
        keys = {
            key(r["artistName"], r["name"])
            for r in results
            if isinstance(r, dict)
            and isinstance(r.get("artistName"), str)
            and isinstance(r.get("name"), str)
        }
        if keys:
            _CHARTS[cc] = (time.monotonic(), keys)


_tasks: set[asyncio.Task] = set()


def chart_keys(
    language: str, settings: Settings, transport: httpx.AsyncBaseTransport | None = None
) -> set[tuple[str, str]]:
    """Cached chart songs for the language — never waits on the network (a cold chart fetch takes
    seconds). Stale or missing charts are refreshed in the background for the next request."""
    countries = CHART_COUNTRIES.get(language, ("us",))
    if any(
        cc not in _CHARTS or time.monotonic() - _CHARTS[cc][0] >= CHART_TTL for cc in countries
    ) and not any(t.get_name() == language for t in _tasks):
        task = asyncio.create_task(refresh(language, settings, transport), name=language)
        _tasks.add(task)  # keep a reference until done (asyncio holds only weak ones)
        task.add_done_callback(_tasks.discard)
    return set().union(*(_CHARTS[cc][1] for cc in countries if cc in _CHARTS))


def trend_of(artist: str, title: str, chart: set[tuple[str, str]]) -> str | None:
    k = key(artist, title)
    return "reels" if k in REELS_KEYS else "chart" if k in chart else None
