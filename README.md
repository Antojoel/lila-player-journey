# LILA BLACK — Player Journey Explorer

A browser tool for a **Level Designer** to see how players actually move through
LILA BLACK matches: routes on the correct minimap, kill / death / loot / storm
markers, timeline playback, and kill / death / traffic heatmaps.

**Live:** <https://lila.antojoel.com/>

There's no sample data baked in. Open the link, **drop a `player_data.zip`** (or a
later `month_x.zip`) onto the page, and it is unpacked and analysed **entirely in
your browser** — nothing is uploaded anywhere, and processed datasets are cached
locally so a refresh keeps them.

![overview](docs/overview.jpg)

---

## Requirements checklist

Everything the assignment asks for, and where it lives.

| Requirement | Done | How / where |
|---|---|---|
| Load and parse the Parquet data | ✅ | Browser reads all 1,243 `.nakama-0` files with **DuckDB-WASM** (`web/src/lib/pipeline/`). A Python twin (`pipeline/build.py`) gives byte-identical output for CI / very large data. |
| Player journeys on the **correct** minimap, world coords mapped | ✅ | Per-map `scale`/`origin` → UV → pixel, Y-flipped. Verified against the dataset README's worked example and by plotting real samples on all 3 maps (`pipeline/verify_coords.py`). |
| Humans vs bots, visually distinct | ✅ | Human = **solid** line, one bright colour each. Bot = **dashed** line, one muted slate colour. Distinct by *both* colour and line style. |
| Distinct markers for kill / death / loot / storm death | ✅ | Four separate canvas glyphs (spark / X / purple diamond / gold diamond), colour-coded, always in the legend, hover for details. |
| Filter by map / date / match | ✅ | Map + date dropdowns; a searchable match list ranked by activity; plus one-click **quick picks**. |
| Timeline / playback | ✅ | Scrubber + play/pause (**spacebar**) + speed (10–120×) + jump to next/previous event. Paths draw up to the current time; markers pop in as playback passes them. |
| Heatmap overlays: kill zones / death zones / traffic | ✅ | Precomputed 96×96 count grids per map, split by day so the date filter is exact. Toggle the kind; each has its own colour ramp + explanation. |
| Hosted, shareable link | ✅ | <https://lila.antojoel.com/> — static build on Vercel, no backend. |
| Single GitHub repo with all code | ✅ | <https://github.com/Antojoel/lila-player-journey> |
| README (tech stack, setup, env vars) | ✅ | This file. |
| `ARCHITECTURE.md`, one page | ✅ | What/why, data flow, coordinate-mapping walkthrough, assumptions, trade-offs table. |
| `INSIGHTS.md`, three findings | ✅ | Each with a concrete stat, the metrics it moves, and why a Level Designer cares. |

Built for a Level Designer, not a data scientist:

- Matches read in plain language — `AmbroseValley · 6:24 · 1 human, 13 bots · 12 kills · 68 loot` — the hex id is a small subtitle.
- **Quick picks** — one click for "Biggest fight", "Longest match", "Most storm deaths", "Quiet match" on the current map/date.
- Players get friendly names (**Human A**, **Bot 3**). Click one — in the list or on the map — to **isolate** just that route.
- **Map brightness** slider so paths and heatmaps read over the satellite art.
- Always-visible legend, hover tooltips on every marker and path, sane defaults on load, explicit empty / progress states.

---

## How to use it (walkthrough)

1. **Open the link → drop a zip.** The page shows a drop zone. Drag
   `player_data.zip` onto it (or click to pick files — several at once is fine).
   You'll see a progress bar per zip: *unzipping → reading Parquet → classifying
   → building matches → binning heatmaps → re-encoding minimaps*. The full sample
   takes a few seconds.

2. **Dataset switcher (top-left).** Each zip becomes a dataset. Drop a second
   `month_x.zip` and a **Combined** entry appears that merges them. **✕** removes
   one. Datasets persist in your browser (IndexedDB) — reload and they're still
   there.

3. **"One match" mode (default).**
   - Pick a match from the list, or use a **quick pick**. The list is searchable
     (`find by id / map`) and filtered by the **Map** and **Date** dropdowns.
   - The map draws every player's route on the right minimap: **solid** lines are
     humans (one colour each), **dashed** slate lines are bots. Filled dot = each
     player's position at the current time.
   - Markers: **✦** kill (where the killer stood), **✕** death, **◈ purple** storm
     death, **◆ gold** loot. Hover any marker or route for player name, event, and
     timestamp.
   - **Players panel** lists everyone with their K/D/L. Click a player (there or
     on the map) to **isolate** their route; an "Isolated: Human A ✕" chip lets
     you clear it (or press **Esc**).
   - **Humans / Bots** checkboxes hide either group.

