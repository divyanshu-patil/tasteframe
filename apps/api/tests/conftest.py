import io
import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image

FIXTURES = Path(__file__).parent / "fixtures" / "qloo"


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


def make_image(fmt: str = "JPEG", size=(600, 900), color=(200, 140, 60), exif=None) -> bytes:
    im = Image.new("RGB", size, color)
    # A second color band so the palette has more than one entry.
    im.paste((30, 30, 40), (0, 0, size[0], size[1] // 3))
    buf = io.BytesIO()
    kwargs = {"exif": exif} if exif is not None else {}
    im.save(buf, format=fmt, **kwargs)
    return buf.getvalue()


@pytest.fixture(autouse=True)
def _fresh_track_cache():
    from app.services.music import itunes, trending

    itunes._TRACKS.clear()
    trending._CHARTS.clear()


@pytest.fixture
def env(tmp_path, monkeypatch):
    # Never read the developer's real apps/api/.env (it may hold live keys) in unit tests.
    monkeypatch.chdir(tmp_path)
    for var in (
        "SUPABASE_URL",
        "SUPABASE_PUBLISHABLE_KEY",
        "AWS_S3_BUCKET",
        "ENVIRONMENT",
        "OLLAMA_API_KEY",
        "OLLAMA_MODEL",
    ):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("STORAGE_BACKEND", "local")
    monkeypatch.setenv("LOCAL_STORAGE_DIR", str(tmp_path / "uploads"))
    monkeypatch.setenv("SESSION_SECRET", "test-secret")
    monkeypatch.setenv("QLOO_API_KEY", "test-qloo-key")
    monkeypatch.setenv("MUSIC_METADATA_PROVIDER", "none")
    monkeypatch.setenv("PUBLIC_API_URL", "http://testserver")
    from app.core import security
    from app.core.config import get_settings
    from app.services.storage import store

    get_settings.cache_clear()
    store._storage = None
    security.reset_rate_limits()
    monkeypatch.setattr("app.services.qloo.client.asyncio.sleep", _no_sleep)
    yield
    get_settings.cache_clear()
    store._storage = None


async def _no_sleep(_):
    return None


class FakeQloo:
    """Routes httpx requests to a handler; records calls."""

    def __init__(self, handler):
        self.calls: list[httpx.Request] = []
        self.handler = handler

    def transport(self) -> httpx.MockTransport:
        def h(req: httpx.Request) -> httpx.Response:
            self.calls.append(req)
            return self.handler(req)

        return httpx.MockTransport(h)


@pytest.fixture
def client_with(env):
    """Build a TestClient whose Qloo calls go to `handler`."""
    from app.api.routes.taste import get_qloo
    from app.core.config import get_settings
    from app.main import create_app
    from app.services.qloo.client import QlooClient

    def build(handler=None):
        fake = FakeQloo(handler or (lambda r: httpx.Response(500)))
        app = create_app()
        app.dependency_overrides[get_qloo] = lambda: QlooClient(get_settings(), fake.transport())
        return TestClient(app), fake

    return build


@pytest.fixture
def client(client_with):
    return client_with()[0]


def new_session(client: TestClient) -> dict[str, str]:
    token = client.post("/v1/session").json()["session_token"]
    return {"X-Session-Token": token}


def upload(client: TestClient, headers: dict, data: bytes, ctype: str = "image/jpeg") -> str:
    p = client.post(
        "/v1/uploads/presign",
        headers=headers,
        json={"content_type": ctype, "size_bytes": len(data)},
    )
    assert p.status_code == 200, p.text
    body = p.json()
    path = body["upload_url"].removeprefix("http://testserver")
    r = client.post(path, data=body["fields"], files={"file": ("x", data, ctype)})
    assert r.status_code == 204, r.text
    return body["object_key"]


def stream(resp) -> list[dict]:
    return [json.loads(line) for line in resp.text.splitlines() if line.strip()]


def result_of(events: list[dict]) -> dict:
    """The analysis result with the songs (sent as a later {"music": …} event) folded in."""
    res = next(e["result"] for e in events if "result" in e)
    assert res["music_pending"] is True and events[-1].keys() == {"music"}
    return {**res, "music": events[-1]["music"], "music_pending": False}
