"""Optional image reasoning with a vision LLM on Ollama Cloud (default `gemma4:31b`).

Adds what pixel statistics can't: broad scene cues, a short aesthetic read and headline ideas.
It complements (never replaces) the local Pillow analysis; any failure just skips it.
Privacy: only a downscaled (≤768px), EXIF-stripped JPEG is sent; the prompt forbids identifying
people or inferring sensitive traits; outputs are validated and length-capped. Ollama states cloud
prompts are not used for training (docs.ollama.com/cloud). The UI discloses this when enabled.
Verified 2026-10-10: qwen3-vl:235b is retired (HTTP 410); gemma4:31b accepts images. JSON-schema
`format` returns empty content on gemma4, so we request `format: "json"` and validate ourselves.
"""

import asyncio
import base64
import io
import json
import logging
import re
import time
from typing import get_args

import httpx
from PIL import Image
from pydantic import ValidationError

from app.core.config import Settings
from app.schemas.api import ImageReasoning, Mood, SubjectPos
from app.services.recommendations.layouts import CATALOGUE
from app.services.vision.taxonomy import (
    normalize_expression,
    normalize_term,
    normalize_topic,
    prompt_vocabulary,
)

log = logging.getLogger("tasteframe.vision")
MOODS: tuple[str, ...] = get_args(Mood)

LAYOUT_IDS = {t.id for t in CATALOGUE}


def build_prompt(n: int) -> str:
    multi = (
        f"There are {n} photos (in order) that will share ONE Story. Read them together.\n"
        if n > 1
        else ""
    )
    subjects = (
        f'  "subjects": [{n} objects, one per photo in order: '
        '{"subject": "person"|"people"|"object"|"scene", "x": 0.0-1.0, "y": 0.0-1.0}],\n'
        if n > 1
        else ""
    )
    what = "photos" if n > 1 else "a photo"
    these = f"these {n} photos" if n > 1 else "THIS photo"
    count_hint = ", and how many photos each layout holds" if n > 1 else ""
    return f"""You are an art director reading {what} for an Instagram Story design.
{multi}Describe only broad visual aesthetics: light, colour, composition, setting and atmosphere.
Never identify people, and never guess age, gender, ethnicity, health, religion or any other
personal or sensitive attribute. If people appear, refer to them only as "a person" or "people".
Reply with ONLY a JSON object, no prose, no code fences:
{{"summary": "one sentence, max 160 chars, about the look and feel",
  "moods": [up to 3 words chosen ONLY from {list(MOODS)}],
  "scene": [up to 4 short lowercase scene cues, e.g. "golden hour", "city street", "seaside"],
  "headline_ideas": [3 short lowercase Story headlines, max 32 chars, no hashtags/emoji],
  "subject": one of "person", "people", "object", "scene" (the first photo's main subject),
  "subject_x": 0.0-1.0 horizontal centre of that subject (0 = left edge),
  "subject_y": 0.0-1.0 vertical centre of that subject (0 = top edge),
{subjects}  "about": the ONE topic id below that the image is mainly about,
  "elements": [up to 8 major things visible, chosen from the element vocabulary below,
               most important first: subjects, setting, sky, occasion, objects, light/style],
  "expressions": [up to 5 pose/expression/framing cues from the expression vocabulary below,
                  only if people are visible, else []],
  "best_layouts": [the 5 layout ids below that best suit {these}
                   (mood, subject, setting{count_hint}), best first;
                   be specific, don't default to the same few]}}
For a selfie or portrait, the subject is "person" and the position marks the centre of the
face area. Positions are for framing only — say nothing about who anyone is.
For people use neutral words (person, people, friends, couple, family, group) — never gender,
age, ethnicity, skin tone, disability, pregnancy or religion.
{prompt_vocabulary()}
Layouts:
{layout_menu(n)}"""


def layout_menu(n: int) -> str:
    def holds(t) -> str:
        return f" (holds {t.capacity} photos)" if t.capacity > 1 else " (1 photo)"

    return "\n".join(f"- {t.id}: {t.blurb}{holds(t) if n > 1 else ''}" for t in CATALOGUE)


PROMPT = build_prompt(1)


def _subjects(raw: dict, n: int, first: str, unit) -> list[SubjectPos]:
    """Per-photo subject positions; photo 1 falls back to the top-level subject fields."""
    out: list[SubjectPos] = []
    items = raw.get("subjects") if isinstance(raw.get("subjects"), list) else []
    for i in range(n):
        it = items[i] if i < len(items) and isinstance(items[i], dict) else {}
        if i == 0 and not it:
            it = {"subject": first, "x": raw.get("subject_x"), "y": raw.get("subject_y")}
        kind = (
            it.get("subject")
            if it.get("subject") in ("person", "people", "object", "scene")
            else "scene"
        )
        out.append(SubjectPos(subject=kind, x=unit(it.get("x")), y=unit(it.get("y"))))
    return out


def model_name(configured: str) -> str:
    """Accept `gemma4:31b:cloud` / `-cloud` (local-daemon style) for the direct cloud API."""
    return re.sub(r"[:-]cloud$", "", configured.strip())


def _jpeg_for_model(im: Image.Image, max_side: int = 768) -> str:
    small = im.convert("RGB")
    small.thumbnail((max_side, max_side))
    buf = io.BytesIO()
    small.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode()


