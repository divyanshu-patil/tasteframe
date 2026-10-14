"""End-to-end analysis pipeline. Yields real stage events, then the result (or a safe error)."""

import asyncio
import hashlib
import logging
import secrets
import time
from collections.abc import AsyncIterator
from itertools import zip_longest

from app.core.config import Settings
from app.core.errors import AppError, request_id_var
from app.schemas.api import (
    AnalysisIn,
    AnalysisOut,
    CulturalRecommendation,
    ImageReasoning,
    MusicSuggestion,
    Provenance,
    Song,
    VisualProfile,
)
from app.services.insights.community import community_picks
from app.services.insights.likes import like_counts
from app.services.music.itunes import find_tracks
from app.services.music.moods import clean_wish, moods_in, qloo_tags, vibe_for
from app.services.music.trending import REELS_UPDATED, chart_keys, key, trend_of
from app.services.music.vibes import rotate, songs_for, vibe_from_cues
from app.services.qloo import usage
from app.services.qloo.client import QlooClient, QlooEntity
from app.services.recommendations.layouts import (
    QLOO_RULE,
    QLOO_RULE_NO_AI,
    layout_tag_ids,
    qloo_layout_fit,
    rank_layouts,
)
from app.services.region import country_name
from app.services.storage.store import Storage
from app.services.vision.analyzer import (
    analyze,
    decode_and_sanitize,
    merge_manual,
    merge_profiles,
)
from app.services.vision.ollama import rank_songs, reason_about_image

log = logging.getLogger("tasteframe.analysis")
# Tests swap this for an httpx.MockTransport.
vision_transport = None
music_transport = None


LANGUAGE_NAMES = {"en": "English", "hi": "Hindi", "pa": "Punjabi", "es": "Spanish", "ko": "Korean"}


async def _no_affinity() -> dict[str, float]:
    return {}


async def cultural_signals(
    qloo: QlooClient,
    ids: list[str],
    mood_tags: list[str] | None = None,
    location: str | None = None,
) -> tuple[list[QlooEntity], list[QlooEntity]]:
    """Two documented Insights queries (artist + movie) anchored on the given entity ids. The
    music mood asked for (fixed Qloo tag ids) and the region steer the artists."""
    seed_ids = set(ids)
    results = await asyncio.gather(
        qloo.get_insights(ids, "artist", take=8, tags=mood_tags, location=location),
        qloo.get_insights(ids, "movie", take=5, location=location),
        return_exceptions=True,
    )
    errors = [r for r in results if isinstance(r, BaseException)]
    if len(errors) == len(results):
        raise errors[0]
    artists, movies = (
        [e for e in r if e.entity_id not in seed_ids] if isinstance(r, list) else []
        for r in results
    )
    return artists, movies


# Artist name → Qloo entity id for the most-picked artists in a region (identifiers only).
# ponytail: per-process, a day; Qloo's caching terms weren't verified, so nothing else is kept.
_ARTIST_IDS: dict[str, tuple[float, QlooEntity | None]] = {}


async def popular_artists(qloo: QlooClient, names: list[str]) -> list[QlooEntity]:
    out = []
    for name in names:
        hit = _ARTIST_IDS.get(name)
        if not hit or time.monotonic() - hit[0] > 86400:
            found = (await qloo.search_entities(name, "artist", take=1))[:1]
            hit = _ARTIST_IDS[name] = (time.monotonic(), found[0] if found else None)
        if hit[1]:
            out.append(hit[1])
    return out


