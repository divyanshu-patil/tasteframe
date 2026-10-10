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
    from app.services.recommendations.layouts import CATALOGUE

    assert res["image_reasoning"] is None and len(res["layouts"]) == len(CATALOGUE)
    assert res["provenance"]["image_reasoning_error"] == "VISION_UNAVAILABLE"


SELFIE = """{"summary": "A warm close portrait in window light.", "moods": ["warm", "dreamy"],
 "scene": ["indoor portrait"], "headline_ideas": ["soft light", "today", "me, lately"],
 "subject": "person", "subject_x": 0.62, "subject_y": 0.31}"""


def test_parse_subject_position_clamped_and_defaulted():
    r = parse_reply(SELFIE, "gemma4:31b")
    assert r and (r.subject, r.subject_x, r.subject_y) == ("person", 0.62, 0.31)
    odd = parse_reply(
        '{"summary": "x", "subject": "celebrity", "subject_x": 7, "subject_y": "top"}', "m"
    )
    assert odd and (odd.subject, odd.subject_x, odd.subject_y) == ("scene", 1.0, 0.5)


def test_people_photos_avoid_split_templates_and_focus_on_subject():
    from app.services.recommendations.layouts import rank_layouts, score_all
    from tests.test_services import profile

    p = profile(mood=["nostalgic", "cinematic"], composition="landscape")
    plain = {t.id: s.visual_fit for t, s, _ in score_all(p, [])}
    people = {t.id: s.visual_fit for t, s, _ in score_all(p, [], people=True)}
    assert people["filmstrip"] < plain["filmstrip"] and people["stills"] < plain["stills"]
    out = rank_layouts(p, [], None, subject=("person", 0.62, 0.31))
    assert all((o.focus_x, o.focus_y) == (0.62, 0.31) for o in out)
    assert "keep the person in shot" in out[0].reason
    centred = rank_layouts(p, [], None, subject=("scene", 0.9, 0.9))
    assert all((o.focus_x, o.focus_y) == (0.5, 0.5) for o in centred)


def test_pipeline_passes_subject_focus(client, monkeypatch):
    monkeypatch.setenv("OLLAMA_API_KEY", "k")
    from app.core.config import get_settings
    from app.services import analysis

    get_settings.cache_clear()
    monkeypatch.setattr(
        analysis,
        "vision_transport",
        httpx.MockTransport(lambda r: httpx.Response(200, json={"message": {"content": SELFIE}})),
    )
    h = new_session(client)
    key = upload(client, h, make_image())
    res = stream(client.post("/v1/analysis", headers=h, json={"object_key": key}))[-1]["result"]
    assert res["image_reasoning"]["subject"] == "person"
    assert {(lay["focus_x"], lay["focus_y"]) for lay in res["layouts"]} == {(0.62, 0.31)}
    assert not {"stills", "filmstrip", "photodump"} & {lay["id"] for lay in res["layouts"][:3]}


def test_transient_failure_is_retried_once():
    calls = []

    def flaky(req):
        calls.append(req)
        if len(calls) == 1:
            return httpx.Response(502)
        return httpx.Response(200, json={"message": {"content": SELFIE}})

    result, err = run(flaky)
    assert err is None and result and len(calls) == 2
    calls.clear()
    assert run(lambda r: (calls.append(r), httpx.Response(401))[1])[1] == "VISION_AUTH_FAILED"
    assert len(calls) == 1  # auth errors aren't retried


def test_topic_and_elements_are_normalised_and_neutral():
    reply = """{"summary": "Two friends laughing at a birthday party.", "moods": ["playful"],
      "about": "Celebration", "elements": ["Woman", "boy", "birthday cake", "Balloons",
      "interracial couple", "pregnant woman", "fireworks", "unicorn hat", "people laughing"],
      "headline_ideas": ["party mode"]}"""
    r = parse_reply(reply, "gemma4:31b")
    assert r and r.about == "celebration"
    assert r.elements == [
        "person",
        "birthday cake",
        "balloons",
        "couple",
        "fireworks",
        "people laughing",
    ]  # neutral words; sensitive/unknown terms dropped
    assert "Never" in __import__("app.services.vision.ollama", fromlist=["x"]).build_prompt(1)


def test_topic_steers_ranking():
    from app.services.recommendations.layouts import TEMPLATES_BY_ID, TOPIC_LAYOUTS, rank_layouts
    from tests.test_services import profile

    for topic, ids in TOPIC_LAYOUTS.items():
        assert all(i in TEMPLATES_BY_ID for i in ids), topic
    p = profile(mood=["natural"])
    pet = rank_layouts(p, [], None, topic="pet", scene=["dog", "tiled floor"])
    music = rank_layouts(
        profile(mood=["moody", "cinematic"]),
        [],
        None,
        topic="music",
        scene=["concert", "neon light"],
    )
    assert pet[0].id in TOPIC_LAYOUTS["pet"][:3] and music[0].id in TOPIC_LAYOUTS["music"][:3]
    assert "Made for pet photos" in pet[0].reason
