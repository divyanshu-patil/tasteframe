"""Saved-Story persistence in Supabase Postgres via PostgREST, as the signed-in user.

Requests carry the publishable key (`apikey`) plus the user's own access token
(`Authorization: Bearer`), so they run as role `authenticated` and RLS restricts every row to
auth.uid() (supabase/schema.sql). The per-user limit is a database trigger.
"""

import logging
from typing import Any

import httpx

from app.core.auth import AuthUser
from app.core.config import Settings
from app.core.errors import AppError

log = logging.getLogger("tasteframe.supabase")
COLUMNS = (
    "id,template_id,layout_config,recommendation_provenance,created_at,s3_object_key,s3_object_keys"
)


def _unavailable() -> AppError:
    return AppError(
        "PERSISTENCE_UNAVAILABLE", "Saved Stories are temporarily unavailable.", 503, True
    )


class SupabaseStories:
    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        self.s = settings
        self._transport = transport

    async def _request(
        self, user: AuthUser, method: str, params: dict[str, str], body: Any = None
    ) -> list[dict]:
        key = self.s.supabase_publishable_key.get_secret_value()  # type: ignore[union-attr]
        headers = {
            "apikey": key,
            "Authorization": f"Bearer {user.token}",
            "Prefer": "return=representation",
        }
        try:
            async with httpx.AsyncClient(
                base_url=f"{str(self.s.supabase_url).rstrip('/')}/rest/v1",
                timeout=self.s.supabase_timeout_seconds,
                transport=self._transport,
                headers=headers,
            ) as client:
                resp = await client.request(method, "/stories", params=params, json=body)
        except httpx.HTTPError:
            log.warning("supabase transport error method=%s", method)
            raise _unavailable() from None
        if resp.status_code >= 400:
            try:
                message = resp.json().get("message")
            except (ValueError, AttributeError):
                message = None
            if message == "STORY_LIMIT":
                raise AppError(
                    "STORY_LIMIT", "You've reached the saved Story limit. Delete one first.", 409
                )
            if resp.status_code == 401:
                raise AppError("AUTH_REQUIRED", "Log in to save Stories to your account.", 401)
            log.warning("supabase error method=%s status=%d", method, resp.status_code)
            raise _unavailable()
        try:
            data = resp.json()
        except ValueError:
            raise _unavailable() from None
        if not isinstance(data, list):
            raise _unavailable()
        return data

    async def insert(
        self,
        user: AuthUser,
        object_keys: list[str],
        template_id: str,
        config: dict,
        provenance: dict,
    ) -> dict:
        # user_id defaults to auth.uid() in SQL; sending it explicitly keeps the CHECK readable.
        rows = await self._request(
            user,
            "POST",
            {"select": COLUMNS},
            {
                "user_id": user.id,
                "s3_object_key": object_keys[0],
                "s3_object_keys": object_keys,
                "template_id": template_id,
                "layout_config": config,
                "recommendation_provenance": provenance,
            },
        )
        if not rows:
            raise _unavailable()
        return rows[0]

    async def list(self, user: AuthUser) -> list[dict]:
        return await self._request(
            user, "GET", {"select": COLUMNS, "order": "created_at.desc", "limit": "20"}
        )

    async def get(self, user: AuthUser, story_id: str) -> dict | None:
        rows = await self._request(user, "GET", {"select": COLUMNS, "id": f"eq.{story_id}"})
        return rows[0] if rows else None

    async def delete(self, user: AuthUser, story_id: str) -> dict | None:
        rows = await self._request(user, "DELETE", {"select": COLUMNS, "id": f"eq.{story_id}"})
        return rows[0] if rows else None