async def pick_music(
    curated: list[tuple[str, str]],
    related: list[str],
    favourites_first: bool,
    vibe: str,
    language: str,
    evidence: list[str],
    seed: int,
    settings: Settings,
    country: str,
    reasoning: ImageReasoning | None = None,
    wish: str | None = None,
) -> MusicSuggestion:
    """Candidate songs: the curated (artist, title) picks for the photo's vibe, each verified in
    the artist's iTunes catalogue, plus a couple of songs by Qloo-related artists (a trending one
    when they have it). The vision model then ranks them against what it saw in the photo; best
    fit leads, the rest are alternatives (one per layout)."""
    curated, related = curated[:6], related[:3]
    artists = list(dict.fromkeys([a for a, _ in curated] + related))
    if not artists:
        return MusicSuggestion(kind="none", explanation="No music suggestion for this photo.")
    found = dict(
        zip(
            artists,
            await asyncio.gather(
                *(find_tracks(a, settings, country, music_transport) for a in artists)
            ),
            strict=True,
        )
    )
    chart = chart_keys(language, settings, music_transport)

    def song(artist: str, src: str, t: tuple[str, str | None, int | None]) -> Song:
        trend = trend_of(artist, t[0], chart)
        return Song(title=t[0], artist=artist, url=t[1], track_id=t[2], trending=trend, source=src)  # type: ignore[arg-type]

    picked = [
        song(a, "vibe", t)
        for a, title in curated
        if (t := next((x for x in found[a] if key(a, x[0]) == key(a, title)), None))
    ]
    if len(picked) < 4:  # titles iTunes doesn't list: fall back to those artists' top songs
        picked += [song(a, "vibe", t) for a, _ in curated for t in rotate(found[a][:10], seed)[:1]]
    qloo: list[Song] = []
    for a in related:
        hot = [t for t in found[a] if trend_of(a, t[0], chart)]
        qloo += [
            song(a, "qloo", t)
            for t in list(dict.fromkeys([*hot[:1], *rotate(found[a][:10], seed)[:2]]))[:2]
        ]
    # Without a ranking: favourites' neighbours and vibe picks take turns (or vibe picks first);
    # duplicates dropped.
    mixed = (
        [x for row in zip_longest(qloo, picked) for x in row if x]
        if favourites_first
        else [*picked, *qloo]
    )
    default: list[Song] = []
    for x in mixed:
        if all((x.title.casefold(), x.artist) != (y.title.casefold(), y.artist) for y in default):
            default.append(x)
    # Trending wins among this photo's top few only, so photos with one vibe don't all share
    # the same trending song.
    default[:3] = sorted(default[:3], key=lambda x: x.trending is None)

    def why(artist: str, src: str) -> str:
        if src == "qloo":
            return f"Qloo links {artist} to {', '.join(evidence)}."
        return (
            f"Your photo reads as {vibe} — {artist} is one of our {LANGUAGE_NAMES[language]} "
            f"{vibe} picks (popular on Spotify, YouTube and Reels)."
        )

    if not default:
        artist, src = (related[0], "qloo") if favourites_first and related else (artists[0], "vibe")
        return MusicSuggestion(
            kind="artist",
            artist=artist,
            artist_source=src,  # type: ignore[arg-type]
            vibe=vibe,  # type: ignore[arg-type]
            language=language,  # type: ignore[arg-type]
            explanation=why(artist, src) + " Artist suggestion — no verified track metadata.",
        )
    ranked = (
        await rank_songs(
            reasoning,
            vibe,
            [(x.title, x.artist, bool(x.trending)) for x in default],
            settings,
            vision_transport,
            wish,
        )
        if reasoning
        else None
    )
    songs = [default[i].model_copy(update={"why": w}) for i, w in ranked] if ranked else default
    if len(songs) < 4:  # keep enough songs to give each layout its own
        picked = {(x.title, x.artist) for x in songs}
        songs += [x for x in default if (x.title, x.artist) not in picked]
    lead = songs[0]
    # One explanation for the whole list (each layout shows a different song from it).
    qloo = any(x.source == "qloo" for x in songs)
    explanation = (
        f"Songs for your photo's {vibe} vibe, from {LANGUAGE_NAMES[language]} artists popular on "
        "Spotify, YouTube and Reels"
        + (f"; artists marked Qloo are related to {', '.join(evidence)}" if qloo else "")
        + (". Ranked against your photo by the vision model" if ranked else "")
        + ". Song titles via iTunes Search (Qloo suggests artists, not songs)."
        + (
            f" 🔥 = in Apple Music's most-played now, or trending on Reels ({REELS_UPDATED})."
            if any(x.trending for x in songs)
            else ""
        )
    )
    return MusicSuggestion(
        kind="track",
        artist=lead.artist,
        title=lead.title,
        url=lead.url,
        track_id=lead.track_id,
        artist_source=lead.source,
        track_source="itunes",
        vibe=vibe,  # type: ignore[arg-type]
        language=language,  # type: ignore[arg-type]
        explanation=explanation,
        trending=lead.trending,
        why=lead.why,
        alternatives=songs[1:9],
    )


