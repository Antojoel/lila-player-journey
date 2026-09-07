"""
LILA player-journey pipeline.

Reads every `{user_id}_{match_id}.nakama-0` parquet file, normalises timestamps,
maps world coords to minimap pixels, and emits static JSON + compressed minimap
images for the frontend to consume with no backend.

Outputs (under web/public/):
  data/manifest.json              - one row per match; powers all dropdowns
  data/matches/<match_id>.json    - per-match paths + events, fetched on demand
  data/heatmaps/<map>_<kind>.json - sparse per-date count grids (kill/death/traffic)
  minimaps/<map>.webp             - web-friendly re-encode of each 1024x1024 minimap

Run:  ../.venv/bin/python build.py
"""
import datetime as dt
import glob
import json
import os
import sys
import traceback

import duckdb
import pandas as pd
from PIL import Image

from lib import (
    EVENT_KINDS,
    MAP_CONFIG,
    TS_SCALE,
    is_human,
    world_to_pixel,
)

DATA = "/Users/user/Downloads/player_data"
DAYS = ["February_10", "February_11", "February_12", "February_13", "February_14"]
OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "web", "public"))
DATA_OUT = os.path.join(OUT, "data")
VERIFY = os.path.join(os.path.dirname(__file__), "_verify")

HEATMAP_GRID = 96          # NxN cells per map
HEATMAP_KINDS = ("kill", "death", "traffic")
MINIMAPS = {
    "AmbroseValley": f"{DATA}/minimaps/AmbroseValley_Minimap.png",
    "GrandRift": f"{DATA}/minimaps/GrandRift_Minimap.png",
    "Lockdown": f"{DATA}/minimaps/Lockdown_Minimap.jpg",
}


def folder_date(day: str) -> str:
    return dt.date(2026, 2, int(day.split("_")[1])).isoformat()


def parse_filename(path: str):
    base = os.path.basename(path)
    stem = base[:-len(".nakama-0")] if base.endswith(".nakama-0") else base
    uid, mid = stem.split("_", 1)
    return uid, mid


_SELECT = (
    "SELECT user_id, match_id AS match_id_col, map_id, x, z, "
    "epoch_ms(ts) AS ts_ms, CAST(event AS VARCHAR) AS event, filename "
    "FROM read_parquet(?, filename=true)"
)


def load_rows():
    """Return (DataFrame, skipped list, file count). One row per event.

    Reads every file in a single query. If that fails because some file is
    unreadable, fall back to a per-file scan that isolates and logs the
    offenders instead of aborting.
    """
    files = []
    for day in DAYS:
        files += sorted(glob.glob(f"{DATA}/{day}/*.nakama-0"))

    # Working set is ~90 MB of rows; the rest of RSS is DuckDB's own runtime.
    con = duckdb.connect(config={"memory_limit": "1GB", "threads": 4})
    skipped = []
    try:
        df = con.execute(_SELECT, [files]).df()
    except Exception:  # noqa: BLE001 - one bad file shouldn't sink the run
        frames = []
        for path in files:
            try:
                d = con.execute(_SELECT, [[path]]).df()
                if d.empty:
                    skipped.append((path, "empty"))
                    continue
                frames.append(d)
            except Exception as e:  # noqa: BLE001 - log every failure reason
                skipped.append((path, repr(e)))
        if not frames:
            raise SystemExit("No readable files found.")
        df = pd.concat(frames, ignore_index=True)

    # Files that returned zero rows never appear in the result — flag them.
    got = set(df["filename"].unique())
    for path in files:
        if path not in got:
            skipped.append((path, "empty / no rows"))

    # Recover per-file identity from the filename column.
    stems = df["filename"].map(os.path.basename).str.removesuffix(".nakama-0")
    df["src_day"] = df["filename"].map(lambda p: os.path.basename(os.path.dirname(p)))
    df["src_uid"] = stems.str.split("_", n=1).str[0]
    df["src_mid"] = stems.str.split("_", n=1).str[1]
    df = df.drop(columns=["filename"])

    return df, skipped, len(files)


