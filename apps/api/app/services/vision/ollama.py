"""Optional image reasoning with a vision LLM on Ollama Cloud (default `gemma4:31b`).

Adds what pixel statistics can't: broad scene cues, a short aesthetic read and headline ideas.
It complements (never replaces) the local Pillow analysis; any failure just skips it.
Privacy: only a downscaled (≤768px), EXIF-stripped JPEG is sent; the prompt forbids identifying
people or inferring sensitive traits; outputs are validated and length-capped. Ollama states cloud
prompts are not used for training (docs.ollama.com/cloud). The UI discloses this when enabled.
Verified 2026-10-10: qwen3-vl:235b is retired (HTTP 410); gemma4:31b accepts images. JSON-schema
`format` returns empty content on gemma4, so we request `format: "json"` and validate ourselves.
"""

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
from app.schemas.api import ImageReasoning, Mood

log = logging.getLogger("tasteframe.vision")
MOODS: tuple[str, ...] = get_args(Mood)

PROMPT = f"""You are an art director reading a photo for an Instagram Story design.
Describe only broad visual aesthetics: light, colour, composition, setting and atmosphere.
Never identify people, and never guess age, gender, ethnicity, health, religion or any other
personal or sensitive attribute. If people appear, refer to them only as "a person" or "people".
Reply with ONLY a JSON object, no prose, no code fences:
{{"summary": "one sentence, max 160 chars, about the photo's look and feel",
  "moods": [up to 3 words chosen ONLY from {list(MOODS)}],
  "scene": [up to 4 short lowercase scene cues, e.g. "golden hour", "city street", "seaside"],
  "headline_ideas": [3 short lowercase Story headlines, max 32 chars, no hashtags/emoji]}}"""


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


def parse_reply(content: str, model: str) -> ImageReasoning | None:
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
    try:
        return ImageReasoning(
            model=model,
            summary=summary,
            moods=list(dict.fromkeys(w.lower() for w in moods))[:3],
            scene=list(dict.fromkeys(scene))[:4],
            headline_ideas=list(dict.fromkeys(ideas))[:3],
        )
    except ValidationError:
        return None


async def reason_about_image(
    im: Image.Image, settings: Settings, transport: httpx.AsyncBaseTransport | None = None
) -> tuple[ImageReasoning | None, str | None]:
    """Returns (reasoning, error_code). Never raises: the pipeline continues without it."""
    if not settings.ollama_enabled:
        return None, None
    model = model_name(settings.ollama_model)
    key = settings.ollama_api_key.get_secret_value()  # type: ignore[union-attr]
    body = {
        "model": model,
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.3},
        "messages": [{"role": "user", "content": PROMPT, "images": [_jpeg_for_model(im)]}],
    }
    started = time.monotonic()
    try:
        async with httpx.AsyncClient(
            base_url=settings.ollama_base_url,
            timeout=httpx.Timeout(settings.ollama_timeout_seconds, connect=5.0),
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
    result = parse_reply(content if isinstance(content, str) else "", model)
    log.info("ollama ok=%s model=%s elapsed=%.1fs", bool(result), model, elapsed)
    return (result, None) if result else (None, "VISION_BAD_RESPONSE")