async def run_analysis(
    req: AnalysisIn,
    settings: Settings,
    storage: Storage,
    qloo: QlooClient,
    country: str = "US",
    region: str | None = None,
) -> AsyncIterator[dict]:
    """`country`: iTunes storefront. `region`: the person's country code (tracking, Qloo
    location signal, what people near them pick)."""
    try:
        yield {"stage": "photo"}
        images = []
        for key in req.object_keys:
            data = await asyncio.to_thread(storage.get, key)
            if data is None:
                raise AppError("OBJECT_NOT_FOUND", "That upload was not found or has expired.", 404)
            im, clean, ctype = await asyncio.to_thread(
                decode_and_sanitize, data, settings.s3_upload_max_bytes, settings.max_image_pixels
            )
            # Replace each original with the metadata-stripped copy (drops EXIF/GPS at rest).
            await asyncio.to_thread(storage.put, key, clean, ctype)
            images.append(im)

        yield {"stage": "mood"}
        # Local pixel statistics (per photo, then merged) and the optional vision-LLM read of all
        # photos together run concurrently.
        measured_each, (reasoning, reasoning_error) = await asyncio.gather(
            asyncio.gather(*(asyncio.to_thread(analyze, im) for im in images)),
            reason_about_image(images, settings, vision_transport),
        )
        measured = merge_profiles(list(measured_each))
        # Mood priority: the user's picks, then the model's read, then measured rules.
        model_moods = reasoning.moods if reasoning else []
        profile: VisualProfile = merge_manual(measured, [*req.manual_mood, *model_moods])
        if not req.manual_mood and model_moods:
            profile = profile.model_copy(update={"source": "vision"})

        yield {"stage": "taste"}
        # The photo's vibe (vision model's read, else pose/mood cues) picks a default artist pool
        # in the chosen language, so a song is suggested with or without favourites.
        # Per-upload seed (keys are random): each photo gets its own pick, re-runs keep it.
        seed = int.from_bytes(hashlib.sha256("|".join(req.object_keys).encode()).digest()[:8])
        # What they asked for ("baddie, sexy, mild tone") → our moods; it picks the song pool and
        # its Qloo tags steer the related artists.
        wish = clean_wish(req.music_wish)
        wish_moods = moods_in(wish)
        picks = await community_picks(settings, region)
        vibe = (
            vibe_for(wish_moods)
            or (reasoning.vibe if reasoning else None)
            or vibe_from_cues(
                [*reasoning.expressions, *reasoning.elements, *reasoning.scene, *profile.mood]
                if reasoning
                else list(profile.mood)
            )
        )
        vibe_songs = rotate(list(songs_for(req.music_language, vibe)), seed)
        artists: list[QlooEntity] = []
        movies: list[QlooEntity] = []
        qloo_error = None
        anchor: list[QlooEntity] = []
        qloo_on = await qloo.enabled()  # admins can switch Qloo off for everyone
        if qloo_on:
            try:  # the vibe's lead artist joins your favourites as a Qloo signal
                anchor = (await qloo.search_entities(vibe_songs[0][0], "artist", take=1))[:1]
            except AppError as e:
                qloo_error = e.code
        if qloo_on and not req.taste_seeds and picks.artists:
            try:  # no favourites: what people near you play/export joins the signal
                anchor += [
                    e
                    for e in await popular_artists(qloo, picks.artists[:2])
                    if e.entity_id not in {a.entity_id for a in anchor}
                ]
            except AppError as e:
                qloo_error = e.code
        ids = [s.entity_id for s in req.taste_seeds] + [e.entity_id for e in anchor]
        qloo_fit: dict[str, tuple[float, list[str]]] | None = None
        if qloo_on and (req.taste_seeds or anchor):
            # Admin switch: Qloo also scores each layout's tags against the same taste signal.
            by_qloo = await usage.layouts_on(settings)
            signals, affinity = await asyncio.gather(
                cultural_signals(qloo, ids, qloo_tags(wish_moods), country_name(region)),
                qloo.tag_affinity(ids, layout_tag_ids()) if by_qloo else _no_affinity(),
                return_exceptions=True,
            )
            for r in (signals, affinity):
                if isinstance(r, AppError):
                    qloo_error = r.code  # degrade: layouts still work, UI labels the gap
                    log.warning("qloo unavailable code=%s", r.code)
                elif isinstance(r, BaseException):
                    raise r
            if not isinstance(signals, BaseException):
                artists, movies = signals
            if by_qloo and isinstance(affinity, dict):
                qloo_fit = qloo_layout_fit(affinity) or None  # nothing back: local ranking

        seed_names = [s.name for s in req.taste_seeds]
        evidence = [*seed_names, *(e.name for e in anchor)]
        if wish_moods:
            evidence.append(f"the {' / '.join(wish_moods[:3])} mood you asked for")
        recs = [
            CulturalRecommendation(
                kind=e.entity_type,
                entity_id=e.entity_id,
                name=e.name,
                tags=e.tags[:4],  # type: ignore[arg-type]
                reason=f"Qloo affinity with {', '.join(evidence)}",
                evidence=evidence,
            )
            for e in [*artists[:3], *movies[:2]]
        ]

        # Start on the songs now so they overlap the layout work; sent after the result.
        # Songs are only suggested while Qloo is on (admin switch / key configured).
        music_task = (
            asyncio.create_task(
                pick_music(
                    vibe_songs,
                    [e.name for e in (artists[:4] if wish_moods else rotate(artists[:4], seed))],
                    bool(req.taste_seeds or wish_moods),
                    vibe,
                    req.music_language,
                    evidence,
                    seed,
                    settings,
                    country,
                    reasoning,
                    wish,
                )
            )
            if qloo_on
            else None
        )
        yield {"stage": "layouts"}
        tags = [t for e in [*artists, *movies] for t in e.tags]
        layouts = rank_layouts(
            profile,
            tags,
            None,  # the "now playing" caption is set per layout in the browser once songs arrive
            headlines=reasoning.headline_ideas if reasoning else None,
            subject=(reasoning.subject, reasoning.subject_x, reasoning.subject_y)
            if reasoning
            else None,
            scene=[*reasoning.scene, *reasoning.elements, *reasoning.expressions]
            if reasoning
            else None,
            topic=reasoning.about if reasoning else None,
            ai_picks=reasoning.layout_picks if reasoning else None,
            subjects=[(x.subject, x.x, x.y) for x in reasoning.subjects] if reasoning else None,
            likes=await like_counts(settings),
            qloo_fit=qloo_fit,
            uses=picks.layouts,
        )

        result = AnalysisOut(
            analysis_id=secrets.token_urlsafe(12),
            visual_profile=profile,
            cultural_recommendations=recs,
            layouts=layouts,
            music=MusicSuggestion(
                kind="none",
                explanation="Picking songs for your photo…"
                if music_task
                else "Can't suggest music while Qloo is off.",
            ),
            music_pending=music_task is not None,
            image_reasoning=reasoning,
            provenance=Provenance(
                qloo_used=bool(artists or movies or qloo_fit),
                qloo_error=qloo_error,
                visual_analysis_used=True,
                image_reasoning_used=reasoning is not None,
                image_reasoning_error=reasoning_error,
                track_level_result=False,  # songs follow in the {"music": …} event
                seeds=seed_names,
                layouts_by_qloo=qloo_fit is not None,
                music_off=music_task is None,
                music_moods=wish_moods,
                **(
                    {"layout_rule": QLOO_RULE if reasoning else QLOO_RULE_NO_AI} if qloo_fit else {}
                ),
            ),
        )
        yield {"result": result.model_dump()}
        if music_task is None:
            return
        # Songs come after the layouts are on screen: fetching and ranking them takes a while.
        try:
            music = await music_task
        except Exception:
            log.exception("music pick failed rid=%s", request_id_var.get())
            music = MusicSuggestion(kind="none", explanation="Couldn't pick songs right now.")
        yield {"music": music.model_dump()}
    except AppError as e:
        yield e.body()
    except Exception:
        log.exception("analysis failed rid=%s", request_id_var.get())
        yield AppError("INTERNAL_ERROR", "Analysis failed. Please try again.", 500, True).body()
