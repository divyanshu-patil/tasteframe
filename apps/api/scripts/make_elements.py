"""Generate the editor's addable elements as transparent PNGs (apps/web/public/elements).

Recreated from scratch with Pillow, after the looks in design-refs/pinterest/user1 — nothing
is cut out of reference photos. Run: apps/api/.venv/bin/python apps/api/scripts/make_elements.py
"""

import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

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


def _outlined(
    shape: Image.Image, fill: Image.Image, border: int, border_color: tuple
) -> Image.Image:
    """Sticker look: `fill` cut to `shape` (an L mask) on a solid border grown `border` px."""
    edge = shape.filter(ImageFilter.MaxFilter(border * 2 + 1)) if border else shape
    out = Image.new("RGBA", shape.size, (0, 0, 0, 0))
    out.paste(Image.new("RGBA", shape.size, border_color), (0, 0), edge)
    out.paste(fill, (0, 0), shape)
    return out


def _star_mask(n: int, size: int, points: int, inset: float, round_px: int) -> Image.Image:
    m = Image.new("L", (n, n), 0)
    c, r = n / 2, size / 2
    pts = []
    for i in range(points * 2):
        a = -math.pi / 2 + i * math.pi / points
        rr = r if i % 2 == 0 else r * inset
        pts.append((c + math.cos(a) * rr, c + math.sin(a) * rr))
    ImageDraw.Draw(m).polygon(pts, fill=255)
    # Puffy: blur, then re-threshold, rounds the tips and the inner corners.
    return m.filter(ImageFilter.GaussianBlur(round_px)).point(lambda v: 255 if v > 110 else 0)


def _chrome(name: str, points: int, inset: float) -> None:
    """Inflated chrome star (u-pin 919789923951050810's stickers), lit from the top left."""
    n = 300 * SS
    m = _star_mask(n, int(n * 0.9), points, inset, 9 * SS)
    soft = m.filter(ImageFilter.GaussianBlur(14 * SS))
    d = 7 * SS
    shade = ImageChops.subtract(ImageChops.offset(soft, d, d), ImageChops.offset(soft, -d, -d))
    lit = ImageChops.subtract(ImageChops.offset(soft, -d, -d), ImageChops.offset(soft, d, d))
    grad = Image.linear_gradient("L").resize((n, n)).point(lambda v: int(200 - 0.35 * v))
    rim = ImageChops.invert(soft).point(lambda v: int(v * 0.35))
    g = ImageChops.add(ImageChops.subtract(grad, rim), lit.point(lambda v: int(v * 1.6)))
    g = ImageChops.subtract(g, shade.point(lambda v: int(v * 1.3)))
    # Two bright specular streaks.
    spec = Image.new("L", (n, n), 0)
    sd = ImageDraw.Draw(spec)
    sd.ellipse((n * 0.33, n * 0.2, n * 0.44, n * 0.34), fill=255)
    sd.ellipse((n * 0.58, n * 0.62, n * 0.64, n * 0.7), fill=200)
    g = ImageChops.lighter(g, spec.filter(ImageFilter.GaussianBlur(6 * SS)))
    metal = Image.merge("RGBA", (g, g, g.point(lambda v: min(255, v + 10)), m))
    shadow = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    shadow.paste((0, 0, 0, 90), (5 * SS, 9 * SS), m.filter(ImageFilter.GaussianBlur(8 * SS)))
    shadow.alpha_composite(metal)
    save(shadow, name, (300, 300))


def chrome_star() -> None:
    _chrome("chrome-star", 5, 0.5)


def chrome_sparkle() -> None:
    _chrome("chrome-sparkle", 4, 0.34)


def exclaim() -> None:
    """Hand-drawn red "!!" with a white sticker edge."""
    w, h = 220, 260
    m = Image.new("L", (w * SS, h * SS), 0)
    d = ImageDraw.Draw(m)
    S = SS
    for x0, tilt in ((40, -18), (120, -8)):
        d.polygon(
            [
                (x0 * S, 20 * S),
                ((x0 + 52) * S, 26 * S),
                ((x0 + 30 + tilt) * S, 170 * S),
                ((x0 + 12 + tilt) * S, 168 * S),
            ],
            fill=255,
        )
        d.ellipse(((x0 + tilt) * S, 188 * S, (x0 + 36 + tilt) * S, 224 * S), fill=255)
    m = m.filter(ImageFilter.GaussianBlur(3 * S)).point(lambda v: 255 if v > 120 else 0)
    im = _outlined(m, Image.new("RGBA", m.size, (214, 34, 40, 255)), 10 * S, (255, 255, 255, 255))
    save(im.rotate(-12, resample=Image.BICUBIC), "exclaim", (w, h))


def anger() -> None:
    """The red anger-vein mark: four curved strokes bowing toward the centre."""
    w = h = 220
    n = w * SS
    m = Image.new("L", (n, n), 0)
    d = ImageDraw.Draw(m)
    c, R = n / 2, n * 0.27
    for sx, sy, start in ((-1, -1, 0), (1, -1, 90), (1, 1, 180), (-1, 1, 270)):
        ox, oy = c + sx * R * 1.2, c + sy * R * 1.2
        d.arc(
            (ox - R, oy - R, ox + R, oy + R), start + 10, start + 80, fill=255, width=int(n * 0.075)
        )
    im = _outlined(m, Image.new("RGBA", m.size, (210, 40, 46, 255)), 9 * SS, (255, 255, 255, 255))
    save(im, "anger", (w, h))


