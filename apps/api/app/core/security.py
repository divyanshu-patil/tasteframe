"""Guest sessions (HMAC-signed tokens), object-key ownership and in-memory rate limiting."""

import hashlib
import hmac
import re
import secrets
import time
from collections import defaultdict, deque

from fastapi import Depends, Header, Request

from app.core.config import Settings, get_settings
from app.core.errors import AppError

SESSION_RE = re.compile(r"^[A-Za-z0-9_-]{22}$")
KEY_RE = re.compile(r"^tmp/([A-Za-z0-9_-]{22})/([A-Za-z0-9_-]{22})\.(jpg|png|webp)$")


def _sign(secret: str, msg: str) -> str:
    return hmac.new(secret.encode(), msg.encode(), hashlib.sha256).hexdigest()[:32]


def new_session_token(settings: Settings) -> str:
    sid = secrets.token_urlsafe(16)
    return f"{sid}.{_sign(settings.session_secret.get_secret_value(), sid)}"


def verify_session_token(token: str, settings: Settings) -> str | None:
    sid, _, sig = token.partition(".")
    if not SESSION_RE.match(sid):
        return None
    good = _sign(settings.session_secret.get_secret_value(), sid)
    return sid if hmac.compare_digest(good, sig) else None


def require_session(
    x_session_token: str = Header(default=""),
    settings: Settings = Depends(get_settings),
) -> str:
    sid = verify_session_token(x_session_token, settings)
    if not sid:
        raise AppError("SESSION_INVALID", "Your session expired. Please reload the page.", 401)
    return sid


def new_object_key(session_id: str, ext: str) -> str:
    return f"tmp/{session_id}/{secrets.token_urlsafe(16)}.{ext}"


def saved_object_key(session_id: str, ext: str) -> str:
    """Saved Stories keep their photo under a separate prefix with its own lifecycle rule."""
    return f"saved/{session_id}/{secrets.token_urlsafe(16)}.{ext}"


def session_hash(settings: Settings, session_id: str) -> str:
    """Stored instead of the raw session id, so DB rows alone can't be replayed as tokens."""
    secret = settings.session_secret.get_secret_value()
    return hashlib.sha256(f"{secret}:{session_id}".encode()).hexdigest()


def assert_owns_key(object_key: str, session_id: str) -> None:
    m = KEY_RE.match(object_key)
    if not m or not hmac.compare_digest(m.group(1), session_id):
        # Same response for malformed and foreign keys: don't leak which keys exist.
        raise AppError("OBJECT_NOT_FOUND", "That upload was not found for this session.", 404)


def sign_upload(settings: Settings, object_key: str, expires: int, content_type: str) -> str:
    return _sign(
        settings.session_secret.get_secret_value(), f"{object_key}|{expires}|{content_type}"
    )


# ponytail: in-process sliding window; per-instance only. Move to Redis when running >1 replica.
_hits: dict[str, deque[float]] = defaultdict(deque)


def rate_limit(bucket: str, limit_setting: str, window_s: int):
    def dep(
        request: Request,
        x_session_token: str = Header(default=""),
        settings: Settings = Depends(get_settings),
    ) -> None:
        limit: int = getattr(settings, limit_setting)
        ip = request.client.host if request.client else "?"
        key = f"{bucket}:{ip}:{x_session_token.partition('.')[0]}"
        now = time.monotonic()
        q = _hits[key]
        while q and now - q[0] > window_s:
            q.popleft()
        if len(q) >= limit:
            raise AppError("RATE_LIMITED", "Too many requests. Please wait a moment.", 429, True)
        q.append(now)

    return dep


def reset_rate_limits() -> None:
    _hits.clear()
