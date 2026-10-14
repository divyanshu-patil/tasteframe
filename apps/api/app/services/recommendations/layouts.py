"""Layout ranking: decides which Story templates fit a photo, using the photo's own read.

Signals (all per-photo):
  visual_fit   — moods (user > vision LLM > pixel rules), scene cues, main subject, orientation
  ai_pick      — the vision LLM's own ranking of the catalogue for this photo (when available)
  cultural_fit — Qloo-returned tags matched to each template's style keywords
  qloo_fit     — (admin switch "suggest layouts with Qloo") Qloo's affinity between the person's
                 taste and each layout's Qloo tags (layout_tags.json, built from how Pinterest
                 classifies the layout's reference pins). Qloo scores the tags; which tags a
                 layout carries is our mapping. Replaces cultural_fit and leads the score.
  readability  — text over busy photos is penalised; off-photo text is neutral (not a free win)

score = 0.30 visual + 0.30 ai_pick + 0.25 cultural + 0.15 readability   (with image reasoning)
score = 0.45 visual + 0.35 cultural + 0.20 readability                   (without)
score = 0.45 qloo + 0.25 visual + 0.20 ai_pick + 0.10 readability       (Qloo layouts on)
score = 0.50 qloo + 0.35 visual + 0.15 readability                       (… without reasoning)
then × (1 + 0.10 popularity + 0.08 newness): likes, exports (people near you, last 30 days) and
recently added layouts get a small boost on
top of photo fit, and one new or well-liked layout that already fits the photo is moved into the
first three suggestions. An engineering heuristic — tune by human review; not a validated model.

All templates are returned, best first, with families interleaved so every group of three the
UI shows (initial set + each Shuffle) is compositionally distinct. Rendering lives in
apps/web/lib/story/templates*.ts; ids must match (a web test checks this).
"""

import hashlib
import json
import math
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

from app.schemas.api import (
    LayoutId,
    LayoutScore,
    LayoutSuggestion,
    Mood,
    SubjectPos,
    VisualProfile,
)

W_VISUAL, W_CULTURAL, W_READ = 0.45, 0.35, 0.20
W_AI = {"visual": 0.30, "ai": 0.30, "cultural": 0.25, "read": 0.15}
AI_RANK_FIT = (1.0, 0.86, 0.74, 0.63, 0.54)
AI_UNPICKED = 0.22
W_QLOO = {"qloo": 0.45, "visual": 0.25, "ai": 0.20, "read": 0.10}
W_QLOO_NO_AI = {"qloo": 0.50, "visual": 0.35, "read": 0.15}
QLOO_PRIOR_WEIGHT = 1.0
QLOO_RULE = "Qloo tag affinity: 0.45 Qloo + 0.25 visual + 0.20 image model + 0.10 readability"
QLOO_RULE_NO_AI = "Qloo tag affinity: 0.50 Qloo + 0.35 visual + 0.15 readability"
# layout id → [{tag, name, weight, from}] (apps/api/scripts/layout_tags.py)
_TAGS_FILE = Path(__file__).with_name("layout_tags.json")
LAYOUT_TAGS: dict[str, list[dict]] = (
    json.loads(_TAGS_FILE.read_text()) if _TAGS_FILE.exists() else {}
)


@dataclass(frozen=True)
class Template:
    id: LayoutId
    name: str
    family: str  # at most one per family in each set of three
    style_tags: tuple[str, ...]
    blurb: str  # shown to the vision model when it picks layouts
    moods: dict[Mood, float]
    scenes: tuple[str, ...]  # substrings matched against the vision model's scene cues
    subjects: dict[str, float] = field(default_factory=dict)  # person/people/object/scene → fit
    compositions: tuple[str, ...] = ("portrait", "square", "landscape")
    text_on_photo: bool = False
    keywords: tuple[str, ...] = ()  # matched against Qloo tag names
    filter: str | None = None  # signature look, overrides the mood filter
    capacity: int = 1  # distinct photos the layout shows (multi-photo Stories)
    min_photos: int = 1  # below this it re-crops one photo to fill its slots