def owo_cat() -> None:
    """Chubby white cat with an OwO face, brown outline (u-pin 96757091990974969's sticker)."""
    w, h = 300, 280
    S = SS
    m = Image.new("L", (w * S, h * S), 0)
    d = ImageDraw.Draw(m)
    d.ellipse((50 * S, 40 * S, 250 * S, 200 * S), fill=255)  # head
    d.polygon([(70 * S, 90 * S), (80 * S, 22 * S), (130 * S, 56 * S)], fill=255)
    d.polygon([(230 * S, 90 * S), (220 * S, 22 * S), (170 * S, 56 * S)], fill=255)
    d.ellipse((70 * S, 150 * S, 230 * S, 262 * S), fill=255)  # body
    d.ellipse((222 * S, 190 * S, 286 * S, 230 * S), fill=255)  # tail
    m = m.filter(ImageFilter.GaussianBlur(4 * S)).point(lambda v: 255 if v > 120 else 0)
    fill = Image.new("RGBA", m.size, (255, 255, 255, 255))
    fd = ImageDraw.Draw(fill)
    grey = (196, 198, 214, 255)
    fd.ellipse((56 * S, 30 * S, 128 * S, 96 * S), fill=grey)  # ear patches
    fd.ellipse((180 * S, 30 * S, 250 * S, 96 * S), fill=grey)
    fd.ellipse((222 * S, 186 * S, 290 * S, 236 * S), fill=grey)
    ink = (92, 58, 40, 255)
    for ex in (112, 188):  # o  o
        fd.ellipse(((ex - 15) * S, 104 * S, (ex + 15) * S, 134 * S), outline=ink, width=6 * S)
    fd.line(
        [
            (136 * S, 132 * S),
            (143 * S, 144 * S),
            (150 * S, 134 * S),
            (157 * S, 144 * S),
            (164 * S, 132 * S),
        ],
        fill=ink,
        width=5 * S,
        joint="curve",
    )  # w
    for bx in (88, 212):
        fd.ellipse(((bx - 14) * S, 138 * S, (bx + 14) * S, 152 * S), fill=(244, 170, 176, 255))
    fd.line([(130 * S, 236 * S), (130 * S, 258 * S)], fill=ink, width=4 * S)
    fd.line([(170 * S, 236 * S), (170 * S, 258 * S)], fill=ink, width=4 * S)
    im = _outlined(m, fill, 6 * S, ink)
    im = _outlined(
        im.getchannel("A").point(lambda v: 255 if v > 0 else 0), im, 9 * S, (255, 255, 255, 255)
    )
    save(im, "owo-cat", (w, h))


def headphone_cat() -> None:
    """A ginger kitten wearing big headphones, as a die-cut sticker."""
    w, h = 280, 300
    S = SS
    m = Image.new("L", (w * S, h * S), 0)
    d = ImageDraw.Draw(m)
    d.ellipse((50 * S, 70 * S, 230 * S, 230 * S), fill=255)
    d.polygon([(66 * S, 120 * S), (78 * S, 40 * S), (130 * S, 84 * S)], fill=255)
    d.polygon([(214 * S, 120 * S), (202 * S, 40 * S), (150 * S, 84 * S)], fill=255)
    d.ellipse((80 * S, 200 * S, 200 * S, 290 * S), fill=255)
    d.rounded_rectangle((26 * S, 120 * S, 70 * S, 200 * S), 18 * S, fill=255)
    d.rounded_rectangle((210 * S, 120 * S, 254 * S, 200 * S), 18 * S, fill=255)
    m = m.filter(ImageFilter.GaussianBlur(3 * S)).point(lambda v: 255 if v > 120 else 0)
    fill = Image.new("RGBA", m.size, (226, 150, 84, 255))
    fd = ImageDraw.Draw(fill)
    for k in range(4):  # tabby stripes
        fd.arc(
            ((96 + k * 10) * S, (60 + k * 12) * S, (184 - k * 10) * S, (150 + k * 12) * S),
            230,
            310,
            fill=(186, 104, 52, 255),
            width=5 * S,
        )
    fd.ellipse((96 * S, 160 * S, 184 * S, 226 * S), fill=(248, 232, 214, 255))  # muzzle
    fd.ellipse((84 * S, 210 * S, 196 * S, 292 * S), fill=(240, 214, 186, 255))  # chest
    for ex in (106, 174):
        fd.ellipse(((ex - 20) * S, 124 * S, (ex + 20) * S, 166 * S), fill=(36, 30, 26, 255))
        fd.ellipse(((ex - 8) * S, 130 * S, (ex + 2) * S, 140 * S), fill=(255, 255, 255, 255))
    fd.polygon(
        [(132 * S, 176 * S), (148 * S, 176 * S), (140 * S, 186 * S)], fill=(232, 120, 132, 255)
    )
    fd.arc(
        (40 * S, 30 * S, 240 * S, 230 * S), 190, 350, fill=(28, 28, 30, 255), width=14 * S
    )  # headband
    for x0 in (26, 210):
        fd.rounded_rectangle(
            (x0 * S, 120 * S, (x0 + 44) * S, 200 * S), 18 * S, fill=(28, 28, 30, 255)
        )
        fd.rounded_rectangle(
            ((x0 + 8) * S, 132 * S, (x0 + 18) * S, 186 * S), 5 * S, fill=(70, 70, 76, 255)
        )
    im = _outlined(m, fill, 10 * S, (255, 255, 255, 255))
    save(im, "headphone-cat", (w, h))


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
        chrome_star,
        chrome_sparkle,
        exclaim,
        anger,
        owo_cat,
        headphone_cat,
    ):
        fn()
    print(sorted(p.name for p in OUT.glob("*.png")))
