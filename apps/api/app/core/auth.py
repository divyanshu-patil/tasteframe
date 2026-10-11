"""Supabase Auth: verify a user's access token. Saving Stories requires a signed-in user.

The token is validated by Supabase itself (GET /auth/v1/user), so we don't need the JWT secret
and it works with both legacy and asymmetric signing keys. The same token is then forwarded to
PostgREST, where RLS (auth.uid()) enforces ownership again.
"""

import logging
import re
from dataclasses import dataclass

import httpx
from fastapi import Depends, Header

from app.core.config import Settings, get_settings
from app.core.errors import AppError

log = logging.getLogger("tasteframe.auth")
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")

# Tests swap this for an httpx.MockTransport.
auth_transport: httpx.AsyncBaseTransport | None = None


@dataclass(frozen=True)
class AuthUser:
    id: str
    token: str


def _login_required() -> AppError:
    return AppError("AUTH_REQUIRED", "Log in to save Stories to your account.", 401)


async def require_user(
    authorization: str = Header(default=""),
    settings: Settings = Depends(get_settings),
) -> AuthUser:
    if not settings.supabase_enabled:
        raise AppError(
            "PERSISTENCE_NOT_CONFIGURED", "Saving Stories isn't enabled on this deployment.", 503
        )
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token or len(token) > 4096:
        raise _login_required()
    key = settings.supabase_publishable_key.get_secret_value()  # type: ignore[union-attr]
    try:
        async with httpx.AsyncClient(
            timeout=settings.supabase_timeout_seconds, transport=auth_transport
        ) as client:
            resp = await client.get(
                f"{str(settings.supabase_url).rstrip('/')}/auth/v1/user",
                headers={"apikey": key, "Authorization": f"Bearer {token}"},
            )
    except httpx.HTTPError:
        log.warning("supabase auth transport error")
        raise AppError(
            "AUTH_UNAVAILABLE", "Sign-in is temporarily unavailable.", 503, True
        ) from None
    if resp.status_code in (401, 403):
        raise _login_required()  # expired/invalid token → client refreshes or re-logs in
    if resp.status_code != 200:
        log.warning("supabase auth status=%d", resp.status_code)
        raise AppError("AUTH_UNAVAILABLE", "Sign-in is temporarily unavailable.", 503, True)
    try:
        uid = resp.json().get("id")
    except (ValueError, AttributeError):
        uid = None
    if not isinstance(uid, str) or not UUID_RE.match(uid):
        raise AppError("AUTH_UNAVAILABLE", "Sign-in is temporarily unavailable.", 503, True)
    return AuthUser(id=uid, token=token)


async def optional_user(
    authorization: str = Header(default=""),
    settings: Settings = Depends(get_settings),
) -> AuthUser | None:
    """The signed-in user when a valid token is sent; None for guests (or an expired token)."""
    if not authorization or not settings.supabase_enabled:
        return None
    try:
        return await require_user(authorization, settings)
    except AppError as e:
        if e.code == "AUTH_REQUIRED":
            return None
        raise
