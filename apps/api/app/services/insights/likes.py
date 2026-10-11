"""Layout likes (anonymous or signed in), stored in Supabase via security-definer functions.

Counts feed the layout ranking as a small boost, so they're cached briefly in memory; a failed or
unconfigured store just means no boost.
"""

import logging
import time

from app.core.config import Settings
from app.core.errors import AppError
from app.services.insights.rest import rest

log = logging.getLogger("tasteframe.likes")
TTL_SECONDS = 60
_at = 0.0
_counts: dict[str, int] = {}


def _parse_counts(rows: object) -> dict[str, int]:
    out: dict[str, int] = {}
    if isinstance(rows, list):
        for r in rows:
            if isinstance(r, dict) and isinstance(r.get("layout"), str):
                n = r.get("likes")
                if isinstance(n, int) and n > 0:
                    out[r["layout"]] = n
    return out


async def like_counts(settings: Settings, fresh: bool = False) -> dict[str, int]:
    """Likes per layout id; {} when persistence is off or the store is unreachable."""
    global _at, _counts
    if not settings.supabase_enabled:
        return {}
    if not fresh and time.monotonic() - _at < TTL_SECONDS:
        return dict(_counts)
    try:
        _counts = _parse_counts(await rest(settings, "POST", "/rpc/layout_like_counts", body={}))
    except AppError:
        log.warning("like counts unavailable")
        return dict(_counts)
    _at = time.monotonic()
    return dict(_counts)


async def my_likes(settings: Settings, visitor: str, token: str | None) -> list[str]:
    rows = await rest(
        settings, "POST", "/rpc/my_layout_likes", token=token, body={"p_visitor": visitor}
    )
    return [r for r in rows if isinstance(r, str)] if isinstance(rows, list) else []


async def set_like(
    settings: Settings, layout: str, visitor: str, on: bool, token: str | None
) -> int:
    n = await rest(
        settings,
        "POST",
        "/rpc/set_layout_like",
        token=token,
        body={"p_layout": layout, "p_visitor": visitor, "p_on": on},
    )
    count = n if isinstance(n, int) else 0
    if count:
        _counts[layout] = count
    else:
        _counts.pop(layout, None)
    return count


def reset_cache() -> None:
    global _at, _counts
    _at, _counts = 0.0, {}
