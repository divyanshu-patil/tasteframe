import hmac
import time
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile

from app.core.config import ALLOWED_CONTENT_TYPES, Settings, get_settings
from app.core.errors import AppError
from app.core.security import (
    KEY_RE,
    assert_owns_key,
    new_object_key,
    rate_limit,
    require_session,
    sign_upload,
)
from app.schemas.api import PresignIn, PresignOut
from app.services.storage.store import Storage, get_storage

router = APIRouter(prefix="/v1/uploads", tags=["uploads"])


@router.post(
    "/presign",
    response_model=PresignOut,
    dependencies=[Depends(rate_limit("presign", "rate_limit_presign_per_10min", 600))],
)
def presign(
    body: PresignIn,
    session_id: str = Depends(require_session),
    settings: Settings = Depends(get_settings),
    storage: Storage = Depends(get_storage),
) -> PresignOut:
    if body.size_bytes > settings.s3_upload_max_bytes:
        mb = settings.s3_upload_max_bytes // (1024 * 1024)
        raise AppError("IMAGE_TOO_LARGE", f"Photos must be {mb} MB or smaller.", 413)
    key = new_object_key(session_id, ALLOWED_CONTENT_TYPES[body.content_type])
    url, fields = storage.presign(key, body.content_type)
    return PresignOut(
        upload_url=url,
        fields=fields,
        object_key=key,
        expires_in=settings.s3_presigned_url_ttl_seconds,
        max_bytes=settings.s3_upload_max_bytes,
    )


@router.post("/local", status_code=204, include_in_schema=False)
async def local_upload(
    key: Annotated[str, Form()],
    content_type: Annotated[str, Form(alias="Content-Type")],
    expires: Annotated[int, Form()],
    signature: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
    settings: Settings = Depends(get_settings),
    storage: Storage = Depends(get_storage),
) -> Response:
    """Development stand-in for the S3 presigned POST. Disabled when STORAGE_BACKEND=s3."""
    if settings.storage_backend != "local":
        raise AppError("NOT_FOUND", "Not found.", 404)
    good = sign_upload(settings, key, expires, content_type)
    if not hmac.compare_digest(good, signature) or not KEY_RE.match(key):
        raise AppError("UPLOAD_FORBIDDEN", "Upload link is invalid.", 403)
    if expires < time.time():
        raise AppError("UPLOAD_EXPIRED", "Upload link expired. Please try again.", 403, True)
    data = await file.read(settings.s3_upload_max_bytes + 1)
    if len(data) > settings.s3_upload_max_bytes:
        raise AppError("IMAGE_TOO_LARGE", "That photo is larger than the upload limit.", 413)
    if not data:
        raise AppError("INVALID_IMAGE", "Empty upload.", 400)
    storage.put(key, data, content_type)
    return Response(status_code=204)


@router.delete("/{object_key:path}", status_code=204)
def delete_upload(
    object_key: str,
    session_id: str = Depends(require_session),
    storage: Storage = Depends(get_storage),
) -> Response:
    assert_owns_key(object_key, session_id)
    storage.delete(object_key)  # idempotent: already-absent objects also return 204
    return Response(status_code=204)
