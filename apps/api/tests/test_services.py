"""Vision, ranking and music-metadata services."""

import asyncio
from datetime import date

import httpx
from PIL import Image

from app.core.config import Settings
from app.schemas.api import VisualProfile
from app.services.music import itunes
from app.services.music.itunes import find_track
from app.services.recommendations.layouts import CATALOGUE, rank_layouts, score_all
from app.services.vision.analyzer import analyze, merge_manual, mood_labels

SETTLED = date(2027, 1, 1)  # long after every layout's "new" window


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
    out = rank_layouts(profile(mood=["cinematic", "moody"]), [], None, today=SETTLED)
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
            "previewUrl": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview/a/b.m4a",
        },
    ]
    assert asyncio.run(find_track("The Artist", s, transport=_itunes(hit))) == (
        "Song",
        "https://music.apple.com/us/album/x?i=1",
        None,  # no trackId in this fixture
        "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview/a/b.m4a",
    )
    itunes._TRACKS.clear()  # each call below is a fresh lookup
    assert asyncio.run(find_track("The Artist", s, transport=_itunes(hit[:1]))) is None
    evil = [
        {
            "artistName": "The Artist",
            "trackName": "T",
            "trackViewUrl": "https://evil.example",
            "previewUrl": "https://evil.example/x.m4a",  # only Apple's preview host passes
        }
    ]
    itunes._TRACKS.clear()
    assert asyncio.run(find_track("The Artist", s, transport=_itunes(evil))) == (
        "T",
        None,
        None,
        None,
    )


def test_itunes_tracks_are_cached_per_artist():
    calls = []

    def h(req):
        calls.append(req)
        return httpx.Response(200, json={"results": [{"artistName": "Cached", "trackName": "S"}]})

    s = Settings(_env_file=None)
    for _ in range(3):
        assert asyncio.run(itunes.find_tracks("Cached", s, transport=httpx.MockTransport(h)))
    assert len(calls) == 1


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


def test_new_and_liked_layouts_get_a_boost_but_fit_still_rules():
    from app.services.recommendations.layouts import ADDED, newness

    p = profile(mood=["moody", "cinematic"])
    day = min(ADDED.values())
    base = {t.id: s.total for t, s, _ in score_all(p, [], today=SETTLED)}
    fresh = {t.id: s.total for t, s, _ in score_all(p, [], today=day)}
    assert newness("songbox", day) == 1 and newness("songbox", SETTLED) == 0
    assert fresh["songbox"] > base["songbox"] and fresh["cinematic"] == base["cinematic"]
    liked = {t.id: s.total for t, s, _ in score_all(p, [], likes={"vinyl": 40}, today=SETTLED)}
    assert liked["vinyl"] > base["vinyl"] and liked["cinematic"] == base["cinematic"]
    # A boost is at most +18%: a poorly fitting layout can't jump a good one.
    assert max(fresh[k] / base[k] for k in base) <= 1.181


def test_a_new_or_liked_layout_that_fits_is_promoted_into_the_first_three():
    from app.services.recommendations.layouts import ADDED

    p = profile(mood=["moody", "cinematic"])
    plain = rank_layouts(p, [], None, today=SETTLED)
    ids = [o.id for o in plain]
    # Something ranked 4th–9th and liked the most is moved into the first three.
    candidate = ids[4]
    boosted = rank_layouts(p, [], None, likes={candidate: 25, ids[30]: 3}, today=SETTLED)
    first = [o.id for o in boosted[:3]]
    assert candidate in first and boosted[first.index(candidate)].likes == 25
    fams = {t.id: t.family for t in CATALOGUE}
    assert len({fams[i] for i in first}) == 3
    # New layouts are flagged and named in the reason.
    new = rank_layouts(p, [], None, today=min(ADDED.values()))
    flagged = [o for o in new if o.is_new]
    assert {o.id for o in flagged} == set(ADDED) and "New layout." in flagged[0].reason


def test_trending_song_is_preferred():
    """Among a photo's top suggested songs, one in Apple Music's most-played chart (or reported
    trending on Reels) leads, even when it isn't the first pick."""
    from app.services import analysis
    from app.services.music.trending import key

    def h(req: httpx.Request) -> httpx.Response:
        if "most-played" in req.url.path:
            chart = [{"artistName": "Beta & Guest", "name": "Beta song 7 (feat. X)"}]
            return httpx.Response(200, json={"feed": {"results": chart}})
        a = req.url.params["term"]
        songs = [{"artistName": a, "trackName": f"{a} song {i}"} for i in range(9)]
        return httpx.Response(200, json={"results": songs})

    s = Settings(_env_file=None)
    old = analysis.music_transport
    analysis.music_transport = httpx.MockTransport(h)
    from app.services.music import trending

    async def run():
        await trending.refresh("en", s, analysis.music_transport)  # normally warmed at startup
        curated = [("Alpha", "Alpha song 0"), ("Beta", "Beta song 7")]  # second pick charts
        return await analysis.pick_music(curated, [], False, "cute", "en", [], 0, s, "US")

    try:
        m = asyncio.run(run())
    finally:
        analysis.music_transport = old
    assert (m.artist, m.title, m.trending) == ("Beta", "Beta song 7", "chart")
    assert m.alternatives[0].title == "Alpha song 0"
    assert all(x.trending is None for x in m.alternatives)
    assert "most-played" in m.explanation and "🔥" in m.explanation
    assert key("Hozier", "Too Sweet") == key("hozier & X", "Too Sweet (Remix)")