CATALOGUE: tuple[Template, ...] = (
    Template(
        "cinematic",
        "Cinematic",
        "fullbleed",
        ("full-bleed", "gradient", "serif"),
        "full-bleed photo, dark gradient, one serif line; dramatic scenes, golden hour, film looks",
        {"cinematic": 1, "moody": 0.9, "warm": 0.6, "bold": 0.6, "nostalgic": 0.5},
        (
            "sunset",
            "golden hour",
            "night",
            "street",
            "city",
            "road",
            "sea",
            "landscape",
            "silhouette",
        ),
        {"person": 0.8, "scene": 1.0, "people": 0.6, "object": 0.5},
        text_on_photo=True,
        keywords=("drama", "thriller", "noir", "film", "soundtrack", "ambient", "indie", "cinema"),
    ),
    Template(
        "vintage",
        "Vintage",
        "fullbleed",
        ("grain", "light leak", "date stamp"),
        "warm film grade, light leaks, dust, orange date stamp; nostalgic, analog, summer",
        {"warm": 1, "nostalgic": 0.95, "dreamy": 0.6, "moody": 0.5, "natural": 0.4},
        ("golden hour", "summer", "beach", "garden", "home", "street", "car", "retro"),
        {"person": 0.9, "people": 0.85, "scene": 0.8, "object": 0.6},
        text_on_photo=True,
        keywords=("soul", "funk", "disco", "70s", "classic", "oldies", "r&b", "motown"),
        filter="film",
    ),
    Template(
        "magazine",
        "Magazine",
        "fullbleed",
        ("cover", "masthead", "barcode"),
        "magazine cover: huge masthead over a full-bleed portrait, cover lines, barcode; "
        "fashion, outfits, confident portraits",
        {"editorial": 1, "bold": 0.95, "cinematic": 0.6, "minimal": 0.5, "bright": 0.5},
        ("portrait", "outfit", "fashion", "studio", "mirror", "street style", "selfie"),
        {"person": 1.0, "people": 0.5, "object": 0.4, "scene": 0.3},
        ("portrait", "square"),
        True,
        ("fashion", "luxury", "design", "pop", "hip hop", "style"),
    ),
    Template(
        "stills",
        "Film Stills",
        "split",
        ("subtitles", "three crops", "letterbox"),
        "three stacked film stills with subtitles; quiet scenes, landscapes, travel, water",
        {"cinematic": 0.9, "nostalgic": 0.8, "dreamy": 0.7, "moody": 0.6, "cool": 0.5},
        ("sea", "water", "beach", "landscape", "train", "window", "road", "sky"),
        {"scene": 1.0, "object": 0.6, "person": 0.45, "people": 0.4},
        ("landscape", "square"),
        True,
        ("indie", "coming of age", "romance", "alternative", "lo-fi", "bedroom", "drama"),
        capacity=3,
    ),
    Template(
        "filmstrip",
        "Film Strip",
        "split",
        ("35mm strip", "sprockets", "edge codes"),
        "vertical 35mm film strip with sprockets and a tape label; analog, retro, trips",
        {"nostalgic": 1, "moody": 0.6, "cinematic": 0.6, "bold": 0.5, "warm": 0.5},
        ("trip", "street", "retro", "concert", "night", "friends"),
        {"scene": 0.9, "object": 0.7, "people": 0.6, "person": 0.5},
        ("landscape", "square"),
        keywords=("rock", "punk", "grunge", "retro", "vintage", "hip hop", "90s", "80s"),
        capacity=3,
    ),
    Template(
        "photodump",
        "Photo Dump",
        "split",
        ("tiles", "doodles", "handwriting"),
        "photo-dump grid of rounded tiles with doodle arrows and handwritten labels; "
        "food, friends, parties, everyday fun",
        {"playful": 1, "bright": 0.7, "warm": 0.6, "natural": 0.5, "nostalgic": 0.5},
        (
            "food",
            "cafe",
            "restaurant",
            "party",
            "friends",
            "celebration",
            "festival",
            "birthday",
            "dinner",
        ),
        {"people": 1.0, "object": 0.8, "person": 0.7, "scene": 0.6},
        keywords=("pop", "k-pop", "comedy", "dance", "indie pop"),
        filter="film",
        capacity=4,
    ),
    Template(
        "editorial",
        "Editorial",
        "paper",
        ("grid paper", "asymmetric", "bold type"),
        "grid paper with a photo band and big lowercase type; architecture, interiors, design",
        {"editorial": 1, "minimal": 0.8, "bold": 0.6, "natural": 0.4, "bright": 0.4},
        ("architecture", "building", "interior", "office", "desk", "museum", "city"),
        {"scene": 0.9, "object": 0.8, "person": 0.5, "people": 0.4},
        ("landscape", "square"),
        keywords=("design", "art", "jazz", "electronic", "architecture", "magazine"),
    ),
    Template(
        "newspaper",
        "Newspaper",
        "paper",
        ("masthead", "columns", "pull quote"),
        "newspaper front page: masthead, columns, pull quote, tall photo; city, events, "
        "black and white",
        {"editorial": 0.9, "nostalgic": 0.7, "minimal": 0.6, "moody": 0.5, "bold": 0.5},
        ("city", "street", "architecture", "event", "crowd", "news", "old"),
        {"person": 0.8, "scene": 0.8, "people": 0.7, "object": 0.6},
        ("portrait", "square"),
        keywords=("news", "politics", "history", "documentary", "jazz"),
        filter="bw",
    ),
    Template(
        "journal",
        "Journal",
        "card",
        ("blurred backdrop", "paper card", "date line"),
        "paper card over the blurred photo with a date and a few lines; reflective, travel, nature",
        {"natural": 0.9, "dreamy": 0.7, "minimal": 0.6, "bright": 0.5, "cool": 0.5},
        ("nature", "travel", "trail", "mountain", "lake", "park", "forest", "garden"),
        {"scene": 1.0, "object": 0.7, "person": 0.5, "people": 0.5},
        ("landscape", "square"),
        keywords=("folk", "acoustic", "poetry", "literary", "singer-songwriter", "travel", "book"),
    ),
    Template(
        "note",
        "Paper Note",
        "card",
        ("torn note", "push pin", "handwriting"),
        "a handwritten torn paper note pinned over the photo; personal notes, cosy moments, pets",
        {"dreamy": 0.8, "warm": 0.8, "natural": 0.7, "nostalgic": 0.6, "minimal": 0.5},
        ("home", "bedroom", "cafe", "books", "window", "coffee", "pet", "dog", "cat"),
        {"object": 0.9, "scene": 0.8, "person": 0.7, "people": 0.6},
        keywords=("singer-songwriter", "acoustic", "poetry", "romance"),
    ),
    Template(
        "softfocus",
        "Soft Focus",
        "card",
        ("blur backdrop", "fine frame", "haze"),
        "dreamy blurred backdrop with the sharp photo inset in a fine frame; plants, flowers, "
        "soft light",
        {"dreamy": 1, "natural": 0.8, "bright": 0.6, "minimal": 0.6, "cool": 0.5},
        ("flower", "plant", "garden", "window", "sky", "leaves", "bokeh"),
        {"object": 0.9, "scene": 0.9, "person": 0.7, "people": 0.5},
        keywords=("ambient", "dream pop", "shoegaze", "indie"),
        filter="faded",
    ),
    Template(
        "scrapbook",
        "Scrapbook",
        "collage",
        ("polaroid", "washi tape", "stickers"),
        "tilted polaroid with washi tape, stars, a torn note and a stamp; celebrations, "
        "friends, pets",
        {"playful": 1, "bright": 0.8, "warm": 0.6, "nostalgic": 0.6, "dreamy": 0.5},
        ("birthday", "party", "friends", "pet", "dog", "cat", "celebration", "gift", "cake"),
        {"person": 0.9, "people": 0.9, "object": 0.8, "scene": 0.5},
        ("portrait", "square"),
        keywords=("pop", "k-pop", "romance", "comedy", "teen", "dance", "cute", "animation"),
    ),
    Template(
        "moodboard",
        "Mood Board",
        "collage",
        ("photo grid", "palette chips", "hex codes"),
        "mood board: grid of crops plus the photo's colour palette as labelled chips; "
        "aesthetics, outfits, food, decor",
        {"minimal": 0.8, "editorial": 0.8, "natural": 0.7, "dreamy": 0.6, "bright": 0.6},
        ("interior", "food", "outfit", "decor", "flower", "texture", "fabric"),
        {"object": 1.0, "scene": 0.8, "person": 0.6, "people": 0.5},
        keywords=("design", "fashion", "art", "aesthetic"),
        capacity=4,
    ),
    Template(
        "torn",
        "Torn Reveal",
        "collage",
        ("torn paper", "label tapes", "daisy"),
        "photo revealed through a torn paper strip with typewriter label tapes; poetic, flowers, "
        "close-ups",
        {"nostalgic": 0.9, "dreamy": 0.8, "moody": 0.6, "natural": 0.6, "warm": 0.5},
        ("flower", "close-up", "face", "eyes", "field", "garden"),
        {"person": 0.9, "object": 0.8, "scene": 0.7, "people": 0.5},
        ("landscape", "square"),
        keywords=("indie", "alternative", "poetry", "folk"),
        filter="film",
    ),
    Template(
        "minimal",
        "Minimal",
        "frame",
        ("framed photo", "quiet type", "dark matte"),
        "one framed photo on a dark matte with quiet type; understated, gallery, monochrome",
        {"minimal": 1, "moody": 0.7, "cool": 0.7, "editorial": 0.5, "cinematic": 0.4},
        ("museum", "gallery", "architecture", "shadow", "night", "street"),
        {"scene": 0.8, "object": 0.8, "person": 0.7, "people": 0.6},
        keywords=("ambient", "classical", "minimal", "techno", "documentary", "experimental"),
        capacity=2,
    ),
    Template(
        "y2k",
        "Y2K Chrome",
        "frame",
        ("chrome", "sparkles", "glitter"),
        "dark chrome frame with four-point sparkles and glitter; nightlife, parties, neon, "
        "bold selfies",
        {"bold": 1, "playful": 0.8, "moody": 0.6, "cool": 0.6, "cinematic": 0.5},
        ("night", "party", "club", "neon", "concert", "mirror", "selfie", "lights"),
        {"person": 1.0, "people": 0.8, "object": 0.5, "scene": 0.4},
        ("portrait", "square"),
        keywords=("pop", "hip hop", "electronic", "edm", "hyperpop", "k-pop"),
        filter="vivid",
    ),
    Template(
        "nowplaying",
        "Now Playing",
        "music",
        ("music player", "album art", "frosted card"),
        "frosted music player with the photo as album art and the suggested song; drives, "
        "nights, concerts",
        {"moody": 0.8, "dreamy": 0.8, "cool": 0.7, "cinematic": 0.6, "bold": 0.5},
        ("car", "drive", "night", "concert", "headphones", "city lights", "sunset"),
        {"scene": 0.8, "person": 0.8, "object": 0.7, "people": 0.6},
        keywords=("indie", "r&b", "pop", "hip hop", "lo-fi", "electronic"),
    ),
    Template(
        "vinyl",
        "Vinyl",
        "music",
        ("record", "label", "tonearm"),
        "a vinyl record on paper with the photo as its label and a tonearm; retro, warm, music",
        {"nostalgic": 0.9, "warm": 0.8, "minimal": 0.6, "editorial": 0.5, "natural": 0.4},
        ("record", "music", "retro", "home", "cafe", "portrait"),
        {"person": 0.8, "object": 0.8, "scene": 0.6, "people": 0.5},
        ("square", "portrait"),
        keywords=("jazz", "soul", "classic", "rock", "vinyl", "funk"),
    ),
    Template(
        "ticket",
        "Ticket",
        "travel",
        ("boarding pass", "perforation", "barcode"),
        "photo above a boarding-pass stub with seat and barcode; travel, airports, holidays",
        {"bright": 0.7, "natural": 0.7, "playful": 0.6, "cool": 0.6, "nostalgic": 0.5},
        (
            "airport",
            "plane",
            "travel",
            "beach",
            "mountain",
            "train",
            "road trip",
            "holiday",
            "luggage",
            "sky",
        ),
        {"scene": 0.9, "person": 0.8, "object": 0.8, "people": 0.7},
        keywords=("travel", "world", "reggae", "latin", "afrobeats"),
    ),
    Template(
        "duo",
        "Duo Polaroids",
        "polaroid",
        ("two polaroids", "tape", "flowers"),
        "two staggered polaroids taped to a coloured backdrop with flowers; pairs, then-and-now, "
        "two moments",
        {"playful": 0.8, "warm": 0.8, "dreamy": 0.7, "nostalgic": 0.7, "bright": 0.6},
        ("friends", "couple", "trip", "cafe", "flowers", "outfit"),
        {"person": 0.9, "people": 0.9, "object": 0.8, "scene": 0.7},
        capacity=2,
        min_photos=2,
    ),
    Template(
        "polaroids",
        "Polaroid Pile",
        "polaroid",
        ("scattered polaroids", "tape", "captions"),
        "a pile of tilted polaroids with tape and handwritten captions on a dark backdrop; "
        "memories, friends, nights out",
        {"nostalgic": 1, "playful": 0.8, "warm": 0.7, "moody": 0.6, "dreamy": 0.6},
        ("friends", "party", "night", "birthday", "trip", "beach", "memories"),
        {"people": 1.0, "person": 0.9, "object": 0.7, "scene": 0.7},
        capacity=4,
        min_photos=2,
    ),
    Template(
        "splitscreen",
        "Split",
        "grid",
        ("split screen", "text band", "dots"),
        "two photos stacked half and half with a slim text band; before/after, pairs, contrasts",
        {"editorial": 0.9, "bold": 0.8, "minimal": 0.8, "cinematic": 0.6, "cool": 0.5},
        ("city", "street", "outfit", "travel", "food", "architecture"),
        {"scene": 0.9, "person": 0.9, "object": 0.9, "people": 0.8},
        capacity=2,
        min_photos=2,
    ),
    Template(
        "grid",
        "Grid",
        "grid",
        ("2×2 grid", "film frames", "squiggles"),
        "four photos in a 2×2 film-frame grid on paper with doodle squiggles; recaps, outfits, "
        "photo sets",
        {"playful": 0.8, "editorial": 0.8, "bright": 0.7, "natural": 0.6, "minimal": 0.6},
        ("outfit", "food", "friends", "trip", "day", "recap"),
        {"people": 0.9, "person": 0.9, "object": 0.9, "scene": 0.8},
        capacity=4,
        min_photos=3,
    ),
    Template(
        "mosaic",
        "Mosaic",
        "grid",
        ("mosaic", "tall + small tiles", "clean gutters"),
        "an asymmetric mosaic of tall and small tiles on linen; aesthetic recaps, travel, mood",
        {"minimal": 0.9, "natural": 0.8, "dreamy": 0.7, "editorial": 0.7, "bright": 0.6},
        ("travel", "nature", "interior", "food", "outfit", "garden"),
        {"scene": 0.9, "object": 0.9, "person": 0.8, "people": 0.8},
        capacity=4,
        min_photos=3,
    ),
    Template(
        "booth",
        "Photo Booth",
        "strip",
        ("photobooth strip", "tape", "paper"),
        "a vertical photo-booth strip of three frames taped to paper; friends, couples, silly "
        "sequences",
        {"playful": 1, "nostalgic": 0.8, "warm": 0.6, "bright": 0.6, "bold": 0.5},
        ("friends", "selfie", "couple", "party", "booth", "night"),
        {"people": 1.0, "person": 1.0, "object": 0.5, "scene": 0.4},
        capacity=3,
        min_photos=2,
    ),
    Template(
        "torncollage",
        "Torn Collage",
        "collage",
        ("torn bands", "paper edges", "layers"),
        "three photos as full-width bands with torn paper edges between them; journeys, days out, "
        "layered stories",
        {"nostalgic": 0.9, "dreamy": 0.8, "natural": 0.7, "moody": 0.6, "warm": 0.6},
        ("travel", "street", "mountain", "hill", "road", "trip", "city"),
        {"scene": 1.0, "person": 0.8, "people": 0.8, "object": 0.7},
        capacity=3,
        min_photos=2,
        filter="film",
    ),
    # From the owner's reference set (apps/web/lib/story/templates-refs.ts, design-refs u01-u19).
    Template(
        "playlist",
        "Playlist",
        "music",
        ("music library", "two photos"),
        "a dark music-library panel up top with the suggested song, two photos stacked below; "
        "late nights, outfits, details",
        {"moody": 0.95, "cool": 0.7, "bold": 0.6},
        ("music", "night", "outfit", "drink in hand", "headphones", "mirror selfie", "full body"),
        {"people": 1.0, "person": 0.9, "scene": 0.6, "object": 0.5},
        capacity=2,
        min_photos=2,
        keywords=("pop", "r&b", "indie", "hip hop"),
    ),
    Template(
        "playercut",
        "Player Cutout",
        "music",
        ("cutout", "player card"),
        "the person die-cut over a collage on a deep-red music player card; posed portraits, "
        "outfits",
        {"moody": 0.95, "bold": 0.85, "nostalgic": 0.6},
        ("music", "posed", "outfit", "portrait", "full body", "hand on face"),
        {"person": 1.0, "people": 0.6, "scene": 0.3, "object": 0.3},
        filter="bw",
        keywords=("r&b", "alt", "indie", "pop"),
    ),
    Template(
        "triptych",
        "Triptych",
        "strip",
        ("three frames", "faded"),
        "the same close-up three times in stacked bands, softly faded; face closeups and soft "
        "poses",
        {"dreamy": 0.95, "moody": 0.85, "nostalgic": 0.7},
        ("face closeup", "pout", "looking away", "hand on face", "over the shoulder", "portrait"),
        {"person": 1.0, "people": 0.6, "scene": 0.3, "object": 0.3},
        capacity=3,
        filter="faded",
        text_on_photo=True,
    ),
    Template(
        "cctv",
        "CCTV",
        "hud",
        ("surveillance hud", "red boxes"),
        "surveillance-camera frame with timestamp, red tracking boxes and zoomed callouts; "
        "street fashion, full-body outfits",
        {"bold": 0.95, "editorial": 0.85, "cool": 0.6},
        ("full body", "outfit", "street", "sunglasses", "posed", "fashion"),
        {"person": 1.0, "people": 0.5, "scene": 0.4, "object": 0.3},
        text_on_photo=True,
        filter="faded",
    ),
    Template(
        "colorbox",
        "Colour Box",
        "poster",
        ("b&w", "colour window"),
        "black-and-white fashion poster with a colour window over the outfit and a huge title "
        "behind the head",
        {"bold": 1.0, "editorial": 0.9, "cinematic": 0.6},
        ("outfit", "fashion", "posed", "full body", "sunglasses", "glasses"),
        {"person": 1.0, "people": 0.5, "scene": 0.3, "object": 0.4},
        text_on_photo=True,
        keywords=("hip hop", "rap", "r&b", "fashion"),
    ),
    Template(
        "tornstrip",
        "Torn Strip",
        "poster",
        ("magazine cover", "torn paper"),
        "magazine-cover look torn open across the eyes to a black-and-white layer; editorial "
        "portraits",
        {"editorial": 1.0, "bold": 0.85, "cinematic": 0.7},
        ("portrait", "posed", "face closeup", "serious", "hand on face", "fashion"),
        {"person": 1.0, "people": 0.6, "scene": 0.3, "object": 0.3},
        text_on_photo=True,
    ),
    Template(
        "cutout",
        "Sticker Cutout",
        "poster",
        ("die-cut", "huge words"),
        "the person as a die-cut sticker with a white outline over huge words; street style, "
        "full body",
        {"playful": 0.9, "bold": 0.95, "bright": 0.6},
        ("full body", "outfit", "street", "sunglasses", "headphones", "peace sign", "posed"),
        {"person": 1.0, "people": 0.4, "scene": 0.4, "object": 0.3},
        text_on_photo=True,
    ),
    Template(
        "focus",
        "Focus",
        "poster",
        ("blur", "sharp eye strip"),
        "soft black-and-white blur with one sharp strip across the eyes; close portraits",
        {"editorial": 0.95, "minimal": 0.85, "moody": 0.8},
        ("face closeup", "wink", "eyes closed", "serious", "portrait", "hair touch"),
        {"person": 1.0, "people": 0.6, "scene": 0.3, "object": 0.3},
        text_on_photo=True,
    ),
    Template(
        "viewfinder",
        "Camera Screen",
        "hud",
        ("camera screen", "focus brackets"),
        "the photo on a camera's back screen with green focus brackets and REC; candid selfies",
        {"nostalgic": 0.9, "playful": 0.8, "cool": 0.6},
        ("pout", "glasses", "candid", "mirror selfie", "selfie", "finger on lips"),
        {"person": 1.0, "people": 0.6, "scene": 0.3, "object": 0.3},
        filter="cool",
    ),
    Template(
        "camcorder",
        "Camcorder",
        "hud",
        ("viewfinder", "rec"),
        "full-frame camcorder viewfinder with REC, timer and focus brackets on the face",
        {"nostalgic": 0.95, "playful": 0.8, "dreamy": 0.6},
        ("pout", "finger on lips", "glasses", "candid", "kiss face", "tongue out", "selfie"),
        {"person": 1.0, "people": 0.6, "scene": 0.3, "object": 0.3},
        text_on_photo=True,
        filter="faded",
    ),
    Template(
        "sepiabooth",
        "Sepia Prints",
        "booth",
        ("sepia", "four prints"),
        "four slightly tilted sepia prints edge to edge; moody close-ups and poses",
        {"nostalgic": 1.0, "moody": 0.85, "dreamy": 0.75},
        ("face closeup", "pout", "looking away", "hand on face", "hair touch", "over the shoulder"),
        {"people": 1.0, "person": 0.9, "scene": 0.6, "object": 0.5},
        capacity=4,
        min_photos=2,
        filter="sepia",
        text_on_photo=True,
    ),
    Template(
        "desktop",
        "Desktop",
        "screen",
        ("laptop", "window"),
        "the photo in a window on a glowing laptop screen late at night; webcam selfies, pouts",
        {"moody": 0.9, "nostalgic": 0.8, "cool": 0.7},
        ("kiss face", "pout", "night", "selfie", "glasses", "candid"),
        {"person": 1.0, "people": 0.6, "scene": 0.3, "object": 0.3},
        keywords=("k-pop", "pop", "indie"),
    ),
    Template(
        "chat",
        "Chat",
        "screen",
        ("chat bubbles", "two photos"),
        "two photos sent as chat messages with the headline typed in the box; close-ups, nights "
        "out",
        {"moody": 0.9, "cinematic": 0.7, "nostalgic": 0.6},
        ("face closeup", "finger on lips", "side profile", "night", "hand on face"),
        {"people": 1.0, "person": 0.9, "scene": 0.6, "object": 0.5},
        capacity=2,
    ),
    Template(
        "kissmark",
        "Kiss Mark",
        "fullbleed",
        ("lipstick print", "lens"),
        "an out-of-focus lipstick print on the lens over the face; flirty mirror selfies",
        {"playful": 0.9, "dreamy": 0.85, "bold": 0.7},
        ("kiss face", "pout", "mirror selfie", "face closeup", "wink"),
        {"person": 1.0, "people": 0.6, "scene": 0.3, "object": 0.3},
        text_on_photo=True,
    ),
    Template(
        "xerox",
        "Xerox Poster",
        "poster",
        ("photocopy", "lyrics"),
        "photocopied poster with a toner-speckled portrait, a lyric column and a giant vertical "
        "word",
        {"bold": 0.95, "editorial": 0.9, "moody": 0.8},
        ("portrait", "face closeup", "serious", "posed", "music"),
        {"person": 1.0, "people": 0.6, "scene": 0.3, "object": 0.3},
        filter="xerox",
        keywords=("k-pop", "r&b", "alt", "punk"),
    ),
    Template(
        "yearbook",
        "Yearbook",
        "card",
        ("portrait cards", "serif caps"),
        "school-portrait cards on a tilted sheet with the name in classic serif caps",
        {"editorial": 0.9, "nostalgic": 0.85, "cool": 0.6},
        ("portrait", "posed", "serious", "smile", "face closeup"),
        {"person": 1.0, "people": 0.6, "scene": 0.3, "object": 0.3},
    ),
    Template(
        "coversepia",
        "Sepia + Song",
        "music",
        ("music sticker", "sepia"),
        "sepia portrait with a small song cover sticker in the corner; over-the-shoulder looks",
        {"nostalgic": 0.95, "moody": 0.85, "warm": 0.6},
        ("over the shoulder", "hair touch", "looking away", "portrait", "music"),
        {"person": 1.0, "people": 0.6, "scene": 0.3, "object": 0.3},
        text_on_photo=True,
        filter="sepia",
        keywords=("r&b", "hip hop", "soul"),
    ),
    Template(
        "covercorner",
        "Song Corner",
        "music",
        ("music sticker", "corner"),
        "full photo with the song cover and title tucked top-left; lying down, candid moods",
        {"moody": 0.9, "bold": 0.75, "playful": 0.6},
        ("lying down", "sunglasses", "candid", "pout", "music", "night"),
        {"person": 1.0, "people": 0.6, "scene": 0.3, "object": 0.3},
        text_on_photo=True,
        filter="faded",
        keywords=("rock", "punk", "alt", "metal"),
    ),
    Template(
        "covermouth",
        "Song on Lips",
        "music",
        ("music sticker", "close-up"),
        "close-up with the song's instagram sticker right over the lips; pouts, tongue out, "
        "playful selfies",
        {"playful": 0.95, "bold": 0.8, "dreamy": 0.6},
        (
            "pout",
            "tongue out",
            "kiss face",
            "face closeup",
            "finger on lips",
            "glasses",
            "selfie",
            "music",
        ),
        {"person": 1.0, "people": 0.6, "scene": 0.3, "object": 0.3},
        text_on_photo=True,
        keywords=("hip hop", "rap", "pop"),
    ),
    Template(
        "camtilt",
        "Night Cam",
        "hud",
        ("night vision", "tilted frame"),
        "a tilted green night-vision camcorder frame with the date burned in; moody night "
        "portraits",
        {"moody": 1.0, "nostalgic": 0.85, "cinematic": 0.75},
        ("night", "portrait", "serious", "looking away", "hair touch", "candid"),
        {"person": 1.0, "people": 0.6, "scene": 0.3, "object": 0.3},
        filter="noir",
    ),
    # Declarative aesthetic + song-cover layouts (apps/web/lib/story/layouts-aesthetic.ts),
    # from design-refs/pinterest/aesthetic1-6 and cover1-4.
    Template(
        "weekday",
        "Weekday",
        "type",
        ("bold type", "weekday"),
        "your day of the week, stacked huge in bold type over the photo",
        {"bold": 1, "playful": 0.8, "bright": 0.7, "natural": 0.5},
        ("weekend", "city", "street", "friends", "cafe"),
        {"person": 0.9, "people": 0.8, "scene": 0.9, "object": 0.6},
        text_on_photo=True,
    ),
    Template(
        "daysplit",
        "Day Split",
        "type",
        ("weekday", "two photos"),
        "two photos stacked with the weekday split across them in giant letters",
        {"bold": 1, "playful": 0.8, "natural": 0.6},
        ("weekend", "city", "friends", "trip"),
        {"people": 1.0, "person": 0.9, "scene": 0.7, "object": 0.7},
        text_on_photo=True,
        capacity=2,
        min_photos=2,
    ),
    Template(
        "halfword",
        "Half Word",
        "type",
        ("weekday", "split word"),
        "the weekday broken in two - top half over one photo, the rest over the next",
        {"bold": 0.95, "moody": 0.7, "cinematic": 0.6},
        ("weekend", "city", "night", "street"),
        {"people": 1.0, "person": 0.9, "scene": 0.7, "object": 0.7},
        text_on_photo=True,
        capacity=2,
        min_photos=2,
    ),
    Template(
        "verticalday",
        "Vertical Day",
        "type",
        ("vertical type", "rule"),
        "a full-bleed photo with the weekday set vertically along the edge",
        {"editorial": 0.9, "minimal": 0.8, "cool": 0.6},
        ("city", "street", "architecture", "sky"),
        {"scene": 1.0, "person": 0.7, "people": 0.6, "object": 0.6},
        text_on_photo=True,
    ),
    Template(
        "scripttitle",
        "Script Title",
        "type",
        ("script", "handwritten"),
        "one big handwritten line over the photo - the little things",
        {"dreamy": 1, "warm": 0.8, "natural": 0.7},
        ("sunset", "golden hour", "flowers", "cafe", "home"),
        {"person": 0.9, "people": 0.8, "scene": 0.9, "object": 0.6},
        text_on_photo=True,
    ),
    Template(
        "refresh",
        "Refresh",
        "type",
        ("script", "landscape"),
        "a landscape with a sweeping script word and a quiet subtitle",
        {"natural": 1, "dreamy": 0.85, "cool": 0.6},
        ("mountain", "landscape", "lake", "sea", "forest", "hill", "sky"),
        {"scene": 1.0, "person": 0.7, "people": 0.6, "object": 0.6},
        text_on_photo=True,
    ),
    Template(
        "bigletters",
        "Big Letters",
        "type",
        ("poster", "huge type"),
        "oversized letters bleeding off the photo, poster-style",
        {"bold": 1, "editorial": 0.8, "cinematic": 0.6},
        ("city", "fashion", "street", "sport", "concert"),
        {"person": 0.9, "people": 0.8, "scene": 0.9, "object": 0.6},
        text_on_photo=True,
    ),
    Template(
        "navheader",
        "Daily Header",
        "type",
        ("nav bar", "serif title"),
        "a moody photo with a slim nav bar and a big serif title",
        {"moody": 0.95, "editorial": 0.85, "cinematic": 0.7},
        ("night", "city", "cafe", "rain", "interior"),
        {"person": 0.9, "people": 0.8, "scene": 0.9, "object": 0.6},
        text_on_photo=True,
    ),
    Template(
        "quotemarks",
        "Quote",
        "type",
        ("quote", "serif"),
        "big quote marks and a serif line over a darkened photo",
        {"moody": 0.9, "cinematic": 0.8, "editorial": 0.7},
        ("night", "rain", "window", "street", "sea"),
        {"scene": 1.0, "person": 0.7, "people": 0.6, "object": 0.6},
        text_on_photo=True,
    ),
    Template(
        "spotlight",
        "Spotlight",
        "fullbleed",
        ("vignette", "centred"),
        "a deep vignette pulls focus to the centre, with white type",
        {"moody": 1, "cinematic": 0.9, "bold": 0.6},
        ("night", "concert", "portrait", "stage", "candle"),
        {"person": 1.0, "people": 0.8, "scene": 0.6, "object": 0.8},
        text_on_photo=True,
    ),
    Template(
        "bluehour",
        "Blue Hour",
        "fullbleed",
        ("cool grade", "rules"),
        "a cool, quiet grade with a centred serif line between rules",
        {"cool": 1, "minimal": 0.8, "dreamy": 0.7, "moody": 0.6},
        ("blue hour", "sea", "city", "sky", "night", "snow"),
        {"scene": 1.0, "person": 0.7, "people": 0.6, "object": 0.6},
        text_on_photo=True,
        filter="cool",
    ),
    Template(
        "subtitlebar",
        "Subtitle Bar",
        "fullbleed",
        ("subtitle", "cinema"),
        "full photo with a cinema subtitle bar for a lyric or a line",
        {"cinematic": 1, "moody": 0.8, "nostalgic": 0.6},
        ("street", "car", "night", "train", "window"),
        {"person": 0.9, "people": 0.8, "scene": 0.9, "object": 0.6},
        text_on_photo=True,
    ),
    Template(
        "redblock",
        "Red Block",
        "card",
        ("red block", "b&w"),
        "black-and-white photo with one red block holding a few words",
        {"bold": 1, "editorial": 0.9, "minimal": 0.6},
        ("city", "architecture", "fashion", "portrait"),
        {"person": 1.0, "people": 0.8, "scene": 0.6, "object": 0.8},
        text_on_photo=True,
        filter="bw",
    ),
    Template(
        "badge",
        "Quote Badge",
        "card",
        ("circle badge", "b&w"),
        "a red circle badge with a short quote over a monochrome photo",
        {"bold": 0.95, "editorial": 0.8, "playful": 0.6},
        ("portrait", "fashion", "street", "city"),
        {"person": 1.0, "people": 0.8, "scene": 0.6, "object": 0.8},
        text_on_photo=True,
        filter="bw",
    ),
    Template(
        "stats",
        "Stats",
        "card",
        ("stats", "script"),
        "a night photo with a script title and a block of little stats",
        {"moody": 0.9, "cinematic": 0.8, "playful": 0.6},
        ("night", "city", "concert", "sport", "car"),
        {"person": 0.9, "people": 0.8, "scene": 0.9, "object": 0.6},
        text_on_photo=True,
    ),
    Template(
        "notesapp",
        "Notes Card",
        "card",
        ("notes app", "card"),
        "a clean notes card over the photo - a thought, a list, a line",
        {"minimal": 0.9, "natural": 0.8, "warm": 0.6},
        ("cafe", "home", "desk", "books", "coffee", "window"),
        {"object": 1.0, "scene": 0.8, "person": 0.6, "people": 0.5},
        text_on_photo=True,
    ),
    Template(
        "handnote",
        "Hand Note",
        "card",
        ("handwriting", "card"),
        "a white card with red handwriting pinned over a black-and-white photo",
        {"nostalgic": 0.9, "editorial": 0.7, "moody": 0.6},
        ("portrait", "street", "home", "books"),
        {"person": 1.0, "people": 0.8, "scene": 0.6, "object": 0.8},
        text_on_photo=True,
        filter="bw",
    ),
    Template(
        "sticky",
        "Sticky Note",
        "card",
        ("sticky note", "tape"),
        "a taped yellow sticky note with a handwritten line over the photo",
        {"playful": 0.95, "bright": 0.8, "warm": 0.6},
        ("desk", "study", "home", "cafe", "books"),
        {"object": 1.0, "scene": 0.8, "person": 0.6, "people": 0.5},
        text_on_photo=True,
    ),
    Template(
        "checklist",
        "Checklist",
        "card",
        ("checklist", "list"),
        "a to-do card checking off what's in the photo",
        {"playful": 0.9, "bright": 0.8, "natural": 0.6},
        ("food", "trip", "picnic", "beach", "cafe", "desk"),
        {"object": 1.0, "scene": 0.8, "person": 0.6, "people": 0.5},
        text_on_photo=True,
    ),
    Template(
        "calendarcard",
        "Calendar",
        "card",
        ("calendar", "date"),
        "the month's calendar card with today circled, over the photo",
        {"minimal": 0.85, "bright": 0.75, "natural": 0.6},
        ("trip", "birthday", "party", "beach", "city"),
        {"person": 0.9, "people": 0.8, "scene": 0.9, "object": 0.6},
        text_on_photo=True,
    ),
    Template(
        "receipt",
        "Receipt",
        "card",
        ("receipt", "list"),
        "a little receipt of the day - items from the photo, total: priceless",
        {"playful": 0.9, "nostalgic": 0.7, "warm": 0.6},
        ("food", "cafe", "shopping", "trip", "market", "dinner"),
        {"object": 1.0, "scene": 0.8, "person": 0.6, "people": 0.5},
        text_on_photo=True,
    ),
    Template(
        "doodlesun",
        "Doodle Frame",
        "frame",
        ("doodles", "rounded"),
        "a rounded photo ringed with white doodles - sun, hearts, swirls",
        {"playful": 1, "bright": 0.8, "warm": 0.7},
        ("selfie", "friends", "beach", "summer", "pet"),
        {"person": 1.0, "people": 0.8, "scene": 0.6, "object": 0.8},
    ),
    Template(
        "bigpolaroid",
        "Big Polaroid",
        "polaroid",
        ("polaroid", "blur"),
        "one big polaroid on a blurred backdrop, captioned by hand",
        {"nostalgic": 0.95, "warm": 0.8, "dreamy": 0.7},
        ("friends", "selfie", "beach", "party", "summer"),
        {"person": 1.0, "people": 0.8, "scene": 0.6, "object": 0.8},
    ),
    Template(
        "framein",
        "Frame in Frame",
        "frame",
        ("frame in frame", "loop"),
        "a framed photo with a smaller crop of itself inset - a loop",
        {"editorial": 0.85, "cinematic": 0.8, "bold": 0.6},
        ("portrait", "architecture", "fashion", "object"),
        {"person": 1.0, "people": 0.8, "scene": 0.6, "object": 0.8},
    ),
    Template(
        "postcard",
        "Postcard",
        "travel",
        ("postcard", "stamp"),
        "a postcard: photo on the left, stamp and handwritten note on the right",
        {"nostalgic": 0.9, "warm": 0.8, "natural": 0.7},
        ("travel", "beach", "city", "landmark", "mountain", "sea"),
        {"scene": 1.0, "person": 0.7, "people": 0.6, "object": 0.6},
    ),
    Template(
        "stackedcards",
        "Stacked Cards",
        "polaroid",
        ("stacked", "tilted"),
        "three photos as tilted cards stacked over a blurred backdrop",
        {"playful": 0.85, "nostalgic": 0.8, "warm": 0.7},
        ("friends", "party", "trip", "night"),
        {"people": 1.0, "person": 0.9, "scene": 0.7, "object": 0.7},
        capacity=3,
        min_photos=2,
    ),
    Template(
        "bwstack",
        "B&W Stack",
        "strip",
        ("b&w", "stack"),
        "three monochrome strips stacked to one side of a blurred scene",
        {"moody": 0.9, "editorial": 0.85, "cinematic": 0.8},
        ("city", "street", "portrait", "night"),
        {"people": 1.0, "person": 0.9, "scene": 0.7, "object": 0.7},
        capacity=3,
        min_photos=2,
        filter="bw",
    ),
    Template(
        "wavecut",
        "Wave Cut",
        "split",
        ("wavy", "paper band"),
        "two photos split by a wavy paper band with handwritten notes",
        {"playful": 0.9, "bright": 0.8, "natural": 0.7},
        ("beach", "sea", "summer", "friends", "pet"),
        {"people": 1.0, "person": 0.9, "scene": 0.7, "object": 0.7},
        capacity=2,
        min_photos=2,
    ),
    Template(
        "diagonal",
        "Diagonal Split",
        "split",
        ("diagonal", "seam"),
        "two photos cut on a diagonal with a title along the seam",
        {"bold": 0.95, "cinematic": 0.8, "moody": 0.6},
        ("sport", "city", "car", "concert", "night"),
        {"people": 1.0, "person": 0.9, "scene": 0.7, "object": 0.7},
        capacity=2,
        min_photos=2,
        text_on_photo=True,
    ),
    Template(
        "filmburn",
        "Film Burn",
        "fullbleed",
        ("film burn", "8mm"),
        "8mm look with orange burn at the edges, vignette and a date stamp",
        {"nostalgic": 1, "warm": 0.9, "dreamy": 0.7},
        ("summer", "beach", "road", "car", "sunset"),
        {"person": 0.9, "people": 0.8, "scene": 0.9, "object": 0.6},
        text_on_photo=True,
        filter="8mm",
    ),
    Template(
        "hearts",
        "Hearts",
        "fullbleed",
        ("hearts", "rosy"),
        "a rosy tint with hearts scattered over the photo",
        {"playful": 0.95, "dreamy": 0.85, "warm": 0.7},
        ("couple", "selfie", "flowers", "date", "valentine"),
        {"person": 1.0, "people": 0.8, "scene": 0.6, "object": 0.8},
        text_on_photo=True,
    ),
    Template(
        "coverface",
        "Cover Over Face",
        "music",
        ("album cover", "over face"),
        "the song's square cover placed over the face - the music trend",
        {"moody": 0.9, "bold": 0.85, "cinematic": 0.7},
        ("music", "concert", "selfie", "portrait", "headphones"),
        {"person": 1.0, "people": 0.6, "scene": 0.3, "object": 0.3},
        text_on_photo=True,
        keywords=("pop", "hip hop", "indie", "r&b", "rap"),
    ),
    Template(
        "coversingle",
        "New Single",
        "music",
        ("album cover", "poster"),
        "a 'new single' poster: big cover art centred on your blurred photo",
        {"bold": 0.95, "cinematic": 0.85, "moody": 0.7},
        ("music", "concert", "stage", "night"),
        {"person": 0.9, "people": 0.8, "scene": 0.9, "object": 0.6},
        text_on_photo=True,
        keywords=("pop", "indie", "electronic", "rock"),
    ),
    Template(
        "coverfloat",
        "Floating Player",
        "music",
        ("player card", "floating"),
        "a tilted player card with the song's cover floating beside you",
        {"dreamy": 0.85, "cool": 0.8, "moody": 0.7},
        ("music", "car", "night", "window", "headphones", "city"),
        {"person": 0.9, "people": 0.8, "scene": 0.9, "object": 0.6},
        text_on_photo=True,
        keywords=("indie", "lo-fi", "r&b", "pop"),
    ),
    Template(
        "coverbubble",
        "Tilted Song",
        "music",
        ("tilted art", "doodle arrow"),
        "big tilted album art with a doodled arrow pointing at it; playful music moments",
        {"playful": 0.95, "bold": 0.8, "warm": 0.6},
        ("music", "friends", "selfie", "party", "car"),
        {"person": 1.0, "people": 0.8, "scene": 0.6, "object": 0.8},
        text_on_photo=True,
        keywords=("pop", "k-pop", "dance", "hip hop"),
    ),
    Template(
        "coverpolaroid",
        "Polaroid + Cover",
        "music",
        ("polaroid", "cover sticker"),
        "a polaroid on paper with the song cover taped on like a sticker",
        {"nostalgic": 0.9, "warm": 0.85, "playful": 0.6},
        ("music", "home", "vinyl", "friends", "summer"),
        {"person": 1.0, "people": 0.8, "scene": 0.6, "object": 0.8},
        keywords=("indie", "folk", "soul", "classic"),
    ),
    Template(
        "notesdark",
        "Dark Note",
        "card",
        ("dark notes", "card"),
        "a dark notes card with soft white type over the photo",
        {"moody": 0.9, "minimal": 0.8, "cool": 0.6},
        ("night", "rain", "window", "city", "desk"),
        {"object": 1.0, "scene": 0.8, "person": 0.6, "people": 0.5},
        text_on_photo=True,
    ),
    # Second owner set (apps/web/lib/story/templates-pins.ts). Metadata spells out the photo each
    # one wants — shot type, subject, light, colour — so ranking and the vision model can match.
    Template(
        "appswitch",
        "App Switcher",
        "screen",
        ("app switcher", "b&w story"),
        "phone app switcher (pins, music, Instagram) with your photo as a black-and-white Story "
        "being posted; candid or posed portraits, sitting indoors, soft window light",
        {"moody": 1.0, "minimal": 0.85, "nostalgic": 0.7, "editorial": 0.6, "cool": 0.5},
        (
            "portrait",
            "sitting",
            "indoor",
            "bedroom",
            "looking away",
            "candid",
            "bandana",
            "window light",
            "selfie",
        ),
        {"person": 1.0, "people": 0.5, "scene": 0.3, "object": 0.3},
        ("portrait", "square"),
        keywords=("r&b", "indie", "pop", "alternative"),
        filter="bw",
    ),
    Template(
        "phones",
        "Old Phones",
        "screen",
        ("retro phones", "split screens"),
        "one face split across a pile of old phones, a camera and a cordless handset on a white "
        "wall, faded pink grain; face close-ups and selfies, y2k nostalgia",
        {"nostalgic": 1.0, "dreamy": 0.85, "playful": 0.7, "moody": 0.6, "editorial": 0.6},
        ("face closeup", "selfie", "portrait", "eyes", "hair", "close-up", "pout"),
        {"person": 1.0, "people": 0.4, "scene": 0.2, "object": 0.4},
        ("portrait", "square"),
        keywords=("y2k", "k-pop", "pop", "2000s", "retro", "indie pop"),
        filter="faded",
    ),
    Template(
        "camlyric",
        "Camera Lyric",
        "music",
        ("digicam", "lyric card", "chrome stars"),
        "a silver digital camera across a mirror selfie, its screen a lyric card with the song "
        "cover, chrome stars and a kiss mark; outfits, dresses, brown and warm tones",
        {"warm": 1.0, "editorial": 0.85, "bold": 0.7, "nostalgic": 0.7, "moody": 0.6},
        (
            "mirror selfie",
            "outfit",
            "dress",
            "full body",
            "fashion",
            "posed",
            "bag",
            "brown",
            "night out",
        ),
        {"person": 1.0, "people": 0.5, "scene": 0.3, "object": 0.3},
        ("portrait", "square"),
        keywords=("r&b", "pop", "hip hop", "soul", "fashion"),
        capacity=2,
    ),
    Template(
        "filmslant",
        "Analog Film",
        "strip",
        ("film strip", "sepia", "4 frames"),
        "a tilted strip of four analog film frames on cream paper, sepia-toned; posed portraits, "
        "smiles, party looks, several shots of the same moment",
        {"nostalgic": 1.0, "warm": 0.85, "dreamy": 0.75, "moody": 0.6, "natural": 0.5},
        ("portrait", "smile", "posed", "party", "friends", "hair", "night out", "selfie"),
        {"person": 1.0, "people": 0.9, "scene": 0.4, "object": 0.4},
        ("portrait", "square", "landscape"),
        keywords=("retro", "vintage", "classic", "soul", "indie"),
        filter="sepia",
        capacity=4,
    ),
    Template(
        "songbox",
        "Song Box",
        "poster",
        ("threshold box", "song title"),
        "a full-colour photo with one square that turns stark black-and-white, the song title "
        "and artist underneath; dim face close-ups, eyes, night selfies",
        {"moody": 1.0, "cinematic": 0.85, "editorial": 0.7, "minimal": 0.6, "warm": 0.5},
        ("face closeup", "eyes", "selfie", "night", "dim", "portrait", "hair", "lips"),
        {"person": 1.0, "people": 0.5, "scene": 0.3, "object": 0.4},
        ("portrait", "square"),
        True,
        ("r&b", "alternative", "indie", "pop", "sad"),
    ),
    Template(
        "clockit",
        "Clock It",
        "poster",
        ("two photos", "type behind you", "cute stickers"),
        "two stacked outfit shots with fine diagonal lines, a big serif word tucked behind you "
        "and cute stickers (headphone cat, !!, owo cat); street style, full-body fits",
        {"playful": 1.0, "nostalgic": 0.8, "warm": 0.75, "bold": 0.7, "natural": 0.5},
        ("outfit", "full body", "street", "fashion", "walking", "shirt", "bag", "fit check"),
        {"person": 1.0, "people": 0.6, "scene": 0.4, "object": 0.3},
        ("portrait", "square"),
        True,
        ("pop", "k-pop", "indie pop", "cute", "fashion"),
        filter="film",
        capacity=2,
    ),
    Template(
        "doodlefit",
        "Basic Fit",
        "doodle",
        ("cutout doodles", "vertical type"),
        "outfit shot with white motion lines and yellow sparks drawn around your outline, "
        "pastel vertical handwriting; top-down fit checks, casual outfits, sunny streets",
        {"playful": 1.0, "bright": 0.9, "natural": 0.75, "warm": 0.6, "minimal": 0.5},
        (
            "outfit",
            "fit check",
            "full body",
            "top-down",
            "street",
            "jeans",
            "sneakers",
            "pavement",
            "walking",
        ),
        {"person": 1.0, "people": 0.5, "scene": 0.3, "object": 0.3},
        text_on_photo=True,
        keywords=("pop", "indie pop", "k-pop", "dance"),
    ),
    Template(
        "lyriclily",
        "Lyric Lily",
        "music",
        ("lyric card", "dark lily", "photo bands"),
        "your photo in two bands around a black strip with a mauve lyric card and a large dark "
        "red lily; moody selfies, close-up portraits, night, sultry or dark-romance vibes",
        {"moody": 1.0, "cinematic": 0.85, "bold": 0.8, "warm": 0.5, "nostalgic": 0.5},
        ("selfie", "close-up", "portrait", "night", "bedroom", "dark", "face", "lips"),
        {"person": 1.0, "people": 0.35, "object": 0.2, "scene": 0.15},
        ("portrait", "square", "landscape"),
        False,
        ("r&b", "hip hop", "rap", "dark", "sultry", "soul", "trap"),
        capacity=2,
    ),
    Template(
        "keyphoto",
        "Key Photo",
        "screen",
        ("photo editor", "live frames", "small caption"),
        "your photo open in a phone photo editor on black: live preview with a small caption, "
        "the key-photo tip, frame scrubber and toolbar; warm indoor selfies, candid portraits",
        {"moody": 0.95, "warm": 0.9, "nostalgic": 0.8, "cinematic": 0.7, "minimal": 0.6},
        ("selfie", "portrait", "bedroom", "indoor", "room", "lamp", "close-up", "night"),
        {"person": 1.0, "people": 0.6, "object": 0.4, "scene": 0.35},
        ("landscape", "square", "portrait"),
        True,
        ("indie", "r&b", "bedroom pop", "lo-fi", "alternative"),
    ),
    Template(
        "sidecollage",
        "Sideways Collage",
        "collage",
        ("sideways photos", "album art", "chrome stars"),
        "two sideways photos with an upright square inset, the song's album art, chrome stars, "
        "red hearts and lips, an eye bar; party outfits, glitter dresses, night-out poses",
        {"bold": 1.0, "playful": 0.9, "editorial": 0.7, "moody": 0.6, "bright": 0.5},
        ("party", "night", "dress", "outfit", "glitter", "pose", "mirror", "full body", "club"),
        {"person": 1.0, "people": 0.7, "object": 0.2, "scene": 0.2},
        ("portrait", "square", "landscape"),
        False,
        ("k-pop", "pop", "party", "dance", "fashion", "hip hop"),
        capacity=3,
    ),
)

