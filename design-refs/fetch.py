"""Rebuild design-refs/pinterest locally from SOURCES.tsv (images are never committed).

Pinterest doesn't grant rights to republish pin images, so the repo keeps only links and
attribution. This uses Pinterest's official oEmbed endpoint to look up each pin's author and
image, and downloads the image for local reference use only.

    python3 design-refs/fetch.py            # download missing images
    python3 design-refs/fetch.py --authors  # also fill the author columns in SOURCES.tsv
"""

import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "pinterest"
SOURCES = ROOT / "SOURCES.tsv"
OEMBED = "https://www.pinterest.com/oembed.json?url="
HEADERS = {"User-Agent": "tasteframe-design-refs/1.0"}


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as r:  # noqa: S310 — fixed https hosts
        return r.read()


def oembed(pin_url: str) -> dict:
    return json.loads(get(OEMBED + urllib.parse.quote(pin_url, safe="")))


def main(fill_authors: bool) -> None:
    rows = [line.split("\t") for line in SOURCES.read_text().splitlines() if line.strip()]
    out, fetched, failed = [], 0, 0
    for row in rows:
        # category, file, pin url, title, [author name, author url]
        row += [""] * (6 - len(row))
        category, name, pin = row[0], row[1], row[2]
        dest = ROOT / category / name
        need_meta = fill_authors and not row[4]
        if dest.exists() and not need_meta:
            out.append(row)
            continue
        try:
            meta = oembed(pin)
            row[4] = meta.get("author_name") or row[4]
            row[5] = meta.get("author_url") or row[5]
            if not dest.exists() and meta.get("thumbnail_url", "").startswith("https://i.pinimg.com/"):
                big = meta["thumbnail_url"].replace("/236x/", "/736x/")
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(get(big))
                fetched += 1
        except Exception as e:  # noqa: BLE001 — report and continue
            failed += 1
            print(f"skip {pin}: {e}", file=sys.stderr)
        out.append(row)
        time.sleep(0.25)  # be polite to Pinterest
    SOURCES.write_text("".join("\t".join(r[:6]) + "\n" for r in out))
    print(f"downloaded {fetched}, failed {failed}, rows {len(out)}")


if __name__ == "__main__":
    main("--authors" in sys.argv)
