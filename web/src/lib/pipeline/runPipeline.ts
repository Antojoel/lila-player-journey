import { getDuckDB } from "./duckdb";
import {
  EVENT_KINDS,
  HEATMAP_GRID,
  MAP_CONFIG,
  TS_SCALE,
  folderDate,
  isHuman,
  worldToPixel,
} from "./constants";
import type {
  EventKind,
  Heatmap,
  Manifest,
  ManifestMatch,
  MapId,
  MatchData,
  Player,
} from "../types";

export interface RawFile {
  /** Path inside the zip, e.g. "February_10/uuid_uuid.nakama-0". */
  path: string;
  buf: ArrayBuffer;
}

export interface PipelineResult {
  manifest: Manifest;
  matches: Map<string, MatchData>;
  heatmaps: Map<string, Heatmap>;
  warnings: string[];
}

const SELECT = (list: string) =>
  `SELECT user_id, CAST(match_id AS VARCHAR) AS match_id_col, map_id, x, z,
          epoch_ms(ts) AS ts_ms, CAST(event AS VARCHAR) AS event, filename
   FROM read_parquet([${list}], filename=true)`;

interface Row {
  user_id: string;
  match_id_col: string;
  map_id: string;
  x: number;
  z: number;
  ts_ms: number;
  event: string;
  filename: string;
}

function parsePath(p: string) {
  const parts = p.split("/");
  const base = parts[parts.length - 1].replace(/\.nakama-0$/, "");
  const day = parts.length > 1 ? parts[parts.length - 2] : "";
  const us = base.indexOf("_");
  return { day, uid: base.slice(0, us), mid: base.slice(us + 1) };
}

