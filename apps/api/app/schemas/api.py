"""Public request/response models (app contracts — not Qloo schemas)."""

from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator

# App-level taste types, mapped to Qloo URNs inside the Qloo adapter.
TasteType = Literal["artist", "movie", "tv_show", "brand", "book", "podcast"]
Mood = Literal[
    "cinematic",
    "minimal",
    "nostalgic",
    "editorial",
    "warm",
    "cool",
    "moody",
    "bright",
    "playful",
    "dreamy",
    "bold",
    "natural",
]
LayoutId = Literal[
    "cinematic",
    "stills",
    "editorial",
    "journal",
    "scrapbook",
    "filmstrip",
    "vintage",
    "minimal",
    "photodump",
    "magazine",
    "nowplaying",
    "vinyl",
    "moodboard",
    "ticket",
    "y2k",
    "torn",
    "note",
    "newspaper",
    "softfocus",
    "duo",
    "splitscreen",
    "booth",
    "torncollage",
    "grid",
    "mosaic",
    "polaroids",
    "weekday",
    "daysplit",
    "halfword",
    "verticalday",
    "scripttitle",
    "refresh",
    "bigletters",
    "navheader",
    "quotemarks",
    "spotlight",
    "bluehour",
    "subtitlebar",
    "redblock",
    "badge",
    "stats",
    "notesapp",
    "handnote",
    "sticky",
    "checklist",
    "calendarcard",
    "receipt",
    "doodlesun",
    "bigpolaroid",
    "framein",
    "postcard",
    "stackedcards",
    "bwstack",
    "wavecut",
    "diagonal",
    "filmburn",
    "hearts",
    "coverface",
    "coversingle",
    "coverfloat",
    "coverbubble",
    "coverstack",
    "coverpolaroid",
    "notesdark",
]
FilterId = Literal[
    "none", "film", "warm", "golden", "cool", "faded", "vivid", "sepia", "bw", "noir", "8mm"
]
StickerKind = Literal[
    "tape",
    "star",
    "sparkle",
    "heart",
    "flower",
    "daisy",
    "bow",
    "paperclip",
    "pin",
    "stamp",
    "arrow",
    "swirl",
    "note",
    "player",
    "kiss",
    "kissblur",
    "brackets",
    "rec",
    "tornstrip",
    "folder",
    "cursor",
    "warning",
    "cat",
    "faceheart",
    "barcode",
]
UUID_PATTERN = r"^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$"


class SessionOut(BaseModel):
    session_token: str


class PresignIn(BaseModel):
    # "image/jpg" / "image/pjpeg" are common non-standard labels for JPEG; normalised below.
    content_type: Literal["image/jpeg", "image/jpg", "image/pjpeg", "image/png", "image/webp"]
    size_bytes: int = Field(gt=0)

    @model_validator(mode="after")
    def _jpeg_alias(self) -> "PresignIn":
        if self.content_type in ("image/jpg", "image/pjpeg"):
            self.content_type = "image/jpeg"
        return self


class PresignOut(BaseModel):
    upload_url: str
    method: Literal["POST"] = "POST"
    fields: dict[str, str]
    object_key: str
    expires_in: int
    max_bytes: int


class TasteCandidate(BaseModel):
    provider: Literal["qloo"] = "qloo"
    entity_id: str
    name: str
    entity_type: TasteType
    disambiguation: str | None = None  # provider-returned descriptor (e.g. year, short description)
    image_url: str | None = None


class TasteSearchOut(BaseModel):
    query: str
    entity_type: TasteType
    candidates: list[TasteCandidate]


class TasteSeed(BaseModel):
    """A user-confirmed entity the server previously returned from /v1/taste/search."""

    entity_id: str = Field(pattern=UUID_PATTERN)
    entity_type: TasteType
    name: str = Field(min_length=1, max_length=120)


class AnalysisIn(BaseModel):
    # 1–4 photos for one Story. `object_key` is the original single-photo field (still accepted).
    object_key: str | None = Field(None, max_length=200)
    object_keys: list[str] = Field(default_factory=list, max_length=4)
    taste_seeds: list[TasteSeed] = Field(default_factory=list, max_length=5)
    manual_mood: list[Mood] = Field(default_factory=list, max_length=4)
    locale: str = Field("en", pattern=r"^[a-z]{2}(-[A-Z]{2})?$")

    @model_validator(mode="after")
    def _keys(self) -> "AnalysisIn":
        keys = self.object_keys or ([self.object_key] if self.object_key else [])
        if (
            not 1 <= len(keys) <= 4
            or len(set(keys)) != len(keys)
            or any(len(k) > 200 for k in keys)
        ):
            raise ValueError("send 1-4 distinct object keys")
        self.object_keys = keys
        return self


