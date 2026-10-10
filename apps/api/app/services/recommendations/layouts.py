"""Local layout ranking. Combines vision measurements and *provider-returned* Qloo tags.

score = 0.45 * visual_fit + 0.35 * cultural_style_fit + 0.20 * readability_fit
An initial engineering heuristic — tune by human review; it is not a validated model.
Rendering of each template lives in the web app (apps/web/lib/templates); ids must match.
"""

from dataclasses import dataclass

from app.schemas.api import LayoutId, LayoutScore, LayoutSuggestion, Mood, VisualProfile

W_VISUAL, W_CULTURAL, W_READ = 0.45, 0.35, 0.20


@dataclass(frozen=True)
class Template:
    id: LayoutId
    name: str
    family: str  # templates in one family look alike; we suggest at most one per family
    style_tags: tuple[str, ...]
    moods: dict[Mood, float]
    compositions: tuple[str, ...]  # source orientations that crop well
    text_on_photo: bool
    keywords: tuple[str, ...]  # matched against Qloo tag names (lower-case substring)


CATALOGUE: tuple[Template, ...] = (
    Template(
        "cinematic",
        "Cinematic",
        "fullbleed",
        ("full-bleed", "gradient", "serif"),
        {"cinematic": 1, "moody": 0.9, "warm": 0.6, "bold": 0.6, "nostalgic": 0.5},
        ("portrait", "square", "landscape"),
        True,
        ("drama", "thriller", "noir", "film", "soundtrack", "ambient", "indie", "cinema"),
    ),
    Template(
        "stills",
        "Film Stills",
        "split",
        ("subtitles", "three crops", "letterbox"),
        {"cinematic": 0.9, "nostalgic": 0.8, "dreamy": 0.7, "moody": 0.6, "cool": 0.5},
        ("landscape", "square"),
        True,
        ("indie", "coming of age", "romance", "alternative", "lo-fi", "bedroom", "drama"),
    ),
    Template(
        "editorial",
        "Editorial",
        "paper",
        ("grid paper", "asymmetric", "bold type"),
        {"editorial": 1, "minimal": 0.8, "bold": 0.7, "natural": 0.5, "bright": 0.5},
        ("landscape", "square", "portrait"),
        False,
        ("fashion", "luxury", "design", "art", "jazz", "electronic", "architecture", "magazine"),
    ),
    Template(
        "journal",
        "Journal",
        "card",
        ("blurred backdrop", "paper card", "date line"),
        {"natural": 0.9, "dreamy": 0.7, "minimal": 0.6, "bright": 0.6, "cool": 0.5},
        ("landscape", "square"),
        False,
        ("folk", "acoustic", "poetry", "literary", "singer-songwriter", "travel", "book"),
    ),
    Template(
        "scrapbook",
        "Scrapbook",
        "collage",
        ("polaroid", "washi tape", "stickers"),
        {"playful": 1, "bright": 0.8, "warm": 0.6, "nostalgic": 0.6, "dreamy": 0.5},
        ("portrait", "square"),
        False,
        ("pop", "k-pop", "romance", "comedy", "teen", "dance", "cute", "animation"),
    ),
    Template(
        "filmstrip",
        "Film Strip",
        "split",
        ("35mm strip", "sprockets", "edge codes"),
        {"nostalgic": 1, "moody": 0.6, "cinematic": 0.6, "bold": 0.5, "warm": 0.5},
        ("landscape", "square"),
        False,
        ("rock", "punk", "grunge", "retro", "vintage", "hip hop", "90s", "80s"),
    ),
    Template(
        "vintage",
        "Vintage",
        "fullbleed",
        ("grain", "light leak", "date stamp"),
        {"warm": 1, "nostalgic": 0.9, "dreamy": 0.6, "moody": 0.5, "natural": 0.4},
        ("portrait", "square", "landscape"),
        True,
        ("soul", "funk", "disco", "70s", "classic", "oldies", "r&b", "motown"),
    ),
    Template(
        "minimal",
        "Minimal",
        "frame",
        ("framed photo", "quiet type", "dark matte"),
        {"minimal": 1, "moody": 0.7, "cool": 0.7, "editorial": 0.5, "cinematic": 0.4},
        ("portrait", "square", "landscape"),
        False,
        ("ambient", "classical", "minimal", "techno", "documentary", "experimental"),
    ),
)

