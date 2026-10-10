"""Saved Stories: Supabase (PostgREST) persistence + photo copy, ownership and failure paths."""

import json
import uuid
from datetime import UTC, datetime

import httpx
import pytest

from tests.conftest import make_image, new_session, upload

CONFIG = {
    "templateId": "editorial",
    "headline": {
        "text": "hello",
        "size": 104,
        "color": "#1d1d1b",
        "align": "left",
        "x": 0.07,
        "y": 0.5,
        "width": 0.48,
        "font": "sans",
    },
    "caption": {
        "text": "world",
        "size": 30,
        "color": "#2b2a28",
        "align": "left",
        "x": 0.62,
        "y": 0.55,
        "width": 0.31,
        "font": "serif",
    },
    "crop": {"zoom": 1, "x": 0.5, "y": 0.5},
    "overlay": {"strength": 0.5, "color": "#efede7"},
    "decorations": {"grid": True},
    "accent": "#c03f13",
    "palette": ["#202020"],
    "stamp": "'26 10 10",
}


class FakePostgrest:
    """Emulates the tf_* RPC functions from supabase/schema.sql (limit lowered to 2)."""

    LIMIT = 2

    def __init__(self):
        self.rows: list[dict] = []
        self.fail = False
        self.headers: list[httpx.Headers] = []

    @staticmethod
    def _public(r: dict) -> dict:
        return {k: v for k, v in r.items() if k != "guest_session_hash"}

    def handler(self, req: httpx.Request) -> httpx.Response:
        self.headers.append(req.headers)
        if self.fail:
            return httpx.Response(500, json={"message": "boom internal detail"})
        fn = req.url.path.removeprefix("/rest/v1/rpc/")
        a = json.loads(req.content)
        owner = a["p_owner"]
        assert len(owner) == 64 and all(c in "0123456789abcdef" for c in owner)
        mine = [r for r in self.rows if r["guest_session_hash"] == owner]
        if fn == "tf_save_story":
            if len(mine) >= self.LIMIT:
                return httpx.Response(400, json={"code": "P0001", "message": "STORY_LIMIT"})
            row = {
                "id": str(uuid.uuid4()),
                "guest_session_hash": owner,
                "s3_object_key": a["p_key"],
                "template_id": a["p_template"],
                "layout_config": a["p_config"],
                "recommendation_provenance": a["p_provenance"],
                "created_at": datetime.now(UTC).isoformat(),
                "expires_at": "2099-01-01T00:00:00+00:00",
            }
            self.rows.append(row)
            return httpx.Response(200, json=[self._public(row)])
        if fn == "tf_list_stories":
            return httpx.Response(200, json=[self._public(r) for r in reversed(mine)])
        hit = [r for r in mine if r["id"] == a["p_id"]]
        if fn == "tf_get_story":
            return httpx.Response(200, json=[self._public(r) for r in hit])
        if fn == "tf_delete_story":
            self.rows = [r for r in self.rows if r not in hit]
            return httpx.Response(200, json=[{"s3_object_key": r["s3_object_key"]} for r in hit])
        return httpx.Response(404, json={"message": "function not found"})