TEMPLATES_BY_ID = {t.id: t for t in CATALOGUE}

# When layouts joined the catalogue (everything else: launch). Newness fades over NEW_DAYS.
LAUNCH = date(2026, 9, 1)
NEW_DAYS = 30
ADDED: dict[str, date] = {
    **{
        i: date(2026, 10, 11)
        for i in ("appswitch", "phones", "camlyric", "filmslant", "songbox", "clockit", "doodlefit")
    },
    **{i: date(2026, 10, 14) for i in ("lyriclily", "keyphoto", "sidecollage")},
}
W_POPULAR, W_NEW = 0.10, 0.08
PROMOTE_WITHIN, PROMOTE_MIN = 9, 0.85  # candidates: top 9 by fit, ≥ 85% of the best score


def newness(template_id: str, today: date | None = None) -> float:
    """1 on the day a layout is added, fading to 0 after NEW_DAYS."""
    age = ((today or date.today()) - ADDED.get(template_id, LAUNCH)).days
    return max(0.0, 1 - max(0, age) / NEW_DAYS)


def new_layout_ids(today: date | None = None) -> list[str]:
    return [t.id for t in CATALOGUE if newness(t.id, today) > 0]


def popularity(template_id: str, likes: dict[str, int]) -> float:
    """0..1, log-scaled against the most-liked layout."""
    top = max(likes.values(), default=0)
    return math.log1p(likes.get(template_id, 0)) / math.log1p(top) if top else 0.0


