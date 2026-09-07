# Architecture

## What I built with, and why

- **Pipeline:** Python + **DuckDB** (reads Parquet regardless of extension, does
  the grouping/binning in one pass) + Pillow (minimap re-encode). One-shot batch
  job: ~4 s, ~1.2 GB peak RAM (row working set ~90 MB; rest is DuckDB's runtime),
  no GPU/network.
- **Frontend:** **React 18 + TypeScript + Vite 7**, rendering hand-rolled HTML
  `<canvas>` over the minimap `<img>`. No map or charting library — the minimap
  is a fixed image in a known 1024-px space, so a mapping stack (Mapbox/deck.gl)
  would be weight with no payoff.
- **Hosting:** a static `dist/` folder. No backend, database, or runtime compute.

**Why static precompute, not a live API.** The dataset is frozen (5 days,
never appended) and tiny (~89 K rows). Every upside of a backend is ad-hoc
querying we don't need; its downside — a free-tier instance cold-starting or
sleeping — lands exactly when a reviewer opens the link. So the pipeline does all
aggregation once and the browser only draws. Trade-off accepted: a genuinely new
question means re-running the pipeline, not a new query.

## How data flows from Parquet to screen

```
player_data/<day>/<user_id>_<match_id>.nakama-0   (Parquet ×1243)
        │  pipeline/build.py  — one try/except per file, corrupt files logged & skipped
        │    decode event bytes → classify (kill/death/storm_death/loot/move)
        │    user_id shape → human (UUID) | bot (numeric)
        │    world (x,z) → minimap pixel   |   ts → per-match relative, ×1000 → real ms
        │    group by match_id → players[]{ path[], events[] }
        │    bin kill/death/traffic into 96×96 grids, split per collection day
        │    re-encode 3 minimaps: 3–12 MB PNG/JPG → ~65 KB WebP
        ▼
web/public/data/manifest.json         one row/match — feeds every dropdown (~120 KB)
web/public/data/matches/<id>.json     per-match paths+events, fetched on click (~5 KB)
web/public/data/heatmaps/<map>_<kind>.json   sparse, day-bucketed count grids
web/public/minimaps/<map>.webp
        │  fetch() only — no other network calls
        ▼
React SPA:  App (filter state, lazy match/heatmap load, playback clock)
            Controls (map/date/match filters, toggles, legend)
            MapCanvas (<img> + heatmap canvas + journey canvas + hit-testing)
            Timeline (scrubber, play/pause, speed, event ticks)
```

`manifest.json` holds only what the filter UI needs; full path data is one file
per match, fetched on selection and cached. Opening the tool = one manifest
fetch; exploring = ~5 KB per match.

Heatmaps are 96×96 count grids per map × kind (`kill` = killer position, `death` =
victim position incl. storm, `traffic` = every position sample), stored sparsely
and **split by collection day** so the date filter sums an exact range rather than
being all-time only. Rendered by upscaling the grid through a tiny offscreen
canvas, composited with `screen` so the map stays readable.

## Mapping game coordinates to the minimap

World `x`/`z` → pixels (`y` is elevation, unused), per the dataset README:

```
u = (x - origin_x) / scale
v = (z - origin_z) / scale
pixel_x = u * 1024
pixel_y = (1 - v) * 1024        # image origin is top-left; world +z is "up"
```

| Map | scale | origin_x | origin_z |
|---|---|---|---|
| AmbroseValley | 900 | −370 | −473 |
| GrandRift | 581 | −290 | −290 |
| Lockdown | 1000 | −500 | −500 |

**Verified two ways** by `pipeline/verify_coords.py`: (1) the README's own worked
example, world `(-301.45, -355.55)` on AmbroseValley → pixel `(78, 890)`, matches
exactly; (2) a few thousand real position samples + the data's bounding-box
corners plotted onto each real minimap — on all three maps they land on roads and
structures and stay inside the playable island. The pipeline emits coords in this
fixed 1024 space; the frontend scales by `canvasSize / 1024`, so rendering is
resolution-independent.

## Assumptions where the data was ambiguous

- **`ts` units.** `ts` is `timestamp[ms]`, but a whole match spans only ~700
  units and the absolute values only fall in Feb 2026 when ×1000 — the export put
  *seconds* into a millisecond field. Pipeline normalises per match (subtract
  min) and ×1000. Result: sane match lengths, median 6.4 min, p90 12.
- **Human vs bot** is decided *only* by `user_id` shape (UUID vs numeric), never
  by event name — a few bot files contain `Position`/`Loot` rows that a
  name-based check would misread.
- **Combat event ownership:** an event belongs to the file's owner. `Kill`/
  `BotKill` → that player got a kill (plotted at killer position). `Killed`/
  `BotKilled`/`KilledByStorm` → that player died (victim position). The README
  phrases `BotKilled` as "killed by a bot"; under the file-owner rule that still
  means the owner died, so they agree. Only bot-vs-bot rows are genuinely
  ambiguous; treated as that bot's kill/death.
- **Map per match** = modal `map_id` across its rows (always consistent here).
  One match_id spans two day folders → assigned the earlier day.
- **Feb 14 is a partial collection day** — included and labelled; lower counts
  are expected.
- **Corrupt files** are counted and logged (`pipeline/_verify/skipped.txt`), not
  fatal. None fail on the current dataset (1243/1243 parse).

## Major trade-offs

| Decision | Alternative | Why this way |
|---|---|---|
| Static precompute, no backend | Live API over Parquet | Frozen tiny dataset; backend's only upside unused, its cold-start downside hits at review time |
| `ts` × 1000 → real ms | Use raw units, label "ticks" | Raw values only make sense as epoch-ms ÷ 1000; ×1000 gives match lengths matching the README |
| Human/bot by id regex only | Also infer from event names | id shape is unambiguous; some bot files carry `Position` rows |
| One JSON per match, lazy-loaded | One bundled file | 796 matches, one viewed at a time — first load stays ~120 KB |
| Heatmap grids split by day | All-time only | Makes the date filter exact for a few KB more (sparse storage) |
| Hand-rolled canvas | Mapbox / deck.gl / charting lib | Minimap is a fixed image in known pixel space — a mapping stack adds weight, no benefit |
| Commit generated JSON | Regenerate in CI | Raw `player_data/` isn't public; committing derived data makes the repo self-contained and the deploy reproducible |
