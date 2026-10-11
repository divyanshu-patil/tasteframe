"""Turn a green-screen Story template into a transparent PNG + its photo windows.

    apps/api/.venv/bin/python apps/api/scripts/key_template.py <in.png> <out.png>

Keys only inside the large green regions (so green UI elsewhere — e.g. an app icon — stays).
Pixels there are unmixed from the key colour, so UI drawn over the green keeps its look: white
icons stay solid, dark translucent buttons and gradients become translucent black. Prints each
window as an axis-aligned box and as a (possibly tilted) rectangle — centre, size, angle — in
1080×1920 Story px, for the layout's slot rects.
"""

import math
import sys

from PIL import Image

W, H = 1080, 1920


def green(r: int, g: int, b: int) -> int:
    return g - max(r, b)


def tilted(points: list[tuple[int, int]]) -> tuple[float, float, float, float, float]:
    """Smallest-area rectangle (cx, cy, w, h, degrees) around points, angles within ±30°."""
    best = None
    for k in range(-120, 121):
        a = math.radians(k / 4)
        c, s = math.cos(a), math.sin(a)
        us = [x * c + y * s for x, y in points]
        vs = [-x * s + y * c for x, y in points]
        u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)
        area = (u1 - u0) * (v1 - v0)
        if best is None or area < best[0]:
            uc, vc = (u0 + u1) / 2, (v0 + v1) / 2
            best = (area, uc * c - vc * s, uc * s + vc * c, u1 - u0, v1 - v0, k / 4)
    assert best is not None
    return best[1:]


def main(src: str, dst: str) -> None:
    im = Image.open(src).convert("RGB").resize((W, H), Image.LANCZOS)
    px = im.load()
    strong = [[green(*px[x, y]) > 60 and px[x, y][1] > 120 for x in range(W)] for y in range(H)]
    # Connected strong-green regions → windows.
    seen = [[False] * W for _ in range(H)]
    regions = []
    for y in range(0, H, 4):
        for x in range(0, W, 4):
            if strong[y][x] and not seen[y][x]:
                stack, pts = [(x, y)], []
                seen[y][x] = True
                while stack:
                    cx, cy = stack.pop()
                    pts.append((cx, cy))
                    for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                        if 0 <= nx < W and 0 <= ny < H and strong[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx] = True
                            stack.append((nx, ny))
                if len(pts) > 20000:
                    regions.append(pts)
    # Key colour: the median of the window pixels.
    sample = sorted(px[p] for r in regions for p in r[::50])
    kr, kg, kb = sample[len(sample) // 2]
    key_gs = green(kr, kg, kb)
    boxes = []
    for pts in regions:
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        boxes.append((min(xs), min(ys), max(xs) - min(xs) + 1, max(ys) - min(ys) + 1, pts))
    out = Image.new("RGBA", (W, H))
    op = out.load()
    pad = 6

    def inside(x: int, y: int) -> bool:
        return any(
            bx - pad <= x < bx + bw + pad and by - pad <= y < by + bh + pad
            for bx, by, bw, bh, _ in boxes
        )

    for y in range(H):
        for x in range(W):
            r, g, b = px[x, y]
            if not inside(x, y):
                op[x, y] = (r, g, b, 255)
                continue
            # pixel = a·F + (1 − a)·key; the green excess tells how much key shows through.
            a = 1 - max(0, green(r, g, b)) / key_gs
            a = min(1.0, max(0.0, a))
            if a < 0.05:
                op[x, y] = (0, 0, 0, 0)
                continue
            f = [(v - (1 - a) * k) / a for v, k in ((r, kr), (g, kg), (b, kb))]
            fr, fg, fb = (int(min(255, max(0, v))) for v in f)
            fg = min(fg, max(fr, fb) + 8)  # despill
            op[x, y] = (fr, fg, fb, int(a * 255))
    out.save(dst, optimize=True)
    for bx, by, bw, bh, pts in sorted(boxes, key=lambda b: b[1]):
        cx, cy, tw, th, deg = tilted(pts[::7])
        print(
            f"box ({bx}, {by}, {bw}, {bh})  tilted c=({cx:.0f}, {cy:.0f}) {tw:.0f}×{th:.0f} {deg}°"
        )


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
