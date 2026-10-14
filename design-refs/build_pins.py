"""Build apps/web/lib/story/pins.json — the Pinterest references behind each layout.

Only links + credits + Pinterest's own oEmbed thumbnail URL are stored (no images).
    python3 design-refs/build_pins.py
"""

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PIN = ROOT / "pinterest"
OUT = ROOT.parent / "apps" / "web" / "lib" / "story" / "pins.json"
CACHE = PIN / "oembed_cache.json"

# Whole categories that inspired a layout (first wave); aesthetic/cover pins map one by one
# (pinterest/pin_layouts.json), and the owner's pins are listed explicitly.
CATEGORY = {
    "cinematic": ["cinematic"], "editorial": ["editorial"], "scrapbook": ["scrapbook"],
    "filmframe": ["filmstrip", "stills"], "minimal": ["minimal"], "collage": ["photodump"],
    "vintage": ["vintage"], "photodump": ["photodump"], "magazine": ["magazine"],
    "nowplaying": ["nowplaying"], "moodboard": ["moodboard"], "ticket": ["ticket"],
    "y2k": ["y2k"], "tornpaper": ["torn", "torncollage"], "notes": ["note"],
    "newspaper": ["newspaper"], "blurframe": ["softfocus", "journal"], "multi2": ["duo", "splitscreen"],
    "multi3": ["booth"], "multi4": ["grid", "mosaic"], "polaroids": ["polaroids", "bigpolaroid"],
}
OWNER = {
    "1089308228644747115": ["playercut"], "1085860160186722100": ["triptych"],
    "1090574866046504741": ["tornstrip"], "1124000019586133369": ["cutout"],
    "613967361752648972": ["playlist"], "1132725743802175895": ["camcorder"],
    "986569862147315636": ["coverface"], "1151514198494369585": ["covermouth"],
    "997125173755428109": ["chat"], "1125970344365273773": ["camtilt"],
    "730075789639923367": ["kissmark"], "1145673592732693244": ["viewfinder"],
    "1093178509566174434": ["yearbook"],
    "613193305553010170": ["xerox"],
    "953566921100167968": ["appswitch"], "955466877203501872": ["phones"],
    "919789923951050810": ["camlyric"], "912401205765506895": ["filmslant"],
    "107030928643308232": ["songbox"], "96757091990974969": ["clockit"],
    "878553839820182314": ["doodlefit"],
    "1110770695656757198": ["lyriclily"], "1110770695656757203": ["keyphoto"],
    "1110770695656757202": ["sidecollage"], "1110770695656757194": [],
}


def oembed(pin: str, cache: dict) -> dict:
    if pin not in cache:
        url = f"https://www.pinterest.com/pin/{pin}/"
        req = urllib.request.Request(
            "https://www.pinterest.com/oembed.json?url=" + urllib.parse.quote(url, safe=""),
            headers={"User-Agent": "tasteframe-design-refs/1.0"},
        )
        with urllib.request.urlopen(req, timeout=20) as r:  # noqa: S310 — fixed https host
            m = json.load(r)
        cache[pin] = {k: m.get(k) for k in ("author_name", "author_url", "thumbnail_url", "thumbnail_width", "thumbnail_height")}
        time.sleep(0.2)
    return cache[pin]


def main() -> None:
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    per_pin = json.loads((PIN / "pin_layouts.json").read_text())
    rows = [line.split("\t") for line in (PIN / "SOURCES.tsv").read_text().splitlines() if line.strip()]
    pins = []
    for row in rows:
        cat, file = row[0], row[1]
        pin = file.split(".")[0]
        layouts = OWNER.get(pin) or per_pin.get(pin) or CATEGORY.get(cat, [])
        meta = oembed(pin, cache)
        pins.append({
            "pin": pin,
            "category": cat,
            "author": meta.get("author_name") or (row[4] if len(row) > 4 else ""),
            "authorUrl": meta.get("author_url") or (row[5] if len(row) > 5 else ""),
            "thumb": meta.get("thumbnail_url") or "",
            "w": meta.get("thumbnail_width") or 236,
            "h": meta.get("thumbnail_height") or 419,
            "layouts": layouts,
        })
    # The same pin can turn up under several searches: keep one entry, union its layouts.
    merged: dict[str, dict] = {}
    for p in pins:
        if p["pin"] in merged:
            merged[p["pin"]]["layouts"] = list(dict.fromkeys(merged[p["pin"]]["layouts"] + p["layouts"]))
        else:
            merged[p["pin"]] = p
    pins = list(merged.values())
    CACHE.write_text(json.dumps(cache, indent=0, ensure_ascii=False, sort_keys=True))
    OUT.write_text(json.dumps(pins, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(pins)} pins, {sum(1 for p in pins if p['layouts'])} linked to layouts")


if __name__ == "__main__":
    main()
