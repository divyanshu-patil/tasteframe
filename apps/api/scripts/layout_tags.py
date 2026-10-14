"""Build app/services/recommendations/layout_tags.json: each layout's Qloo tags.

Terms per layout come from how Pinterest classifies the layout's reference pins
(design-refs/pinterest/pin_meta.json: visual annotations, category breadcrumbs, related
interests) plus the layout's own moods, style tags and keywords. Each term is resolved to real
Qloo tag ids with GET /v2/tags (exact name match, taste tag types only). At runtime Qloo scores
these tags against the person's taste (QlooClient.tag_affinity).

    pnpm api:py scripts/layout_tags.py     # or: apps/api/.venv/bin/python scripts/layout_tags.py
Needs QLOO_API_KEY in apps/api/.env. One Qloo call per new search word (cached locally).
"""

import json
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

API = Path(__file__).resolve().parent.parent
ROOT = API.parent.parent
sys.path.insert(0, str(API))

from app.services.recommendations.layouts import CATALOGUE  # noqa: E402

OUT = API / "app/services/recommendations/layout_tags.json"
PINS = ROOT / "apps/web/lib/story/pins.json"
META = ROOT / "design-refs/pinterest/pin_meta.json"
# term → matched tags, kept locally (gitignored) so reruns only spend Qloo credits on new terms.
CACHE = API / "scripts/.layout_tags_cache.json"

# Tag types that get affinity from artist/film signals (checked live 2026-10-14); place, dish,
# occupation and decor tags don't, so they'd never move a ranking. Earlier = preferred.
TYPES = (
    "urn:tag:style:qloo",
    "urn:tag:genre:music",
    "urn:tag:genre:media",
    "urn:tag:subgenre:qloo",
    "urn:tag:keyword:qloo",
    "urn:tag:music:qloo",
    "urn:tag:artist:qloo",
    "urn:tag:audience:qloo",
)
# Pinterest phrases are SEO-ish ("Aesthetic Movie Scenes"): these words say nothing about style.
STOP = set(
    "a an and the of for to in on with my your ideas idea inspo inspiration aesthetic aesthetics "
    "photo photos photography pic pics picture pictures instagram insta ig story stories post "
    "posts template templates layout layouts design designs edit edits editing wallpaper "
    "background cute best cool easy simple new art poster quotes quote".split()
)
PER_LAYOUT = 6
SOURCE_WEIGHT = {"annotation": 1.0, "breadcrumb": 0.5, "interest": 0.5}


def env() -> dict[str, str]:
    lines = (API / ".env").read_text().splitlines()
    return {
        k.strip(): v.strip()
        for k, v in (x.split("=", 1) for x in lines if "=" in x and not x.lstrip().startswith("#"))
    }


def queries(term: str) -> list[str]:
    """The phrase, then its meaningful bigrams and words ("rockstar aesthetics" → "rockstar")."""
    words = [w for w in re.findall(r"[a-z0-9&'-]+", term.lower()) if w not in STOP]
    out = [" ".join(words)] if len(words) > 1 else []
    out += [f"{a} {b}" for a, b in zip(words, words[1:], strict=False)][
        : 2 if len(words) > 2 else 0
    ]
    out += words
    return list(dict.fromkeys(q for q in out if len(q) > 2))


def resolve(q: str, key: str, base: str, cache: dict) -> list[dict]:
    if q in cache:
        return cache[q]
    url = f"{base}/v2/tags?" + urllib.parse.urlencode({"filter.query": q, "take": 25})
    req = urllib.request.Request(url, headers={"X-Api-Key": key, "Accept": "application/json"})  # noqa: S310
    try:
        with urllib.request.urlopen(req, timeout=20) as r:  # noqa: S310 — fixed https host
            tags = json.load(r).get("results", {}).get("tags", [])
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
        tags = []
    norm = q.replace(" ", "_").replace("-", "_")
    exact = [
        {"tag": t["id"], "name": re.sub(r"\s*-\s*", "-", t["name"]).strip("\"' ")}
        for t in tags
        if t.get("type") in TYPES and t["id"].rsplit(":", 1)[-1] == norm
    ]
    exact.sort(key=lambda t: TYPES.index(t["tag"].rsplit(":", 1)[0]))
    cache[q] = exact[:2]  # e.g. vintage → style + music genre
    time.sleep(0.1)
    return cache[q]


def terms_by_layout() -> dict[str, dict[str, float]]:
    """layout → {term: weight}. Pinterest terms are averaged over the layout's pins."""
    terms: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    meta = json.loads(META.read_text()) if META.exists() else {}
    pins = json.loads(PINS.read_text())
    per_layout: dict[str, list[str]] = defaultdict(list)
    for p in pins:
        for layout in p["layouts"]:
            per_layout[layout].append(p["pin"])
    for layout, ids in per_layout.items():
        seen = [meta[i] for i in ids if i in meta]
        for m in seen:
            for src, w in SOURCE_WEIGHT.items():
                for term in m.get(src + "s", []):
                    terms[layout][term] += w / len(seen)
    for t in CATALOGUE:
        for mood, fit in t.moods.items():
            if fit >= 0.8:
                terms[t.id][mood] += 0.6 * fit
        for term in (*t.style_tags, *t.keywords):
            terms[t.id][term] += 0.4
    return terms


def main() -> None:
    e = env()
    key, base = e.get("QLOO_API_KEY"), e.get("QLOO_BASE_URL") or "https://hackathon.api.qloo.com"
    if not key:
        raise SystemExit("QLOO_API_KEY is not set in apps/api/.env")
    cache: dict[str, list[dict]] = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    out = {}
    for layout, terms in sorted(terms_by_layout().items()):
        if layout not in {t.id for t in CATALOGUE}:
            continue  # pins.json can name retired layouts
        tags: dict[str, dict] = {}
        for term, w in sorted(terms.items(), key=lambda x: -x[1]):
            for q in queries(term):
                for t in resolve(q, key, base, cache):
                    row = tags.setdefault(t["tag"], {**t, "weight": 0.0, "from": []})
                    row["weight"] = round(row["weight"] + w, 3)
                    if term not in row["from"]:
                        row["from"].append(term)
                if resolve(q, key, base, cache):
                    break  # most specific match wins ("bollywood movie poster" → bollywood)
        out[layout] = sorted(tags.values(), key=lambda t: -t["weight"])[:PER_LAYOUT]
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    CACHE.write_text(json.dumps(cache, sort_keys=True))
    missing = [t.id for t in CATALOGUE if not out.get(t.id)]
    unique = {t["tag"] for v in out.values() for t in v}
    print(f"{len(out)} layouts, {len(unique)} distinct Qloo tags, {len(cache)} lookups")
    print("pin meta:", "yes" if META.exists() else "no (template terms only)")
    if missing:
        print("no Qloo tags:", ", ".join(missing))


if __name__ == "__main__":
    main()