SPLITS_PHOTO = {"stills", "filmstrip", "photodump"}  # shifted crops of one photo can slice a face

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

MOOD_WEIGHTS = (1.0, 0.8, 0.6, 0.45, 0.35)

# What the photo is about (vision/taxonomy.py TOPICS) → layouts that suit it, best first.
TOPIC_LAYOUTS: dict[str, tuple[str, ...]] = {
    "portrait": (
        "magazine",
        "cinematic",
        "vintage",
        "torn",
        "y2k",
        "softfocus",
        "tornstrip",
        "focus",
        "xerox",
        "songbox",
        "appswitch",
        "filmslant",
        "lyriclily",
        "keyphoto",
    ),
    "selfie": (
        "y2k",
        "magazine",
        "vintage",
        "booth",
        "polaroids",
        "scrapbook",
        "viewfinder",
        "camcorder",
        "kissmark",
        "phones",
        "songbox",
        "filmslant",
        "keyphoto",
        "sidecollage",
    ),
    "group": ("photodump", "polaroids", "booth", "scrapbook", "grid", "filmstrip", "filmslant"),
    "couple": ("duo", "vintage", "softfocus", "polaroids", "cinematic", "note"),
    "family": ("scrapbook", "polaroids", "journal", "duo", "mosaic", "note"),
    "pet": ("note", "scrapbook", "polaroids", "softfocus", "duo", "grid"),
    "animal": ("journal", "softfocus", "stills", "cinematic", "note"),
    "sky": ("cinematic", "stills", "softfocus", "journal", "vintage"),
    "landscape": ("journal", "stills", "torncollage", "cinematic", "mosaic", "softfocus"),
    "beach": ("vintage", "stills", "ticket", "torncollage", "polaroids", "cinematic"),
    "flowers": ("softfocus", "torn", "moodboard", "note", "journal"),
    "city": ("newspaper", "editorial", "minimal", "splitscreen", "cinematic", "filmstrip"),
    "architecture": ("editorial", "newspaper", "minimal", "splitscreen", "mosaic"),
    "travel": ("ticket", "journal", "torncollage", "stills", "polaroids", "mosaic"),
    "food": ("photodump", "moodboard", "grid", "note", "mosaic"),
    "celebration": ("scrapbook", "photodump", "polaroids", "y2k", "booth", "grid", "sidecollage"),
    "wedding": ("softfocus", "duo", "vintage", "magazine", "polaroids", "journal"),
    "music": (
        "nowplaying",
        "vinyl",
        "filmstrip",
        "y2k",
        "cinematic",
        "playlist",
        "playercut",
        "coversepia",
        "camlyric",
        "songbox",
        "appswitch",
        "lyriclily",
    ),
    "sport": ("magazine", "newspaper", "splitscreen", "grid", "filmstrip"),
    "fashion": (
        "magazine",
        "moodboard",
        "y2k",
        "splitscreen",
        "editorial",
        "grid",
        "colorbox",
        "cctv",
        "cutout",
        "clockit",
        "doodlefit",
        "camlyric",
        "sidecollage",
    ),
    "interior": ("moodboard", "editorial", "note", "mosaic", "minimal"),
    "objects": ("moodboard", "note", "editorial", "grid", "minimal"),
    "study_work": ("editorial", "newspaper", "note", "grid", "minimal"),
    "night": (
        "y2k",
        "nowplaying",
        "cinematic",
        "filmstrip",
        "minimal",
        "songbox",
        "appswitch",
        "lyriclily",
        "sidecollage",
    ),
    "details": ("minimal", "softfocus", "moodboard", "torn", "editorial"),
}