class VisualProfile(BaseModel):
    palette: list[str]  # hex colors, dominant first
    brightness: float  # 0..1 mean luminance
    contrast: float  # 0..1 normalized luminance std-dev
    saturation: float  # 0..1
    warmth: float  # -1 (cool) .. 1 (warm)
    composition: Literal["portrait", "landscape", "square"]
    mood: list[Mood]
    source: Literal["vision", "manual", "vision+manual"]
    width: int
    height: int
    photo_count: int = 1  # how many photos this Story uses (profile is merged across them)


class CulturalRecommendation(BaseModel):
    provider: Literal["qloo"] = "qloo"
    kind: TasteType
    entity_id: str
    name: str
    tags: list[str] = Field(default_factory=list)  # provider-returned tag names
    reason: str
    evidence: list[str]  # names of the user seeds used as the signal


class SubjectPos(BaseModel):
    subject: Literal["person", "people", "object", "scene"] = "scene"
    x: float = Field(0.5, ge=0, le=1)
    y: float = Field(0.5, ge=0, le=1)


class LayoutScore(BaseModel):
    """Internal engineering heuristic — not a provider score and not a validated model."""

    visual_fit: float
    cultural_style_fit: float
    readability_fit: float
    total: float
    ai_pick: float | None = None  # the vision model's own pick for this photo (when available)


class LayoutSuggestion(BaseModel):
    id: LayoutId
    name: str
    reason: str
    style_tags: list[str]
    score: LayoutScore
    headline: str
    caption: str
    accent: str  # hex from the photo palette
    # Default crop focus (0..1) keeping the main subject in frame; 0.5/0.5 when unknown.
    focus_x: float = 0.5
    focus_y: float = 0.5
    filter: FilterId = "none"  # suggested photo filter (mood rules / template look)
    focuses: list[SubjectPos] = Field(default_factory=list, max_length=4)  # crop focus per photo
    photo_slots: int = 1  # distinct photos this layout shows


class MusicSuggestion(BaseModel):
    kind: Literal["track", "artist", "none"]
    artist: str | None = None
    title: str | None = None
    url: str | None = None
    artist_source: Literal["qloo"] | None = None
    track_source: Literal["itunes"] | None = None
    track_id: int | None = None  # for the song cover (GET /v1/music/artwork/{track_id})
    explanation: str


class ImageReasoning(BaseModel):
    """Vision-LLM read of the photo (Ollama). Validated, length-capped; no people/sensitive data."""

    provider: Literal["ollama"] = "ollama"
    model: str
    summary: str = Field(max_length=200)
    moods: list[Mood] = Field(default_factory=list, max_length=3)
    scene: list[str] = Field(default_factory=list, max_length=4)
    headline_ideas: list[str] = Field(default_factory=list, max_length=3)
    # Where the main subject sits (for cropping/text placement) — never who it is.
    subject: Literal["person", "people", "object", "scene"] = "scene"
    subject_x: float = Field(0.5, ge=0, le=1)
    subject_y: float = Field(0.5, ge=0, le=1)
    layout_picks: list[LayoutId] = Field(default_factory=list, max_length=5)
    subjects: list[SubjectPos] = Field(default_factory=list, max_length=4)  # one per photo
    # Pose/expression cues (taxonomy.EXPRESSIONS): face closeup, pout, wink… never identity.
    expressions: list[str] = Field(default_factory=list, max_length=5)
    # What the photo is about (controlled vocabulary, sensitive terms neutralised).
    about: str | None = None
    elements: list[str] = Field(default_factory=list, max_length=8)


class Provenance(BaseModel):
    qloo_used: bool
    qloo_error: str | None = None  # safe error code only
    visual_analysis_used: bool
    image_reasoning_used: bool = False
    image_reasoning_error: str | None = None  # safe error code only
    track_level_result: bool
    seeds: list[str]
    layout_rule: str = "local heuristic: 0.45 visual + 0.35 cultural + 0.20 readability"


