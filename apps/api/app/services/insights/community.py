"""What people in a region export and listen to (public.community_picks), cached briefly.

Feeds ranking as a nudge: layouts exported more get a popularity boost, and the most-picked
artists become extra Qloo signals for people who added no favourites. Unconfigured or unreachable
store → nothing, never an error.
"""

import logging
import time
from dataclasses import dataclass, field

from app.core.config import Settings
from app.core.errors import AppError
from app.services.insights.rest import rest

log = logging.getLogger("tasteframe.community")
TTL_SECONDS = 600
# ponytail: per-process cache keyed by region; fine for one worker.
_cache: dict[str | None, tuple[float, "Picks"]] = {}


@dataclass
class Picks:
    region: str | None = None  # the region the counts are from (None = everywhere)
    layouts: dict[str, int] = field(default_factory=dict)  # exports per layout
    artists: list[str] = field(default_factory=list)  # most listened/exported first


def _parse(data: object) -> Picks:
    if not isinstance(data, dict):
        return Picks()
    layouts = data.get("layouts") if isinstance(data.get("layouts"), dict) else {}
    artists = data.get("artists") if isinstance(data.get("artists"), list) else []
    region = data.get("region")
    return Picks(
        region if isinstance(region, str) else None,
        {k: v for k, v in layouts.items() if isinstance(k, str) and isinstance(v, int) and v > 0},
        [a for a in artists if isinstance(a, str) and a][:5],
    )


async def community_picks(settings: Settings, region: str | None) -> Picks:
    if not settings.supabase_enabled:
        return Picks()
    hit = _cache.get(region)
    if hit and time.monotonic() - hit[0] < TTL_SECONDS:
        return hit[1]
    try:
        picks = _parse(
            await rest(settings, "POST", "/rpc/community_picks", body={"p_region": region})
        )
    except AppError:
        log.warning("community picks unavailable")
        picks = hit[1] if hit else Picks()
    _cache[region] = (time.monotonic(), picks)
    return picks
