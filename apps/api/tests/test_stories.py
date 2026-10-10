"""Saved Stories (login required): Supabase Auth token check + PostgREST with RLS, photo copy."""

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
    "crop": {"zoom": 1, "x": 0.5, "y": 0.5, "fit": "cover"},
    "filter": "film",
    "order": [],
    "crops": [],
    "stickers": [
        {
            "id": "star-1",
            "kind": "star",
            "x": 0.2,
            "y": 0.3,
            "scale": 1.2,
            "rotate": 10,
            "color": "#d9a62e",
        }
    ],
    "overlay": {"strength": 0.5, "color": "#efede7"},
    "decorations": {"grid": True},
    "accent": "#c03f13",
    "palette": ["#202020"],
    "stamp": "'26 10 10",
}
ALICE = ("token-alice", "11111111-1111-4111-8111-111111111111")
BOB = ("token-bob", "22222222-2222-4222-8222-222222222222")


class FakeSupabase:
    """Auth (/auth/v1/user) + the `stories` table with RLS-by-token and the 20→2 limit trigger."""

    LIMIT = 2

    def __init__(self):
        self.users = dict([ALICE, BOB])
        self.rows: list[dict] = []
        self.fail = False
        self.ignore_deletes = False  # PostgREST answering a DELETE with [] and deleting nothing
        self.requests: list[httpx.Request] = []

    def handler(self, req: httpx.Request) -> httpx.Response:
        self.requests.append(req)
        assert req.headers["apikey"] == "sb_publishable_test"
        token = req.headers.get("authorization", "").removeprefix("Bearer ")
        uid = self.users.get(token)
        if req.url.path == "/auth/v1/user":
            return httpx.Response(200, json={"id": uid}) if uid else httpx.Response(401)
        assert req.url.path == "/rest/v1/stories"
        if self.fail:
            return httpx.Response(500, json={"message": "boom internal detail"})
        if not uid:
            return httpx.Response(401, json={"message": "JWT expired"})
        mine = [r for r in self.rows if r["user_id"] == uid]  # RLS
        params = dict(req.url.params)
        if req.method == "POST":
            body = json.loads(req.content)
            keys = body.get("s3_object_keys") or [body["s3_object_key"]]
            if body["user_id"] != uid or not all(k.startswith(f"saved/{uid}/") for k in keys):
                return httpx.Response(403, json={"message": "violates row-level security"})
            if len(mine) >= self.LIMIT:
                return httpx.Response(400, json={"code": "P0001", "message": "STORY_LIMIT"})
            row = {**body, "id": str(uuid.uuid4()), "created_at": datetime.now(UTC).isoformat()}
            self.rows.append(row)
            return httpx.Response(201, json=[row])
        hits = [
            r for r in mine if "id" not in params or r["id"] == params["id"].removeprefix("eq.")
        ]
        if req.method == "DELETE":
            if self.ignore_deletes:
                return httpx.Response(200, json=[])
            self.rows = [r for r in self.rows if r not in hits]
        return httpx.Response(200, json=hits)


