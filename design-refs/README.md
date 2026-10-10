# Design references

Story inspiration collected from Pinterest search (2026-10-10) to shape the template catalogue
in `apps/web/lib/story/templates.ts`.

- `pinterest/<style>/*.jpg` — downloaded pins (**local only, gitignored**: third-party copyrighted
  images, used for reference, never shipped).
- `pinterest/SOURCES.tsv` — category, file, original pin URL, pin title (committed).

Re-fetch locally: the images can be re-downloaded from the pin URLs in `SOURCES.tsv`.

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
