"""Image validation + local visual analysis (Pillow only — photos never leave our infrastructure).

Extracts broad aesthetics only: palette, luminance, contrast, saturation, warmth, orientation.
No face detection, identity or sensitive-attribute inference. Swap `analyze()` for a model-backed
adapter later; callers only depend on the returned VisualProfile fields.
"""

import io
import warnings

from PIL import Image, ImageOps, ImageStat

from app.core.errors import AppError
from app.schemas.api import Mood, VisualProfile

FORMATS = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}


def decode_and_sanitize(
    data: bytes, max_bytes: int, max_pixels: int
) -> tuple[Image.Image, bytes, str]:
    """Validate real image bytes; return (image, EXIF-stripped bytes, content type)."""
    if not data:
        raise AppError("IMAGE_TOO_LARGE", "That photo is too large or empty.", 413)
    if len(data) > max_bytes:
        raise AppError("IMAGE_TOO_LARGE", "That photo is larger than the upload limit.", 413)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            im = Image.open(io.BytesIO(data))
            fmt = im.format
            if fmt not in FORMATS:
                raise AppError("INVALID_IMAGE", "Only JPEG, PNG or WebP photos are supported.", 415)
            if im.width * im.height > max_pixels:
                raise AppError("INVALID_IMAGE", "That photo's dimensions are too large.", 413)
            im.load()
    except AppError:
        raise
    except Exception:  # noqa: BLE001 — any decoder failure means "not a valid image"
        raise AppError("INVALID_IMAGE", "That file could not be read as an image.", 415) from None

    # Bake in camera orientation, then re-encode without EXIF/GPS/XMP metadata.
    im = ImageOps.exif_transpose(im)
    if fmt == "JPEG" and im.mode not in ("RGB", "L"):
        im = im.convert("RGB")
    out = io.BytesIO()
    save_kwargs = {"quality": 92} if fmt in ("JPEG", "WEBP") else {}
    im.save(out, format=fmt, **save_kwargs)
    return im, out.getvalue(), FORMATS[fmt]


def _clip(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def analyze(im: Image.Image) -> VisualProfile:
    small = im.convert("RGB")
    small.thumbnail((160, 160))

    quant = small.quantize(colors=6, method=Image.Quantize.MEDIANCUT)
    pal = quant.getpalette() or []
    counts = sorted(quant.getcolors() or [], reverse=True)
    palette = ["#{:02x}{:02x}{:02x}".format(*pal[i * 3 : i * 3 + 3]) for _, i in counts[:5]]

    lum = ImageStat.Stat(small.convert("L"))
    brightness = round(lum.mean[0] / 255, 3)
    contrast = round(_clip(lum.stddev[0] / 100), 3)
    saturation = round(ImageStat.Stat(small.convert("HSV")).mean[1] / 255, 3)
    r, g, b = ImageStat.Stat(small).mean
    warmth = round(_clip((r - b) / 128, -1, 1), 3)

    ratio = im.width / im.height
    composition = "landscape" if ratio > 1.15 else "portrait" if ratio < 0.87 else "square"

    return VisualProfile(
        palette=palette,
        brightness=brightness,
        contrast=contrast,
        saturation=saturation,
        warmth=warmth,
        composition=composition,
        width=im.width,
        height=im.height,
        mood=mood_labels(brightness, contrast, saturation, warmth, g > r and g > b),
        source="vision",
    )


def mood_labels(
    brightness: float, contrast: float, saturation: float, warmth: float, green: bool
) -> list[Mood]:
    """Deterministic rules mapping measurements to broad aesthetic words (strongest first)."""
    scored: list[tuple[float, Mood]] = []
    if brightness < 0.38:
        scored.append((0.38 - brightness + 0.2, "moody"))
    if brightness > 0.62:
        scored.append((brightness - 0.62 + 0.2, "bright"))
    if contrast > 0.55:
        scored.append((contrast - 0.55 + 0.25, "cinematic"))
    if contrast < 0.32:
        scored.append((0.32 - contrast + 0.15, "dreamy"))
    if saturation < 0.18:
        scored.append((0.18 - saturation + 0.2, "minimal"))
        if contrast > 0.45:
            scored.append((0.3, "editorial"))
    if saturation > 0.5:
        scored.append((saturation - 0.5 + 0.2, "playful"))
    if warmth > 0.12:
        scored.append((warmth, "warm"))
        if 0.15 < saturation < 0.5 and contrast < 0.5:
            scored.append((warmth * 0.8, "nostalgic"))
    if warmth < -0.08:
        scored.append((-warmth, "cool"))
    if green:
        scored.append((0.2, "natural"))
    labels = [m for _, m in sorted(scored, key=lambda t: -t[0])][:4]
    return labels or ["natural"]


def merge_manual(profile: VisualProfile, manual: list[Mood]) -> VisualProfile:
    if not manual:
        return profile
    merged = list(dict.fromkeys([*manual, *profile.mood]))[:5]
    return profile.model_copy(update={"mood": merged, "source": "vision+manual"})


def merge_profiles(profiles: list[VisualProfile]) -> VisualProfile:
    """One read for a multi-photo Story: blended palette, mean measurements, consensus moods."""
    if len(profiles) == 1:
        return profiles[0]
    palette: list[str] = []
    for rank in range(2):  # the two strongest colours of each photo, interleaved
        for p in profiles:
            if rank < len(p.palette) and p.palette[rank] not in palette:
                palette.append(p.palette[rank])
    votes: dict[str, float] = {}
    for p in profiles:
        for i, m in enumerate(p.mood):
            votes[m] = votes.get(m, 0) + (4 - i)
    moods = sorted(votes, key=lambda m: -votes[m])[:4]
    n = len(profiles)
    first = profiles[0]
    return first.model_copy(
        update={
            "palette": palette[:5],
            "brightness": round(sum(p.brightness for p in profiles) / n, 3),
            "contrast": round(sum(p.contrast for p in profiles) / n, 3),
            "saturation": round(sum(p.saturation for p in profiles) / n, 3),
            "warmth": round(sum(p.warmth for p in profiles) / n, 3),
            "mood": moods,
            "photo_count": n,
        }
    )