def _clean_text(value: object, limit: int) -> str | None:
    if not isinstance(value, str):
        return None
    text = re.sub(r"[#\n\r\t]+", " ", value)
    text = re.sub(r"[^\w\s.,'’!?&:;()/-]", "", text).strip()  # strip emoji/markup
    return text[:limit] if text else None


def parse_reply(content: str, model: str, n: int = 1) -> ImageReasoning | None:
    """Tolerates code fences / surrounding prose; keeps only valid, capped fields."""
    m = re.search(r"\{.*\}", content, re.DOTALL)
    if not m:
        return None
    try:
        raw = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    if not isinstance(raw, dict):
        return None
    summary = _clean_text(raw.get("summary"), 200)
    if not summary:
        return None
    moods = [w for w in (raw.get("moods") or []) if isinstance(w, str) and w.lower() in MOODS]
    scene = [t.lower() for v in (raw.get("scene") or []) if (t := _clean_text(v, 32))]
    ideas = [t.lower() for v in (raw.get("headline_ideas") or []) if (t := _clean_text(v, 40))]
    subject = (
        raw.get("subject")
        if raw.get("subject") in ("person", "people", "object", "scene")
        else "scene"
    )

    def unit(v: object) -> float:
        return min(1.0, max(0.0, float(v))) if isinstance(v, int | float) else 0.5

    try:
        return ImageReasoning(
            model=model,
            subject=subject,
            subject_x=unit(raw.get("subject_x")),
            subject_y=unit(raw.get("subject_y")),
            layout_picks=list(
                dict.fromkeys(
                    v
                    for v in (raw.get("best_layouts") or [])
                    if isinstance(v, str) and v in LAYOUT_IDS
                )
            )[:5],
            subjects=_subjects(raw, n, subject, unit),
            about=normalize_topic(raw.get("about")),
            elements=list(
                dict.fromkeys(
                    t for v in (raw.get("elements") or [])[:16] if (t := normalize_term(v))
                )
            )[:8],
            expressions=list(
                dict.fromkeys(
                    t for v in (raw.get("expressions") or [])[:10] if (t := normalize_expression(v))
                )
            )[:5],
            summary=summary,
            moods=list(dict.fromkeys(w.lower() for w in moods))[:3],
            scene=list(dict.fromkeys(scene))[:4],
            headline_ideas=list(dict.fromkeys(ideas))[:3],
        )
    except ValidationError:
        return None


RETRYABLE = {"VISION_UNAVAILABLE", "VISION_BAD_RESPONSE"}


async def reason_about_image(
    im: Image.Image | list[Image.Image],
    settings: Settings,
    transport: httpx.AsyncBaseTransport | None = None,
) -> tuple[ImageReasoning | None, str | None]:
    """Returns (reasoning, error_code). Never raises: the pipeline continues without it.
    One retry for transient failures (5xx, transport, unparseable reply); not for timeouts."""
    result, err = await _reason_once(im, settings, transport)
    if err in RETRYABLE:
        log.info("ollama retry after %s", err)
        result, err = await _reason_once(im, settings, transport)
    return result, err


async def _reason_once(
    im: Image.Image | list[Image.Image],
    settings: Settings,
    transport: httpx.AsyncBaseTransport | None,
) -> tuple[ImageReasoning | None, str | None]:
    images = im if isinstance(im, list) else [im]
    # Downscale/encode off the event loop (large phone photos are CPU-heavy).
    encoded = await asyncio.gather(*(asyncio.to_thread(_jpeg_for_model, x) for x in images))
    if not settings.ollama_enabled:
        return None, None
    model = model_name(settings.ollama_model)
    key = settings.ollama_api_key.get_secret_value()  # type: ignore[union-attr]
    body = {
        "model": model,
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.3},
        "messages": [
            {
                "role": "user",
                "content": build_prompt(len(images)),
                "images": encoded,
            }
        ],
    }
    started = time.monotonic()
    try:
        async with httpx.AsyncClient(
            base_url=settings.ollama_base_url,
            # More photos → more tokens to read; give each extra photo a little more time.
            timeout=httpx.Timeout(
                settings.ollama_timeout_seconds + 5 * (len(images) - 1), connect=5.0
            ),
            transport=transport,
        ) as client:
            resp = await client.post(
                "/api/chat", json=body, headers={"Authorization": f"Bearer {key}"}
            )
    except httpx.TimeoutException:
        log.warning("ollama timeout model=%s", model)
        return None, "VISION_TIMEOUT"
    except httpx.HTTPError:
        log.warning("ollama transport error model=%s", model)
        return None, "VISION_UNAVAILABLE"
    elapsed = time.monotonic() - started
    if resp.status_code in (401, 403):
        log.warning("ollama auth failed")
        return None, "VISION_AUTH_FAILED"
    if resp.status_code == 410 or resp.status_code == 404:
        log.warning("ollama model unavailable model=%s status=%d", model, resp.status_code)
        return None, "VISION_MODEL_UNAVAILABLE"
    if resp.status_code != 200:
        log.warning("ollama status=%d model=%s", resp.status_code, model)
        return None, "VISION_UNAVAILABLE"
    try:
        content = resp.json().get("message", {}).get("content", "")
    except (ValueError, AttributeError):
        content = ""
    result = parse_reply(content if isinstance(content, str) else "", model, len(images))
    log.info("ollama ok=%s model=%s elapsed=%.1fs", bool(result), model, elapsed)
    return (result, None) if result else (None, "VISION_BAD_RESPONSE")