@pytest.fixture
def setup(client_with, monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://proj.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")
    from app.api.routes.stories import get_repo
    from app.core.config import get_settings
    from app.services.stories.supabase import SupabaseStories

    get_settings.cache_clear()
    fake = FakePostgrest()
    client, _ = client_with()
    client.app.dependency_overrides[get_repo] = lambda: SupabaseStories(
        get_settings(), httpx.MockTransport(fake.handler)
    )
    return client, fake


def save(client, h, key, config=CONFIG):
    return client.post(
        "/v1/stories",
        headers=h,
        json={
            "object_key": key,
            "config": config,
            "provenance": {"qloo_used": True, "music_artist": "A", "music_title": None},
        },
    )


def test_features_and_not_configured(client):
    f = client.get("/v1/features").json()
    assert f == {"qloo": True, "saved_stories": False, "storage": "local"}
    h = new_session(client)
    r = client.get("/v1/stories", headers=h)
    assert r.status_code == 503 and r.json()["error"]["code"] == "PERSISTENCE_NOT_CONFIGURED"


def test_save_list_photo_delete_roundtrip(setup, tmp_path):
    client, fake = setup
    h = new_session(client)
    key = upload(client, h, make_image())
    r = save(client, h, key)
    assert r.status_code == 201, r.text
    story = r.json()
    assert story["config"] == CONFIG and story["template_id"] == "editorial"
    row = fake.rows[0]
    assert row["s3_object_key"].startswith("saved/") and "guest_session_hash" in row
    assert h["X-Session-Token"].split(".")[0] not in row["guest_session_hash"]  # hashed, not raw
    assert fake.headers[0]["apikey"] == "sb_publishable_test"
    assert "authorization" not in fake.headers[0]  # new keys go in `apikey` only
    assert "sb_publishable_test" not in r.text

    listed = client.get("/v1/stories", headers=h).json()["stories"]
    assert [s["id"] for s in listed] == [story["id"]]
    photo = client.get(f"/v1/stories/{story['id']}/photo", headers=h)
    assert photo.status_code == 200 and photo.headers["content-type"] == "image/jpeg"
    assert photo.content[:3] == b"\xff\xd8\xff"

    saved_file = tmp_path / "uploads" / row["s3_object_key"]
    assert saved_file.exists()
    assert client.delete(f"/v1/stories/{story['id']}", headers=h).status_code == 204
    assert not saved_file.exists() and fake.rows == []
    assert client.delete(f"/v1/stories/{story['id']}", headers=h).status_code == 204
    assert client.get(f"/v1/stories/{story['id']}/photo", headers=h).status_code == 404


def test_other_session_cannot_read_or_delete(setup):
    client, fake = setup
    owner, other = new_session(client), new_session(client)
    key = upload(client, owner, make_image())
    sid = save(client, owner, key).json()["id"]
    assert client.get("/v1/stories", headers=other).json()["stories"] == []
    assert client.get(f"/v1/stories/{sid}/photo", headers=other).status_code == 404
    client.delete(f"/v1/stories/{sid}", headers=other)
    assert len(fake.rows) == 1  # untouched
    assert save(client, other, key).status_code == 404  # can't save someone else's upload


def test_rejects_invalid_config(setup):
    client, _ = setup
    h = new_session(client)
    key = upload(client, h, make_image())
    bad_color = {**CONFIG, "accent": "red; background:url(x)"}
    extra = {**CONFIG, "html": "<script>"}
    assert save(client, h, key, bad_color).status_code == 422
    assert save(client, h, key, extra).status_code == 422
    assert client.get("/v1/stories/not-a-uuid/photo", headers=h).status_code == 422


def test_limit_enforced_by_database_rolls_back_photo(setup, tmp_path):
    client, _ = setup
    h = new_session(client)
    key = upload(client, h, make_image())
    codes = [save(client, h, key).status_code for _ in range(3)]
    assert codes == [201, 201, 409]
    assert len(list((tmp_path / "uploads").glob("saved/**/*.jpg"))) == 2  # 3rd copy removed


def test_supabase_outage_cleans_up_photo_copy(setup, tmp_path):
    client, fake = setup
    h = new_session(client)
    key = upload(client, h, make_image())
    fake.fail = True
    r = save(client, h, key)
    assert r.status_code == 503 and r.json()["error"]["code"] == "PERSISTENCE_UNAVAILABLE"
    assert "boom" not in r.text
    assert not list((tmp_path / "uploads").glob("saved/**/*.jpg"))


def test_expired_upload_cannot_be_saved(setup):
    client, _ = setup
    h = new_session(client)
    key = upload(client, h, make_image())
    client.delete(f"/v1/uploads/{key}", headers=h)
    r = save(client, h, key)
    assert r.status_code == 404 and r.json()["error"]["code"] == "OBJECT_NOT_FOUND"
