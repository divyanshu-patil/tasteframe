"""Saved-Story persistence in Supabase Postgres via PostgREST RPC, using the PUBLISHABLE key.

The publishable key maps to the `anon` role and is public by design, so the database enforces
access (supabase/schema.sql): RLS on, no table privileges for `anon`, and only the SECURITY
DEFINER `tf_*` functions are executable. Each call carries the owner hash
sha256(SESSION_SECRET:session_id), which never leaves the API. Limits/retention live in SQL.
Key goes in the `apikey` header only (Supabase: new keys are not JWTs; not `Authorization`).
"""

import logging
from typing import Any

import httpx

from app.core.config import Settings
from app.core.errors import AppError

log = logging.getLogger("tasteframe.supabase")


def _unavailable() -> AppError:
    return AppError(
        "PERSISTENCE_UNAVAILABLE", "Saved Stories are temporarily unavailable.", 503, True
    )


class SupabaseStories:
    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        self.s = settings
        self._transport = transport

    async def _rpc(self, fn: str, args: dict[str, Any]) -> list[dict]:
        if not self.s.supabase_enabled:
            raise AppError(
                "PERSISTENCE_NOT_CONFIGURED",
                "Saving Stories isn't enabled on this deployment.",
                503,
            )
        key = self.s.supabase_publishable_key.get_secret_value()  # type: ignore[union-attr]
        try:
            async with httpx.AsyncClient(
                base_url=f"{str(self.s.supabase_url).rstrip('/')}/rest/v1",
                timeout=self.s.supabase_timeout_seconds,
                transport=self._transport,
                headers={"apikey": key, "Content-Type": "application/json"},
            ) as client:
                resp = await client.post(f"/rpc/{fn}", json=args)
        except httpx.HTTPError:
            log.warning("supabase transport error fn=%s", fn)
            raise _unavailable() from None
        if resp.status_code >= 400:
            # Our SQL raises well-known messages (errcode P0001); never echo anything else.
            try:
                message = resp.json().get("message")
            except (ValueError, AttributeError):
                message = None
            if message == "STORY_LIMIT":
                raise AppError(
                    "STORY_LIMIT", "You've reached the saved Story limit. Delete one first.", 409
                )
            if resp.status_code == 404:
                log.error("supabase rpc %s missing — apply supabase/schema.sql", fn)
            else:
                log.warning("supabase error fn=%s status=%d", fn, resp.status_code)
            raise _unavailable()
        try:
            data = resp.json()
        except ValueError:
            raise _unavailable() from None
        if not isinstance(data, list):
            raise _unavailable()
        return data

    async def insert(
        self, owner: str, object_key: str, template_id: str, config: dict, provenance: dict
    ) -> dict:
        rows = await self._rpc(
            "tf_save_story",
            {
                "p_owner": owner,
                "p_key": object_key,
                "p_template": template_id,
                "p_config": config,
                "p_provenance": provenance,
            },
        )
        if not rows:
            raise _unavailable()
        return rows[0]

    async def list(self, owner: str) -> list[dict]:
        return await self._rpc("tf_list_stories", {"p_owner": owner})

    async def get(self, owner: str, story_id: str) -> dict | None:
        rows = await self._rpc("tf_get_story", {"p_owner": owner, "p_id": story_id})
        return rows[0] if rows else None

    async def delete(self, owner: str, story_id: str) -> dict | None:
        rows = await self._rpc("tf_delete_story", {"p_owner": owner, "p_id": story_id})
        return rows[0] if rows else None