def main():
    os.makedirs(os.path.join(DATA_OUT, "matches"), exist_ok=True)
    os.makedirs(os.path.join(DATA_OUT, "heatmaps"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "minimaps"), exist_ok=True)
    os.makedirs(VERIFY, exist_ok=True)

    df, skipped, n_files = load_rows()

    # --- basic sanity / cleaning -------------------------------------------------
    unknown_events = sorted(set(df.event.unique()) - set(EVENT_KINDS))
    if unknown_events:
        print("WARNING unknown event types (kept, classified as 'other'):", unknown_events)
    bad_map = sorted(set(df.map_id.unique()) - set(MAP_CONFIG))
    if bad_map:
        print("WARNING rows on unknown maps (dropped):", bad_map)
        df = df[df.map_id.isin(MAP_CONFIG)].copy()

    df["kind"] = df.event.map(EVENT_KINDS).fillna("other")
    df["is_human"] = df.src_uid.map(is_human)

    # Cross-check filename match_id vs the column value (column carries a
    # ".nakama-0" suffix per the dataset README).
    col_mid = df.match_id_col.str.replace(".nakama-0", "", regex=False)
    mismatch = int((col_mid != df.src_mid).sum())
    if mismatch:
        print(f"WARNING {mismatch} rows where filename match_id != column match_id "
              "(using filename)")

    # A match that shows up under more than one collection day -> earliest wins.
    day_by_match = df.groupby("src_mid").src_day.agg(lambda s: sorted(set(s)))
    multi_day = {m: d for m, d in day_by_match.items() if len(d) > 1}
    if multi_day:
        print(f"NOTE {len(multi_day)} matches span multiple day folders; "
              "assigning the earliest.")

    # --- per-match JSON --------------------------------------------------------
    manifest_matches = []
    px_col, py_col = [], []
    for x, z, m in zip(df.x.values, df.z.values, df.map_id.values):
        p = world_to_pixel(float(x), float(z), m)
        px_col.append(round(p[0], 1))
        py_col.append(round(p[1], 1))
    df["px"] = px_col
    df["py"] = py_col

    for mid, mdf in df.groupby("src_mid", sort=False):
        map_id = mdf.map_id.mode().iat[0]
        day = sorted(mdf.src_day.unique())[0]
        date = folder_date(day)
        t0 = int(mdf.ts_ms.min())
        mdf = mdf.assign(t=((mdf.ts_ms - t0) * TS_SCALE).astype("int64"))
        duration_ms = int(mdf.t.max())

        players = []
        ev_totals = {"kill": 0, "death": 0, "storm_death": 0, "loot": 0}
        for uid, pdf in mdf.groupby("src_uid", sort=False):
            pdf = pdf.sort_values("t")
            path = [[float(a), float(b), int(c)]
                    for a, b, c in zip(pdf.px, pdf.py, pdf.t)]
            events = []
            for a, b, c, k in zip(pdf.px, pdf.py, pdf.t, pdf.kind):
                if k in ("kill", "death", "storm_death", "loot"):
                    events.append({"k": k, "px": float(a), "py": float(b), "t": int(c)})
                    ev_totals[k] += 1
            players.append({
                "id": uid,
                "human": bool(pdf.is_human.iat[0]),
                "path": path,
                "events": events,
            })

        human_ids = mdf[mdf.is_human].src_uid.nunique()
        bot_ids = mdf[~mdf.is_human].src_uid.nunique()
        match_obj = {
            "match_id": mid,
            "map_id": map_id,
            "date": date,
            "duration_ms": duration_ms,
            "human_count": int(human_ids),
            "bot_count": int(bot_ids),
            "event_counts": ev_totals,
            "players": players,
        }
        with open(os.path.join(DATA_OUT, "matches", f"{mid}.json"), "w") as fh:
            json.dump(match_obj, fh, separators=(",", ":"))

        manifest_matches.append({
            "match_id": mid,
            "map_id": map_id,
            "date": date,
            "duration_ms": duration_ms,
            "human_count": int(human_ids),
            "bot_count": int(bot_ids),
            "event_counts": ev_totals,
        })

    manifest_matches.sort(key=lambda r: (r["date"], r["map_id"], r["match_id"]))

    # --- heatmaps (sparse, per collection day) -------------------------------
    # kind -> which event kinds feed it
    feeds = {
        "kill": {"kill"},
        "death": {"death", "storm_death"},
        "traffic": {"move"},
    }
    for map_id in MAP_CONFIG:
        mmap = df[df.map_id == map_id]
        for hk, kinds in feeds.items():
            sub = mmap[mmap.kind.isin(kinds)]
            per_date = {}
            for date_key, ddf in sub.groupby(sub.src_day.map(folder_date)):
                counts = {}
                for a, b in zip(ddf.px, ddf.py):
                    c = min(HEATMAP_GRID - 1, max(0, int(a / 1024 * HEATMAP_GRID)))
                    r = min(HEATMAP_GRID - 1, max(0, int(b / 1024 * HEATMAP_GRID)))
                    idx = r * HEATMAP_GRID + c
                    counts[idx] = counts.get(idx, 0) + 1
                if counts:
                    per_date[date_key] = [[i, n] for i, n in sorted(counts.items())]
            out = {
                "map_id": map_id,
                "kind": hk,
                "grid": HEATMAP_GRID,
                "image_size": 1024,
                "note": "cell counts are per collection day; frontend sums the "
                        "selected date range. 'kill' = killer position, "
                        "'death' = victim position (incl. storm), "
                        "'traffic' = Position/BotPosition samples.",
                "dates": per_date,
            }
            with open(os.path.join(DATA_OUT, "heatmaps", f"{map_id}_{hk}.json"), "w") as fh:
                json.dump(out, fh, separators=(",", ":"))

    # --- minimap re-encode --------------------------------------------------
    # Sources are up to 9000x9000 (Lockdown). draft() lets the JPEG decoder emit
    # a ~1/8-scale image directly, and stepping down to 2x before the final
    # LANCZOS pass keeps peak memory low instead of holding an 8-bit 9000^2 RGB
    # buffer (~240 MB) in RAM.
    minimap_meta = {}
    for map_id, src in MINIMAPS.items():
        img = Image.open(src)
        img.draft("RGB", (2048, 2048))
        img = img.convert("RGB")
        if max(img.size) > 2048:
            img = img.resize((2048, 2048), Image.BILINEAR)
        if img.size != (1024, 1024):
            img = img.resize((1024, 1024), Image.LANCZOS)
        dst = os.path.join(OUT, "minimaps", f"{map_id}.webp")
        img.save(dst, "WEBP", quality=82, method=6)
        minimap_meta[map_id] = {
            "file": f"minimaps/{map_id}.webp",
            "src_bytes": os.path.getsize(src),
            "out_bytes": os.path.getsize(dst),
        }
        print(f"minimap {map_id}: {os.path.getsize(src)//1024} KB -> "
              f"{os.path.getsize(dst)//1024} KB")

    # --- manifest ---------------------------------------------------------
    manifest = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "maps": sorted({r["map_id"] for r in manifest_matches}),
        "dates": sorted({r["date"] for r in manifest_matches}),
        "map_config": MAP_CONFIG,
        "minimaps": minimap_meta,
        "heatmap_grid": HEATMAP_GRID,
        "ts_scale": TS_SCALE,
        "counts": {
            "files_total": n_files,
            "files_ok": n_files - len(skipped),
            "files_skipped": len(skipped),
            "matches": len(manifest_matches),
            "players": int(df.src_uid.nunique()),
            "humans": int(df[df.is_human].src_uid.nunique()),
            "bots": int(df[~df.is_human].src_uid.nunique()),
            "event_rows": int(len(df)),
        },
        "matches": manifest_matches,
    }
    with open(os.path.join(DATA_OUT, "manifest.json"), "w") as fh:
        json.dump(manifest, fh, separators=(",", ":"))

    # --- logs ------------------------------------------------------------
    with open(os.path.join(VERIFY, "skipped.txt"), "w") as fh:
        for p, why in skipped:
            fh.write(f"{p}\t{why}\n")

    print(json.dumps(manifest["counts"], indent=2))
    print(f"skipped {len(skipped)} files (see {VERIFY}/skipped.txt)")
    print(f"wrote {len(manifest_matches)} match files to {DATA_OUT}/matches/")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        sys.exit(1)
