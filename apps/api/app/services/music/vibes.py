"""Photo vibe → default artist pools, so a song is suggested even with no favourites.

The pools are hand-curated (Oct 2026) from public chart reporting — Spotify most-streamed and
monthly-listener lists, YouTube Music charts and Instagram Reels trend roundups — weighted to
US/UK artists for English. Names only: no streaming service is scraped, no audio is fetched.
Tracks come from iTunes Search for the chosen artist (see itunes.py).
"""

from typing import Literal, get_args

Vibe = Literal[
    "baddie", "aesthetic", "toxic", "friendly", "sweet", "cute", "romantic", "chill", "sad", "party"
]
VIBES: tuple[str, ...] = get_args(Vibe)
Language = Literal["en", "hi", "pa", "es", "ko"]

POOLS: dict[str, dict[str, tuple[str, ...]]] = {
    "en": {
        "baddie": (
            "Doja Cat",
            "Nicki Minaj",
            "Megan Thee Stallion",
            "Cardi B",
            "Ice Spice",
            "Beyoncé",
            "Rihanna",
            "Tinashe",
            "GloRilla",
            "Doechii",
        ),
        "aesthetic": (
            "Lana Del Rey",
            "Frank Ocean",
            "Clairo",
            "Laufey",
            "Tame Impala",
            "beabadoobee",
            "Cigarettes After Sex",
            "The 1975",
            "Arctic Monkeys",
        ),
        "toxic": (
            "The Weeknd",
            "Drake",
            "Kanye West",
            "PARTYNEXTDOOR",
            "Bryson Tiller",
            "Brent Faiyaz",
            "SZA",
            "Travis Scott",
            "6LACK",
            "Chris Brown",
        ),
        "friendly": (
            "Harry Styles",
            "Ed Sheeran",
            "Bruno Mars",
            "Dua Lipa",
            "Lizzo",
            "Pharrell Williams",
            "Coldplay",
            "One Direction",
            "Katy Perry",
        ),
        "sweet": (
            "Taylor Swift",
            "Sabrina Carpenter",
            "Ariana Grande",
            "Conan Gray",
            "Gracie Abrams",
            "Selena Gomez",
            "Tate McRae",
            "Benson Boone",
        ),
        "cute": (
            "Sabrina Carpenter",
            "Chappell Roan",
            "Olivia Rodrigo",
            "Carly Rae Jepsen",
            "KATSEYE",
            "Meghan Trainor",
            "Lily Allen",
            "Ariana Grande",
        ),
        "romantic": (
            "Bruno Mars",
            "Ed Sheeran",
            "Justin Bieber",
            "Daniel Caesar",
            "Giveon",
            "Adele",
            "Hozier",
            "John Legend",
            "Lewis Capaldi",
        ),
        "chill": (
            "Frank Ocean",
            "Steve Lacy",
            "Khalid",
            "Mac Miller",
            "Tyler, The Creator",
            "Jorja Smith",
            "Rex Orange County",
            "Omar Apollo",
            "Daniel Caesar",
        ),
        "sad": (
            "Billie Eilish",
            "Lewis Capaldi",
            "Adele",
            "Olivia Rodrigo",
            "Phoebe Bridgers",
            "Sam Smith",
            "Juice WRLD",
            "Joji",
            "Lana Del Rey",
        ),
        "party": (
            "Drake",
            "Travis Scott",
            "Kendrick Lamar",
            "Calvin Harris",
            "Dua Lipa",
            "Charli xcx",
            "Post Malone",
            "Future",
            "Metro Boomin",
            "The Weeknd",
        ),
    },
    "hi": {
        "baddie": ("Badshah", "Yo Yo Honey Singh", "Neha Kakkar", "Raftaar", "DIVINE"),
        "aesthetic": ("Prateek Kuhad", "Anuv Jain", "The Local Train", "Ritviz", "Lifafa"),
        "toxic": ("KING", "Talwiinder", "MC STAN", "Emiway Bantai", "Seedhe Maut"),
        "friendly": ("Pritam", "Vishal-Shekhar", "Amit Trivedi", "Shankar-Ehsaan-Loy"),
        "sweet": ("Shreya Ghoshal", "Jubin Nautiyal", "Darshan Raval", "Armaan Malik"),
        "cute": ("Armaan Malik", "Neha Kakkar", "Tulsi Kumar", "Jonita Gandhi"),
        "romantic": ("Arijit Singh", "Atif Aslam", "Shreya Ghoshal", "Vishal Mishra", "Pritam"),
        "chill": ("Prateek Kuhad", "Anuv Jain", "Lost Stories", "Ritviz", "Aditya Rikhari"),
        "sad": ("Arijit Singh", "Vishal Mishra", "Jubin Nautiyal", "B Praak", "Javed Ali"),
        "party": ("Badshah", "Yo Yo Honey Singh", "Diljit Dosanjh", "Guru Randhawa", "Nucleya"),
    },
    "pa": {
        "baddie": ("Karan Aujla", "Sidhu Moose Wala", "Shubh", "Jasmine Sandlas"),
        "aesthetic": ("AP Dhillon", "Talwiinder", "Satinder Sartaaj", "Prabh Deep"),
        "toxic": ("Karan Aujla", "AP Dhillon", "Talwiinder", "Shubh"),
        "friendly": ("Diljit Dosanjh", "Ammy Virk", "Gurdas Maan", "Guru Randhawa"),
        "sweet": ("Ammy Virk", "Satinder Sartaaj", "Diljit Dosanjh", "Arjan Dhillon"),
        "cute": ("Guru Randhawa", "Jasmine Sandlas", "Ammy Virk", "Diljit Dosanjh"),
        "romantic": ("AP Dhillon", "B Praak", "Satinder Sartaaj", "Arjan Dhillon"),
        "chill": ("AP Dhillon", "Talwiinder", "Prabh Deep", "Shubh"),
        "sad": ("B Praak", "Arjan Dhillon", "Satinder Sartaaj", "Sidhu Moose Wala"),
        "party": ("Diljit Dosanjh", "Karan Aujla", "Guru Randhawa", "Sidhu Moose Wala"),
    },
    "es": {
        "baddie": ("Karol G", "Rosalía", "Bad Bunny", "Young Miko", "Becky G"),
        "aesthetic": ("Rosalía", "Kali Uchis", "Natalia Lafourcade", "Bomba Estéreo"),
        "toxic": ("Bad Bunny", "Feid", "Myke Towers", "Rauw Alejandro", "Peso Pluma"),
        "friendly": ("J Balvin", "Sebastián Yatra", "Morat", "Carlos Vives"),
        "sweet": ("Sebastián Yatra", "TINI", "Morat", "Aitana"),
        "cute": ("TINI", "Aitana", "Becky G", "Karol G"),
        "romantic": ("Rauw Alejandro", "Sebastián Yatra", "Kali Uchis", "Natalia Lafourcade"),
        "chill": ("Kali Uchis", "Feid", "Natalia Lafourcade", "Bomba Estéreo"),
        "sad": ("Natanael Cano", "Mon Laferte", "Morat", "Bad Bunny"),
        "party": ("Bad Bunny", "Karol G", "Peso Pluma", "Shakira", "Daddy Yankee"),
    },
    "ko": {
        "baddie": ("JENNIE", "BLACKPINK", "LISA", "aespa", "ITZY"),
        "aesthetic": ("NewJeans", "IU", "DEAN", "ROSÉ", "Crush"),
        "toxic": ("DEAN", "Crush", "Jay Park", "Stray Kids"),
        "friendly": ("BTS", "SEVENTEEN", "TWICE", "Jung Kook"),
        "sweet": ("IU", "TWICE", "IVE", "ROSÉ"),
        "cute": ("TWICE", "NewJeans", "IVE", "LE SSERAFIM"),
        "romantic": ("IU", "Crush", "Jung Kook", "Zion.T"),
        "chill": ("DEAN", "Crush", "Zion.T", "NewJeans"),
        "sad": ("IU", "BTS", "Taeyang", "Jung Kook"),
        "party": ("BLACKPINK", "BTS", "Stray Kids", "aespa", "LE SSERAFIM"),
    },
}

