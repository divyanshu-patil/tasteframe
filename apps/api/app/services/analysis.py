"""End-to-end analysis pipeline. Yields real stage events, then the result (or a safe error)."""

import asyncio
import logging
import secrets
from collections.abc import AsyncIterator

from app.core.config import Settings
from app.core.errors import AppError, request_id_var
from app.schemas.api import (
    AnalysisIn,
    AnalysisOut,
    CulturalRecommendation,
    MusicSuggestion,
    Provenance,
    VisualProfile,
)
from app.services.music.itunes import find_track
from app.services.qloo.client import QlooClient, QlooEntity
from app.services.recommendations.layouts import rank_layouts
from app.services.storage.store import Storage
from app.services.vision.analyzer import analyze, decode_and_sanitize, merge_manual
from app.services.vision.ollama import reason_about_image

log = logging.getLogger("tasteframe.analysis")
# Tests swap this for an httpx.MockTransport.
vision_transport = None


async def cultural_signals(
    qloo: QlooClient, req: AnalysisIn
) -> tuple[list[QlooEntity], list[QlooEntity]]:
    """Two documented Insights queries (artist + movie) anchored on the confirmed seeds."""
    ids = [s.entity_id for s in req.taste_seeds]
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


def _music_line(music: MusicSuggestion) -> str | None:
    if music.kind == "track":
        return f"now playing — {music.title} · {music.artist}"
    if music.kind == "artist":
        return f"on repeat — {music.artist}"
    return None


async def run_analysis(
    req: AnalysisIn, settings: Settings, storage: Storage, qloo: QlooClient, country: str = "US"
) -> AsyncIterator[dict]:
    try:
        yield {"stage": "photo"}
        data = await asyncio.to_thread(storage.get, req.object_key)
        if data is None:
            raise AppError("OBJECT_NOT_FOUND", "That upload was not found or has expired.", 404)
        im, clean, ctype = await asyncio.to_thread(
            decode_and_sanitize, data, settings.s3_upload_max_bytes, settings.max_image_pixels
        )
        # Replace the original with the metadata-stripped copy (drops EXIF/GPS at rest).
        await asyncio.to_thread(storage.put, req.object_key, clean, ctype)

        yield {"stage": "mood"}
        # Local pixel statistics and (optional) vision-LLM reasoning run concurrently.
        measured, (reasoning, reasoning_error) = await asyncio.gather(
            asyncio.to_thread(analyze, im), reason_about_image(im, settings, vision_transport)
        )
        # Mood priority: the user's picks, then the model's read, then measured rules.
        model_moods = reasoning.moods if reasoning else []
        profile: VisualProfile = merge_manual(measured, [*req.manual_mood, *model_moods])
        if not req.manual_mood and model_moods:
            profile = profile.model_copy(update={"source": "vision"})

        yield {"stage": "taste"}
        artists: list[QlooEntity] = []
        movies: list[QlooEntity] = []
        qloo_error = None
        if req.taste_seeds:
            try:
                artists, movies = await cultural_signals(qloo, req)
            except AppError as e:
                qloo_error = e.code  # degrade: layouts still work, UI labels the gap
                log.warning("qloo unavailable code=%s", e.code)

        seed_names = [s.name for s in req.taste_seeds]
        recs = [
            CulturalRecommendation(
                kind=e.entity_type,
                entity_id=e.entity_id,
                name=e.name,
                tags=e.tags[:4],  # type: ignore[arg-type]
                reason=f"Qloo affinity with {', '.join(seed_names)}",
                evidence=seed_names,
            )
            for e in [*artists[:3], *movies[:2]]
        ]

        if artists:
            top = artists[0]
            track = await find_track(top.name, settings, country)
            explanation = f"Qloo links {top.name} to your taste in {', '.join(seed_names)}."
            if track:
                music = MusicSuggestion(
                    kind="track",
                    artist=top.name,
                    title=track[0],
                    url=track[1],
                    artist_source="qloo",
                    track_source="itunes",
                    explanation=explanation + " The song is a top iTunes Search result for that "
                    "artist, not a Qloo pick.",
                )
            else:
                music = MusicSuggestion(
                    kind="artist",
                    artist=top.name,
                    artist_source="qloo",
                    explanation=explanation + " Artist suggestion — no verified track metadata.",
                )
        else:
            why = (
                "Cultural recommendations were unavailable."
                if qloo_error
                else "Add a favorite artist, film or brand to get a Qloo-informed music pick."
            )
            music = MusicSuggestion(kind="none", explanation=why)

        yield {"stage": "layouts"}
        tags = [t for e in [*artists, *movies] for t in e.tags]
        layouts = rank_layouts(
            profile,
            tags,
            _music_line(music),
            headlines=reasoning.headline_ideas if reasoning else None,
            subject=(reasoning.subject, reasoning.subject_x, reasoning.subject_y)
            if reasoning
            else None,
        )

        result = AnalysisOut(
            analysis_id=secrets.token_urlsafe(12),
            visual_profile=profile,
            cultural_recommendations=recs,
            layouts=layouts,
            music=music,
            image_reasoning=reasoning,
            provenance=Provenance(
                qloo_used=bool(artists or movies),
                qloo_error=qloo_error,
                visual_analysis_used=True,
                image_reasoning_used=reasoning is not None,
                image_reasoning_error=reasoning_error,
                track_level_result=music.kind == "track",
                seeds=seed_names,
            ),
        )
        yield {"result": result.model_dump()}
    except AppError as e:
        yield e.body()
    except Exception:
        log.exception("analysis failed rid=%s", request_id_var.get())
        yield AppError("INTERNAL_ERROR", "Analysis failed. Please try again.", 500, True).body()
