import type { Heatmap, Manifest, MatchData, HeatmapKind, MapId } from "./types";

// All data is static JSON under /data, emitted by the Python pipeline.
// Vite's BASE_URL keeps this correct whether deployed at a domain root or a sub-path.
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const DATA = `${BASE}/data`;

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json() as Promise<T>;
}

let manifestPromise: Promise<Manifest> | null = null;
export function loadManifest(): Promise<Manifest> {
  if (!manifestPromise) manifestPromise = getJSON<Manifest>(`${DATA}/manifest.json`);
  return manifestPromise;
}

const matchCache = new Map<string, Promise<MatchData>>();
export function loadMatch(matchId: string): Promise<MatchData> {
  let p = matchCache.get(matchId);
  if (!p) {
    p = getJSON<MatchData>(`${DATA}/matches/${matchId}.json`);
    matchCache.set(matchId, p);
  }
  return p;
}

const heatmapCache = new Map<string, Promise<Heatmap>>();
export function loadHeatmap(mapId: MapId, kind: HeatmapKind): Promise<Heatmap> {
  const key = `${mapId}_${kind}`;
  let p = heatmapCache.get(key);
  if (!p) {
    p = getJSON<Heatmap>(`${DATA}/heatmaps/${key}.json`);
    heatmapCache.set(key, p);
  }
  return p;
}

export function minimapURL(mapId: MapId): string {
  return `${BASE}/minimaps/${mapId}.webp`;
}
