"""S3 adapter with botocore Stubber — no AWS account needed."""

import boto3
from botocore.stub import Stubber

from app.core.config import Settings
from app.services.storage.store import S3Storage


def s3():
    c = boto3.client(
        "s3", region_name="us-east-1", aws_access_key_id="AKIATEST", aws_secret_access_key="secret"
    )
    settings = Settings(storage_backend="s3", aws_s3_bucket="bucket", _env_file=None)
    return S3Storage(settings, client=c), c


def test_presigned_post_enforces_type_and_size():
    store, _ = s3()
    url, fields = store.presign("tmp/a/b.jpg", "image/jpeg")
    assert "bucket" in url and fields["key"] == "tmp/a/b.jpg"
    assert fields["Content-Type"] == "image/jpeg" and "policy" in fields


def test_get_rejects_oversized_without_download_and_delete():
    store, c = s3()
    with Stubber(c) as stub:
        stub.add_response(
            "head_object", {"ContentLength": 50 * 1024 * 1024}, {"Bucket": "bucket", "Key": "k"}
        )
        assert store.get("k") == b""
        stub.add_client_error("head_object", "404", http_status_code=404)
        assert store.get("missing") is None
        stub.add_response("delete_object", {}, {"Bucket": "bucket", "Key": "k"})
        store.delete("k")