export async function runPipeline(
  files: RawFile[],
  onProgress?: (msg: string, frac: number) => void,
): Promise<PipelineResult> {
  const warnings: string[] = [];
  const nak = files.filter((f) => f.path.endsWith(".nakama-0"));
  if (nak.length === 0) throw new Error("No .nakama-0 files found in the archive.");

  const db = await getDuckDB();
  const conn = await db.connect();
  onProgress?.("Reading Parquet files…", 0.1);

  // Register each buffer under a simple name; keep the real path in JS.
  const meta = new Map<string, { day: string; uid: string; mid: string }>();
  const names: string[] = [];
  for (let i = 0; i < nak.length; i++) {
    const name = `f${i}.parquet`;
    await db.registerFileBuffer(name, new Uint8Array(nak[i].buf));
    names.push(name);
    meta.set(name, parsePath(nak[i].path));
  }
  const listSql = names.map((n) => `'${n}'`).join(",");

  let rows: Row[];
  try {
    const res = await conn.query(SELECT(listSql));
    rows = res.toArray().map((r) => r.toJSON() as Row);
  } catch {
    // A file has a different schema / is truncated — isolate the offenders.
    warnings.push("Bulk read failed; scanning files individually.");
    rows = [];
    for (const n of names) {
      try {
        const res = await conn.query(SELECT(`'${n}'`));
        for (const r of res.toArray()) rows.push(r.toJSON() as Row);
      } catch (e) {
        const m = meta.get(n)!;
        warnings.push(`Skipped ${m.day}/${m.uid}_${m.mid}: ${String(e)}`);
      }
    }
  }
  for (const n of names) await db.dropFile(n).catch(() => {});
  await conn.close();

  if (rows.length === 0) throw new Error("No readable rows in the archive.");

  const got = new Set(rows.map((r) => r.filename));
  for (const n of names) {
    if (!got.has(n)) {
      const m = meta.get(n)!;
      warnings.push(`Empty file: ${m.day}/${m.uid}_${m.mid}`);
    }
  }

  onProgress?.("Classifying events…", 0.55);

  // Attach per-file identity + classification.
  type Ann = Row & {
    day: string;
    uid: string;
    mid: string;
    kind: EventKind | "move" | "other";
    human: boolean;
    px: number;
    py: number;
  };
  const badMaps = new Set<string>();
  const ann: Ann[] = [];
  for (const r of rows) {
    const m = meta.get(r.filename)!;
    if (!(r.map_id in MAP_CONFIG)) {
      badMaps.add(r.map_id);
      continue;
    }
    const [px, py] = worldToPixel(r.x, r.z, r.map_id as MapId);
    ann.push({
      ...r,
      day: m.day,
      uid: m.uid,
      mid: m.mid,
      kind: EVENT_KINDS[r.event] ?? "other",
      human: isHuman(m.uid),
      px: Math.round(px * 10) / 10,
      py: Math.round(py * 10) / 10,
    });
  }
  if (badMaps.size)
    warnings.push(
      `Dropped rows on unknown map(s): ${[...badMaps].join(", ")} (no minimap / config).`,
    );

  // --- group by match ---
  onProgress?.("Building matches…", 0.7);
  const byMatch = new Map<string, Ann[]>();
  for (const a of ann) {
    let g = byMatch.get(a.mid);
    if (!g) byMatch.set(a.mid, (g = []));
    g.push(a);
  }

  const matches = new Map<string, MatchData>();
  const manifestMatches: ManifestMatch[] = [];

  for (const [mid, g] of byMatch) {
    const mapId = mode(g.map((a) => a.map_id)) as MapId;
    const day = [...new Set(g.map((a) => a.day))].sort()[0];
    const date = folderDate(day);
    const t0 = Math.min(...g.map((a) => a.ts_ms));
    for (const a of g) a.ts_ms = Math.round((a.ts_ms - t0) * TS_SCALE);
    const durationMs = Math.max(...g.map((a) => a.ts_ms));

    const evTotals = { kill: 0, death: 0, storm_death: 0, loot: 0 };
    const byPlayer = new Map<string, Ann[]>();
    for (const a of g) {
      let p = byPlayer.get(a.uid);
      if (!p) byPlayer.set(a.uid, (p = []));
      p.push(a);
    }
    const players: Player[] = [];
    for (const [uid, pg] of byPlayer) {
      pg.sort((x, y) => x.ts_ms - y.ts_ms);
      const path: [number, number, number][] = pg.map((a) => [a.px, a.py, a.ts_ms]);
      const events = [];
      for (const a of pg) {
        if (
          a.kind === "kill" ||
          a.kind === "death" ||
          a.kind === "storm_death" ||
          a.kind === "loot"
        ) {
          events.push({ k: a.kind, px: a.px, py: a.py, t: a.ts_ms });
          evTotals[a.kind]++;
        }
      }
      players.push({ id: uid, human: pg[0].human, path, events });
    }

    const humanCount = new Set(g.filter((a) => a.human).map((a) => a.uid)).size;
    const botCount = new Set(g.filter((a) => !a.human).map((a) => a.uid)).size;
    const obj: MatchData = {
      match_id: mid,
      map_id: mapId,
      date,
      duration_ms: durationMs,
      human_count: humanCount,
      bot_count: botCount,
      event_counts: evTotals,
      players,
    };
    matches.set(mid, obj);
    manifestMatches.push({
      match_id: mid,
      map_id: mapId,
      date,
      duration_ms: durationMs,
      human_count: humanCount,
      bot_count: botCount,
      event_counts: evTotals,
    });
  }

  manifestMatches.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.map_id.localeCompare(b.map_id) ||
      a.match_id.localeCompare(b.match_id),
  );

  // --- heatmaps (sparse, per collection day) ---
  onProgress?.("Binning heatmaps…", 0.88);
  const feeds: Record<string, Set<string>> = {
    traffic: new Set(["move"]),
    kill: new Set(["kill"]),
    death: new Set(["death", "storm_death"]),
  };
  const heatmaps = new Map<string, Heatmap>();
  const mapsPresent = [...new Set(ann.map((a) => a.map_id))] as MapId[];
  for (const mapId of mapsPresent) {
    const rowsForMap = ann.filter((a) => a.map_id === mapId);
    for (const kind of ["traffic", "kill", "death"] as const) {
      const wanted = feeds[kind];
      const dates: Record<string, [number, number][]> = {};
      const byDate = new Map<string, Ann[]>();
      for (const a of rowsForMap) {
        if (!wanted.has(a.kind)) continue;
        const dk = folderDate(a.day);
        let d = byDate.get(dk);
        if (!d) byDate.set(dk, (d = []));
        d.push(a);
      }
      for (const [dk, ds] of byDate) {
        const counts = new Map<number, number>();
        for (const a of ds) {
          const c = Math.min(
            HEATMAP_GRID - 1,
            Math.max(0, Math.floor((a.px / 1024) * HEATMAP_GRID)),
          );
          const rr = Math.min(
            HEATMAP_GRID - 1,
            Math.max(0, Math.floor((a.py / 1024) * HEATMAP_GRID)),
          );
          const idx = rr * HEATMAP_GRID + c;
          counts.set(idx, (counts.get(idx) ?? 0) + 1);
        }
        if (counts.size) dates[dk] = [...counts.entries()].sort((x, y) => x[0] - y[0]);
      }
      heatmaps.set(`${mapId}_${kind}`, {
        map_id: mapId,
        kind,
        grid: HEATMAP_GRID,
        image_size: 1024,
        note: "cell counts are per collection day; the client sums the selected range",
        dates,
      });
    }
  }

  const uids = new Set(ann.map((a) => a.uid));
  const humanUids = new Set(ann.filter((a) => a.human).map((a) => a.uid));
  const manifest: Manifest = {
    generated_at: new Date().toISOString(),
    maps: [...new Set(manifestMatches.map((m) => m.map_id))].sort() as MapId[],
    dates: [...new Set(manifestMatches.map((m) => m.date))].sort(),
    map_config: MAP_CONFIG,
    minimaps: {} as Manifest["minimaps"],
    heatmap_grid: HEATMAP_GRID,
    ts_scale: TS_SCALE,
    counts: {
      files_total: nak.length,
      files_ok: got.size,
      files_skipped: nak.length - got.size,
      matches: manifestMatches.length,
      players: uids.size,
      humans: humanUids.size,
      bots: uids.size - humanUids.size,
      event_rows: ann.length,
    },
    matches: manifestMatches,
  };

  onProgress?.("Done", 1);
  return { manifest, matches, heatmaps, warnings };
}

function mode<T>(arr: T[]): T {
  const c = new Map<T, number>();
  let best = arr[0];
  let bn = 0;
  for (const v of arr) {
    const n = (c.get(v) ?? 0) + 1;
    c.set(v, n);
    if (n > bn) {
      bn = n;
      best = v;
    }
  }
  return best;
}
