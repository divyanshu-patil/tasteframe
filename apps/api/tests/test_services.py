"""Vision, ranking and music-metadata services."""

import asyncio

import httpx
from PIL import Image

from app.core.config import Settings
from app.schemas.api import VisualProfile
from app.services.music.itunes import find_track
from app.services.recommendations.layouts import CATALOGUE, rank_layouts, score_all
from app.services.vision.analyzer import analyze, merge_manual, mood_labels


def profile(**kw) -> VisualProfile:
    base = dict(
        palette=["#202020", "#c87830"],
        brightness=0.5,
        contrast=0.4,
        saturation=0.3,
        warmth=0.1,
        composition="portrait",
        mood=["natural"],
        source="vision",
        width=1080,
        height=1920,
    )
    return VisualProfile(**{**base, **kw})


def test_vision_dark_vs_bright():
    dark = analyze(Image.new("RGB", (400, 300), (15, 15, 25)))
    assert "moody" in dark.mood and dark.composition == "landscape"
    bright = analyze(Image.new("RGB", (300, 300), (250, 220, 170)))
    assert "bright" in bright.mood and "warm" in bright.mood and bright.composition == "square"
    assert bright.palette[0].startswith("#") and 0 <= bright.brightness <= 1


def test_mood_rules_default_and_manual_merge():
    assert mood_labels(0.5, 0.4, 0.3, 0.0, False) == ["natural"]
    p = merge_manual(profile(mood=["warm", "bright"]), ["minimal", "warm"])
    assert p.mood == ["minimal", "warm", "bright"] and p.source == "vision+manual"
    assert merge_manual(profile(), []).source == "vision"


def test_ranking_returns_three_distinct_families_and_formula():
    out = rank_layouts(profile(mood=["cinematic", "moody"]), [], None)
    fams = {t.id: t.family for t in CATALOGUE}
    assert len(out) == 3 and len({fams[o.id] for o in out}) == 3
    s = out[0].score
    assert (
        abs(
            s.total
            - round(0.45 * s.visual_fit + 0.35 * s.cultural_style_fit + 0.20 * s.readability_fit, 3)
        )
        < 0.002
    )
    assert s.cultural_style_fit == 0.5  # neutral without provider evidence


def test_cultural_tags_shift_ranking():
    p = profile(mood=["warm", "nostalgic"])
    plain = {t.id: s.total for t, s, _ in score_all(p, [])}
    disco = {t.id: (s, hits) for t, s, hits in score_all(p, ["Disco", "Funk", "Soul"])}
    assert disco["vintage"][0].total > plain["vintage"] and disco["vintage"][1]
    top = rank_layouts(p, ["Disco", "Funk", "Soul"], None)
    assert top[0].id == "vintage" and "Qloo" in top[0].reason


def test_readability_penalizes_busy_photo_for_text_on_photo():
    busy = {t.id: s for t, s, _ in score_all(profile(contrast=0.9, brightness=0.5), [])}
    assert busy["cinematic"].readability_fit < busy["editorial"].readability_fit


def _itunes(results):
    return httpx.MockTransport(lambda r: httpx.Response(200, json={"results": results}))


def test_itunes_exact_artist_match_only():
    s = Settings(_env_file=None)
    hit = [
        {"artistName": "Someone Else", "trackName": "Nope"},
        {
            "artistName": "the artist",
            "trackName": "Song",
            "trackViewUrl": "https://music.apple.com/us/album/x?i=1",
        },
    ]
    assert asyncio.run(find_track("The Artist", s, transport=_itunes(hit))) == (
        "Song",
        "https://music.apple.com/us/album/x?i=1",
    )
    assert asyncio.run(find_track("The Artist", s, transport=_itunes(hit[:1]))) is None
    evil = [{"artistName": "The Artist", "trackName": "T", "trackViewUrl": "https://evil.example"}]
    assert asyncio.run(find_track("The Artist", s, transport=_itunes(evil))) == ("T", None)


def test_itunes_failure_and_disabled():
    s = Settings(_env_file=None)
    down = httpx.MockTransport(lambda r: httpx.Response(500))
    assert asyncio.run(find_track("A", s, transport=down)) is None
    off = Settings(music_metadata_provider="none", _env_file=None)
    assert asyncio.run(find_track("A", off)) is None