# Pose/expression and mood cues (vision taxonomy) → votes per vibe. Used when the vision model
# didn't name a vibe itself (or is off); the photo's measured mood is always available.
CUES: dict[str, tuple[str, ...]] = {
    "baddie": (
        "pout",
        "sunglasses",
        "mirror selfie",
        "outfit",
        "over the shoulder",
        "hair touch",
        "full body",
        "bold",
    ),
    "aesthetic": ("minimal", "editorial", "dreamy", "nostalgic", "side profile", "candid"),
    "toxic": ("serious", "looking away", "moody", "cinematic", "finger on lips"),
    "friendly": ("laugh", "people", "friends", "group", "peace sign"),
    "sweet": ("smile", "warm", "natural", "soft"),
    "cute": ("tongue out", "wink", "peace sign", "playful", "hand on face"),
    "romantic": ("kiss face", "couple", "golden hour", "flowers"),
    "chill": ("eyes closed", "lying down", "headphones", "drink in hand", "cool", "beach"),
    "sad": ("rain", "night", "eyes closed", "moody"),
    "party": ("night out", "party", "concert", "drink in hand", "bright", "group"),
}


def vibe_from_cues(cues: list[str]) -> str:
    """Most-voted vibe; earlier cues (most prominent) weigh more. Default: aesthetic."""
    score = dict.fromkeys(VIBES, 0.0)
    for i, cue in enumerate(cues):
        for vibe, words in CUES.items():
            if cue in words:
                score[vibe] += 1 / (1 + 0.25 * i)
    best = max(score, key=lambda v: score[v])
    return best if score[best] > 0 else "aesthetic"


def pool(language: str, vibe: str) -> tuple[str, ...]:
    return POOLS.get(language, POOLS["en"]).get(vibe) or POOLS["en"]["aesthetic"]


def rotate(items: list, seed: int) -> list:
    """Deterministic per-photo order: the same photo keeps its pick, another photo shifts it."""
    if not items:
        return items
    k = seed % len(items)
    return items[k:] + items[:k]
