"""Optional saved Stories. Rows live in Supabase; the photo copy lives under `saved/` in storage."""

import asyncio
import re

from fastapi import APIRouter, Depends, Path, Response

from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.core.security import (
    assert_owns_key,
    rate_limit,
    require_session,
    saved_object_key,
    session_hash,
)
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
        expires_at=row.get("expires_at"),
    )


def _not_found() -> AppError:
    return AppError("STORY_NOT_FOUND", "That saved Story was not found or has expired.", 404)


@router.post(
    "",
    response_model=StoryOut,
    status_code=201,
    dependencies=[Depends(rate_limit("save", "rate_limit_analysis_per_10min", 600))],
)
async def save_story(
    body: SaveStoryIn,
    session_id: str = Depends(require_session),
    settings: Settings = Depends(get_settings),
    storage: Storage = Depends(get_storage),
    repo: SupabaseStories = Depends(get_repo),
) -> StoryOut:
    """Save with explicit user intent: copies the (EXIF-stripped) photo and stores the config.
    The per-owner limit is enforced in SQL (STORY_LIMIT → 409; the photo copy is rolled back)."""
    assert_owns_key(body.object_key, session_id)
    owner = session_hash(settings, session_id)
    dst = saved_object_key(session_id, body.object_key.rsplit(".", 1)[1])
    if not await asyncio.to_thread(storage.copy, body.object_key, dst):
        raise AppError("OBJECT_NOT_FOUND", "That upload has expired. Re-upload to save.", 404)
    try:
        row = await repo.insert(
            owner,
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
    session_id: str = Depends(require_session),
    settings: Settings = Depends(get_settings),
    repo: SupabaseStories = Depends(get_repo),
) -> StoryListOut:
    rows = await repo.list(session_hash(settings, session_id))
    return StoryListOut(stories=[_out(r) for r in rows])


@router.get(
    "/{story_id}/photo",
    response_class=Response,
    responses={200: {"content": {"image/jpeg": {}, "image/png": {}, "image/webp": {}}}},
)
async def story_photo(
    story_id: str = StoryId,
    session_id: str = Depends(require_session),
    settings: Settings = Depends(get_settings),
    storage: Storage = Depends(get_storage),
    repo: SupabaseStories = Depends(get_repo),
) -> Response:
    """Photo bytes via the API (same-origin, so the canvas is never tainted; no public URLs)."""
    row = await repo.get(session_hash(settings, session_id), story_id)
    if not row:
        raise _not_found()
    key = row["s3_object_key"]
    m = re.match(r"^saved/[A-Za-z0-9_-]{22}/[A-Za-z0-9_-]{22}\.(jpg|png|webp)$", key)
    data = await asyncio.to_thread(storage.get, key) if m else None
    if not data:
        raise _not_found()
    return Response(
        data,
        media_type=MEDIA[m.group(1)],  # type: ignore[union-attr]
        headers={"Cache-Control": "private, no-store"},
    )


@router.delete("/{story_id}", status_code=204)
async def delete_story(
    story_id: str = StoryId,
    session_id: str = Depends(require_session),
    settings: Settings = Depends(get_settings),
    storage: Storage = Depends(get_storage),
    repo: SupabaseStories = Depends(get_repo),
) -> Response:
    """Deletes the DB row and its photo copy. Idempotent for already-deleted Stories."""
    row = await repo.delete(session_hash(settings, session_id), story_id)
    if row and str(row.get("s3_object_key", "")).startswith("saved/"):
        await asyncio.to_thread(storage.delete, row["s3_object_key"])
    return Response(status_code=204)
