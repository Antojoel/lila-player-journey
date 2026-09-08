// Mirror of pipeline/lib.py — keep the two in sync (there is a parity check in
// ARCHITECTURE.md). These are the only place map math / classification lives.
import type { EventKind, MapId } from "../types";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MapCfg {
  scale: number;
  origin_x: number;
  origin_z: number;
}

export const MAP_CONFIG: Record<MapId, MapCfg> = {
  AmbroseValley: { scale: 900, origin_x: -370, origin_z: -473 },
  GrandRift: { scale: 581, origin_x: -290, origin_z: -290 },
  Lockdown: { scale: 1000, origin_x: -500, origin_z: -500 },
};

export const IMG_SIZE = 1024;
export const HEATMAP_GRID = 96;

// ts in the parquet is real epoch-milliseconds ÷ 1000 (seconds in an ms field).
export const TS_SCALE = 1000;

export const EVENT_KINDS: Record<string, EventKind | "move"> = {
  Position: "move",
  BotPosition: "move",
  Kill: "kill",
  BotKill: "kill",
  Killed: "death",
  BotKilled: "death",
  KilledByStorm: "storm_death",
  Loot: "loot",
};

export const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

export function isHuman(userId: string): boolean {
  return UUID_RE.test(userId);
}

export function worldToPixel(x: number, z: number, mapId: MapId): [number, number] {
  const c = MAP_CONFIG[mapId];
  const u = (x - c.origin_x) / c.scale;
  const v = (z - c.origin_z) / c.scale;
  return [u * IMG_SIZE, (1 - v) * IMG_SIZE];
}

/** `February_10` -> `2026-02-10`; unparseable names pass through unchanged. */
export function folderDate(day: string, year = 2026): string {
  const [mon, dd] = day.split("_");
  const m = MONTHS[(mon ?? "").toLowerCase()];
  if (m && /^\d+$/.test(dd ?? "")) {
    return `${year}-${String(m).padStart(2, "0")}-${String(+dd).padStart(2, "0")}`;
  }
  return day;
}
