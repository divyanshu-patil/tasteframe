"""Object storage: private S3 (production) or signed local disk (development without AWS).

Both expose the same browser contract: a short-lived form POST (url + fields + file).
S3 presigned POST lets the policy itself enforce `content-length-range` and Content-Type.
"""

import time
from pathlib import Path
from typing import Protocol

from app.core.config import Settings
from app.core.security import sign_upload


class Storage(Protocol):
    def presign(self, key: str, content_type: str) -> tuple[str, dict[str, str]]: ...
    def get(self, key: str) -> bytes | None: ...
    def put(self, key: str, data: bytes, content_type: str) -> None: ...
    def delete(self, key: str) -> None: ...
    def copy(self, src: str, dst: str) -> bool: ...


class S3Storage:
    def __init__(self, settings: Settings, client=None):
        import boto3
        from botocore.config import Config

        self.s = settings
        creds = {}
        if settings.aws_access_key_id and settings.aws_secret_access_key:
            creds = {
                "aws_access_key_id": settings.aws_access_key_id.get_secret_value(),
                "aws_secret_access_key": settings.aws_secret_access_key.get_secret_value(),
            }
        # Regional endpoint + SigV4: the global endpoint answers browser POSTs for non-us-east-1
        # buckets with a 307 redirect, which presigned-POST uploads can't follow.
        self.client = client or boto3.client(
            "s3",
            region_name=settings.aws_region,
            config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
            **creds,
        )
        self.bucket = settings.aws_s3_bucket

    def presign(self, key: str, content_type: str) -> tuple[str, dict[str, str]]:
        post = self.client.generate_presigned_post(
            Bucket=self.bucket,
            Key=key,
            Fields={"Content-Type": content_type},
            Conditions=[
                {"Content-Type": content_type},
                ["content-length-range", 1, self.s.s3_upload_max_bytes],
            ],
            ExpiresIn=self.s.s3_presigned_url_ttl_seconds,
        )
        return post["url"], post["fields"]

    def get(self, key: str) -> bytes | None:
        try:
            head = self.client.head_object(Bucket=self.bucket, Key=key)
        except self.client.exceptions.ClientError:
            return None
        if head["ContentLength"] > self.s.s3_upload_max_bytes:
            return b""  # caller rejects as too large without downloading
        return self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)  # idempotent in S3

    def copy(self, src: str, dst: str) -> bool:
        try:
            self.client.copy_object(
                Bucket=self.bucket, Key=dst, CopySource={"Bucket": self.bucket, "Key": src}
            )
        except self.client.exceptions.ClientError:
            return False
        return True


class LocalStorage:
    """Dev-only stand-in for S3. Upload URLs are HMAC-signed and expire like presigned URLs."""

    def __init__(self, settings: Settings):
        self.s = settings
        self.root = Path(settings.local_storage_dir).resolve()

    def _path(self, key: str) -> Path:
        p = (self.root / key).resolve()
        if self.root not in p.parents:
            raise ValueError("key escapes storage root")
        return p

    def presign(self, key: str, content_type: str) -> tuple[str, dict[str, str]]:
        expires = int(time.time()) + self.s.s3_presigned_url_ttl_seconds
        sig = sign_upload(self.s, key, expires, content_type)
        fields = {
            "key": key,
            "Content-Type": content_type,
            "expires": str(expires),
            "signature": sig,
        }
        return f"{self.s.public_api_url.rstrip('/')}/v1/uploads/local", fields

    def get(self, key: str) -> bytes | None:
        p = self._path(key)
        if not p.is_file():
            return None
        return b"" if p.stat().st_size > self.s.s3_upload_max_bytes else p.read_bytes()

    def put(self, key: str, data: bytes, content_type: str) -> None:
        p = self._path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)

    def copy(self, src: str, dst: str) -> bool:
        data = self.get(src)
        if not data:
            return False
        self.put(dst, data, "")
        return True


_storage: Storage | None = None


def get_storage() -> Storage:
    from app.core.config import get_settings

    global _storage
    if _storage is None:
        s = get_settings()
        _storage = S3Storage(s) if s.storage_backend == "s3" else LocalStorage(s)
    return _storage
