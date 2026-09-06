export type MapId = "AmbroseValley" | "GrandRift" | "Lockdown";
export type EventKind = "kill" | "death" | "storm_death" | "loot";

export interface MapConfig {
  scale: number;
  origin_x: number;
  origin_z: number;
}

export interface ManifestMatch {
  match_id: string;
  map_id: MapId;
  date: string; // YYYY-MM-DD
  duration_ms: number;
  human_count: number;
  bot_count: number;
  event_counts: Record<"kill" | "death" | "storm_death" | "loot", number>;
}

export interface Manifest {
  generated_at: string;
  maps: MapId[];
  dates: string[];
  map_config: Record<MapId, MapConfig>;
  minimaps: Record<MapId, { file: string; src_bytes: number; out_bytes: number }>;
  heatmap_grid: number;
  ts_scale: number;
  counts: {
    files_total: number;
    files_ok: number;
    files_skipped: number;
    matches: number;
    players: number;
    humans: number;
    bots: number;
    event_rows: number;
  };
  matches: ManifestMatch[];
}

/** A path point: [pixelX, pixelY, tMs] in 1024-space, tMs from match start. */
export type PathPoint = [number, number, number];

export interface PlayerEvent {
  k: EventKind;
  px: number;
  py: number;
  t: number;
}

export interface Player {
  id: string;
  human: boolean;
  path: PathPoint[];
  events: PlayerEvent[];
}

export interface MatchData {
  match_id: string;
  map_id: MapId;
  date: string;
  duration_ms: number;
  human_count: number;
  bot_count: number;
  event_counts: ManifestMatch["event_counts"];
  players: Player[];
}

export type HeatmapKind = "traffic" | "kill" | "death";

export interface Heatmap {
  map_id: MapId;
  kind: HeatmapKind;
  grid: number;
  image_size: number;
  note: string;
  /** date -> list of [cellIndex, count]; cellIndex = row*grid + col. */
  dates: Record<string, [number, number][]>;
}
