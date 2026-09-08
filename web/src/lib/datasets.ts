import { openDB, type DBSchema } from "idb";
import type { Heatmap, Manifest, MapId, MatchData } from "./types";
import { HEATMAP_GRID, MAP_CONFIG, TS_SCALE } from "./pipeline/constants";

export interface Dataset {
  id: string;
  label: string;
  createdAt: number;
  manifest: Manifest;
  matches: Map<string, MatchData>;
  heatmaps: Map<string, Heatmap>;
  minimaps: Map<MapId, Blob>;
  warnings: string[];
}

interface Stored {
  id: string;
  label: string;
  createdAt: number;
  manifest: Manifest;
  matches: Record<string, MatchData>;
  heatmaps: Record<string, Heatmap>;
  minimaps: Record<string, Blob>;
  warnings: string[];
}

interface Schema extends DBSchema {
  datasets: { key: string; value: Stored };
}

const DB = "lila-datasets";
const dbp = openDB<Schema>(DB, 1, {
  upgrade(db) {
    db.createObjectStore("datasets", { keyPath: "id" });
  },
});

const toStored = (d: Dataset): Stored => ({
  id: d.id,
  label: d.label,
  createdAt: d.createdAt,
  manifest: d.manifest,
  matches: Object.fromEntries(d.matches),
  heatmaps: Object.fromEntries(d.heatmaps),
  minimaps: Object.fromEntries(d.minimaps),
  warnings: d.warnings,
});

const fromStored = (s: Stored): Dataset => ({
  id: s.id,
  label: s.label,
  createdAt: s.createdAt,
  manifest: s.manifest,
  matches: new Map(Object.entries(s.matches)),
  heatmaps: new Map(Object.entries(s.heatmaps)),
  minimaps: new Map(Object.entries(s.minimaps) as [MapId, Blob][]),
  warnings: s.warnings,
});

export async function saveDataset(d: Dataset): Promise<void> {
  (await dbp).put("datasets", toStored(d));
}

export async function loadDatasets(): Promise<Dataset[]> {
  const all = await (await dbp).getAll("datasets");
  return all.sort((a, b) => a.createdAt - b.createdAt).map(fromStored);
}

export async function deleteDataset(id: string): Promise<void> {
  (await dbp).delete("datasets", id);
}

export async function clearDatasets(): Promise<void> {
  (await dbp).clear("datasets");
}

/** Merge several datasets into one synthetic "Combined" view. */
export function combineDatasets(list: Dataset[]): Dataset {
  const matches = new Map<string, MatchData>();
  const minimaps = new Map<MapId, Blob>();
  for (const d of list) {
    for (const [k, v] of d.matches) matches.set(k, v);
    for (const [k, v] of d.minimaps) if (!minimaps.has(k)) minimaps.set(k, v);
  }

  const heatmaps = new Map<string, Heatmap>();
  for (const d of list) {
    for (const [key, hm] of d.heatmaps) {
      const cur = heatmaps.get(key);
      if (!cur) {
        heatmaps.set(key, {
          ...hm,
          dates: Object.fromEntries(
            Object.entries(hm.dates).map(([k, v]) => [k, v.map((p) => [...p])]),
          ),
        });
        continue;
      }
      for (const [dk, cells] of Object.entries(hm.dates)) {
        const acc = new Map<number, number>(
          (cur.dates[dk] ?? []).map((p) => [p[0], p[1]]),
        );
        for (const [i, n] of cells) acc.set(i, (acc.get(i) ?? 0) + n);
        cur.dates[dk] = [...acc.entries()].sort((a, b) => a[0] - b[0]);
      }
    }
  }

  const mList = [...matches.values()].map((m) => ({
    match_id: m.match_id,
    map_id: m.map_id,
    date: m.date,
    duration_ms: m.duration_ms,
    human_count: m.human_count,
    bot_count: m.bot_count,
    event_counts: m.event_counts,
  }));
  mList.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.map_id.localeCompare(b.map_id) ||
      a.match_id.localeCompare(b.match_id),
  );

  const sum = (f: (c: Manifest["counts"]) => number) =>
    list.reduce((t, d) => t + f(d.manifest.counts), 0);

  const manifest: Manifest = {
    generated_at: new Date().toISOString(),
    maps: [...new Set(mList.map((m) => m.map_id))].sort() as MapId[],
    dates: [...new Set(mList.map((m) => m.date))].sort(),
    map_config: MAP_CONFIG,
    minimaps: {} as Manifest["minimaps"],
    heatmap_grid: HEATMAP_GRID,
    ts_scale: TS_SCALE,
    counts: {
      files_total: sum((c) => c.files_total),
      files_ok: sum((c) => c.files_ok),
      files_skipped: sum((c) => c.files_skipped),
      matches: mList.length,
      players: sum((c) => c.players),
      humans: sum((c) => c.humans),
      bots: sum((c) => c.bots),
      event_rows: sum((c) => c.event_rows),
    },
    matches: mList,
  };

  return {
    id: "__combined__",
    label: `Combined (${list.length})`,
    createdAt: 0,
    manifest,
    matches,
    heatmaps,
    minimaps,
    warnings: [],
  };
}
