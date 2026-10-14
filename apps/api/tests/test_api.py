"""Route-level tests: health, sessions, uploads, ownership, analysis, deletion, rate limits."""

import io
import json

import httpx
from PIL import Image

from tests.conftest import load_fixture, make_image, new_session, result_of, stream, upload

SEED_A = "11111111-1111-4111-8111-111111111111"
SEED_B = "55555555-5555-4555-8555-555555555555"


def test_health(client):
    r = client.get("/health")
    assert r.json() == {"status": "ok", "service": "tasteframe-api"}
    assert r.headers["X-Request-ID"]


def test_requires_valid_session(client):
    r = client.post("/v1/uploads/presign", json={"content_type": "image/jpeg", "size_bytes": 10})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "SESSION_INVALID"
    bad = {"X-Session-Token": "AAAAAAAAAAAAAAAAAAAAAA.forged"}
    assert (
        client.post(
            "/v1/uploads/presign",
            headers=bad,
            json={"content_type": "image/jpeg", "size_bytes": 10},
        ).status_code
        == 401
    )


def test_presign_validation(client):
    h = new_session(client)
    r = client.post(
        "/v1/uploads/presign", headers=h, json={"content_type": "image/svg+xml", "size_bytes": 10}
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_REQUEST"
    r = client.post(
        "/v1/uploads/presign",
        headers=h,
        json={"content_type": "image/png", "size_bytes": 11 * 1024 * 1024},
    )
    assert r.status_code == 413 and r.json()["error"]["code"] == "IMAGE_TOO_LARGE"
    r = client.post(
        "/v1/uploads/presign", headers=h, json={"content_type": "image/png", "size_bytes": 1000}
    )
    body = r.json()
    sid = h["X-Session-Token"].split(".")[0]
    assert body["object_key"].startswith(f"tmp/{sid}/") and body["object_key"].endswith(".png")
    assert body["expires_in"] == 300 and body["fields"]["signature"]


def test_local_upload_rejects_tampering(client):
    h = new_session(client)
    body = client.post(
        "/v1/uploads/presign", headers=h, json={"content_type": "image/jpeg", "size_bytes": 10}
    ).json()
    fields = dict(body["fields"], key=body["fields"]["key"].replace("tmp/", "tmp/x"))
    r = client.post("/v1/uploads/local", data=fields, files={"file": ("x", b"abc", "image/jpeg")})
    assert r.status_code == 403
    fields = dict(body["fields"], expires="1")
    r = client.post("/v1/uploads/local", data=fields, files={"file": ("x", b"abc", "image/jpeg")})
    assert r.status_code == 403


def test_analysis_without_seeds_returns_three_distinct_layouts(client):
    h = new_session(client)
    key = upload(client, h, make_image())
    events = stream(
        client.post(
            "/v1/analysis", headers=h, json={"object_key": key, "manual_mood": ["cinematic"]}
        )
    )
    assert [e["stage"] for e in events[:-2]] == ["photo", "mood", "taste", "layouts"]
    res = result_of(events)
    from app.services.recommendations.layouts import CATALOGUE, TEMPLATES_BY_ID

    ids = [lay["id"] for lay in res["layouts"]]
    assert sorted(ids) == sorted(t.id for t in CATALOGUE)  # every layout, ranked once
    assert len({TEMPLATES_BY_ID[i].family for i in ids[:3]}) == 3  # first set is distinct
    assert all(lay["filter"] for lay in res["layouts"])
    assert res["visual_profile"]["mood"][0] == "cinematic"
    assert res["visual_profile"]["source"] == "vision+manual"
    assert res["visual_profile"]["composition"] == "portrait"
    # No favourites: still a music pick, from the photo's vibe (cinematic → toxic).
    from app.services.music.vibes import SONGS

    assert res["music"]["kind"] == "artist" and res["music"]["artist_source"] == "vibe"
    toxic = {a for a, _ in SONGS["en"]["toxic"]}
    assert res["music"]["vibe"] == "toxic" and res["music"]["artist"] in toxic
    assert res["provenance"]["qloo_used"] is False and res["cultural_recommendations"] == []


def test_foreign_object_key_is_rejected(client):
    owner, other = new_session(client), new_session(client)
    key = upload(client, owner, make_image())
    r = client.post("/v1/analysis", headers=other, json={"object_key": key})
    assert r.status_code == 404 and r.json()["error"]["code"] == "OBJECT_NOT_FOUND"
    assert client.delete(f"/v1/uploads/{key}", headers=other).status_code == 404
    r = client.post("/v1/analysis", headers=owner, json={"object_key": "../../etc/passwd"})
    assert r.status_code == 404


def test_delete_is_idempotent_and_removes_object(client):
    h = new_session(client)
    key = upload(client, h, make_image())
    assert client.delete(f"/v1/uploads/{key}", headers=h).status_code == 204
    assert client.delete(f"/v1/uploads/{key}", headers=h).status_code == 204
    events = stream(client.post("/v1/analysis", headers=h, json={"object_key": key}))
    assert events[-1]["error"]["code"] == "OBJECT_NOT_FOUND"


def test_corrupt_and_disguised_files_rejected(client):
    h = new_session(client)
    key = upload(client, h, b"<svg xmlns='http://www.w3.org/2000/svg'></svg>")
    events = stream(client.post("/v1/analysis", headers=h, json={"object_key": key}))
    assert events[-1]["error"]["code"] == "INVALID_IMAGE"
    gif = io.BytesIO()
    Image.new("RGB", (10, 10)).save(gif, format="GIF")
    key = upload(client, h, gif.getvalue())
    assert (
        stream(client.post("/v1/analysis", headers=h, json={"object_key": key}))[-1]["error"][
            "code"
        ]
        == "INVALID_IMAGE"
    )


def test_exif_gps_is_stripped(client, tmp_path):
    exif = Image.Exif()
    exif[0x8825] = {2: (48.0, 51.0, 24.0)}  # GPSInfo
    exif[0x010F] = "CameraMaker"
    data = make_image(exif=exif)
    assert Image.open(io.BytesIO(data)).getexif()
    h = new_session(client)
    key = upload(client, h, data)
    stream(client.post("/v1/analysis", headers=h, json={"object_key": key}))
    stored = (tmp_path / "uploads" / key).read_bytes()
    assert not Image.open(io.BytesIO(stored)).getexif()


def test_seed_changes_cultural_results(client_with):
    """Controlled test: same image, different seed → different Qloo-derived music + recs."""
    insights = load_fixture("insights_artist.json")

    def handler(req: httpx.Request) -> httpx.Response:
        assert req.headers["X-Api-Key"] == "test-qloo-key"
        if req.url.path == "/search":  # the photo-vibe anchor lookup: none found here
            return httpx.Response(404)
        assert req.url.path == "/v2/insights"
        seeds = req.url.params["signal.interests.entities"]
        data = json.loads(json.dumps(insights))
        if seeds == SEED_B:
            data["results"]["entities"].reverse()
        return httpx.Response(200, json=data)

    client, fake = client_with(handler)
    h = new_session(client)
    key = upload(client, h, make_image())

    def run(seed):
        body = {
            "object_key": key,
            "taste_seeds": [{"entity_id": seed, "entity_type": "artist", "name": "Seed"}],
        }
        return result_of(stream(client.post("/v1/analysis", headers=h, json=body)))

    a, b = run(SEED_A), run(SEED_B)
    related = {e["name"] for e in insights["results"]["entities"]}
    assert a["music"]["artist"] in related and a["music"]["kind"] == "artist"
    assert b["music"]["artist"] in related and b["music"]["artist"] != a["music"]["artist"]
    assert a["music"]["artist_source"] == "qloo"
    assert a["music"]["title"] is None  # never invent a track
    assert a["provenance"]["qloo_used"] and a["provenance"]["seeds"] == ["Seed"]
    assert a["cultural_recommendations"][0]["provider"] == "qloo"
    types = {c.url.params["filter.type"] for c in fake.calls if c.url.path == "/v2/insights"}
    assert types == {"urn:entity:artist", "urn:entity:movie"}


def test_qloo_outage_degrades_without_breaking_layouts(client_with):
    client, _ = client_with(lambda r: httpx.Response(503))
    h = new_session(client)
    key = upload(client, h, make_image())
    body = {
        "object_key": key,
        "taste_seeds": [{"entity_id": SEED_A, "entity_type": "artist", "name": "Seed"}],
    }
    res = result_of(stream(client.post("/v1/analysis", headers=h, json=body)))
    assert res["provenance"]["qloo_error"] == "QLOO_UPSTREAM_ERROR"
    assert res["provenance"]["qloo_used"] is False
    from app.services.recommendations.layouts import CATALOGUE

    assert len(res["layouts"]) == len(CATALOGUE)
    assert res["music"]["artist_source"] == "vibe"  # still a song idea without Qloo


def test_seed_must_be_provider_id_not_free_text(client):
    h = new_session(client)
    body = {
        "object_key": "tmp/x/y.jpg",
        "taste_seeds": [
            {"entity_id": "urn:entity:artist&take=999", "entity_type": "artist", "name": "x"}
        ],
    }
    assert client.post("/v1/analysis", headers=h, json=body).status_code == 422


def test_taste_search(client_with):
    def handler(req):
        assert req.url.path == "/search"
        assert req.url.params["types"] == "urn:entity:artist"
        return httpx.Response(200, json=load_fixture("search_artist.json"))

    client, _ = client_with(handler)
    h = new_session(client)
    r = client.get("/v1/taste/search", params={"q": "seed", "type": "artist"}, headers=h)
    cands = r.json()["candidates"]
    assert [c["name"] for c in cands] == ["Seed Artist", "Seed Artist Tribute Band"]
    assert cands[0]["disambiguation"] == "American singer-songwriter"
    assert "test-qloo-key" not in r.text


def test_taste_search_invalid_key_is_safe(client_with):
    client, _ = client_with(
        lambda r: httpx.Response(401, json={"message": "bad key test-qloo-key"})
    )
    h = new_session(client)
    r = client.get("/v1/taste/search", params={"q": "seed"}, headers=h)
    assert r.status_code == 502
    assert r.json()["error"]["code"] == "QLOO_AUTH_FAILED"
    assert "test-qloo-key" not in r.text


def test_rate_limit(client, monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_PRESIGN_PER_10MIN", "3")
    from app.core.config import get_settings

    get_settings.cache_clear()
    h = new_session(client)  # session creation shares the same limit setting
    codes = [
        client.post(
            "/v1/uploads/presign", headers=h, json={"content_type": "image/png", "size_bytes": 5}
        ).status_code
        for _ in range(4)
    ]
    assert codes == [200, 200, 200, 429]


def test_multi_photo_analysis_merges_and_ranks_for_photo_count(client):
    from app.services.recommendations.layouts import TEMPLATES_BY_ID

    h = new_session(client)
    keys = [
        upload(client, h, make_image(color=c))
        for c in ((230, 120, 40), (40, 90, 200), (60, 160, 70))
    ]
    res = result_of(stream(client.post("/v1/analysis", headers=h, json={"object_keys": keys})))
    assert res["visual_profile"]["photo_count"] == 3
    assert len(res["visual_profile"]["palette"]) >= 3  # colours from all photos
    top = res["layouts"][:3]
    assert all(TEMPLATES_BY_ID[lay["id"]].capacity >= 3 for lay in top), [lay["id"] for lay in top]
    assert all(lay["photo_slots"] == 3 for lay in top)
    # Foreign / too many keys are rejected.
    other = new_session(client)
    assert client.post("/v1/analysis", headers=other, json={"object_keys": keys}).status_code == 404
    assert client.post("/v1/analysis", headers=h, json={"object_keys": keys * 2}).status_code == 422


def test_jpg_mime_aliases_are_accepted_as_jpeg(client):
    h = new_session(client)
    for alias in ("image/jpg", "image/pjpeg"):
        r = client.post(
            "/v1/uploads/presign", headers=h, json={"content_type": alias, "size_bytes": 1000}
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert (
            body["object_key"].endswith(".jpg") and body["fields"]["Content-Type"] == "image/jpeg"
        )


def test_guest_gets_vibe_song_that_varies_by_photo(client_with, monkeypatch):
    """No favourites: the photo's vibe picks curated songs, each verified on iTunes (titles iTunes
    doesn't list are skipped); different uploads land on different songs, re-runs keep theirs."""
    from app.services import analysis
    from app.services.music.vibes import SONGS

    curated = {lang: {t for _, t in SONGS[lang]["cute"]} for lang in ("en", "hi")}

    def itunes(req: httpx.Request) -> httpx.Response:
        if "most-played" in req.url.path:
            return httpx.Response(404)  # no chart today
        artist = req.url.params["term"]
        titles = [t for a, t in SONGS["en"]["cute"] + SONGS["hi"]["cute"] if a == artist]
        songs = [
            {
                "artistName": artist,
                "trackName": t,
                "trackId": 100 + i,
                "trackViewUrl": "https://music.apple.com/us/album/x?i=1",
            }
            for i, t in enumerate([f"{artist} song", *titles])
        ]
        return httpx.Response(200, json={"results": songs})

    monkeypatch.setenv("MUSIC_METADATA_PROVIDER", "itunes")
    from app.core.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setattr(analysis, "music_transport", httpx.MockTransport(itunes))
    client, _ = client_with(lambda r: httpx.Response(404))  # Qloo: no anchor found
    h = new_session(client)

    def run(key: str, lang: str = "en") -> dict:
        body = {"object_key": key, "manual_mood": ["playful"], "music_language": lang}
        return result_of(stream(client.post("/v1/analysis", headers=h, json=body)))["music"]

    keys = [upload(client, h, make_image()) for _ in range(6)]
    picks = [run(k) for k in keys]
    for m in picks:
        assert m["kind"] == "track" and m["track_source"] == "itunes"
        assert m["vibe"] == "cute" and m["title"] in curated["en"]
        assert len(m["alternatives"]) == 5  # the other curated picks: one song per layout
        assert all(a["title"] in curated["en"] for a in m["alternatives"])
    assert len({m["title"] for m in picks}) > 1
    assert run(keys[0])["title"] == picks[0]["title"]
    hindi = run(keys[0], "hi")
    assert hindi["language"] == "hi" and hindi["title"] in curated["hi"]


def test_favourites_need_login_when_accounts_exist(client, monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "pk")
    get_settings.cache_clear()
    h = new_session(client)
    r = client.get("/v1/taste/search", params={"q": "drake"}, headers=h)
    assert r.status_code == 401 and r.json()["error"]["code"] == "AUTH_REQUIRED"
    r = client.get("/v1/music/search", params={"q": "drake"}, headers=h)  # picking a song, too
    assert r.status_code == 401 and r.json()["error"]["code"] == "AUTH_REQUIRED"
    body = {
        "object_key": upload(client, h, make_image()),
        "taste_seeds": [{"entity_id": SEED_A, "entity_type": "artist", "name": "Seed"}],
    }
    r = client.post("/v1/analysis", headers=h, json=body)
    assert r.status_code == 401 and r.json()["error"]["code"] == "AUTH_REQUIRED"
    # …but song suggestions don't: a guest without favourites still gets a full result.
    body["taste_seeds"] = []
    assert result_of(stream(client.post("/v1/analysis", headers=h, json=body)))["layouts"]


def test_guests_get_three_layouts_and_the_rest_after_login(client, monkeypatch):
    from app.core import auth
    from app.core.config import get_settings
    from app.services.insights import rest

    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "pk")
    get_settings.cache_clear()

    def supabase(req: httpx.Request) -> httpx.Response:
        if req.url.path == "/auth/v1/user":
            ok = req.headers["authorization"] == "Bearer tok"
            uid = "bbbbbbbb-0000-0000-0000-000000000002"
            return httpx.Response(200, json={"id": uid}) if ok else httpx.Response(401)
        return httpx.Response(200, json=[])  # like counts

    t = httpx.MockTransport(supabase)
    monkeypatch.setattr(auth, "auth_transport", t)
    monkeypatch.setattr(rest, "rest_transport", t)
    h = new_session(client)
    body = {"object_key": upload(client, h, make_image())}
    res = result_of(stream(client.post("/v1/analysis", headers=h, json=body)))
    assert len(res["layouts"]) == 3 and res["locked_layouts"] > 0
    more = f"/v1/analysis/{res['analysis_id']}/layouts"
    assert client.get(more, headers=h).status_code == 401  # shuffle needs a login
    user = {**h, "Authorization": "Bearer tok"}
    full = client.get(more, headers=user).json()["layouts"]
    assert len(full) == 3 + res["locked_layouts"] and full[:3] == res["layouts"]
    other = {**new_session(client), "Authorization": "Bearer tok"}
    assert client.get(more, headers=other).status_code == 404  # another session's analysis
    # Signed in from the start: every layout right away.
    res = result_of(stream(client.post("/v1/analysis", headers=user, json=body)))
    assert len(res["layouts"]) == len(full) and res["locked_layouts"] == 0


def test_vibe_from_pose_cues():
    from app.services.music.vibes import vibe_from_cues

    assert vibe_from_cues(["pout", "sunglasses", "warm"]) == "baddie"
    assert vibe_from_cues(["laugh", "friends"]) == "friendly"
    assert vibe_from_cues(["eyes closed", "headphones"]) == "chill"
    assert vibe_from_cues([]) == "aesthetic"


def test_qloo_layout_switch_ranks_by_tag_affinity(client_with, monkeypatch):
    """Admin switch on: Qloo's affinity to each layout's tags leads the ranking."""
    from app.services.qloo import usage
    from app.services.recommendations.layouts import LAYOUT_TAGS

    favourite = "newspaper"
    liked = {t["tag"] for t in LAYOUT_TAGS[favourite]}

    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path == "/search":
            return httpx.Response(404)
        if req.url.params["filter.type"] == "urn:tag":
            tags = req.url.params["filter.results.tags"].split(",")
            rows = [
                {"tag_id": t, "query": {"affinity": 0.95 if t in liked else 0.05}} for t in tags
            ]
            return httpx.Response(200, json={"results": {"tags": rows}})
        return httpx.Response(200, json=load_fixture("insights_artist.json"))

    client, fake = client_with(handler)
    h = new_session(client)
    key = upload(client, h, make_image())
    body = {
        "object_key": key,
        "taste_seeds": [{"entity_id": SEED_A, "entity_type": "artist", "name": "Seed"}],
    }

    def run(on: bool) -> dict:
        async def layouts_on(_settings) -> bool:
            return on

        monkeypatch.setattr(usage, "layouts_on", layouts_on)
        return result_of(stream(client.post("/v1/analysis", headers=h, json=body)))

    off = run(False)
    assert not any(c.url.params.get("filter.type") == "urn:tag" for c in fake.calls)
    assert off["provenance"]["layouts_by_qloo"] is False

    on = run(True)
    assert on["provenance"]["layouts_by_qloo"] is True
    assert on["provenance"]["layout_rule"].startswith("Qloo tag affinity")
    top = {x["id"]: x for x in on["layouts"][:3]}
    assert favourite in top
    assert top[favourite]["score"]["cultural_style_fit"] == 1.0
    assert "Qloo matches your taste" in top[favourite]["reason"]
    assert [x["id"] for x in on["layouts"]] != [x["id"] for x in off["layouts"]]


def test_qloo_layout_switch_falls_back_when_qloo_fails(client_with, monkeypatch):
    from app.services.qloo import usage

    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path == "/search":
            return httpx.Response(404)
        if req.url.params["filter.type"] == "urn:tag":
            return httpx.Response(503)
        return httpx.Response(200, json=load_fixture("insights_artist.json"))

    async def layouts_on(_settings) -> bool:
        return True

    monkeypatch.setattr(usage, "layouts_on", layouts_on)
    client, _ = client_with(handler)
    h = new_session(client)
    key = upload(client, h, make_image())
    body = {
        "object_key": key,
        "taste_seeds": [{"entity_id": SEED_A, "entity_type": "artist", "name": "Seed"}],
    }
    res = result_of(stream(client.post("/v1/analysis", headers=h, json=body)))
    assert res["provenance"]["layouts_by_qloo"] is False  # local ranking
    assert res["provenance"]["qloo_error"] == "QLOO_UPSTREAM_ERROR"
    assert res["cultural_recommendations"]  # the artist/film calls still worked


def test_no_songs_while_qloo_is_off(client_with, monkeypatch):
    """Admin switched Qloo off (or no key): no song is suggested and no song lookups are made."""
    from app.services import analysis
    from app.services.qloo.client import QlooClient

    looked_up: list[httpx.Request] = []
    monkeypatch.setenv("MUSIC_METADATA_PROVIDER", "itunes")
    from app.core.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setattr(
        analysis, "music_transport", httpx.MockTransport(lambda r: looked_up.append(r))
    )

    async def off(_self) -> bool:
        return False

    monkeypatch.setattr(QlooClient, "enabled", off)
    client, qloo = client_with()
    h = new_session(client)
    body = {"object_key": upload(client, h, make_image()), "manual_mood": ["playful"]}
    events = stream(client.post("/v1/analysis", headers=h, json=body))
    res = events[-1]["result"]  # nothing follows the result: no {"music": …} event
    assert res["music_pending"] is False
    assert res["music"]["kind"] == "none" and "off" in res["music"]["explanation"]
    assert res["layouts"] and not looked_up and not qloo.calls
