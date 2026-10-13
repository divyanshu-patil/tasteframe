"""Public request/response models (app contracts — not Qloo schemas)."""

from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator

from app.services.music.vibes import Language, Vibe

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
    "playlist",
    "covermouth",
    "camtilt",
    "playercut",
    "triptych",
    "cctv",
    "colorbox",
    "tornstrip",
    "cutout",
    "focus",
    "viewfinder",
    "camcorder",
    "sepiabooth",
    "desktop",
    "chat",
    "kissmark",
    "xerox",
    "yearbook",
    "coversepia",
    "covercorner",
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
    "coverpolaroid",
    "notesdark",
    "appswitch",
    "phones",
    "camlyric",
    "filmslant",
    "songbox",
    "clockit",
    "doodlefit",
]
FilterId = Literal[
    "none",
    "film",
    "warm",
    "golden",
    "cool",
    "faded",
    "vivid",
    "sepia",
    "bw",
    "noir",
    "8mm",
    "xerox",
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
    "spotify",
    "chromestar",
    "chromesparkle",
    "exclaim",
    "anger",
    "owocat",
    "headcat",
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
    music_language: Language = "en"  # language of the suggested songs

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
    likes: int = 0  # people who liked this layout (anonymous or signed in)
    is_new: bool = False  # added recently (ranked with a small boost)


Trend = Literal["chart", "reels"]


class Song(BaseModel):
    """A song that fits the photo (iTunes-verified title + artist)."""

    title: str
    artist: str
    url: str | None = None
    track_id: int | None = None
    trending: Trend | None = None
    source: Literal["qloo", "vibe"] = "vibe"
    why: str | None = Field(None, max_length=90)  # the vision model's short fit reason


class MusicSuggestion(BaseModel):
    kind: Literal["track", "artist", "none"]
    artist: str | None = None
    title: str | None = None
    url: str | None = None
    # "qloo": related to your favourites; "vibe": from the curated pool for the photo's vibe.
    artist_source: Literal["qloo", "vibe"] | None = None
    track_source: Literal["itunes"] | None = None
    track_id: int | None = None  # for the song cover (GET /v1/music/artwork/{track_id})
    explanation: str
    vibe: Vibe | None = None  # how the photo reads (pose/expression/mood), e.g. "baddie"
    language: Language = "en"
    # More songs, best fit first: the UI gives each layout / shuffle its own song.
    alternatives: list[Song] = Field(default_factory=list, max_length=8)
    # "chart": in Apple Music's most-played now; "reels": reported trending on Instagram Reels.
    trending: Trend | None = None
    why: str | None = Field(None, max_length=90)


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
    vibe: Vibe | None = None  # social-media energy of the pose/expression


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
    # True while songs are still being picked; they follow as a separate {"music": …} event.
    music_pending: bool = False
    # Guests get the top 3 layouts; this many more unlock after login
    # (GET /v1/analysis/{analysis_id}/layouts).
    locked_layouts: int = 0
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
    size: float = Field(ge=8, le=600)
    color: str = Field(pattern=HEX)
    align: Literal["left", "center", "right"]
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    width: float = Field(gt=0, le=2)
    font: Literal["display", "serif", "sans", "hand", "mono", "italic"]
    family: str | None = Field(None, pattern=r"^[A-Za-z0-9 ]{2,40}$")  # a Google Font name


class CropConfig(BaseModel):
    zoom: float = Field(ge=1, le=10)
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    fit: Literal["cover", "contain"] = "cover"
    rot: Literal[0, 90, 180, 270] | None = None  # clockwise quarter turns


class StickerConfig(BaseModel):
    model_config = {"extra": "forbid"}

    id: str = Field(max_length=64)
    kind: StickerKind
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    scale: float = Field(ge=0.1, le=12)
    rotate: float = Field(ge=0, lt=360)
    color: str = Field(pattern=HEX)
    text: str | None = Field(None, max_length=40)
    layout: bool | None = None  # placed by the layout (vs added by the user)


class OverlayConfig(BaseModel):
    strength: float = Field(ge=0, le=1)
    color: str = Field(pattern=HEX)


class Point01(BaseModel):
    model_config = {"extra": "forbid"}

    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)


class Rect01(Point01):
    w: float = Field(gt=0, le=1)
    h: float = Field(gt=0, le=1)


class BoxRect(BaseModel):
    """A moved/resized layout box, 0..1 of the Story (may hang half off an edge)."""

    model_config = {"extra": "forbid"}

    x: float = Field(ge=-0.5, le=1)
    y: float = Field(ge=-0.5, le=1)
    w: float = Field(gt=0, le=1)
    h: float = Field(gt=0, le=1)


class ViewTweak(BaseModel):
    """Drag/zoom inside a box showing part of the photo, relative to the layout's framing."""

    model_config = {"extra": "forbid"}

    dx: float = Field(ge=-1, le=1)
    dy: float = Field(ge=-1, le=1)
    zoom: float = Field(ge=0.25, le=10)