def _topic_fit(t: Template, topic: str | None) -> float:
    if not topic or topic not in TOPIC_LAYOUTS:
        return 0.5  # unknown: neutral
    order = TOPIC_LAYOUTS[topic]
    if t.id not in order:
        return 0.35
    i = order.index(t.id)
    return 1.0 if i < 2 else 0.85 if i < 4 else 0.7


def _mood_fit(t: Template, p: VisualProfile) -> float:
    if not p.mood:
        return 0.3
    weights = MOOD_WEIGHTS[: len(p.mood)]
    total = sum(w * t.moods.get(m, 0.1) for w, m in zip(weights, p.mood, strict=False))
    return total / sum(weights)


def _scene_fit(t: Template, scene: list[str]) -> float:
    if not scene:
        return 0.5  # no evidence either way
    cues = " | ".join(scene).lower()
    hits = sum(1 for k in t.scenes if k in cues)
    return 0.3 + 0.7 * min(1.0, hits / 2)


def _visual_fit(
    t: Template, p: VisualProfile, scene: list[str], subject: str | None, topic: str | None = None
) -> float:
    comp = 1.0 if p.composition in t.compositions else 0.4
    subj = t.subjects.get(subject, 0.6) if subject else 0.6
    fit = (
        0.40 * _mood_fit(t, p)
        + 0.20 * _topic_fit(t, topic)
        + 0.15 * _scene_fit(t, scene)
        + 0.15 * subj
        + 0.10 * comp
    )
    return round(min(fit, 1.0), 3)


