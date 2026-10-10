"""Generate the editor's addable elements as transparent PNGs (apps/web/public/elements).

Recreated from scratch with Pillow, after the looks in design-refs/pinterest/user1 — nothing
is cut out of reference photos. Run: apps/api/.venv/bin/python apps/api/scripts/make_elements.py
"""

import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parents[2] / "web" / "public" / "elements"
SS = 4  # supersampling for smooth edges


def canvas(w: int, h: int) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    im = Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def save(im: Image.Image, name: str, size: tuple[int, int]) -> None:
    im.resize(size, Image.LANCZOS).save(OUT / f"{name}.png", optimize=True)


def kiss_print() -> None:
    """The kiss print is the owner-supplied PNG (trimmed + resized); pass its path to refresh."""
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else OUT / "kiss-print.png"
    im = Image.open(src).convert("RGBA")
    im = im.crop(im.getchannel("A").getbbox())
    im.thumbnail((900, 900), Image.LANCZOS)
    im.save(OUT / "kiss-print.png", optimize=True)


def kiss_blur() -> None:
    """The out-of-focus lipstick mark on a lens/mirror (u17): the print, softened."""
    im = Image.open(OUT / "kiss-print.png").convert("RGBA")
    pad = 120
    big = Image.new("RGBA", (im.width + pad * 2, im.height + pad * 2), (0, 0, 0, 0))
    big.alpha_composite(im, (pad, pad))
    big = big.filter(ImageFilter.GaussianBlur(26))
    big.save(OUT / "kiss-blur.png", optimize=True)


def folder() -> None:
    s = 16  # pixel-art grid
    px = [
        "................",
        ".KKKKK..........",
        "KYYYYYK.........",
        "KYYYYYKKKKKKKK..",
        "KYYYYYYYYYYYYYK.",
        "KYWWWWWWWWWWWYKK",
        "KYWYYYYYYYYYYYKK",
        "KYWYYYYYYYYYYYKK",
        "KYWYYYYYYYYYYYKK",
        "KYYYYYYYYYYYYYKK",
        "KYYYYYYYYYYYYYKK",
        "KOOOOOOOOOOOOOKK",
        ".KKKKKKKKKKKKKKK",
        "..KKKKKKKKKKKKKK",
    ]
    colors = {
        "K": (40, 30, 10, 255),
        "Y": (250, 196, 60, 255),
        "W": (255, 236, 160, 255),
        "O": (214, 140, 30, 255),
    }
    im = Image.new("RGBA", (s, len(px)), (0, 0, 0, 0))
    for y, row in enumerate(px):
        for x, c in enumerate(row):
            if c in colors:
                im.putpixel((x, y), colors[c])
    im.resize((s * 16, len(px) * 16), Image.NEAREST).save(OUT / "folder.png", optimize=True)


def cursor() -> None:
    px = [
        "K...........",
        "KK..........",
        "KWK.........",
        "KWWK........",
        "KWWWK.......",
        "KWWWWK......",
        "KWWWWWK.....",
        "KWWWWWWK....",
        "KWWWWWWWK...",
        "KWWWWWWWWK..",
        "KWWWWWKKKKK.",
        "KWWKWWK.....",
        "KWK.KWWK....",
        "KK..KWWK....",
        "K....KWWK...",
        ".....KWWK...",
        "......KK....",
    ]
    colors = {"K": (10, 10, 10, 255), "W": (255, 255, 255, 255)}
    im = Image.new("RGBA", (12, len(px)), (0, 0, 0, 0))
    for y, row in enumerate(px):
        for x, c in enumerate(row):
            if c in colors:
                im.putpixel((x, y), colors[c])
    im.resize((12 * 14, len(px) * 14), Image.NEAREST).save(OUT / "cursor.png", optimize=True)


def warning() -> None:
    w = h = 260
    im, d = canvas(w, h)
    S = SS
    tri = [(w * S / 2, 14 * S), (w * S - 12 * S, h * S - 22 * S), (12 * S, h * S - 22 * S)]
    d.polygon(tri, fill=(20, 20, 20, 255))
    inner = [(w * S / 2, 40 * S), (w * S - 34 * S, h * S - 36 * S), (34 * S, h * S - 36 * S)]
    d.polygon(inner, fill=(255, 214, 0, 255))
    d.rounded_rectangle(
        (w * S / 2 - 11 * S, 92 * S, w * S / 2 + 11 * S, 170 * S), 8 * S, fill=(20, 20, 20, 255)
    )
    d.ellipse((w * S / 2 - 13 * S, 184 * S, w * S / 2 + 13 * S, 210 * S), fill=(20, 20, 20, 255))
    save(im, "warning", (w, h))


def focus_brackets() -> None:
    w, h = 400, 300
    im, d = canvas(w, h)
    g, lw, arm = (64, 220, 110, 255), 7 * SS, 70 * SS
    W, H, m = w * SS, h * SS, 6 * SS
    for x, y, dx, dy in (
        (m, m, 1, 1),
        (W - m, m, -1, 1),
        (m, H - m, 1, -1),
        (W - m, H - m, -1, -1),
    ):
        d.line([(x, y), (x + dx * arm, y)], fill=g, width=lw)
        d.line([(x, y), (x, y + dy * arm)], fill=g, width=lw)
    save(im, "focus-brackets", (w, h))


