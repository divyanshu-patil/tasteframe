"""What someone types about the music they want → our fixed mood vocabulary.

The text never reaches Qloo: words are matched here against hand-picked synonyms, and only the
mood's own Qloo tag ids (checked live on hackathon.api.qloo.com, 2026-10-14) are sent as
`signal.interests.tags`. The text itself only goes to the vision model that ranks the songs.
"""

import re

# mood → (words that ask for it, curated vibe it maps to, Qloo tag ids)
MOODS: dict[str, tuple[tuple[str, ...], str, tuple[str, ...]]] = {
    "confident": (
        ("baddie", "confident", "boss", "savage", "fierce", "slay", "bold", "queen", "attitude"),
        "baddie",
        (
            "urn:tag:artist:qloo:confident",
            "urn:tag:music:qloo:empowering",
            "urn:tag:style:qloo:fierce",
        ),
    ),
    "sultry": (
        ("sexy", "hot", "sultry", "seductive", "sensual", "flirty", "spicy", "steamy", "sexi"),
        "toxic",
        ("urn:tag:music:qloo:sultry", "urn:tag:music:qloo:sensual", "urn:tag:style:qloo:seductive"),
    ),
    "mellow": (
        (
            "mild",
            "mellow",
            "soft",
            "calm",
            "gentle",
            "chill",
            "relaxed",
            "lofi",
            "lo-fi",
            "slow",
            "low-key",
            "lowkey",
            "smooth",
            "soothing",
        ),
        "chill",
        ("urn:tag:genre:music:mellow", "urn:tag:genre:music:chill", "urn:tag:music:qloo:smooth"),
    ),
    "upbeat": (
        (
            "upbeat",
            "happy",
            "fun",
            "energetic",
            "energy",
            "hype",
            "dance",
            "party",
            "bouncy",
            "groovy",
            "lit",
            "vibey",
        ),
        "party",
        (
            "urn:tag:music:qloo:upbeat",
            "urn:tag:music:qloo:energetic",
            "urn:tag:genre:music:danceable",
        ),
    ),
    "romantic": (
        ("romantic", "love", "lovey", "couple", "crush", "date"),
        "romantic",
        ("urn:tag:genre:music:romantic", "urn:tag:music:qloo:romantic"),
    ),
    "dreamy": (
        ("dreamy", "aesthetic", "ethereal", "soft girl", "indie", "artsy"),
        "aesthetic",
        ("urn:tag:genre:music:dreamy", "urn:tag:music:qloo:dreamy"),
    ),
    "dark": (
        ("dark", "moody", "toxic", "villain", "edgy", "mysterious", "night"),
        "toxic",
        ("urn:tag:music:qloo:dark", "urn:tag:music:qloo:moody", "urn:tag:music:qloo:edgy"),
    ),
    "sad": (
        (
            "sad",
            "emotional",
            "heartbreak",
            "heartbroken",
            "melancholy",
            "melancholic",
            "crying",
            "lonely",
            "missing",
        ),
        "sad",
        (
            "urn:tag:genre:music:sad",
            "urn:tag:genre:music:melancholic",
            "urn:tag:music:qloo:emotional",
        ),
    ),
    "nostalgic": (
        ("nostalgic", "throwback", "retro", "old school", "oldies", "vintage", "90s", "80s"),
        "aesthetic",
        ("urn:tag:music:qloo:nostalgic",),
    ),
    "uplifting": (
        ("uplifting", "motivational", "motivation", "feel good", "positive", "inspiring"),
        "friendly",
        ("urn:tag:music:qloo:uplifting", "urn:tag:music:qloo:feel_good"),
    ),
    "intense": (
        ("intense", "aggressive", "hard", "gym", "workout", "rage"),
        "party",
        ("urn:tag:music:qloo:intense", "urn:tag:music:qloo:aggressive"),
    ),
}


def clean_wish(text: str | None) -> str | None:
    """One line, printable, ≤ 140 chars (it's shown to the song-ranking model as data)."""
    if not text:
        return None
    line = re.sub(r"\s+", " ", re.sub(r"[^\w\s,.'!?&-]", " ", text)).strip()[:140]
    return line or None


def moods_in(text: str | None) -> list[str]:
    """Moods asked for, in the order they appear ("baddie, sexy, mild tone" →
    confident, sultry, mellow)."""
    if not text:
        return []
    low = f" {text.lower()} "
    found: list[tuple[int, str]] = []
    for mood, (words, _, _) in MOODS.items():
        hits = [m.start() for w in words for m in re.finditer(rf"\b{re.escape(w)}\b", low)]
        if hits:
            found.append((min(hits), mood))
    return [m for _, m in sorted(found)]


def vibe_for(moods: list[str]) -> str | None:
    """The curated song pool for the first mood asked for."""
    return MOODS[moods[0]][1] if moods else None


def qloo_tags(moods: list[str]) -> list[str]:
    return list(dict.fromkeys(t for m in moods[:3] for t in MOODS[m][2]))


if __name__ == "__main__":
    assert moods_in(
        "i want the music that will make me baddie, look sexy, and have a mild tone"
    ) == [
        "confident",
        "sultry",
        "mellow",
    ]
    assert vibe_for(["confident", "sultry"]) == "baddie"
    assert moods_in("Hardly") == [] and moods_in(None) == []
    assert clean_wish("  sexy\n\n<script>  ") == "sexy script"
    print("ok")
