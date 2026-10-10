"""Turn a green-screen Story template into a transparent PNG + its photo windows.

    apps/api/.venv/bin/python apps/api/scripts/key_template.py <in.png> <out.png>

Keys only inside the large green regions (so green UI elsewhere — e.g. an app icon — stays),
keeps white UI drawn over the green (timestamps, play buttons) and prints the window boxes
(x, y, w, h in 1080×1920 Story px) for the layout's slot rects.
"""

import sys

from PIL import Image

W, H = 1080, 1920


def green(r: int, g: int, b: int) -> int:
    return g - max(r, b)


def main(src: str, dst: str) -> None:
    im = Image.open(src).convert("RGB").resize((W, H), Image.LANCZOS)
    px = im.load()
    strong = [[green(*px[x, y]) > 60 and px[x, y][1] > 120 for x in range(W)] for y in range(H)]
    # Connected strong-green regions → windows.
    seen = [[False] * W for _ in range(H)]
    boxes = []
    for y in range(0, H, 4):
        for x in range(0, W, 4):
            if strong[y][x] and not seen[y][x]:
                stack, n = [(x, y)], 0
                seen[y][x] = True
                x0 = x1 = x
                y0 = y1 = y
                while stack:
                    cx, cy = stack.pop()
                    n += 1
                    x0, x1, y0, y1 = min(x0, cx), max(x1, cx), min(y0, cy), max(y1, cy)
                    for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                        if 0 <= nx < W and 0 <= ny < H and strong[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx] = True
                            stack.append((nx, ny))
                if n > 20000:
                    boxes.append((x0, y0, x1 - x0 + 1, y1 - y0 + 1))
    out = Image.new("RGBA", (W, H))
    op = out.load()
    pad = 6

    def inside(x: int, y: int) -> bool:
        return any(
            bx - pad <= x < bx + bw + pad and by - pad <= y < by + bh + pad
            for bx, by, bw, bh in boxes
        )

    for y in range(H):
        for x in range(W):
            r, g, b = px[x, y]
            if not inside(x, y):
                op[x, y] = (r, g, b, 255)
                continue
            gs = green(r, g, b)
            if min(r, b) > 150:  # white UI over the screen: keep, remove the green cast
                op[x, y] = (r, max(r, b), b, 255)
            elif gs > 60 and g > 120:
                op[x, y] = (0, 0, 0, 0)
            elif gs > 20:
                a = int(255 * (1 - (gs - 20) / 40))
                op[x, y] = (r, min(g, max(r, b) + 8), b, a)
            else:
                op[x, y] = (r, g, b, 255)
    out.save(dst, optimize=True)
    for b in sorted(boxes, key=lambda b: b[1]):
        print(b)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
