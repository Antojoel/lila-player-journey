import JSZip from "jszip";
import type { MapId } from "../types";
import type { RawFile } from "./runPipeline";

const MAP_MATCH: [RegExp, MapId][] = [
  [/ambrose/i, "AmbroseValley"],
  [/grand ?rift/i, "GrandRift"],
  [/lockdown/i, "Lockdown"],
];

export interface Unzipped {
  files: RawFile[];
  minimaps: Map<MapId, Blob>;
}

/** Pull the .nakama-0 files and any minimaps/ images out of an uploaded zip. */
export async function unzip(file: File): Promise<Unzipped> {
  const zip = await JSZip.loadAsync(file);
  const files: RawFile[] = [];
  const minimaps = new Map<MapId, Blob>();

  const entries = Object.values(zip.files).filter((e) => !e.dir);
  for (const e of entries) {
    if (e.name.endsWith(".nakama-0")) {
      files.push({ path: e.name, buf: await e.async("arraybuffer") });
    } else if (/minimap/i.test(e.name) && /\.(png|jpe?g|webp)$/i.test(e.name)) {
      const hit = MAP_MATCH.find(([re]) => re.test(e.name));
      if (hit && !minimaps.has(hit[1])) {
        minimaps.set(hit[1], await e.async("blob"));
      }
    }
  }
  return { files, minimaps };
}