class AnalysisOut(BaseModel):
    analysis_id: str
    visual_profile: VisualProfile
    cultural_recommendations: list[CulturalRecommendation]
    layouts: list[LayoutSuggestion]
    music: MusicSuggestion
    image_reasoning: ImageReasoning | None = None
    provenance: Provenance


# ---- saved Stories (optional Supabase persistence) -------------------------------------
HEX = r"^#[0-9a-fA-F]{6}$"


class FeaturesOut(BaseModel):
    qloo: bool
    image_reasoning: bool
    saved_stories: bool
    storage: Literal["s3", "local"]


class TextLayerConfig(BaseModel):
    text: str = Field(max_length=160)
    size: float = Field(ge=12, le=240)
    color: str = Field(pattern=HEX)
    align: Literal["left", "center", "right"]
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    width: float = Field(gt=0, le=1)
    font: Literal["display", "serif", "sans", "hand", "mono", "italic"]


class CropConfig(BaseModel):
    zoom: float = Field(ge=1, le=4)
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    fit: Literal["cover", "contain"] = "cover"


class StickerConfig(BaseModel):
    model_config = {"extra": "forbid"}

    id: str = Field(max_length=64)
    kind: StickerKind
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    scale: float = Field(ge=0.3, le=3)
    rotate: float = Field(ge=0, lt=360)
    color: str = Field(pattern=HEX)
    text: str | None = Field(None, max_length=40)


class OverlayConfig(BaseModel):
    strength: float = Field(ge=0, le=1)
    color: str = Field(pattern=HEX)


class CoverConfig(BaseModel):
    """Square song cover placed on the Story; the image is refetched by track id."""

    model_config = {"extra": "forbid"}

    show: bool
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    scale: float = Field(ge=0.3, le=4)
    rotate: float = Field(ge=-180, le=180)
    style: Literal["plain", "card", "bubble", "sticker"]
    title: str = Field(max_length=120)
    artist: str = Field(max_length=120)
    trackId: int | None = Field(None, ge=1)  # noqa: N815


class StoryConfig(BaseModel):
    """Mirror of the web app's serializable StoryState (apps/web/lib/story/types.ts)."""

    model_config = {"extra": "forbid"}

    templateId: LayoutId  # noqa: N815 — matches the browser's JSON shape
    filter: FilterId = "none"
    stickers: list[StickerConfig] = Field(default_factory=list, max_length=24)
    order: list[Annotated[int, Field(ge=0, le=3)]] = Field(default_factory=list, max_length=4)
    crops: list[CropConfig] = Field(default_factory=list, max_length=3)  # slots 2-4
    headline: TextLayerConfig
    caption: TextLayerConfig
    crop: CropConfig
    overlay: OverlayConfig
    decorations: dict[str, bool] = Field(max_length=12)
    accent: str = Field(pattern=HEX)
    palette: list[Annotated[str, Field(pattern=HEX)]] = Field(max_length=6)
    stamp: str = Field(max_length=16)
    cover: CoverConfig | None = None
    tags: list[Annotated[str, Field(max_length=40)]] = Field(default_factory=list, max_length=5)


class StoryProvenance(BaseModel):
    """Minimal, sanitized: no seeds or taste text are stored."""

    qloo_used: bool = False
    music_artist: str | None = Field(None, max_length=120)
    music_title: str | None = Field(None, max_length=160)
    track_source: Literal["itunes"] | None = None


class SaveStoryIn(BaseModel):
    object_key: str | None = Field(None, max_length=200)
    object_keys: list[str] = Field(default_factory=list, max_length=4)
    config: StoryConfig
    provenance: StoryProvenance = Field(default_factory=StoryProvenance)

    @model_validator(mode="after")
    def _keys(self) -> "SaveStoryIn":
        keys = self.object_keys or ([self.object_key] if self.object_key else [])
        if (
            not 1 <= len(keys) <= 4
            or len(set(keys)) != len(keys)
            or any(len(k) > 200 for k in keys)
        ):
            raise ValueError("send 1-4 distinct object keys")
        self.object_keys = keys
        return self


class StoryOut(BaseModel):
    id: str
    template_id: LayoutId
    config: StoryConfig
    provenance: StoryProvenance
    created_at: str
    photo_count: int = 1


class StoryListOut(BaseModel):
    stories: list[StoryOut]


class TrackOut(BaseModel):
    track_id: int
    title: str
    artist: str
    album: str | None = None
    has_artwork: bool


class TrackSearchOut(BaseModel):
    query: str
    tracks: list[TrackOut]
