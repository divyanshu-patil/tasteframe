"""Admin switch for Qloo and per-call usage logging, both kept in Supabase (app_flags, qloo_usage).

Without Supabase the switch is always on and nothing is logged.
"""

import asyncio
import logging
import time

import httpx

from app.core.config import Settings
from app.core.errors import AppError
from app.services.insights.rest import rest

log = logging.getLogger("tasteframe.qloo")

FLAG_TTL_SECONDS = 15.0
# ponytail: per-process cache, so other API instances see a toggle within FLAG_TTL_SECONDS.
_flag: dict[str, float | bool] = {"on": True, "at": float("-inf")}
_pending: set[asyncio.Task] = set()


def remember(on: bool) -> None:
    _flag.update(on=on, at=time.monotonic())


async def switched_on(settings: Settings) -> bool:
    """The admin switch (cached briefly). If Supabase can't be read, keep the last known value."""
    if not settings.supabase_enabled:
        return True
    if time.monotonic() - float(_flag["at"]) < FLAG_TTL_SECONDS:
        return bool(_flag["on"])
    try:
        rows = await rest(settings, "GET", "/app_flags", params={"select": "qloo_enabled"})
        remember(bool(rows[0]["qloo_enabled"]) if rows else True)
    except (AppError, LookupError, TypeError):
        log.warning("qloo switch unreadable; keeping last value")
        _flag["at"] = time.monotonic()  # don't hammer Supabase while it's down
    return bool(_flag["on"])


def _int(resp: httpx.Response | None, name: str) -> int | None:
    try:
        return int(float(resp.headers[name])) if resp is not None else None
    except (KeyError, ValueError):
        return None


def record(settings: Settings, path: str, resp: httpx.Response | None) -> None:
    """Log one Qloo HTTP attempt (resp=None for timeouts) without delaying the caller."""
    if not settings.supabase_enabled:
        return
    body = {
        "p_endpoint": "insights" if "insights" in path else "search",
        "p_ok": resp is not None and (resp.status_code < 400 or resp.status_code == 404),
        "p_limit": _int(resp, "x-month-ratelimit-limit"),
        "p_remaining": _int(resp, "x-month-ratelimit-remaining"),
        "p_reset_s": _int(resp, "x-month-ratelimit-reset"),
    }

    async def send() -> None:
        try:
            await rest(settings, "POST", "/rpc/log_qloo_call", body=body, prefer="return=minimal")
        except AppError:
            log.warning("qloo usage not logged")

    task = asyncio.create_task(send())
    _pending.add(task)
    task.add_done_callback(_pending.discard)
