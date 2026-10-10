"""Saved Stories for signed-in users. Rows in Supabase (RLS); photo copy under saved/<user_id>/."""

import asyncio
import re

from fastapi import APIRouter, Depends, Path, Query, Response

from app.core.auth import AuthUser, require_user
from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.core.security import assert_owns_key, rate_limit, require_session, saved_object_key
from app.schemas.api import (
    UUID_PATTERN,
    SaveStoryIn,
    StoryConfig,
    StoryListOut,
    StoryOut,
    StoryProvenance,
)
from app.services.storage.store import Storage, get_storage
from app.services.stories.supabase import SupabaseStories

router = APIRouter(prefix="/v1/stories", tags=["stories"])
StoryId = Path(pattern=UUID_PATTERN)
MEDIA = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}


def get_repo(settings: Settings = Depends(get_settings)) -> SupabaseStories:
    return SupabaseStories(settings)


def _out(row: dict) -> StoryOut:
    return StoryOut(
        id=row["id"],
        template_id=row["template_id"],
        config=StoryConfig.model_validate(row["layout_config"]),
        provenance=StoryProvenance.model_validate(row.get("recommendation_provenance") or {}),
        created_at=row["created_at"],
        photo_count=len(_keys(row)),
    )


def _keys(row: dict) -> list[str]:
    keys = row.get("s3_object_keys") or []
    return keys if keys else [row["s3_object_key"]]


def _not_found() -> AppError:
    return AppError("STORY_NOT_FOUND", "That saved Story was not found.", 404)


@router.post(
    "",
    response_model=StoryOut,
    response_model_exclude_none=True,
    status_code=201,
    dependencies=[Depends(rate_limit("save", "rate_limit_analysis_per_10min", 600))],
)
async def save_story(
    body: SaveStoryIn,
    session_id: str = Depends(require_session),
    user: AuthUser = Depends(require_user),
    storage: Storage = Depends(get_storage),
    repo: SupabaseStories = Depends(get_repo),
) -> StoryOut:
    """Requires login. The upload must belong to this browser session; the copy belongs to the
    user. The per-user limit is enforced in SQL (STORY_LIMIT → 409; the copy is rolled back)."""
    for key in body.object_keys:
        assert_owns_key(key, session_id)
    copies: list[str] = []
    for key in body.object_keys:
        dst = saved_object_key(user.id, key.rsplit(".", 1)[1])
        if not await asyncio.to_thread(storage.copy, key, dst):
            for c in copies:
                await asyncio.to_thread(storage.delete, c)
            raise AppError("OBJECT_NOT_FOUND", "An upload has expired. Re-upload to save.", 404)
        copies.append(dst)
    try:
        row = await repo.insert(
            user,
            copies,
            body.config.templateId,
            body.config.model_dump(exclude_unset=True),
            body.provenance.model_dump(),
        )
    except AppError:
        for c in copies:  # don't leave orphaned photo copies
            await asyncio.to_thread(storage.delete, c)
        raise
    return _out(row)


@router.get("", response_model=StoryListOut, response_model_exclude_none=True)
async def list_stories(
    user: AuthUser = Depends(require_user), repo: SupabaseStories = Depends(get_repo)
) -> StoryListOut:
    return StoryListOut(stories=[_out(r) for r in await repo.list(user)])


@router.get(
    "/{story_id}/photo",
    response_class=Response,
    responses={200: {"content": {"image/jpeg": {}, "image/png": {}, "image/webp": {}}}},
)
async def story_photo(
    story_id: str = StoryId,
    index: int = Query(0, ge=0, le=3),
    user: AuthUser = Depends(require_user),
    storage: Storage = Depends(get_storage),
    repo: SupabaseStories = Depends(get_repo),
) -> Response:
    """Photo bytes via the API (same-origin, so the canvas is never tainted; no public URLs)."""
    row = await repo.get(user, story_id)
    if not row:
        raise _not_found()
    # Defence in depth: only ever read from this user's own prefix.
    pattern = rf"^saved/{re.escape(user.id)}/[A-Za-z0-9_-]{{22}}\.(jpg|png|webp)$"
    keys = _keys(row)
    if index >= len(keys):
        raise _not_found()
    m = re.match(pattern, keys[index])
    data = await asyncio.to_thread(storage.get, keys[index]) if m else None
    if not m or not data:
        raise _not_found()
    return Response(
        data, media_type=MEDIA[m.group(1)], headers={"Cache-Control": "private, no-store"}
    )


@router.delete("/{story_id}", status_code=204)
async def delete_story(
    story_id: str = StoryId,
    user: AuthUser = Depends(require_user),
    storage: Storage = Depends(get_storage),
    repo: SupabaseStories = Depends(get_repo),
) -> Response:
    """Deletes the row (RLS: own rows only), then its photo copy. Idempotent.

    PostgREST has been observed to occasionally answer a valid DELETE with an empty result. We
    look the row up first and, if it survives the delete, report a retryable error instead of a
    false 204 — so the photo is never orphaned and the UI keeps the item for a retry."""
    row = await repo.get(user, story_id)
    if not row:
        return Response(status_code=204)  # already gone
    if not await repo.delete(user, story_id) and await repo.get(user, story_id):
        raise AppError(
            "PERSISTENCE_UNAVAILABLE", "Couldn't delete that Story. Please try again.", 503, True
        )
    for key in _keys(row):
        if str(key).startswith(f"saved/{user.id}/"):
            await asyncio.to_thread(storage.delete, key)
    return Response(status_code=204)
