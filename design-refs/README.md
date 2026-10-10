# Design references

Story inspiration collected from Pinterest search (2026-10-10) to shape the template catalogue
in `apps/web/lib/story/templates.ts`.

- `pinterest/<style>/*.jpg` — downloaded pins (**local only, gitignored**: third-party copyrighted
  images, used for reference, never shipped).
- `pinterest/SOURCES.tsv` — category, file, original pin URL, pin title, **author name, author
  profile URL** (committed). This is the attribution for every reference.

Pinterest's terms keep copyright with each pin's creator and grant no right to republish pin
images, so the repo carries links and credits only. Rebuild the images locally with
`python3 design-refs/fetch.py` (official oEmbed lookup, stdlib only; `--authors` refreshes the
credits). The owner's own pins are rows with category `owner`. `pinterest/user1/` holds the
same references as shared in chat (local only).

`python3 design-refs/build_pins.py` writes `apps/web/lib/story/pins.json` (pin, author credit,
Pinterest's oEmbed thumbnail URL, layouts). Per-pin layout links for the aesthetic/cover sets live in
`pinterest/pin_layouts.json`; oEmbed answers are cached in `pinterest/oembed_cache.json`.

## What each template borrows

| Template | Reference cues |
|---|---|
| `cinematic` | Full-bleed still, warm serif line centred low ("the art of observing."), subtitle-style caption, grain |
| `stills` | Three stacked film stills of one moment with lowercase subtitles |
| `editorial` | Grid paper, "CREATIVE STORY / 2K25" metadata, photo band, big lowercase grotesk headline, ghost date numerals, corner brackets |
| `journal` | Paper card over a blurred photo backdrop; date line, title, quote mark, short paragraph, inset photo |
| `scrapbook` | Tilted polaroid, washi tape, gold stars, torn paper note, handwritten captions, postage stamp |
| `filmstrip` | Vertical 35mm strip, sprocket holes, orange edge codes ("3A"), tape label |
| `vintage` | Warm grade, orange/red light leaks, dust and scratches, orange digital date stamp |
| `minimal` | Dark matte, white-bordered frame, offset second frame, small serif name |

Collage pins informed the multi-crop compositions (`stills`, `filmstrip`, `minimal` offset frame);
the app uses one photo per Story, so true multi-photo collages are out of scope.

## Second wave (2026-10-10)

Added categories: photodump, magazine, nowplaying, moodboard, ticket, y2k, tornpaper, notes,
newspaper, filters, stickers, blurframe. Each became a layout (`templates-more.ts`), the filter
set (`filters.ts`) or the sticker tray (`stickers.ts`). Brand marks seen in pins (magazine
mastheads, streaming-app UIs) are deliberately not reproduced: the masthead uses your headline
and the player is generic.