def rec() -> None:
    w, h = 300, 110
    im, d = canvas(w, h)
    d.ellipse((10 * SS, 25 * SS, 70 * SS, 85 * SS), fill=(230, 30, 30, 255))
    # "REC" in blocky strokes (no font dependency).
    x0, y0, t = 95 * SS, 25 * SS, 11 * SS
    hgt = 60 * SS
    d.rectangle((x0, y0, x0 + t, y0 + hgt), fill="white")  # R
    d.rectangle((x0, y0, x0 + 40 * SS, y0 + t), fill="white")
    d.rectangle((x0 + 30 * SS, y0, x0 + 40 * SS, y0 + 32 * SS), fill="white")
    d.rectangle((x0, y0 + 26 * SS, x0 + 40 * SS, y0 + 26 * SS + t), fill="white")
    d.polygon(
        [
            (x0 + 18 * SS, y0 + 34 * SS),
            (x0 + 30 * SS, y0 + 34 * SS),
            (x0 + 44 * SS, y0 + hgt),
            (x0 + 32 * SS, y0 + hgt),
        ],
        fill="white",
    )
    x1 = x0 + 58 * SS  # E
    d.rectangle((x1, y0, x1 + t, y0 + hgt), fill="white")
    for yy in (y0, y0 + 25 * SS, y0 + hgt - t):
        d.rectangle((x1, yy, x1 + 38 * SS, yy + t), fill="white")
    x2 = x1 + 56 * SS  # C
    d.rectangle((x2, y0, x2 + t, y0 + hgt), fill="white")
    for yy in (y0, y0 + hgt - t):
        d.rectangle((x2, yy, x2 + 40 * SS, yy + t), fill="white")
    save(im, "rec", (w, h))


def torn_strip() -> None:
    w, h = 1200, 220
    im, d = canvas(w, h)
    rnd = random.Random(3)  # noqa: S311 — deterministic art, not security
    W, H = w * SS, h * SS
    top = [(x, 30 * SS + rnd.uniform(-22, 22) * SS) for x in range(0, W + 1, 14 * SS)]
    bot = [(x, H - 30 * SS + rnd.uniform(-22, 22) * SS) for x in range(W, -1, -14 * SS)]
    d.polygon(top + bot, fill=(250, 248, 242, 255))
    # Fibrous edge: a few semi-transparent tufts.
    for x, y in top[::2] + bot[::2]:
        d.ellipse((x - 9 * SS, y - 9 * SS, x + 9 * SS, y + 9 * SS), fill=(255, 255, 255, 140))
    im = im.filter(ImageFilter.GaussianBlur(SS * 0.8))
    save(im, "torn-strip", (w, h))


def cat_doodle() -> None:
    w, h = 260, 260
    im, d = canvas(w, h)
    S, c = SS, (255, 255, 255, 255)
    d.ellipse((60 * S, 120 * S, 190 * S, 230 * S), fill=c)  # body
    d.ellipse((70 * S, 50 * S, 180 * S, 150 * S), fill=c)  # head
    d.polygon([(78 * S, 80 * S), (84 * S, 20 * S), (118 * S, 60 * S)], fill=c)  # ears
    d.polygon([(172 * S, 80 * S), (166 * S, 20 * S), (132 * S, 60 * S)], fill=c)
    d.line(
        [(185 * S, 200 * S), (235 * S, 150 * S), (225 * S, 120 * S)],
        fill=c,
        width=14 * S,
        joint="curve",
    )
    k = (30, 30, 30, 255)
    d.ellipse((100 * S, 90 * S, 110 * S, 102 * S), fill=k)
    d.ellipse((140 * S, 90 * S, 150 * S, 102 * S), fill=k)
    d.polygon(
        [(120 * S, 108 * S), (130 * S, 108 * S), (125 * S, 115 * S)], fill=(240, 150, 160, 255)
    )
    for side in (-1, 1):
        for dy in (-6, 6):
            x0 = 125 * S + side * 20 * S
            d.line(
                [(x0, 112 * S + dy * S), (x0 + side * 50 * S, 104 * S + dy * 2 * S)],
                fill=c,
                width=3 * S,
            )
    save(im, "cat-doodle", (w, h))


def face_heart() -> None:
    w = h = 120
    im, d = canvas(w, h)
    S = SS
    d.ellipse((10 * S, 18 * S, 62 * S, 70 * S), fill="white")
    d.ellipse((58 * S, 18 * S, 110 * S, 70 * S), fill="white")
    d.polygon([(14 * S, 54 * S), (106 * S, 54 * S), (60 * S, 108 * S)], fill="white")
    save(im, "face-heart", (w, h))


def barcode() -> None:
    w, h = 420, 170
    im, d = canvas(w, h)
    rnd = random.Random(35)  # noqa: S311 — deterministic art, not security
    x = 10 * SS
    while x < (w - 10) * SS:
        bw = rnd.choice((2, 2, 3, 5, 7)) * SS
        if rnd.random() > 0.3:
            d.rectangle((x, 8 * SS, x + bw, 130 * SS), fill=(15, 15, 15, 255))
        x += bw + 3 * SS
    save(im, "barcode", (w, h))


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for fn in (
        kiss_print,
        kiss_blur,
        folder,
        cursor,
        warning,
        focus_brackets,
        rec,
        torn_strip,
        cat_doodle,
        face_heart,
        barcode,
    ):
        fn()
    print(sorted(p.name for p in OUT.glob("*.png")))
