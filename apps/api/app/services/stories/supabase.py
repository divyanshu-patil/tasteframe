"""Saved-Story persistence in Supabase Postgres via its REST (PostgREST) API.

Server-side only: authenticates with the service-role key, which bypasses RLS, so every query
here filters on `guest_session_hash` itself. The key never leaves the API process.
Table: public.stories (supabase/schema.sql).
"""

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.core.config import Settings
from app.core.errors import AppError

log = logging.getLogger("tasteframe.supabase")
COLUMNS = (
    "id,template_id,layout_config,recommendation_provenance,created_at,expires_at,s3_object_key"
)


def _unavailable() -> AppError:
    return AppError(
        "PERSISTENCE_UNAVAILABLE", "Saved Stories are temporarily unavailable.", 503, True
    )


class SupabaseStories:
    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        self.s = settings
        self._transport = transport

    async def _request(self, method: str, params: dict[str, str], **kw: Any) -> Any:
        if not self.s.supabase_enabled:
            raise AppError(
                "PERSISTENCE_NOT_CONFIGURED",
                "Saving Stories isn't enabled on this deployment.",
                503,
            )
        key = self.s.supabase_service_role_key.get_secret_value()  # type: ignore[union-attr]
        headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Prefer": "return=representation",
        }
        try:
            async with httpx.AsyncClient(
                base_url=f"{str(self.s.supabase_url).rstrip('/')}/rest/v1",
                timeout=self.s.supabase_timeout_seconds,
                transport=self._transport,
                headers=headers,
            ) as client:
                resp = await client.request(method, "/stories", params=params, **kw)
        except httpx.HTTPError:
            log.warning("supabase transport error method=%s", method)
            raise _unavailable() from None
        if resp.status_code >= 400:
            # Body may echo query details; log status only.
            log.warning("supabase error method=%s status=%d", method, resp.status_code)
            raise _unavailable()
        try:
            data = resp.json()
        except ValueError:
            raise _unavailable() from None
        if not isinstance(data, list):
            raise _unavailable()
        return data

    async def count_active(self, owner: str) -> int:
        rows = await self._request(
            "GET",
            {
                "select": "id",
                "guest_session_hash": f"eq.{owner}",
                "expires_at": f"gt.{_now().isoformat()}",
                "limit": str(self.s.max_saved_stories + 1),
            },
        )
        return len(rows)

    async def insert(
        self, owner: str, object_key: str, template_id: str, config: dict, provenance: dict
    ) -> dict:
        expires = _now() + timedelta(days=self.s.story_retention_days)
        rows = await self._request(
            "POST",
            {"select": COLUMNS},
            json={
                "guest_session_hash": owner,
                "s3_object_key": object_key,
                "template_id": template_id,
                "layout_config": config,
                "recommendation_provenance": provenance,
                "expires_at": expires.isoformat(),
            },
        )
        if not rows:
            raise _unavailable()
        return rows[0]

    async def list(self, owner: str) -> list[dict]:
        return await self._request(
            "GET",
            {
                "select": COLUMNS,
                "guest_session_hash": f"eq.{owner}",
                "expires_at": f"gt.{_now().isoformat()}",
                "order": "created_at.desc",
                "limit": str(self.s.max_saved_stories),
            },
        )

    async def get(self, owner: str, story_id: str) -> dict | None:
        rows = await self._request(
            "GET",
            {
                "select": COLUMNS,
                "id": f"eq.{story_id}",
                "guest_session_hash": f"eq.{owner}",
                "expires_at": f"gt.{_now().isoformat()}",
            },
        )
        return rows[0] if rows else None

    async def delete(self, owner: str, story_id: str) -> dict | None:
        rows = await self._request(
            "DELETE",
            {
                "select": COLUMNS,
                "id": f"eq.{story_id}",
                "guest_session_hash": f"eq.{owner}",
            },
        )
        return rows[0] if rows else None


def _now() -> datetime:
    return datetime.now(UTC)