def _cultural_fit(t: Template, tags: list[str]) -> tuple[float, list[str]]:
    if not tags:
        return 0.5, []  # neutral: no provider evidence, so no cultural preference either way
    lowered = [x.lower() for x in tags]
    hits = sorted({tag for tag in lowered for k in t.keywords if k in tag})
    return round(0.35 + 0.65 * min(1.0, len(hits) / 3), 3), hits


def layout_tag_ids() -> list[str]:
    """Every Qloo tag any layout carries (what tag_affinity is asked about)."""
    return sorted({x["tag"] for tags in LAYOUT_TAGS.values() for x in tags})


def qloo_layout_fit(affinity: dict[str, float]) -> dict[str, tuple[float, list[str]]]:
    """Layout id → (0..1 fit, tag names that drove it), from Qloo's tag affinities.

    A layout's raw fit is the weight-averaged affinity of its tags (a tag Qloo left out counts
    as 0), shrunk toward 0.5 by a prior worth QLOO_PRIOR_WEIGHT of tag weight, so a layout with
    one lucky tag can't outrank one with several good ones. Fits are then scaled so the best
    layout scores 1. Empty when Qloo returned nothing."""
    raw: dict[str, tuple[float, list[str]]] = {}
    for layout, tags in LAYOUT_TAGS.items():
        total = sum(x["weight"] for x in tags)
        if not total:
            continue
        hit = sum(x["weight"] * affinity.get(x["tag"], 0.0) for x in tags)
        fit = (hit + 0.5 * QLOO_PRIOR_WEIGHT) / (total + QLOO_PRIOR_WEIGHT)
        top = sorted(
            (x for x in tags if x["tag"] in affinity),
            key=lambda x: -x["weight"] * affinity[x["tag"]],
        )
        raw[layout] = (fit, list(dict.fromkeys(x["name"].lower() for x in top))[:3])
    best = max((f for f, _ in raw.values()), default=0.0)
    if not affinity or best <= 0:
        return {}
    return {k: (round(f / best, 3), names) for k, (f, names) in raw.items()}