4. **Timeline (bottom).** ▶ / **spacebar** plays the match; the route reveals and
   markers pop in as time advances. **⏮ / ⏭** jump to the previous / next event.
   Drag the scrubber to any moment. Ticks under the bar mark every event, coloured
   by kind. Change playback speed on the right.

5. **Heatmap mode.** Switch the toggle at the top. Pick **Traffic** (where
   players spend time), **Kill zones** (where killers stood), or **Death zones**
   (where players died, storm included). Choose a **Map** and a **day** or *All 5
   days* — counts are bucketed per day, so any range is exact.

6. **Map brightness** slider dims the satellite art so overlays pop.

---

## Tech stack

- **Frontend:** React 18 + TypeScript, [Vite](https://vitejs.dev/) 7. Journeys and
  heatmaps are hand-drawn on stacked HTML `<canvas>` over the minimap image — no
  charting or map library.
- **In-browser pipeline:** [DuckDB-WASM](https://duckdb.org/docs/api/wasm/overview)
  (Parquet read + SQL grouping), [JSZip](https://stuk.github.io/jszip/) (unzip), a
  TypeScript port of the classification / coordinate / timestamp logic,
  [`idb`](https://github.com/jakearchibald/idb) (IndexedDB). The DuckDB
  `wasm` + worker are bundled locally (no CDN) and **code-split** — the ~8 MB gzip
  wasm downloads only on the first upload.
- **Offline pipeline (twin):** Python 3 + DuckDB + pandas + Pillow
  (`pipeline/build.py`). Same logic; verified to produce identical output. For CI,
  a dataset too big for a tab, or baking an optional bundled dataset.
- **Hosting:** a static `dist/` folder — Vercel here, but Netlify / GitHub Pages /
  Docker+nginx / `npx serve` all work. **No backend, no database, no env vars.**

---

## Repo layout

```
web/                       React + Vite frontend
  src/lib/pipeline/         in-browser pipeline
    constants.ts            map config, event map, bot regex  (mirrors pipeline/lib.py)
    duckdb.ts               lazy DuckDB-WASM instance
    unzip.ts                pull *.nakama-0 + minimaps out of a zip
    runPipeline.ts          the analysis — the TS port of build.py
    minimaps.ts             re-encode a minimap image to a 1024² WebP
    index.ts                processZip(): unzip -> analyse -> Dataset
  src/lib/
    datasets.ts             Dataset type, IndexedDB persistence, "Combined" merge
    bundled.ts              optionally load web/public/data if the Python twin ran
    types.ts / draw.ts / palette.ts / matchStats.ts / format.ts
  src/components/           Landing, DatasetBar, Controls, MapCanvas, Timeline, Legend
  src/hooks/usePlayback.ts
  public/                   ships empty (public/data is git-ignored output)
  Dockerfile / nginx.conf / eslint.config.js / .prettierrc.json

pipeline/                   Python twin: parse Parquet -> static JSON + minimaps
  lib.py                    coord mapping, human/bot detection, event classification
  build.py                  entrypoint  (env: PLAYER_DATA_DIR, OUTPUT_DIR, DATASET_YEAR)
  verify_coords.py          renders sample points onto each minimap for a visual check
  pyproject.toml (ruff) / requirements*.txt / Dockerfile

docker-compose.yml          `up web` serves the site; `run --rm pipeline` bakes a dataset
Makefile                    make help / dev / build / lint / format / check / docker-serve
.github/workflows/          ci.yml — lint + typecheck + build + docker build on every push
ARCHITECTURE.md             one-page design doc
INSIGHTS.md                 three findings from the data
```

---

## Run it locally

`make help` at the root lists every target.

### Frontend (all you need)

```bash
cd web
npm install
npm run dev       # http://localhost:5173  — then drop a player_data.zip on it
npm run build     # -> web/dist   (static, this is what deploys)
npm run preview   # serve the production build locally
```

**Node 20+** (Vite 7). No environment variables. `vite.config.ts` sets
`base: "./"` so the build works at a domain root or any sub-path.

### Python pipeline (optional)

The browser already does the pipeline. Run this only for CI, a dataset too big
for a tab, or to bake a bundled dataset the app loads on boot (it writes to
`web/public/data`). Output is byte-identical to the browser's.

```bash
python3 -m venv .venv
./.venv/bin/pip install -r pipeline/requirements-dev.txt
PLAYER_DATA_DIR=/path/to/player_data ./.venv/bin/python pipeline/build.py
#   or:  make data PLAYER_DATA_DIR=/path/to/player_data
```

| Env var | Default | Meaning |
|---|---|---|
| `PLAYER_DATA_DIR` | `~/Downloads/player_data` | raw dataset root — day folders + `minimaps/` |
| `OUTPUT_DIR` | `web/public` | where `data/` and `minimaps/` are written |
| `DATASET_YEAR` | `2026` | year for the `<Month>_<DD>` folders |

Day folders are auto-discovered (any sub-dir with `*.nakama-0`), so a `March_01/…`
drop-in needs no code change. `build.py` prints a summary and lists any unreadable
files in `pipeline/_verify/skipped.txt` (currently none — all 1,243 parse).

### Docker

```bash
docker compose up --build web       # site on http://localhost:8080
PLAYER_DATA_DIR=/abs/path \
  docker compose run --rm pipeline  # bake web/public/data as a bundled dataset
```

`web/Dockerfile` is a multi-stage build (Node build → nginx serving `dist/`).
`pipeline/Dockerfile` runs `build.py` against `/data` (read-only) → `/out`.

---

## Deploy

Static site, output is `web/dist/`.

- **Vercel** (used here): `npx vercel login`, then `npx vercel --cwd web` and
  `npx vercel --cwd web --prod`. Root directory `web`, framework auto-detects
  Vite, no env vars. The `.vercel/` project link is git-ignored.
- **Netlify:** base `web`, build `npm run build`, publish `web/dist` — or drag the
  `web/dist` folder onto app.netlify.com/drop.
- **GitHub Pages / Cloudflare Pages / any static host:** build `web/` and serve
  `web/dist`. (Cloudflare Pages' free tier caps files at 25 MB — the wasm is
  34 MB — so use one of the others there.)

The 34 MB DuckDB wasm is the only large file; every host above serves it
compressed (~8 MB) and it loads only when someone drops a zip.

---

## Code quality

| Area | Tool | Command |
|---|---|---|
| Frontend lint | ESLint 9 (flat config) + `typescript-eslint` + react-hooks | `npm run lint` |
| Frontend format | Prettier | `npm run format` / `npm run format:check` |
| Frontend types | `tsc --noEmit`, `strict: true` | `npm run typecheck` |
| Pipeline lint + format | Ruff (`E`, `F`, `W`, `I`, `UP`, `B`, `SIM`, `C4`) | `ruff check pipeline` |

`make check` runs the lot. `.github/workflows/ci.yml` runs the same on every push
and PR, plus a `docker build` of both images. `.editorconfig` covers editor
indentation.

---

## Assumptions & edge cases

Where the data was ambiguous, the call I made. (Also in `ARCHITECTURE.md`.)

- **`ts` units.** `ts` is `timestamp[ms]`, but a whole match spans only ~700 of
  those units, and the absolute values only land in Feb 2026 if multiplied by
  1000 — the export put *seconds* into a millisecond field. Both pipelines
  normalise per match (subtract the match's min `ts`) and **×1000**. Result:
  sensible match lengths — median **6.4 min**, p90 12.
- **Human vs bot** is decided **only** by `user_id` shape — a UUID is a human, a
  short number is a bot. Event names are not used (a few bot files contain
  `Position` / `Loot` rows that a name check would misread).
- **Combat event ownership.** An event belongs to the file's owner. `Kill` /
  `BotKill` → that player got a kill (drawn at the killer's position → *kill
  zones*). `Killed` / `BotKilled` / `KilledByStorm` → that player died (victim's
  position → *death zones*). The dataset README phrases `BotKilled` as "killed by
  a bot"; under the file-owner rule that still means the file's owner died, so the
  two agree. Only `BotKill` / `BotKilled` rows *inside a bot's file* (bot-vs-bot)
  are genuinely ambiguous — treated as that bot's kill / death.
- **Match date** comes from the day folder in the zip (`February_10` → `2026-02-10`);
  any `<Month>_<DD>` name is parsed, others pass through unchanged.
- **February 14 is a partial day** (collection was ongoing) — included and
  labelled; its lower counts are expected.
- **Map per match** = the modal `map_id` across the match's rows (always
  consistent here). One match_id appears under two day folders — assigned the
  earlier day.
- **Unknown `map_id`** — rows dropped with a dataset warning (no minimap /
  config). A zip may include `minimaps/<Name>` to supply the image.
- **Corrupt / truncated files** — the bulk read falls back to a per-file scan that
  isolates, counts and lists each failure (a dataset warning in the browser,
  `pipeline/_verify/skipped.txt` offline). None fail on the current dataset.
- **`y` (elevation)** is ignored for plotting — only `x` / `z` map to the 2D
  minimap.
- **Heatmap date filtering** is exact: cells are bucketed per collection day and
  summed for the selected range on the client.
