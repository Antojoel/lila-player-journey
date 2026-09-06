# Architecture

## What & why

A Level Designer needs to open one link and understand how players move through
LILA BLACK matches — routes, fights, loot, and the aggregate pressure map — with
no setup and no one to walk them through it.

The whole system is a **static precompute + static SPA**. A Python pipeline turns
1,243 Parquet files into a few MB of JSON and three small images; a React app
renders them on a `<canvas>` over the minimap. There is **no backend, no
database, no runtime compute.**

### Why no backend

| | Static precompute (chosen) | Live backend / API |
|---|---|---|
| Reviewer opens the link cold | Loads instantly from CDN/static host | Free-tier dyno may be cold-started or asleep → the one moment it matters, it's slow or down |
| Maintenance | None. It's files. | Something to keep alive, patch, pay for |
| Data size | ~5 MB total, ~65 KB per match on demand | Would need a DB or file store for 89 K rows |
| Query flexibility | Fixed to what the pipeline emits | Arbitrary |
| Cost | $0 | $0 until it isn't, or it sleeps |

The dataset is **fixed** (5 days of history, never appended to by this tool) and
**small**. Every advantage of a backend is about ad-hoc querying we don't need;
every risk of one lands exactly when a reviewer clicks the link. So the pipeline
does all the aggregation once, and the browser just draws.

Trade-off accepted: new questions ("show me only players who used a weapon") mean
re-running the pipeline, not a new API call. For a review tool over frozen data
that's the right side of the trade.

---

## Data flow

```
player_data/<day>/<user_id>_<match_id>.nakama-0   (Parquet, 1243 files)
        │
        │  pipeline/build.py  (DuckDB read, one try/except per file)
        │    • decode event bytes -> string, classify into kind
        │    • user_id shape -> human | bot
        │    • world (x,z) -> minimap pixel (per-map scale/origin, Y flip)
        │    • ts -> per-match relative, ×1000 -> real milliseconds
        │    • group by match_id -> per-match players[] { path[], events[] }
        │    • bin kill/death/traffic into 96×96 grids, split by day
        │    • re-encode 3 minimaps  PNG/JPG (3–12 MB) -> WebP (~65 KB)
        ▼
web/public/data/manifest.json          one row per match  (all dropdowns)
web/public/data/matches/<id>.json      per-match detail   (fetched on click)
web/public/data/heatmaps/<map>_<kind>.json   sparse day-bucketed grids
web/public/minimaps/<map>.webp
        │
        │  fetch() only — no other network calls
        ▼
React SPA
  App           filter state, match/heatmap loading, playback clock
  Controls      map / date / match filters, toggles, legend
  MapCanvas     <img> minimap + heatmap <canvas> + journey <canvas> + hit-testing
  Timeline      scrubber, play/pause, speed, event ticks
```

### Manifest vs match files

`manifest.json` holds only what the filter UI needs (≈120 KB for 796 matches).
Full path/event data lives in one file per match and is fetched **on selection**,
then cached. Opening the tool costs one manifest fetch; exploring costs ~5 KB per
match.

### Heatmaps

Per map and per kind (`kill`, `death`, `traffic`) a 96×96 grid of counts, stored
**sparsely** (`[cellIndex, count]` pairs) and **split by collection day**. The
client sums the days in the selected range, so date filtering is exact rather
than "all-time only". `kill` bins the killer's position, `death` bins the
victim's (including storm), `traffic` bins every `Position` / `BotPosition`
sample. Rendered by writing the grid into a tiny offscreen canvas and letting the
browser bilinear-upscale it, composited with `screen` so the map stays readable.

---

## Coordinate mapping

World `x`/`z` (not `y` — that's elevation) → minimap pixels, per the dataset
README:

```
u = (x - origin_x) / scale
v = (z - origin_z) / scale
pixel_x = u * 1024
pixel_y = (1 - v) * 1024          # image origin is top-left, world +z is "up"
```

| Map | scale | origin_x | origin_z |
|---|---|---|---|
| AmbroseValley | 900 | −370 | −473 |
| GrandRift | 581 | −290 | −290 |
| Lockdown | 1000 | −500 | −500 |

**Verification.** `pipeline/verify_coords.py` plots (a) the README's own worked
example — world `(-301.45, -355.55)` on AmbroseValley, which must land on pixel
`(78, 890)`, and it does exactly — and (b) a few thousand real position samples
per map, plus the data's bounding-box corners, onto the actual minimap image. On
all three maps the samples sit on roads and structures and stay inside the
playable island. The pipeline emits pixel coords in this fixed 1024 space; the
frontend scales by `canvasSize / 1024`, so the canvas is resolution-independent.

---

## Timestamp handling

`ts` is `timestamp[ms]`, but one match spans only ~700 units and the absolute
values only fall in Feb 2026 if multiplied by 1000 — the export put **seconds
into a millisecond field**. So:

```
t_relative_ms = (row.ts − match.min(ts)) × 1000
```

Playback starts at 0. Recovered match lengths are sane: median **6.4 min**, p90
**12 min**, which matches "a match lasts several minutes" from the README.

---

## Rendering & interaction

- Two stacked `<canvas>` layers (heatmap below, journeys above) over an `<img>`
  minimap. `devicePixelRatio`-aware, re-sized via `ResizeObserver`, kept square.
- Journey redraw is cheap (≤~300 points/player, ≤16 players) so playback just
  redraws every frame from a `requestAnimationFrame` clock.
- Hit-testing is done in screen space against the marker list returned by the
  draw pass, then against path segments — hovering a marker or a route dims
  everything else and shows a tooltip.
- Humans: solid, per-player colour from a 10-hue set. Bots: dashed, one slate
  colour. Colour **and** dash pattern differ, so the distinction survives
  grayscale / colour-blindness.

---

## Assumptions & trade-offs

| Decision | Alternative | Why this way |
|---|---|---|
| Static precompute, no backend | Live API over the Parquet | Frozen, small dataset; a backend's only upside (ad-hoc queries) isn't needed, its downside (cold start / downtime) hits exactly when reviewed |
| `ts` × 1000 to real ms | Use raw units; label "ticks" | Raw values only make sense as epoch-ms ÷ 1000; ×1000 yields match lengths that match the README's description |
| Human/bot by `user_id` regex only | Also infer from event names | The id shape is unambiguous and documented; a few bot files carry `Position` rows that would mislead a name-based check |
| Combat event attributed to the file's owner | Trust the README's human-centric phrasing literally | The file-owner rule is consistent for every event type and for bot-vs-bot rows the README doesn't cover |
| One JSON per match, fetched on demand | One big bundle | 796 matches; only one is viewed at a time — keeps first load ~120 KB |
| Heatmap grids split by day | All-time only | Makes the date filter exact for a modest size increase (sparse storage) |
| 96×96 heatmap grid | Finer / coarser | Enough spatial detail to read POIs at 1024 px; still only a few KB per map/kind |
| Hand-rolled canvas | Mapbox / deck.gl / a charting lib | The minimap is a fixed image in a known pixel space; a full mapping stack is weight with no benefit here |
| Commit generated data | Generate in CI from the raw files | The raw `player_data/` isn't public; committing the derived JSON makes the repo self-contained and the deploy reproducible |
