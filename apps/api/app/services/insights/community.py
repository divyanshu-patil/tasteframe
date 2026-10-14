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
# ponytail: per-process cache keyed by (region, photo topic); fine for one worker.
_cache: dict[tuple[str | None, str | None], tuple[float, "Picks"]] = {}


@dataclass
class Picks:
    region: str | None = None  # the region the counts are from (None = everywhere)
    layouts: dict[str, int] = field(default_factory=dict)  # exports per layout
    artists: list[str] = field(default_factory=list)  # most listened/exported first
    # for this photo topic: opens + 3 × exports per layout (everyone)
    topic_layouts: dict[str, int] = field(default_factory=dict)


def _parse(data: object) -> Picks:
    if not isinstance(data, dict):
        return Picks()

    def counts(key: str) -> dict[str, int]:
        raw = data.get(key) if isinstance(data.get(key), dict) else {}
        return {k: v for k, v in raw.items() if isinstance(k, str) and isinstance(v, int) and v > 0}

    artists = data.get("artists") if isinstance(data.get("artists"), list) else []
    region = data.get("region")
    return Picks(
        region if isinstance(region, str) else None,
        counts("layouts"),
        [a for a in artists if isinstance(a, str) and a][:5],
        counts("topic_layouts"),
    )


async def community_picks(
    settings: Settings, region: str | None, topic: str | None = None
) -> Picks:
    if not settings.supabase_enabled:
        return Picks()
    hit = _cache.get((region, topic))
    if hit and time.monotonic() - hit[0] < TTL_SECONDS:
        return hit[1]
    try:
        picks = _parse(
            await rest(
                settings,
                "POST",
                "/rpc/community_picks",
                body={"p_region": region, "p_topic": topic},
            )
        )
    except AppError:
        log.warning("community picks unavailable")
        picks = hit[1] if hit else Picks()
    _cache[(region, topic)] = (time.monotonic(), picks)
    return picks
