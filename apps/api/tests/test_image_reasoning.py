"""Ollama image reasoning: parsing/sanitizing, failure modes, and pipeline integration."""

import asyncio
import json

import httpx
from PIL import Image

from app.core.config import Settings
from app.services.vision.ollama import model_name, parse_reply, reason_about_image
from tests.conftest import make_image, new_session, stream, upload

# Shape of a real gemma4:31b reply (2026-10-10): JSON wrapped in a code fence.
REPLY = """```json
{"summary": "A dusk sky fading from navy to warm orange over dark hills 🌅",
 "moods": ["warm", "Dreamy", "serene", "cinematic", "bold"],
 "scene": ["Golden Hour", "hills", "sky", "silhouettes", "extra"],
 "headline_ideas": ["#golden hour, again", "after the light", "the quiet part", "spare"]}
```"""


def settings(**kw) -> Settings:
    return Settings(ollama_api_key="k", _env_file=None, **kw)


def run(handler, **kw):
    img = Image.new("RGB", (2000, 1000), (200, 120, 60))
    return asyncio.run(reason_about_image(img, settings(**kw), httpx.MockTransport(handler)))


def test_parse_reply_sanitizes_and_filters():
    r = parse_reply(REPLY, "gemma4:31b")
    assert r and r.summary.startswith("A dusk sky") and "🌅" not in r.summary
    assert r.moods == ["warm", "dreamy", "cinematic"]  # "serene" isn't an app mood; capped at 3
    assert r.scene == ["golden hour", "hills", "sky", "silhouettes"]
    assert r.headline_ideas == ["golden hour, again", "after the light", "the quiet part"]
    assert parse_reply("no json here", "m") is None
    assert parse_reply('{"moods": ["warm"]}', "m") is None  # summary required


def test_model_name_accepts_cloud_suffix():
    assert model_name("gemma4:31b:cloud") == "gemma4:31b"
    assert model_name("gemma4:31b-cloud") == "gemma4:31b"
    assert model_name("gemma4:31b") == "gemma4:31b"


def test_request_shape_and_downscale():
    seen = {}

    def h(req: httpx.Request):
        seen["auth"] = req.headers["authorization"]
        seen["body"] = json.loads(req.content)
        return httpx.Response(200, json={"message": {"content": REPLY}})

    result, err = run(h, ollama_model="gemma4:31b:cloud")
    assert err is None and result and result.model == "gemma4:31b"
    body = seen["body"]
    assert seen["auth"] == "Bearer k" and body["model"] == "gemma4:31b" and body["format"] == "json"
    assert "Never identify people" in body["messages"][0]["content"]
    import base64
    import io

    sent = Image.open(io.BytesIO(base64.b64decode(body["messages"][0]["images"][0])))
    assert max(sent.size) <= 768 and sent.format == "JPEG"


def test_failure_modes_never_raise():
    assert (
        run(lambda r: httpx.Response(410, json={"error": "retired"}))[1]
        == "VISION_MODEL_UNAVAILABLE"
    )
    assert run(lambda r: httpx.Response(401))[1] == "VISION_AUTH_FAILED"
    assert run(lambda r: httpx.Response(500))[1] == "VISION_UNAVAILABLE"
    assert (
        run(lambda r: httpx.Response(200, json={"message": {"content": "sure!"}}))[1]
        == "VISION_BAD_RESPONSE"
    )

    def slow(req):
        raise httpx.ReadTimeout("slow", request=req)

    assert run(slow) == (None, "VISION_TIMEOUT")


def test_disabled_without_key():
    img = Image.new("RGB", (10, 10))
    assert asyncio.run(reason_about_image(img, Settings(_env_file=None))) == (None, None)


def test_pipeline_uses_reasoning(client, monkeypatch):
    monkeypatch.setenv("OLLAMA_API_KEY", "k")
    from app.core.config import get_settings
    from app.services import analysis

    get_settings.cache_clear()
    monkeypatch.setattr(
        analysis,
        "vision_transport",
        httpx.MockTransport(lambda r: httpx.Response(200, json={"message": {"content": REPLY}})),
    )
    h = new_session(client)
    key = upload(client, h, make_image())
    res = stream(client.post("/v1/analysis", headers=h, json={"object_key": key}))[-1]["result"]
    assert res["image_reasoning"]["model"] == "gemma4:31b"
    assert res["visual_profile"]["mood"][:3] == ["warm", "dreamy", "cinematic"]
    assert res["layouts"][0]["headline"] == "golden hour, again"
    assert res["provenance"]["image_reasoning_used"] is True


def test_pipeline_survives_reasoning_outage(client, monkeypatch):
    monkeypatch.setenv("OLLAMA_API_KEY", "k")
    from app.core.config import get_settings
    from app.services import analysis

    get_settings.cache_clear()
    monkeypatch.setattr(
        analysis, "vision_transport", httpx.MockTransport(lambda r: httpx.Response(503))
    )
    h = new_session(client)
    key = upload(client, h, make_image())
    res = stream(client.post("/v1/analysis", headers=h, json={"object_key": key}))[-1]["result"]
    assert res["image_reasoning"] is None and len(res["layouts"]) == 3
    assert res["provenance"]["image_reasoning_error"] == "VISION_UNAVAILABLE"