@pytest.fixture
def setup(client_with, monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://proj.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")
    from app.api.routes.stories import get_repo
    from app.core import auth
    from app.core.config import get_settings
    from app.services.stories.supabase import SupabaseStories

    get_settings.cache_clear()
    fake = FakeSupabase()
    transport = httpx.MockTransport(fake.handler)
    monkeypatch.setattr(auth, "auth_transport", transport)
    client, _ = client_with()
    client.app.dependency_overrides[get_repo] = lambda: SupabaseStories(get_settings(), transport)
    return client, fake


def headers(client, user=ALICE):
    h = new_session(client)
    if user:
        h["Authorization"] = f"Bearer {user[0]}"
    return h


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
    assert client.get("/v1/features").json() == {
        "qloo": True,
        "image_reasoning": False,
        "saved_stories": False,
        "storage": "local",
    }
    r = client.get("/v1/stories", headers=new_session(client))
    assert r.status_code == 503 and r.json()["error"]["code"] == "PERSISTENCE_NOT_CONFIGURED"


def test_guest_must_log_in_to_save(setup):
    client, fake = setup
    h = headers(client, user=None)
    key = upload(client, h, make_image())
    r = save(client, h, key)
    assert r.status_code == 401 and r.json()["error"]["code"] == "AUTH_REQUIRED"
    assert "Log in" in r.json()["error"]["message"]
    h["Authorization"] = "Bearer forged-token"
    assert save(client, h, key).status_code == 401
    assert client.get("/v1/stories", headers=h).status_code == 401
    assert fake.rows == []


def test_save_list_photo_delete_roundtrip(setup, tmp_path):
    client, fake = setup
    h = headers(client)
    key = upload(client, h, make_image())
    r = save(client, h, key)
    assert r.status_code == 201, r.text
    story = r.json()
    assert (
        story["config"] == {**CONFIG, "tags": [], "tracks": [], "views": {}, "boxes": {}}
        and story["template_id"] == "editorial"
    )
    row = fake.rows[0]
    assert row["user_id"] == ALICE[1] and row["s3_object_key"].startswith(f"saved/{ALICE[1]}/")
    table_req = [q for q in fake.requests if q.url.path == "/rest/v1/stories"][0]
    assert table_req.headers["authorization"] == "Bearer token-alice"  # RLS runs as the user
    assert "sb_publishable_test" not in r.text

    assert [s["id"] for s in client.get("/v1/stories", headers=h).json()["stories"]] == [
        story["id"]
    ]
    photo = client.get(f"/v1/stories/{story['id']}/photo", headers=h)
    assert photo.status_code == 200 and photo.content[:3] == b"\xff\xd8\xff"

    saved_file = tmp_path / "uploads" / row["s3_object_key"]
    assert saved_file.exists()
    assert client.delete(f"/v1/stories/{story['id']}", headers=h).status_code == 204
    assert not saved_file.exists() and fake.rows == []
    assert client.delete(f"/v1/stories/{story['id']}", headers=h).status_code == 204
    assert client.get(f"/v1/stories/{story['id']}/photo", headers=h).status_code == 404


def test_story_follows_the_account_not_the_browser(setup):
    client, _ = setup
    laptop = headers(client)
    sid = save(client, laptop, upload(client, laptop, make_image())).json()["id"]
    phone = headers(client)  # new browser session, same account
    assert [s["id"] for s in client.get("/v1/stories", headers=phone).json()["stories"]] == [sid]


def test_other_user_cannot_read_or_delete(setup):
    client, fake = setup
    alice, bob = headers(client), headers(client, BOB)
    key = upload(client, alice, make_image())
    sid = save(client, alice, key).json()["id"]
    assert client.get("/v1/stories", headers=bob).json()["stories"] == []
    assert client.get(f"/v1/stories/{sid}/photo", headers=bob).status_code == 404
    client.delete(f"/v1/stories/{sid}", headers=bob)
    assert len(fake.rows) == 1
    assert save(client, bob, key).status_code == 404  # Bob's browser doesn't own Alice's upload


def test_rejects_invalid_config(setup):
    client, _ = setup
    h = headers(client)
    key = upload(client, h, make_image())
    assert save(client, h, key, {**CONFIG, "accent": "red; background:url(x)"}).status_code == 422
    assert save(client, h, key, {**CONFIG, "html": "<script>"}).status_code == 422
    assert client.get("/v1/stories/not-a-uuid/photo", headers=h).status_code == 422


def test_limit_enforced_by_database_rolls_back_photo(setup, tmp_path):
    client, _ = setup
    h = headers(client)
    key = upload(client, h, make_image())
    assert [save(client, h, key).status_code for _ in range(3)] == [201, 201, 409]
    assert len(list((tmp_path / "uploads").glob("saved/**/*.jpg"))) == 2


def test_supabase_outage_cleans_up_photo_copy(setup, tmp_path):
    client, fake = setup
    h = headers(client)
    key = upload(client, h, make_image())
    fake.fail = True
    r = save(client, h, key)
    assert r.status_code == 503 and r.json()["error"]["code"] == "PERSISTENCE_UNAVAILABLE"
    assert "boom" not in r.text
    assert not list((tmp_path / "uploads").glob("saved/**/*.jpg"))


def test_expired_upload_cannot_be_saved(setup):
    client, _ = setup
    h = headers(client)
    key = upload(client, h, make_image())
    client.delete(f"/v1/uploads/{key}", headers=h)
    r = save(client, h, key)
    assert r.status_code == 404 and r.json()["error"]["code"] == "OBJECT_NOT_FOUND"


def test_delete_that_silently_fails_is_reported_and_keeps_the_photo(setup, tmp_path):
    client, fake = setup
    h = headers(client)
    sid = save(client, h, upload(client, h, make_image())).json()["id"]
    fake.ignore_deletes = True
    r = client.delete(f"/v1/stories/{sid}", headers=h)
    assert r.status_code == 503 and r.json()["error"]["retryable"] is True
    assert len(fake.rows) == 1 and len(list((tmp_path / "uploads").glob("saved/**/*.jpg"))) == 1
    fake.ignore_deletes = False
    assert client.delete(f"/v1/stories/{sid}", headers=h).status_code == 204  # retry works
    assert fake.rows == [] and not list((tmp_path / "uploads").glob("saved/**/*.jpg"))


def test_multi_photo_story_saves_every_photo(setup, tmp_path):
    client, fake = setup
    h = headers(client)
    keys = [
        upload(client, h, make_image(color=c))
        for c in ((200, 40, 40), (40, 200, 40), (40, 40, 200))
    ]
    r = client.post(
        "/v1/stories",
        headers=h,
        json={"object_keys": keys, "config": {**CONFIG, "templateId": "booth", "order": [2, 0, 1]}},
    )
    assert r.status_code == 201, r.text
    story = r.json()
    assert story["photo_count"] == 3 and story["config"]["order"] == [2, 0, 1]
    saved = fake.rows[0]["s3_object_keys"]
    assert len(saved) == 3 and all(k.startswith(f"saved/{ALICE[1]}/") for k in saved)
    photos = [
        client.get(f"/v1/stories/{story['id']}/photo", params={"index": i}, headers=h)
        for i in range(3)
    ]
    assert all(p.status_code == 200 for p in photos) and len({p.content for p in photos}) == 3
    assert (
        client.get(f"/v1/stories/{story['id']}/photo", params={"index": 3}, headers=h).status_code
        == 404
    )
    assert client.delete(f"/v1/stories/{story['id']}", headers=h).status_code == 204
    assert not list((tmp_path / "uploads").glob("saved/**/*.jpg"))


def test_multi_photo_save_rolls_back_copies_when_one_upload_is_gone(setup, tmp_path):
    client, _ = setup
    h = headers(client)
    keys = [upload(client, h, make_image()) for _ in range(2)]
    client.delete(f"/v1/uploads/{keys[1]}", headers=h)
    r = client.post("/v1/stories", headers=h, json={"object_keys": keys, "config": CONFIG})
    assert r.status_code == 404
    assert not list((tmp_path / "uploads").glob("saved/**/*.jpg"))


def test_song_cover_config_validated():
    from pydantic import ValidationError

    from app.schemas.api import StoryConfig

    cover = {
        "show": True,
        "x": 0.3,
        "y": 0.3,
        "scale": 1.3,
        "rotate": 0,
        "style": "ig",
        "title": "golden hour",
        "artist": "JVKE",
        "trackId": 1640157165,
    }
    ok = StoryConfig.model_validate(
        {**CONFIG, "templateId": "coverface", "cover": cover, "tags": ["cake", "party hat"]}
    )
    assert ok.cover and ok.cover.trackId == 1640157165
    for bad in ({**cover, "style": "hologram"}, {**cover, "x": 2}, {**cover, "url": "https://x"}):
        with pytest.raises(ValidationError):
            StoryConfig.model_validate({**CONFIG, "cover": bad})
