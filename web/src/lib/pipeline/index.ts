import type { Dataset } from "../datasets";
import type { MapId } from "../types";
import { downscaleMinimap } from "./minimaps";
import { runPipeline } from "./runPipeline";
import { unzip } from "./unzip";

export type Progress = (msg: string, frac: number) => void;

/** Unzip -> analyze -> re-encode minimaps. One uploaded zip -> one Dataset. */
export async function processZip(file: File, onProgress: Progress): Promise<Dataset> {
  onProgress("Unzipping…", 0.02);
  const { files, minimaps: rawMinimaps } = await unzip(file);

  const { manifest, matches, heatmaps, warnings } = await runPipeline(
    files,
    (msg, frac) => onProgress(msg, 0.05 + frac * 0.85),
  );

  onProgress("Re-encoding minimaps…", 0.92);
  const minimaps = new Map<MapId, Blob>();
  for (const [map, blob] of rawMinimaps) {
    try {
      minimaps.set(map, await downscaleMinimap(blob));
    } catch (e) {
      warnings.push(`Minimap ${map} could not be processed: ${String(e)}`);
    }
  }
  for (const map of manifest.maps) {
    if (!minimaps.has(map)) {
      warnings.push(
        `No minimap for ${map} in this zip — its journeys render on a plain grid.`,
      );
    }
  }

  onProgress("Done", 1);
  const label = file.name.replace(/\.zip$/i, "") || "upload";
  return {
    id: `${label}-${file.size}-${manifest.counts.event_rows}`,
    label,
    createdAt: Date.now(),
    manifest,
    matches,
    heatmaps,
    minimaps,
    warnings,
  };
}