HEADLINES: dict[str, str] = {
    "cinematic": "the art of observing.",
    "moody": "after hours.",
    "bright": "sun on everything.",
    "warm": "golden hour, again.",
    "cool": "blue for a while.",
    "nostalgic": "still so young.",
    "dreamy": "somewhere in between.",
    "minimal": "less, but better.",
    "editorial": "the edit.",
    "playful": "a little chaos.",
    "bold": "loud and clear.",
    "natural": "the silence that heals.",
}


def _visual_fit(t: Template, p: VisualProfile) -> float:
    weights = [t.moods.get(m, 0.15) for m in p.mood] or [0.3]
    # Strongest mood counts double: it is what the photo reads as first.
    fit = (2 * weights[0] + sum(weights[1:])) / (len(weights) + 1)
    fit = 0.85 * fit + (0.15 if p.composition in t.compositions else 0.0)
    return round(min(fit, 1.0), 3)


def _cultural_fit(t: Template, tags: list[str]) -> tuple[float, list[str]]:
    if not tags:
        return 0.5, []  # neutral: no provider evidence, so no cultural preference either way
    lowered = [x.lower() for x in tags]
    hits = sorted({tag for tag in lowered for k in t.keywords if k in tag})
    return round(0.35 + 0.65 * min(1.0, len(hits) / 3), 3), hits


def _readability(t: Template, p: VisualProfile) -> float:
    if not t.text_on_photo:
        return 0.95
    # Text over busy, mid-tone photos is hardest to read; overlays help but don't fix it fully.
    busy = p.contrast * 0.6 + (1 - abs(p.brightness - 0.5) * 2) * 0.4
    return round(max(0.3, 1 - 0.55 * busy), 3)


def _accent(p: VisualProfile) -> str:
    def sat(h: str) -> float:
        r, g, b = (int(h[i : i + 2], 16) for i in (1, 3, 5))
        mx, mn = max(r, g, b), min(r, g, b)
        return 0 if mx == 0 else (mx - mn) / mx * (0.4 + 0.6 * mx / 255)

    best = max(p.palette, key=sat, default="#c03f13")
    return best if sat(best) > 0.25 else "#c03f13"


def score_all(
    p: VisualProfile, qloo_tags: list[str]
) -> list[tuple[Template, LayoutScore, list[str]]]:
    """Every template scored, best first (ties broken by id for determinism)."""
    scored = []
    for t in CATALOGUE:
        v = _visual_fit(t, p)
        c, hits = _cultural_fit(t, qloo_tags)
        r = _readability(t, p)
        total = round(W_VISUAL * v + W_CULTURAL * c + W_READ * r, 3)
        score = LayoutScore(visual_fit=v, cultural_style_fit=c, readability_fit=r, total=total)
        scored.append((t, score, hits))
    return sorted(scored, key=lambda s: (-s[1].total, s[0].id))


def rank_layouts(
    p: VisualProfile, qloo_tags: list[str], music_line: str | None, k: int = 3
) -> list[LayoutSuggestion]:
    picked, families = [], set()
    for t, score, hits in score_all(p, qloo_tags):
        if t.family in families:
            continue
        families.add(t.family)
        picked.append((t, score, hits))
        if len(picked) == k:
            break

    top_mood = p.mood[0] if p.mood else "natural"
    accent = _accent(p)
    out = []
    for t, score, hits in picked:
        matched = [m for m in p.mood if t.moods.get(m, 0) >= 0.6]
        reason = (
            f"Your photo reads as {', '.join(matched[:2])}, which {t.name} is built for."
            if matched
            else f"Adds contrast to the set: a {t.style_tags[0]} take."
        )
        if hits:
            reason += f" Qloo results tagged “{hits[0]}” point to this style."
        if t.text_on_photo and score.readability_fit < 0.6:
            reason += " Text sits on an overlay to stay readable."
        out.append(
            LayoutSuggestion(
                id=t.id,
                name=t.name,
                reason=reason,
                style_tags=list(t.style_tags),
                score=score,
                headline=HEADLINES.get(top_mood, "today."),
                caption=music_line or "",
                accent=accent,
            )
        )
    return out
