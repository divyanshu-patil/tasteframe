"""Song search + cover artwork proxy (iTunes Search API mocked)."""

import asyncio
import io

import httpx
from PIL import Image

from app.core.config import Settings
from app.services.music.itunes import fetch_artwork, search_tracks
from tests.conftest import new_session

ART = "https://is1-ssl.mzstatic.com/image/thumb/Music/v4/aa/x.jpg/100x100bb.jpg"


def jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (600, 600), (200, 30, 60)).save(buf, format="JPEG")
    return buf.getvalue()


def itunes(art_url: str = ART, image: bytes | None = None, seen: list | None = None):
    def handler(req: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(str(req.url))
        if req.url.host == "itunes.apple.com" and req.url.path == "/search":
            return httpx.Response(
                200,
                json={
                    "results": [
                        {
                            "trackId": 11,
                            "trackName": "golden hour",
                            "artistName": "JVKE",
                            "collectionName": "this is what ____ feels like",
                            "artworkUrl100": art_url,
                        },
                        {"trackName": "no id", "artistName": "x"},
                    ]
                },
            )
        if req.url.path == "/lookup":
            return httpx.Response(
                200, json={"results": [{"trackId": 11, "artworkUrl100": art_url}]}
            )
        return httpx.Response(200, content=image if image is not None else jpeg())

    return httpx.MockTransport(handler)


def test_search_tracks_normalises():
    out = asyncio.run(search_tracks("golden hour", Settings(_env_file=None), transport=itunes()))
    assert out == [
        {
            "track_id": 11,
            "title": "golden hour",
            "artist": "JVKE",
            "album": "this is what ____ feels like",
            "has_artwork": True,
        }
    ]


def test_artwork_upscales_and_validates():
    seen: list = []
    got = asyncio.run(fetch_artwork(11, Settings(_env_file=None), transport=itunes(seen=seen)))
    assert got and got[1] == "image/jpeg" and got[0][:3] == b"\xff\xd8\xff"
    assert any("600x600bb.jpg" in u for u in seen)  # asked for the large cover


def test_artwork_rejects_foreign_hosts_and_non_images():
    s = Settings(_env_file=None)
    assert (
        asyncio.run(fetch_artwork(11, s, transport=itunes(art_url="https://evil.example/x.jpg")))
        is None
    )
    assert asyncio.run(fetch_artwork(11, s, transport=itunes(image=b"<html>nope</html>"))) is None


def test_music_routes(client, monkeypatch):
    from app.api.routes import music

    monkeypatch.setattr(music, "music_transport", itunes())
    h = new_session(client)
    r = client.get("/v1/music/search", params={"q": "golden hour"}, headers=h)
    assert r.status_code == 200 and r.json()["tracks"][0]["track_id"] == 11
    art = client.get("/v1/music/artwork/11", headers=h)
    assert art.status_code == 200 and art.headers["content-type"] == "image/jpeg"
    assert client.get("/v1/music/artwork/11").status_code == 401  # session required
    monkeypatch.setattr(music, "music_transport", itunes(art_url="http://insecure/x.jpg"))
    assert client.get("/v1/music/artwork/11", headers=h).status_code == 404