def test_vision_model_ranks_songs_against_the_photo():
    """The lead song is the vision model's best fit for the photo, not the pool's first pick;
    bad indices are ignored and short lists are topped up so each layout has a song."""
    import json

    from app.schemas.api import ImageReasoning
    from app.services import analysis

    seen = {}

    def ollama(req: httpx.Request) -> httpx.Response:
        seen["prompt"] = json.loads(req.content)["messages"][0]["content"]
        ranking = [{"i": 2, "why": "slow and warm, like the light"}, {"i": 0}, {"i": 99}]
        reply = {"message": {"content": json.dumps({"ranking": ranking})}}
        return httpx.Response(200, json=reply)

    def itunes(req: httpx.Request) -> httpx.Response:
        if "most-played" in req.url.path:
            return httpx.Response(404)
        a = req.url.params["term"]
        return httpx.Response(
            200, json={"results": [{"artistName": a, "trackName": f"{a}{i}"} for i in range(3)]}
        )

    s = Settings(_env_file=None, ollama_api_key="k")
    r = ImageReasoning(model="m", summary="a person smiling at golden hour", moods=["warm"])
    old = analysis.music_transport, analysis.vision_transport
    analysis.music_transport = httpx.MockTransport(itunes)
    analysis.vision_transport = httpx.MockTransport(ollama)
    try:
        curated = [("A", "A0"), ("B", "B0"), ("A", "A1"), ("B", "B1")]
        m = asyncio.run(analysis.pick_music(curated, [], False, "sweet", "en", [], 0, s, "US", r))
    finally:
        analysis.music_transport, analysis.vision_transport = old
    assert '0. "A0" — A' in seen["prompt"] and "golden hour" in seen["prompt"]
    assert (m.title, m.why) == ("A1", "slow and warm, like the light")
    assert [x.title for x in m.alternatives] == ["A0", "B0", "B1"]
    assert "Ranked against your photo" in m.explanation


def test_chart_lookup_never_waits_on_the_network():
    """Cold cache: no trending info this time, a background refresh fills it for the next one."""
    from app.services.music import trending

    chart = {"feed": {"results": [{"artistName": "A", "name": "S"}]}}
    t = httpx.MockTransport(lambda r: httpx.Response(200, json=chart))
    s = Settings(_env_file=None)

    async def run():
        first = trending.chart_keys("ko", s, t)
        await asyncio.gather(*trending._tasks)
        return first, trending.chart_keys("ko", s, t)

    assert asyncio.run(run()) == (set(), {("a", "s")})


def test_decode_keeps_full_size_bytes_but_a_small_image_for_analysis():
    import io

    from PIL import Image

    from app.services.vision.analyzer import decode_and_sanitize

    im = Image.new("RGB", (3000, 2000), "orange")
    exif = im.getexif()
    exif[0x0112] = 6  # rotate 90° on display, like a portrait phone shot
    buf = io.BytesIO()
    im.save(buf, "JPEG", exif=exif)
    small, clean, ctype = decode_and_sanitize(buf.getvalue(), 10 * 2**20, 40_000_000)
    assert small.size == (683, 1024)  # rotated, and capped for analysis (memory)
    stored = Image.open(io.BytesIO(clean))
    assert stored.size == (2000, 3000) and 0x0112 not in stored.getexif()  # full size, no EXIF
    assert ctype == "image/jpeg"


def test_every_layout_has_qloo_tags():
    """Rerun apps/api/scripts/layout_tags.py after adding a layout."""
    from app.services.recommendations.layouts import CATALOGUE, LAYOUT_TAGS, qloo_layout_fit

    assert not [t.id for t in CATALOGUE if not LAYOUT_TAGS.get(t.id)]
    assert set(LAYOUT_TAGS) <= {t.id for t in CATALOGUE}
    assert all(
        x["tag"].startswith("urn:tag:") and x["weight"] > 0 for v in LAYOUT_TAGS.values() for x in v
    )
    some = LAYOUT_TAGS["cinematic"][0]["tag"]
    fit = qloo_layout_fit({some: 0.9})
    assert max(f for f, _ in fit.values()) == 1.0 and fit["cinematic"][1]
    assert qloo_layout_fit({}) == {}


def test_exports_near_you_boost_a_layout():
    from app.services.recommendations.layouts import rank_layouts

    p = profile()
    base = [x.id for x in rank_layouts(p, [], None)]
    pick = base[-1]  # the last layout, exported a lot nearby
    boosted = rank_layouts(p, [], None, uses={pick: 50, base[0]: 1})
    ids = [x.id for x in boosted]
    assert ids.index(pick) < base.index(pick)
    assert "Often exported by people near you." in boosted[ids.index(pick)].reason


def test_layouts_chosen_for_this_kind_of_photo_get_boosted():
    from app.services.recommendations.layouts import rank_layouts

    p = profile()
    base = [x.id for x in rank_layouts(p, [], None, topic="food")]
    pick = base[-1]
    out = rank_layouts(p, [], None, topic="food", topic_uses={pick: 30, base[0]: 1})
    ids = [x.id for x in out]
    assert ids.index(pick) < base.index(pick)
    assert "Often chosen for food photos." in out[ids.index(pick)].reason
