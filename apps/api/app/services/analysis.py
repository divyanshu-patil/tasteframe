"""End-to-end analysis pipeline. Yields real stage events, then the result (or a safe error)."""

import asyncio
import hashlib
import logging
import secrets
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
from app.services.insights.likes import like_counts
from app.services.music.itunes import find_tracks
from app.services.music.trending import REELS_UPDATED, chart_keys, trend_of
from app.services.music.vibes import pool, rotate, vibe_from_cues
from app.services.qloo.client import QlooClient, QlooEntity
from app.services.recommendations.layouts import rank_layouts
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


async def cultural_signals(
    qloo: QlooClient, ids: list[str]
) -> tuple[list[QlooEntity], list[QlooEntity]]:
    """Two documented Insights queries (artist + movie) anchored on the given entity ids."""
    seed_ids = set(ids)
    results = await asyncio.gather(
        qloo.get_insights(ids, "artist", take=8),
        qloo.get_insights(ids, "movie", take=5),
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


async def pick_music(
    candidates: list[tuple[str, str]],
    vibe: str,
    language: str,
    evidence: list[str],
    seed: int,
    settings: Settings,
    country: str,
    reasoning: ImageReasoning | None = None,
) -> MusicSuggestion:
    """Up to 3 songs from each of the first 5 candidate (artist, source) — a trending one when the
    artist has it, else seeded picks from their top songs so photos differ — then the vision model
    ranks them against what it saw in the photo. Best fit leads; the rest are alternatives."""
    if not candidates:
        return MusicSuggestion(kind="none", explanation="No music suggestion for this photo.")
    head = candidates[:5]
    found = await asyncio.gather(
        *(find_tracks(a, settings, country, music_transport) for a, _ in head)
    )
    chart = chart_keys(language, settings, music_transport)
    groups: list[list[Song]] = []
    for (artist, src), tracks in zip(head, found, strict=True):
        hot = [t for t in tracks if trend_of(artist, t[0], chart)]
        chosen = list(dict.fromkeys([*hot[:1], *rotate(tracks[:10], seed)[:3]]))[:3]
        groups.append(
            [
                Song(
                    title=t,
                    artist=artist,
                    url=u,
                    track_id=i,
                    trending=trend_of(artist, t, chart),  # type: ignore[arg-type]
                    source=src,  # type: ignore[arg-type]
                )
                for t, u, i in chosen
            ]
        )
    # Without a ranking: one song per artist in turn (variety across layouts), trending first.
    default = [x for row in zip_longest(*groups) for x in row if x]
    default.sort(key=lambda x: x.trending is None)

    def why(artist: str, src: str) -> str:
        if src == "qloo":
            return f"Qloo links {artist} to {', '.join(evidence)}."
        return (
            f"Your photo reads as {vibe} — {artist} is one of our {LANGUAGE_NAMES[language]} "
            f"{vibe} picks (popular on Spotify, YouTube and Reels)."
        )

    if not default:
        artist, src = candidates[0]
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
    req: AnalysisIn, settings: Settings, storage: Storage, qloo: QlooClient, country: str = "US"
) -> AsyncIterator[dict]:
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
        vibe = (reasoning.vibe if reasoning else None) or vibe_from_cues(
            [*reasoning.expressions, *reasoning.elements, *reasoning.scene, *profile.mood]
            if reasoning
            else list(profile.mood)
        )
        vibe_artists = rotate(list(pool(req.music_language, vibe)), seed)
        artists: list[QlooEntity] = []
        movies: list[QlooEntity] = []
        qloo_error = None
        anchor: list[QlooEntity] = []
        if settings.qloo_enabled:
            try:  # the vibe's lead artist joins your favourites as a Qloo signal
                anchor = (await qloo.search_entities(vibe_artists[0], "artist", take=1))[:1]
            except AppError as e:
                qloo_error = e.code
        ids = [s.entity_id for s in req.taste_seeds] + [e.entity_id for e in anchor]
        if req.taste_seeds or anchor:
            try:
                artists, movies = await cultural_signals(qloo, ids)
            except AppError as e:
                qloo_error = e.code  # degrade: layouts still work, UI labels the gap
                log.warning("qloo unavailable code=%s", e.code)

        seed_names = [s.name for s in req.taste_seeds]
        evidence = [*seed_names, *(e.name for e in anchor)]
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

        related = [(e.name, "qloo") for e in rotate(artists[:4], seed)]
        pooled = [(a, "vibe") for a in vibe_artists]
        # With favourites, Qloo's related artists lead; otherwise the vibe pick leads and Qloo's
        # neighbours of it follow.
        ordered = [*related, *pooled] if req.taste_seeds else [pooled[0], *related[:2], *pooled[1:]]
        candidates: list[tuple[str, str]] = []
        for c in ordered:
            if all(c[0].casefold() != x.casefold() for x, _ in candidates):
                candidates.append(c)
        # Start on the songs now so they overlap the layout work; sent after the result.
        music_task = asyncio.create_task(
            pick_music(
                candidates,
                vibe,
                req.music_language,
                evidence,
                seed,
                settings,
                country,
                reasoning,
            )
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
        )

        result = AnalysisOut(
            analysis_id=secrets.token_urlsafe(12),
            visual_profile=profile,
            cultural_recommendations=recs,
            layouts=layouts,
            music=MusicSuggestion(kind="none", explanation="Picking songs for your photo…"),
            music_pending=True,
            image_reasoning=reasoning,
            provenance=Provenance(
                qloo_used=bool(artists or movies),
                qloo_error=qloo_error,
                visual_analysis_used=True,
                image_reasoning_used=reasoning is not None,
                image_reasoning_error=reasoning_error,
                track_level_result=False,  # songs follow in the {"music": …} event
                seeds=seed_names,
            ),
        )
        yield {"result": result.model_dump()}
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
