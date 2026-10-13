"""Photo vibe → default songs, so a song is suggested even with no favourites.

Hand-curated (Oct 2026) songs per vibe and language from public chart reporting — Spotify
most-streamed and monthly-listener lists, YouTube Music charts and Instagram Reels trend roundups —
weighted to US/UK artists for English. (artist, title) only: no streaming service is scraped and
no audio is fetched. Each title is verified against the artist's iTunes catalogue before it is
shown (see analysis.pick_music); a title iTunes doesn't have is skipped, never invented.
"""

from typing import Literal, get_args

Vibe = Literal[
    "baddie", "aesthetic", "toxic", "friendly", "sweet", "cute", "romantic", "chill", "sad", "party"
]
VIBES: tuple[str, ...] = get_args(Vibe)
Language = Literal["en", "hi", "pa", "es", "ko"]

SONGS: dict[str, dict[str, tuple[tuple[str, str], ...]]] = {
    "en": {
        "baddie": (
            ("Doja Cat", "Paint The Town Red"),
            ("Megan Thee Stallion", "Savage"),
            ("Nicki Minaj", "Super Freaky Girl"),
            ("Cardi B", "Bodak Yellow"),
            ("Beyoncé", "CUFF IT"),
            ("Rihanna", "Bitch Better Have My Money"),
            ("Doechii", "Anxiety"),
            ("Ice Spice", "Munch (Feelin' U)"),
            ("Tinashe", "Nasty"),
            ("GloRilla", "TGIF"),
            ("Ariana Grande", "7 rings"),
        ),
        "aesthetic": (
            ("Lana Del Rey", "Video Games"),
            ("Frank Ocean", "Pink + White"),
            ("Clairo", "Juna"),
            ("Laufey", "From The Start"),
            ("Tame Impala", "The Less I Know The Better"),
            ("beabadoobee", "Glue Song"),
            ("Cigarettes After Sex", "Apocalypse"),
            ("The 1975", "Robbers"),
            ("Arctic Monkeys", "I Wanna Be Yours"),
            ("The Neighbourhood", "Sweater Weather"),
        ),
        "toxic": (
            ("The Weeknd", "The Hills"),
            ("Drake", "Marvins Room"),
            ("Kanye West", "Runaway"),
            ("SZA", "Kill Bill"),
            ("Bryson Tiller", "Don't"),
            ("Brent Faiyaz", "Dead Man Walking"),
            ("Travis Scott", "goosebumps"),
            ("Chris Brown", "Under The Influence"),
            ("6LACK", "PRBLMS"),
            ("The Weeknd", "Often"),
        ),
        "friendly": (
            ("Harry Styles", "As It Was"),
            ("Pharrell Williams", "Happy"),
            ("Bruno Mars", "Treasure"),
            ("Dua Lipa", "Levitating"),
            ("Lizzo", "Good as Hell"),
            ("Ed Sheeran", "Shivers"),
            ("One Direction", "What Makes You Beautiful"),
            ("Katy Perry", "Roar"),
            ("Coldplay", "Adventure of a Lifetime"),
            ("Mark Ronson", "Uptown Funk"),
        ),
        "sweet": (
            ("Taylor Swift", "Lover"),
            ("Taylor Swift", "Love Story"),
            ("Gracie Abrams", "Close To You"),
            ("Selena Gomez", "Love You Like a Love Song"),
            ("Benson Boone", "Beautiful Things"),
            ("Jason Mraz", "I'm Yours"),
            ("Lauv", "I Like Me Better"),
            ("Ariana Grande", "pov"),
            ("Shawn Mendes", "There's Nothing Holdin' Me Back"),
            ("Sabrina Carpenter", "Bed Chem"),
        ),
        "cute": (
            ("Sabrina Carpenter", "Espresso"),
            ("Chappell Roan", "HOT TO GO!"),
            ("Carly Rae Jepsen", "Call Me Maybe"),
            ("Meghan Trainor", "Made You Look"),
            ("Olivia Rodrigo", "bad idea right?"),
            ("Ariana Grande", "yes, and?"),
            ("Harry Styles", "Watermelon Sugar"),
            ("KATSEYE", "Gabriela"),
            ("Lily Allen", "Not Fair"),
            ("Chappell Roan", "Femininomenon"),
        ),
        "romantic": (
            ("Ed Sheeran", "Perfect"),
            ("Lady Gaga", "Die With A Smile"),
            ("Billie Eilish", "BIRDS OF A FEATHER"),
            ("Daniel Caesar", "Best Part"),
            ("Giveon", "Heartbreak Anniversary"),
            ("Adele", "Make You Feel My Love"),
            ("Hozier", "Too Sweet"),
            ("John Legend", "All of Me"),
            ("The Weeknd", "Die For You"),
            ("Justin Bieber", "Ghost"),
        ),
        "chill": (
            ("Frank Ocean", "Ivy"),
            ("Steve Lacy", "Bad Habit"),
            ("Khalid", "Location"),
            ("Mac Miller", "Good News"),
            ("Tyler, The Creator", "See You Again"),
            ("Jorja Smith", "Blue Lights"),
            ("Rex Orange County", "Loving Is Easy"),
            ("Omar Apollo", "Evergreen"),
            ("Daniel Caesar", "Get You"),
            ("Kali Uchis", "telepatía"),
        ),
        "sad": (
            ("Billie Eilish", "when the party's over"),
            ("Lewis Capaldi", "Someone You Loved"),
            ("Adele", "Someone Like You"),
            ("Olivia Rodrigo", "drivers license"),
            ("Phoebe Bridgers", "Motion Sickness"),
            ("Sam Smith", "Too Good At Goodbyes"),
            ("Juice WRLD", "Lucid Dreams"),
            ("Joji", "SLOW DANCING IN THE DARK"),
            ("Lana Del Rey", "Summertime Sadness"),
            ("Gracie Abrams", "I Love You, I'm Sorry"),
        ),
        "party": (
            ("Drake", "Nice For What"),
            ("Travis Scott", "SICKO MODE"),
            ("Kendrick Lamar", "Not Like Us"),
            ("Calvin Harris", "Summer"),
            ("Dua Lipa", "Don't Start Now"),
            ("Charli xcx", "360"),
            ("Post Malone", "rockstar"),
            ("Future", "Mask Off"),
            ("The Weeknd", "Blinding Lights"),
            ("Tommy Richman", "MILLION DOLLAR BABY"),
            ("Anita Ward", "Ring My Bell"),
        ),
    },
    "hi": {
        "baddie": (
            ("Badshah", "Genda Phool"),
            ("Yo Yo Honey Singh", "Blue Eyes"),
            ("Badshah", "Paani Paani"),
            ("DIVINE", "Mirchi"),
            ("Yo Yo Honey Singh", "Millionaire"),
            ("Raftaar", "Swag Mera Desi"),
        ),
        "aesthetic": (
            ("Prateek Kuhad", "cold/mess"),
            ("Anuv Jain", "Baarishein"),
            ("The Local Train", "Aaftaab"),
            ("Ritviz", "Udd Gaye"),
            ("Lifafa", "Jaago"),
            ("Prateek Kuhad", "Kasoor"),
        ),
        "toxic": (
            ("KING", "Maan Meri Jaan"),
            ("Talwiinder", "Gallan Tuhadiyan"),
            ("MC STAN", "Basti Ka Hasti"),
            ("Seedhe Maut", "Nanchaku"),
            ("Emiway Bantai", "Firse Machayenge"),
        ),
        "friendly": (
            ("Pritam", "Badtameez Dil"),
            ("Amit Trivedi", "London Thumakda"),
            ("Shankar-Ehsaan-Loy", "Gallan Goodiyaan"),
            ("Badshah", "Kar Gayi Chull"),
            ("Pritam", "Ude Dil Befikre"),
        ),
        "sweet": (
            ("Shreya Ghoshal", "Teri Meri"),
            ("Darshan Raval", "Tera Zikr"),
            ("Armaan Malik", "Main Rahoon Ya Na Rahoon"),
            ("Arijit Singh", "Tum Hi Ho"),
            ("Jubin Nautiyal", "Raataan Lambiyan"),
        ),
        "cute": (
            ("Armaan Malik", "Bol Do Na Zara"),
            ("Darshan Raval", "Ek Ladki Ko Dekha"),
            ("Neha Kakkar", "Aankh Marey"),
            ("Jonita Gandhi", "Gallan Kardi"),
            ("Pritam", "Kudi Nu Nachne De"),
        ),
        "romantic": (
            ("Pritam", "Kesariya"),
            ("Arijit Singh", "Raabta"),
            ("Vishal Mishra", "Kaise Hua"),
            ("Atif Aslam", "Tera Hone Laga Hoon"),
            ("Arijit Singh", "Tum Hi Ho"),
            ("Jubin Nautiyal", "Raataan Lambiyan"),
        ),
        "chill": (
            ("Prateek Kuhad", "Tum Jab Paas"),
            ("Anuv Jain", "Husn"),
            ("Ritviz", "Liggi"),
            ("Aditya Rikhari", "Faasle"),
            ("Anuv Jain", "Arz Kiya Hai"),
        ),
        "sad": (
            ("B Praak", "Mann Bharryaa 2.0"),
            ("Vishal Mishra", "Pehle Bhi Main"),
            ("Jubin Nautiyal", "Lut Gaye"),
            ("Arijit Singh", "Channa Mereya"),
            ("Arijit Singh", "Phir Bhi Tumko Chaahunga"),
        ),
        "party": (
            ("Badshah", "DJ Waley Babu"),
            ("Diljit Dosanjh", "Lover"),
            ("Guru Randhawa", "High Rated Gabru"),
            ("Nucleya", "Bass Rani"),
            ("Yo Yo Honey Singh", "Desi Kalakaar"),
        ),
    },
    "pa": {
        "baddie": (
            ("Karan Aujla", "Softly"),
            ("Sidhu Moose Wala", "295"),
            ("Shubh", "Cheques"),
            ("AP Dhillon", "Brown Munde"),
            ("Karan Aujla", "Tauba Tauba"),
        ),
        "aesthetic": (
            ("AP Dhillon", "Excuses"),
            ("Talwiinder", "Khayaal"),
            ("Satinder Sartaaj", "Sajjan Raazi"),
            ("AP Dhillon", "Summer High"),
        ),
        "toxic": (
            ("Karan Aujla", "Winning Speech"),
            ("Shubh", "Still Rollin"),
            ("Talwiinder", "Gallan Tuhadiyan"),
            ("AP Dhillon", "Insane"),
        ),
        "friendly": (
            ("Diljit Dosanjh", "G.O.A.T."),
            ("Guru Randhawa", "Lahore"),
            ("Gurdas Maan", "Ki Banu Duniya Da"),
            ("Diljit Dosanjh", "Born To Shine"),
        ),
        "sweet": (
            ("Ammy Virk", "Qismat"),
            ("Satinder Sartaaj", "Udaarian"),
            ("Diljit Dosanjh", "Born To Shine"),
            ("AP Dhillon", "With You"),
        ),
        "cute": (
            ("Guru Randhawa", "Suit Suit"),
            ("Diljit Dosanjh", "Proper Patola"),
            ("Guru Randhawa", "Patola"),
            ("Ammy Virk", "Qismat"),
        ),
        "romantic": (
            ("AP Dhillon", "With You"),
            ("B Praak", "Filhall"),
            ("Satinder Sartaaj", "Udaarian"),
            ("AP Dhillon", "Excuses"),
        ),
        "chill": (
            ("AP Dhillon", "Summer High"),
            ("Talwiinder", "Khayaal"),
            ("Shubh", "Elevated"),
            ("Prabh Deep", "Wakhra"),
        ),
        "sad": (
            ("B Praak", "Mann Bharryaa"),
            ("Sidhu Moose Wala", "The Last Ride"),
            ("B Praak", "Filhall"),
            ("Satinder Sartaaj", "Sajjan Raazi"),
        ),
        "party": (
            ("Diljit Dosanjh", "Lover"),
            ("Karan Aujla", "Tauba Tauba"),
            ("Guru Randhawa", "Patola"),
            ("Sidhu Moose Wala", "So High"),
        ),
    },
    "es": {
        "baddie": (
            ("Rosalía", "SAOKO"),
            ("Bad Bunny", "Yo Perreo Sola"),
            ("Young Miko", "Lisa"),
            ("Becky G", "Mayores"),
            ("KAROL G", "TQG"),
        ),
        "aesthetic": (
            ("Kali Uchis", "telepatía"),
            ("Natalia Lafourcade", "Hasta la Raíz"),
            ("Bomba Estéreo", "To My Love"),
            ("Rosalía", "DESPECHÁ"),
        ),
        "toxic": (
            ("Bad Bunny", "Tití Me Preguntó"),
            ("Myke Towers", "LALA"),
            ("Feid", "Classy 101"),
            ("Rauw Alejandro", "Todo de Ti"),
        ),
        "friendly": (
            ("J Balvin", "Mi Gente"),
            ("Sebastián Yatra", "Tacones Rojos"),
            ("Morat", "Besos en Guerra"),
            ("Carlos Vives", "La Bicicleta"),
        ),
        "sweet": (
            ("TINI", "Miénteme"),
            ("Aitana", "Los Ángeles"),
            ("Morat", "Cómo Te Atreves"),
            ("Sebastián Yatra", "Tacones Rojos"),
        ),
        "cute": (
            ("TINI", "Cupido"),
            ("Aitana", "Mon Amour"),
            ("KAROL G", "PROVENZA"),
            ("Becky G", "Sin Pijama"),
        ),
        "romantic": (
            ("Rauw Alejandro", "Todo de Ti"),
            ("Carlos Vives", "Robarte un Beso"),
            ("Kali Uchis", "Moonlight"),
            ("Natalia Lafourcade", "Nunca Es Suficiente"),
        ),
        "chill": (
            ("Kali Uchis", "Moonlight"),
            ("Feid", "Normal"),
            ("Bomba Estéreo", "Soy Yo"),
            ("Natalia Lafourcade", "Tú Sí Sabes Quererme"),
        ),
        "sad": (
            ("Mon Laferte", "Tu Falta de Querer"),
            ("Shakira", "Acróstico"),
            ("Morat", "Cómo Te Atreves"),
            ("Bad Bunny", "DtMF"),
        ),
        "party": (
            ("Bad Bunny", "MONACO"),
            ("KAROL G", "PROVENZA"),
            ("Shakira", "Hips Don't Lie"),
            ("Daddy Yankee", "Gasolina"),
            ("Peso Pluma", "LADY GAGA"),
        ),
    },
    "ko": {
        "baddie": (
            ("JENNIE", "SOLO"),
            ("BLACKPINK", "How You Like That"),
            ("LISA", "MONEY"),
            ("aespa", "Supernova"),
            ("ITZY", "WANNABE"),
        ),
        "aesthetic": (
            ("NewJeans", "Ditto"),
            ("IU", "Love wins all"),
            ("DEAN", "instagram"),
            ("Crush", "Beautiful"),
        ),
        "toxic": (
            ("DEAN", "D (Half Moon)"),
            ("Crush", "Rush Hour"),
            ("Jay Park", "All I Wanna Do"),
            ("Stray Kids", "God's Menu"),
        ),
        "friendly": (
            ("BTS", "Dynamite"),
            ("SEVENTEEN", "Very Nice"),
            ("TWICE", "CHEER UP"),
            ("Jung Kook", "Seven"),
        ),
        "sweet": (
            ("IU", "Blueming"),
            ("TWICE", "What is Love?"),
            ("IVE", "LOVE DIVE"),
            ("ROSÉ", "APT."),
        ),
        "cute": (
            ("TWICE", "TT"),
            ("NewJeans", "Hype Boy"),
            ("IVE", "After LIKE"),
            ("LE SSERAFIM", "Smart"),
        ),
        "romantic": (
            ("IU", "Through the Night"),
            ("Crush", "Beautiful"),
            ("Jung Kook", "Seven"),
            ("Zion.T", "Snow"),
        ),
        "chill": (
            ("DEAN", "instagram"),
            ("Crush", "Sometimes"),
            ("Zion.T", "Yanghwa BRDG"),
            ("NewJeans", "Super Shy"),
        ),
        "sad": (
            ("BTS", "Spring Day"),
            ("Taeyang", "Eyes, Nose, Lips"),
            ("Jung Kook", "Still With You"),
            ("IU", "Through the Night"),
        ),
        "party": (
            ("BLACKPINK", "DDU-DU DDU-DU"),
            ("BTS", "Butter"),
            ("Stray Kids", "S-Class"),
            ("aespa", "Whiplash"),
            ("LE SSERAFIM", "ANTIFRAGILE"),
        ),
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


def songs_for(language: str, vibe: str) -> tuple[tuple[str, str], ...]:
    """(artist, title) picks for the vibe in that language."""
    return SONGS.get(language, SONGS["en"]).get(vibe) or SONGS["en"]["aesthetic"]


def rotate(items: list, seed: int) -> list:
    """Deterministic per-photo order: the same photo keeps its pick, another photo shifts it."""
    if not items:
        return items
    k = seed % len(items)
    return items[k:] + items[:k]