class PanelTrack(BaseModel):
    """A real catalogue track (iTunes) for the playlist panel — never user-invented text."""

    model_config = {"extra": "forbid"}

    title: str = Field(max_length=120)
    artist: str = Field(max_length=120)
    explicit: bool | None = None
    trackId: int | None = Field(None, ge=1)  # noqa: N815


class OutlineConfig(BaseModel):
    model_config = {"extra": "forbid"}

    show: bool
    color: str = Field(pattern=HEX)
    width: float = Field(ge=0, le=120)
    margin: float = Field(0, ge=0, le=200)


class LinesConfig(BaseModel):
    """Generated doodle lines (Basic Fit): distance from the subject and thickness, Story px."""

    model_config = {"extra": "forbid"}

    gap: float = Field(ge=0, le=400)
    width: float = Field(ge=1, le=80)


class CoverConfig(BaseModel):
    """Square song cover placed on the Story; the image is refetched by track id."""

    model_config = {"extra": "forbid"}

    show: bool
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    scale: float = Field(ge=0.1, le=10)
    rotate: float = Field(ge=-180, le=180)
    style: Literal["ig", "igpill", "igart"]
    textColor: str | None = Field(None, pattern=HEX)  # noqa: N815
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
    tracks: list[PanelTrack] = Field(default_factory=list, max_length=10)
    views: dict[Annotated[str, Field(pattern=r"^[a-z0-9-]{1,24}$")], ViewTweak] = Field(
        default_factory=dict, max_length=24
    )
    boxes: dict[Annotated[str, Field(pattern=r"^[a-z0-9-]{1,24}$")], BoxRect] = Field(
        default_factory=dict, max_length=12
    )
    prop: str | None = Field(None, pattern=r"^[a-z]{2,16}$")
    outline: OutlineConfig | None = None
    focus: Point01 | None = None
    spot: Rect01 | None = None
    tags: list[Annotated[str, Field(max_length=40)]] = Field(default_factory=list, max_length=5)
    seed: int | None = Field(None, ge=0, le=9999)
    lines: LinesConfig | None = None
    boxFilter: FilterId | None = None  # noqa: N815


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
    explicit: bool = False


class TrackSearchOut(BaseModel):
    query: str
    tracks: list[TrackOut]


# ---- Analytics, layout requests, admin ------------------------------------------------------
EventType = Literal[
    "pageview", "analysis", "layout_open", "export", "save", "request", "gallery_pick"
]
Device = Literal["mobile", "tablet", "desktop"]


class LikesOut(BaseModel):
    enabled: bool  # likes need persistence (Supabase); the UI hides them otherwise
    counts: dict[str, int]
    liked: list[LayoutId]  # by this visitor / account
    new: list[LayoutId]  # recently added layouts
    added: dict[str, str]  # ISO date each layout joined the catalogue (gallery "Newest" sort)


class LikeIn(BaseModel):
    model_config = {"extra": "forbid"}

    visitor: str = Field(pattern=r"^[A-Za-z0-9_-]{8,64}$")
    liked: bool


class LikeOut(BaseModel):
    layout: LayoutId
    likes: int
    liked: bool


class EventIn(BaseModel):
    """One usage event. `visitor` is a random id kept in the browser; it's hashed here. Signed-in
    users' events also carry their account id (set by the database from their token)."""

    model_config = {"extra": "forbid"}

    type: EventType
    visitor: str = Field(pattern=r"^[A-Za-z0-9_-]{8,64}$")
    path: str | None = Field(None, pattern=r"^/[a-z0-9/_-]{0,60}$")
    referrer: str | None = Field(None, max_length=300)
    layout: LayoutId | None = None
    device: Device | None = None


class PinPreview(BaseModel):
    pin_id: str
    pin_url: str
    title: str | None = None
    author: str | None = None
    author_url: str | None = None
    thumbnail_url: str
    width: int
    height: int


class LayoutRequestIn(BaseModel):
    model_config = {"extra": "forbid"}

    pin_url: str = Field(min_length=8, max_length=300)
    note: str | None = Field(None, max_length=500)
    email: str | None = Field(None, max_length=200, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    visitor: str | None = Field(None, pattern=r"^[A-Za-z0-9_-]{8,64}$")
    referrer: str | None = Field(None, max_length=300)
    device: Device | None = None


class LayoutRequestOut(BaseModel):
    id: str
    created_at: str
    status: Literal["pending", "accepted", "rejected", "done"]
    pin_id: str
    pin_url: str
    pin_title: str | None = None
    pin_author: str | None = None
    pin_author_url: str | None = None
    pin_thumb: str | None = None
    pin_width: int | None = None
    pin_height: int | None = None
    note: str | None = None
    email: str | None = None
    referrer: str | None = None
    device: str | None = None
    signed_in: bool = False
    admin_note: str | None = None
    reviewed_at: str | None = None


class LayoutRequestList(BaseModel):
    requests: list[LayoutRequestOut]


class LayoutRequestPatch(BaseModel):
    model_config = {"extra": "forbid"}

    status: Literal["pending", "accepted", "rejected", "done"]
    admin_note: str | None = Field(None, max_length=500)