def _readability(t: Template, p: VisualProfile) -> float:
    if not t.text_on_photo:
        return 0.75  # text sits on paper/cards: fine, but not an automatic win
    # Text over busy, mid-tone photos is hardest to read; overlays help but don't fix it fully.
    busy = p.contrast * 0.6 + (1 - abs(p.brightness - 0.5) * 2) * 0.4
    return round(max(0.3, 1 - 0.55 * busy), 3)


def _ai_fit(t: Template, picks: list[str]) -> float:
    if t.id in picks:
        i = picks.index(t.id)
        return AI_RANK_FIT[min(i, len(AI_RANK_FIT) - 1)]
    return AI_UNPICKED


def _count_fit(t: Template, n: int) -> float:
    """How well a layout suits the number of photos (1 = ideal)."""
    if n <= 1:
        if t.capacity == 1:
            return 1.0
        return 0.9 if t.min_photos == 1 else 0.4  # multi-only layouts would repeat one photo
    if t.capacity >= n:
        return 1.0 if t.min_photos <= n else 0.85
    return 0.7 if t.capacity > 1 else 0.3  # single-photo layouts would drop photos


def _jitter(p: VisualProfile, template_id: str) -> float:
    """Tiny, deterministic, photo-specific tie-breaker (≤0.012) derived from the image read."""
    sig = f"{p.palette}|{p.brightness}|{p.contrast}|{p.saturation}|{template_id}"
    return int(hashlib.sha256(sig.encode()).hexdigest()[:6], 16) / 0xFFFFFF * 0.012


def mood_filter(p: VisualProfile) -> str:
    """Photo filter suggested by the photo's moods/measurements (template looks may override)."""
    moods = p.mood[:2]
    if "minimal" in moods and p.saturation < 0.2 and p.contrast > 0.5:
        return "noir"
    if "warm" in moods and p.brightness > 0.55:
        return "golden"
    if "warm" in moods or "nostalgic" in moods:
        return "film"
    if "cool" in moods:
        return "cool"
    if "dreamy" in moods or "minimal" in moods:
        return "faded"
    if "playful" in moods or "bold" in moods:
        return "vivid"
    return "none"


