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
    assert len(out) == len(CATALOGUE) and len({fams[o.id] for o in out[:3]}) == 3
    s = out[0].score
    assert (
        abs(
            s.total
            - round(0.45 * s.visual_fit + 0.35 * s.cultural_style_fit + 0.20 * s.readability_fit, 3)
        )
        < 0.013  # + photo-specific tie-breaker (≤ 0.012)
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
        None,  # no trackId in this fixture
    )
    assert asyncio.run(find_track("The Artist", s, transport=_itunes(hit[:1]))) is None
    evil = [{"artistName": "The Artist", "trackName": "T", "trackViewUrl": "https://evil.example"}]
    assert asyncio.run(find_track("The Artist", s, transport=_itunes(evil))) == ("T", None, None)


def test_itunes_failure_and_disabled():
    s = Settings(_env_file=None)
    down = httpx.MockTransport(lambda r: httpx.Response(500))
    assert asyncio.run(find_track("A", s, transport=down)) is None
    off = Settings(music_metadata_provider="none", _env_file=None)
    assert asyncio.run(find_track("A", off)) is None


def test_every_shuffle_set_has_distinct_families():
    out = rank_layouts(profile(mood=["warm", "playful"]), [], None)
    fams = {t.id: t.family for t in CATALOGUE}
    for i in range(0, 15, 3):  # 5 full sets; the tail may repeat when families run out
        assert len({fams[o.id] for o in out[i : i + 3]}) == 3, [o.id for o in out[i : i + 3]]


def test_ai_picks_move_the_ranking():
    p = profile(mood=["natural"])
    base = [o.id for o in rank_layouts(p, [], None)][:3]
    picked = rank_layouts(p, [], None, ai_picks=["ticket", "vinyl", "y2k"])
    assert picked[0].id == "ticket" and picked[0].id not in base[:1]
    assert picked[0].score.ai_pick == 1.0 and "image model picked" in picked[0].reason


def test_different_photos_get_different_top_sets():
    from app.services.recommendations.layouts import rank_layouts as rl

    street = rl(
        profile(mood=["editorial", "minimal"], saturation=0.15),
        [],
        None,
        scene=["city street", "architecture"],
        subject=("scene", 0.5, 0.5),
    )
    party = rl(
        profile(mood=["playful", "bright"], saturation=0.6),
        [],
        None,
        scene=["birthday", "party"],
        subject=("person", 0.5, 0.4),
    )
    dog = rl(
        profile(mood=["warm", "natural"]),
        [],
        None,
        scene=["dog", "home", "tiled floor"],
        subject=("object", 0.5, 0.5),
    )
    tops = [tuple(o.id for o in x[:3]) for x in (street, party, dog)]
    assert len(set(tops)) == 3, tops
    from app.services.recommendations.layouts import TEMPLATES_BY_ID as by_id

    # The winner must suit the mood, whichever of the many fitting layouts it is.
    s, p = by_id[street[0].id].moods, by_id[party[0].id].moods
    assert max(s.get("editorial", 0), s.get("minimal", 0)) >= 0.8, street[0].id
    assert max(p.get("playful", 0), p.get("bright", 0)) >= 0.8, party[0].id


def test_mood_filter_rules():
    from app.services.recommendations.layouts import mood_filter

    assert mood_filter(profile(mood=["warm"], brightness=0.7)) == "golden"
    assert mood_filter(profile(mood=["nostalgic"])) == "film"
    assert mood_filter(profile(mood=["cool"])) == "cool"
    assert mood_filter(profile(mood=["minimal"], saturation=0.1, contrast=0.7)) == "noir"
    assert mood_filter(profile(mood=["natural"])) == "none"
    out = rank_layouts(profile(mood=["natural"]), [], None)
    assert {o.id: o.filter for o in out}["newspaper"] == "bw"  # template look overrides


def test_sql_template_check_matches_catalogue():
    import re
    from pathlib import Path

    sql = (Path(__file__).resolve().parents[3] / "supabase" / "schema.sql").read_text()
    block = re.search(r"stories_template check \((.*?)\);", sql, re.S)
    assert block, "stories_template constraint missing"
    ids = set(re.findall(r"'([a-z0-9]+)'", block.group(1)))
    assert ids == {t.id for t in CATALOGUE}
