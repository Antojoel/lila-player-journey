import type { Dataset } from "./datasets";
import type { Heatmap, Manifest, MapId, MatchData } from "./types";

// Optional: if web/public/data exists (someone ran the Python/Docker pipeline, or
// a deploy shipped with data), load it as a read-only dataset. Absent by default
// — the app is upload-driven.
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json() as Promise<T>;
}

export async function tryLoadBundled(): Promise<Dataset | null> {
  let manifest: Manifest;
  try {
    manifest = await json<Manifest>(`${BASE}/data/manifest.json`);
  } catch {
    return null; // no bundled data — normal
  }

  const matches = new Map<string, MatchData>();
  await Promise.all(
    manifest.matches.map(async (m) => {
      matches.set(
        m.match_id,
        await json<MatchData>(`${BASE}/data/matches/${m.match_id}.json`),
      );
    }),
  );

  const heatmaps = new Map<string, Heatmap>();
  await Promise.all(
    manifest.maps.flatMap((map) =>
      (["traffic", "kill", "death"] as const).map(async (kind) => {
        try {
          heatmaps.set(
            `${map}_${kind}`,
            await json<Heatmap>(`${BASE}/data/heatmaps/${map}_${kind}.json`),
          );
        } catch {
          /* a map may lack a kind */
        }
      }),
    ),
  );

  const minimaps = new Map<MapId, Blob>();
  await Promise.all(
    manifest.maps.map(async (map) => {
      try {
        const r = await fetch(`${BASE}/minimaps/${map}.webp`);
        if (r.ok) minimaps.set(map, await r.blob());
      } catch {
        /* fall back to plain grid */
      }
    }),
  );

  return {
    id: "__bundled__",
    label: "Bundled dataset",
    createdAt: 0,
    manifest,
    matches,
    heatmaps,
    minimaps,
    warnings: [],
  };
}
