"""Saved Stories for signed-in users. Rows in Supabase (RLS); photo copy under saved/<user_id>/."""

import asyncio
import re

from fastapi import APIRouter, Depends, Path, Response

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
    )


def _not_found() -> AppError:
    return AppError("STORY_NOT_FOUND", "That saved Story was not found.", 404)


@router.post(
    "",
    response_model=StoryOut,
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
    assert_owns_key(body.object_key, session_id)
    dst = saved_object_key(user.id, body.object_key.rsplit(".", 1)[1])
    if not await asyncio.to_thread(storage.copy, body.object_key, dst):
        raise AppError("OBJECT_NOT_FOUND", "That upload has expired. Re-upload to save.", 404)
    try:
        row = await repo.insert(
            user,
            dst,
            body.config.templateId,
            body.config.model_dump(),
            body.provenance.model_dump(),
        )
    except AppError:
        await asyncio.to_thread(storage.delete, dst)  # don't leave an orphaned photo copy
        raise
    return _out(row)


@router.get("", response_model=StoryListOut)
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
    m = re.match(pattern, row["s3_object_key"])
    data = await asyncio.to_thread(storage.get, row["s3_object_key"]) if m else None
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
    """Deletes the row (RLS: own rows only) and its photo copy. Idempotent."""
    row = await repo.delete(user, story_id)
    key = str(row.get("s3_object_key", "")) if row else ""
    if key.startswith(f"saved/{user.id}/"):
        await asyncio.to_thread(storage.delete, key)
    return Response(status_code=204)
