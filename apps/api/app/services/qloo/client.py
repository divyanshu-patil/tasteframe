"""Qloo adapter. Owns auth, endpoints, retries and normalization; nothing outside sees raw JSON.

Verified against docs.qloo.com + github.com/qloo/docs-public (2026-10-10):
- Hackathon base URL https://hackathon.api.qloo.com, header `X-Api-Key`.
- GET /search?query=&types=<urn>&take=
- GET /v2/insights?filter.type=<urn>&signal.interests.entities=<id,id>&take=
- No track/song entity type exists; music is artist-level (urn:entity:artist).
"""

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.core.config import Settings
from app.core.errors import AppError

log = logging.getLogger("tasteframe.qloo")

URN = {
    "artist": "urn:entity:artist",
    "movie": "urn:entity:movie",
    "tv_show": "urn:entity:tv_show",
    "brand": "urn:entity:brand",
    "book": "urn:entity:book",
    "podcast": "urn:entity:podcast",
}


@dataclass
class QlooEntity:
    entity_id: str
    name: str
    entity_type: str
    descriptor: str | None = None
    image_url: str | None = None
    tags: list[str] = field(default_factory=list)


def _err(code: str, retryable: bool, status: int = 502) -> AppError:
    messages = {
        "QLOO_AUTH_FAILED": "Cultural recommendations are not configured correctly.",
        "QLOO_RATE_LIMITED": "Cultural recommendations are busy. Please try again shortly.",
        "QLOO_TIMEOUT": "Cultural recommendations timed out. Please try again.",
        "QLOO_INVALID_QUERY": "That taste selection could not be used.",
        "QLOO_UPSTREAM_ERROR": "Cultural recommendations are temporarily unavailable.",
        "QLOO_NOT_CONFIGURED": "Cultural recommendations are not available in this deployment.",
    }
    return AppError(code, messages[code], status, retryable)


def normalize_entity(raw: Any, entity_type: str) -> QlooEntity | None:
    """Keep only provider-returned fields we need; skip anything without id+name."""
    if not isinstance(raw, dict):
        return None
    eid, name = raw.get("entity_id"), raw.get("name")
    if not isinstance(eid, str) or not isinstance(name, str) or not eid or not name:
        return None
    props = raw.get("properties") if isinstance(raw.get("properties"), dict) else {}
    descriptor = None
    if isinstance(props.get("release_year"), int):
        descriptor = str(props["release_year"])
    elif isinstance(props.get("short_description"), str):
        descriptor = props["short_description"][:80]
    elif isinstance(props.get("description"), str):
        descriptor = props["description"][:80]
    image = props.get("image")
    image_url = image.get("url") if isinstance(image, dict) else None
    tags = [
        t["name"]
        for t in (raw.get("tags") or [])
        if isinstance(t, dict) and isinstance(t.get("name"), str)
    ][:8]
    return QlooEntity(eid, name.strip(), entity_type, descriptor,
                      image_url if isinstance(image_url, str) else None, tags)


class QlooClient:
    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        self.settings = settings
        self._transport = transport

    async def _get(self, path: str, params: dict[str, str | int]) -> Any:
        if not self.settings.qloo_enabled:
            raise _err("QLOO_NOT_CONFIGURED", False, 503)
        key = self.settings.qloo_api_key.get_secret_value()  # type: ignore[union-attr]
        timeout = httpx.Timeout(self.settings.qloo_timeout_seconds, connect=4.0)
        attempts = self.settings.qloo_max_retries + 1
        async with httpx.AsyncClient(
            base_url=self.settings.qloo_base_url, timeout=timeout, transport=self._transport,
            headers={"X-Api-Key": key, "Accept": "application/json"},
        ) as client:
            for attempt in range(attempts):
                last = attempt == attempts - 1
                try:
                    resp = await client.get(path, params=params)
                except httpx.TimeoutException:
                    log.warning("qloo timeout path=%s attempt=%d", path, attempt)
                    if last:
                        raise _err("QLOO_TIMEOUT", True, 504) from None
                    await asyncio.sleep(0.4 * 2**attempt)
                    continue
                except httpx.TransportError:
                    log.warning("qloo transport error path=%s attempt=%d", path, attempt)
                    if last:
                        raise _err("QLOO_UPSTREAM_ERROR", True) from None
                    await asyncio.sleep(0.4 * 2**attempt)
                    continue

                status = resp.status_code
                log.info("qloo path=%s status=%d attempt=%d", path, status, attempt)
                if status in (401, 403):
                    raise _err("QLOO_AUTH_FAILED", False)
                if status == 404:
                    return None  # documented "No results" for /search
                if status == 400:
                    raise _err("QLOO_INVALID_QUERY", False, 400)
                if status == 429 or status >= 500:
                    if last:
                        code = "QLOO_RATE_LIMITED" if status == 429 else "QLOO_UPSTREAM_ERROR"
                        raise _err(code, True, 429 if status == 429 else 502)
                    await asyncio.sleep(0.5 * 2**attempt)
                    continue
                try:
                    return resp.json()
                except ValueError:
                    raise _err("QLOO_UPSTREAM_ERROR", True) from None
        raise _err("QLOO_UPSTREAM_ERROR", True)  # unreachable; keeps type-checkers happy

    async def search_entities(self, query: str, entity_type: str, take: int = 6) -> list[QlooEntity]:
        data = await self._get("/search", {"query": query, "types": URN[entity_type], "take": take})
        if data is None:
            return []
        results = data.get("results") if isinstance(data, dict) else None
        if not isinstance(results, list):
            raise _err("QLOO_UPSTREAM_ERROR", True)
        out = [e for r in results if (e := normalize_entity(r, entity_type))]
        return out[:take]

    async def get_insights(
        self, entity_ids: list[str], target_type: str, take: int = 8
    ) -> list[QlooEntity]:
        params: dict[str, str | int] = {
            "filter.type": URN[target_type],
            "signal.interests.entities": ",".join(entity_ids),
            "take": take,
        }
        data = await self._get("/v2/insights", params)
        if data is None:
            return []
        results = data.get("results") if isinstance(data, dict) else None
        entities = results.get("entities") if isinstance(results, dict) else None
        if not isinstance(entities, list):
            raise _err("QLOO_UPSTREAM_ERROR", True)
        return [e for r in entities if (e := normalize_entity(r, target_type))]
