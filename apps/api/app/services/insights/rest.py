"""Minimal PostgREST client for analytics, layout requests and the admin dashboard.

Anonymous writes use the publishable key (role `anon`); admin reads/writes forward the signed-in
user's token (role `authenticated`), and RLS + is_admin() decide what they can see.
"""

import logging
from typing import Any

import httpx

from app.core.config import Settings
from app.core.errors import AppError

log = logging.getLogger("tasteframe.insights")

# Tests swap this for an httpx.MockTransport.
rest_transport: httpx.AsyncBaseTransport | None = None


def unavailable() -> AppError:
    return AppError("INSIGHTS_UNAVAILABLE", "That's temporarily unavailable. Try again.", 503, True)


async def rest(
    settings: Settings,
    method: str,
    path: str,
    *,
    token: str | None = None,
    params: dict[str, str] | None = None,
    body: Any = None,
    prefer: str = "return=representation",
) -> Any:
    key = settings.supabase_publishable_key.get_secret_value()  # type: ignore[union-attr]
    headers = {"apikey": key, "Authorization": f"Bearer {token or key}", "Prefer": prefer}
    try:
        async with httpx.AsyncClient(
            base_url=f"{str(settings.supabase_url).rstrip('/')}/rest/v1",
            timeout=settings.supabase_timeout_seconds,
            transport=rest_transport,
            headers=headers,
        ) as client:
            resp = await client.request(method, path, params=params, json=body)
    except httpx.HTTPError:
        log.warning("postgrest transport error %s %s", method, path)
        raise unavailable() from None
    if resp.status_code >= 400:
        try:
            err = resp.json()
            message, code = err.get("message"), err.get("code")
        except (ValueError, AttributeError):
            message = code = None
        if message == "REQUEST_LIMIT":
            raise AppError(
                "REQUEST_LIMIT", "You've sent a lot of requests today. Try again tomorrow.", 429
            )
        if message == "NOT_SELF":
            raise AppError("NOT_SELF", "You can't change your own account.", 400)
        if message == "USER_NOT_FOUND":
            raise AppError("NOT_FOUND", "That account doesn't exist.", 404)
        if message == "NOT_ADMIN" or resp.status_code == 403:
            raise AppError("NOT_ADMIN", "This page is for admins.", 403)
        if resp.status_code == 401:
            raise AppError("AUTH_REQUIRED", "Log in to continue.", 401)
        # PostgREST/Postgres error code only (e.g. PGRST202 function not found, 21000 bare
        # UPDATE): says why without logging the message, which can echo request data.
        log.warning("postgrest error %s %s status=%d code=%s", method, path, resp.status_code, code)
        raise unavailable()
    if resp.status_code == 204 or not resp.content:
        return None
    try:
        return resp.json()
    except ValueError:
        raise unavailable() from None
