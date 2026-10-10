"""Route-level tests: health, sessions, uploads, ownership, analysis, deletion, rate limits."""

import io
import json

import httpx
from PIL import Image

from tests.conftest import load_fixture, make_image, new_session, stream, upload

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
    assert [e["stage"] for e in events[:-1]] == ["photo", "mood", "taste", "layouts"]
    res = events[-1]["result"]
    from app.services.recommendations.layouts import CATALOGUE, TEMPLATES_BY_ID

    ids = [lay["id"] for lay in res["layouts"]]
    assert sorted(ids) == sorted(t.id for t in CATALOGUE)  # every layout, ranked once
    assert len({TEMPLATES_BY_ID[i].family for i in ids[:3]}) == 3  # first set is distinct
    assert all(lay["filter"] for lay in res["layouts"])
    assert res["visual_profile"]["mood"][0] == "cinematic"
    assert res["visual_profile"]["source"] == "vision+manual"
    assert res["visual_profile"]["composition"] == "portrait"
    assert res["music"]["kind"] == "none"
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
        return stream(client.post("/v1/analysis", headers=h, json=body))[-1]["result"]

    a, b = run(SEED_A), run(SEED_B)
    assert a["music"]["artist"] == "Related Artist One" and a["music"]["kind"] == "artist"
    assert b["music"]["artist"] == "Related Artist Two"
    assert a["music"]["title"] is None  # never invent a track
    assert a["provenance"]["qloo_used"] and a["provenance"]["seeds"] == ["Seed"]
    assert a["cultural_recommendations"][0]["provider"] == "qloo"
    types = {c.url.params["filter.type"] for c in fake.calls}
    assert types == {"urn:entity:artist", "urn:entity:movie"}


def test_qloo_outage_degrades_without_breaking_layouts(client_with):
    client, _ = client_with(lambda r: httpx.Response(503))
    h = new_session(client)
    key = upload(client, h, make_image())
    body = {
        "object_key": key,
        "taste_seeds": [{"entity_id": SEED_A, "entity_type": "artist", "name": "Seed"}],
    }
    res = stream(client.post("/v1/analysis", headers=h, json=body))[-1]["result"]
    assert res["provenance"]["qloo_error"] == "QLOO_UPSTREAM_ERROR"
    assert res["provenance"]["qloo_used"] is False
    assert len(res["layouts"]) == 19 and res["music"]["kind"] == "none"


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