def score_all(
    p: VisualProfile,
    qloo_tags: list[str],
    people: bool = False,
    scene: list[str] | None = None,
    subject: str | None = None,
    ai_picks: list[str] | None = None,
    topic: str | None = None,
    likes: dict[str, int] | None = None,
    today: date | None = None,
    qloo_fit: dict[str, tuple[float, list[str]]] | None = None,
) -> list[tuple[Template, LayoutScore, list[str]]]:
    """Every template scored, best first (photo-specific tie-breaks). With `qloo_fit` (Qloo
    layouts on), Qloo's tag affinity replaces the keyword match and leads the score."""
    scene = scene or []
    likes = likes or {}
    if people and subject is None:
        subject = "person"
    scored = []
    for t in CATALOGUE:
        v = _visual_fit(t, p, scene, subject, topic)
        if people and t.id in SPLITS_PHOTO:
            v = round(v * 0.7, 3)  # selfies/portraits: keep the person in one intact frame
        if qloo_fit is not None:
            c, hits = qloo_fit.get(t.id, (0.5, []))  # no tags yet: neutral
        else:
            c, hits = _cultural_fit(t, qloo_tags)
        r = _readability(t, p)
        a = _ai_fit(t, ai_picks) if ai_picks is not None else None
        if qloo_fit is not None and a is not None:
            total = W_QLOO["qloo"] * c + W_QLOO["visual"] * v + W_QLOO["ai"] * a
            total += W_QLOO["read"] * r
        elif qloo_fit is not None:
            total = W_QLOO_NO_AI["qloo"] * c + W_QLOO_NO_AI["visual"] * v
            total += W_QLOO_NO_AI["read"] * r
        elif a is not None:
            total = W_AI["visual"] * v + W_AI["ai"] * a + W_AI["cultural"] * c + W_AI["read"] * r
        else:
            total = W_VISUAL * v + W_CULTURAL * c + W_READ * r
        # Photo-count fit scales the whole score so 2–4 photo Stories lead with layouts that
        # actually show every photo (single-photo layouts stay available, just lower).
        total = total * (0.55 + 0.45 * _count_fit(t, p.photo_count))
        # Community + freshness: a nudge on top of fit, never a substitute for it.
        total *= 1 + W_POPULAR * popularity(t.id, likes) + W_NEW * newness(t.id, today)
        total = round(total + _jitter(p, t.id), 3)
        score = LayoutScore(
            visual_fit=v, cultural_style_fit=c, readability_fit=r, total=total, ai_pick=a
        )
        scored.append((t, score, hits))
    return sorted(scored, key=lambda s: (-s[1].total, s[0].id))


def _interleave(scored: list[tuple[Template, LayoutScore, list[str]]]):
    """Order so each consecutive group of 3 has distinct families (best-first within that rule)."""
    remaining = list(scored)
    ordered = []
    while remaining:
        families: set[str] = set()
        for _ in range(3):
            if not remaining:
                break
            pick = next((x for x in remaining if x[0].family not in families), remaining[0])
            remaining.remove(pick)
            families.add(pick[0].family)
            ordered.append(pick)
    return ordered


def _promote(
    ordered: list[tuple[Template, LayoutScore, list[str]]],
    likes: dict[str, int],
    today: date | None,
) -> list[tuple[Template, LayoutScore, list[str]]]:
    """Make sure the first three include a new or well-liked layout when one fits this photo."""
    if len(ordered) < 4:
        return ordered

    def featured(t: Template) -> bool:
        return newness(t.id, today) > 0 or popularity(t.id, likes) >= 0.5

    if any(featured(x[0]) for x in ordered[:3]):
        return ordered
    best = max(x[1].total for x in ordered[:3])
    pick = next(
        (
            x
            for x in ordered[3:PROMOTE_WITHIN]
            if featured(x[0]) and x[1].total >= PROMOTE_MIN * best
        ),
        None,
    )
    if pick is None:
        return ordered
    rest = [x for x in ordered if x is not pick]
    # Take the third slot, or the second if that keeps the three families distinct.
    for slot in (2, 1):
        others = {x[0].family for i, x in enumerate(rest[:3]) if i != slot}
        if pick[0].family not in others:
            return [*rest[:slot], pick, *rest[slot:]]
    return ordered


def _accent(p: VisualProfile) -> str:
    def sat(h: str) -> float:
        r, g, b = (int(h[i : i + 2], 16) for i in (1, 3, 5))
        mx, mn = max(r, g, b), min(r, g, b)
        return 0 if mx == 0 else (mx - mn) / mx * (0.4 + 0.6 * mx / 255)

    best = max(p.palette, key=sat, default="#c03f13")
    return best if sat(best) > 0.25 else "#c03f13"


def rank_layouts(
    p: VisualProfile,
    qloo_tags: list[str],
    music_line: str | None,
    k: int | None = None,
    headlines: list[str] | None = None,
    subject: tuple[str, float, float] | None = None,
    scene: list[str] | None = None,
    ai_picks: list[str] | None = None,
    subjects: list[tuple[str, float, float]] | None = None,
    topic: str | None = None,
    likes: dict[str, int] | None = None,
    today: date | None = None,
    qloo_fit: dict[str, tuple[float, list[str]]] | None = None,
    uses: dict[str, int] | None = None,
    topic_uses: dict[str, int] | None = None,
) -> list[LayoutSuggestion]:
    """All templates ranked for this photo (or the top `k`), families interleaved per 3.

    `headlines`: optional ideas from image reasoning; spread across the suggestions.
    `subject`: (kind, x, y) of the main subject from image reasoning — crop focus + ranking.
    `ai_picks`: the vision model's ranked template ids for this photo.
    `subjects`: per-photo (kind, x, y) for multi-photo Stories (crop focus per photo).
    `likes`: like counts per layout id (community boost); `today` pins newness in tests.
    `uses`: exports per layout id (people in your region, or everyone) — same boost as likes.
    `topic_uses`: how often each layout was chosen for photos like this one (same boost).
    `qloo_fit`: from qloo_layout_fit(); when given, Qloo's tag affinity leads the ranking."""
    people = bool(subject and subject[0] in ("person", "people"))
    per_photo = subjects or ([subject] if subject else [])
    focuses = [
        SubjectPos(subject=k, x=round(x, 3), y=round(y, 3))  # type: ignore[arg-type]
        if k != "scene"
        else SubjectPos(subject="scene")
        for k, x, y in per_photo
    ]
    focus = (subject[1], subject[2]) if subject and subject[0] != "scene" else (0.5, 0.5)
    kind = subject[0] if subject else None
    likes, uses, topic_uses = likes or {}, uses or {}, topic_uses or {}
    pop = {
        k: likes.get(k, 0) + uses.get(k, 0) + topic_uses.get(k, 0)
        for k in {*likes, *uses, *topic_uses}
    }
    ordered = _promote(
        _interleave(
            score_all(p, qloo_tags, people, scene, kind, ai_picks, topic, pop, today, qloo_fit)
        ),
        pop,
        today,
    )
    if k is not None:
        ordered = ordered[:k]

    top_mood = p.mood[0] if p.mood else "natural"
    accent = _accent(p)
    base_filter = mood_filter(p)
    out: list[LayoutSuggestion] = []
    for t, score, hits in ordered:
        matched = [m for m in p.mood if t.moods.get(m, 0) >= 0.6]
        cues = [c for c in (scene or []) if any(k in c.lower() for k in t.scenes)]
        reason = (
            f"Your photo reads as {', '.join(matched[:2])}, which {t.name} is built for."
            if matched
            else f"A {t.style_tags[0]} take for contrast."
        )
        if cues:
            reason += f" Fits the scene: {cues[0]}."
        if topic and t.id in TOPIC_LAYOUTS.get(topic, ())[:3]:
            reason += f" Made for {topic.replace('_', ' & ')} photos."
        if ai_picks and t.id in ai_picks[:3]:
            reason += " The image model picked it for this photo."
        if hits and qloo_fit is not None:
            reason += f" Qloo matches your taste to its {' / '.join(hits[:2])} style."
        elif hits:
            reason += f" Qloo results tagged “{hits[0]}” point to this style."
        fresh = newness(t.id, today) > 0
        liked = likes.get(t.id, 0)
        if fresh:
            reason += " New layout."
        if popularity(t.id, likes) >= 0.5 and liked:
            reason += f" Liked by {liked} {'person' if liked == 1 else 'people'}."
        if popularity(t.id, uses) >= 0.5:
            reason += " Often exported by people near you."
        if topic and popularity(t.id, topic_uses) >= 0.5:
            reason += f" Often chosen for {topic.replace('_', ' & ')} photos."
        if t.text_on_photo and score.readability_fit < 0.6:
            reason += " Text sits on an overlay to stay readable."
        n = p.photo_count
        if n > 1 and t.capacity >= n:
            reason += f" Shows all {n} of your photos."
        elif n > 1 and t.capacity > 1:
            reason += f" Shows {t.capacity} of your {n} photos."
        elif n > 1:
            reason += " Uses your first photo only."
        if people:
            reason += " Framed to keep the person in shot, with text placed away from them."
        out.append(
            LayoutSuggestion(
                id=t.id,
                name=t.name,
                reason=reason,
                style_tags=list(t.style_tags),
                score=score,
                headline=(
                    headlines[len(out) % len(headlines)]
                    if headlines
                    else HEADLINES.get(top_mood, "today.")
                ),
                caption=music_line or "",
                accent=accent,
                focus_x=round(focus[0], 3),
                focus_y=round(focus[1], 3),
                filter=t.filter or base_filter,
                focuses=focuses,
                photo_slots=min(t.capacity, max(1, p.photo_count)),
                likes=liked,
                is_new=fresh,
            )
        )
    return out
