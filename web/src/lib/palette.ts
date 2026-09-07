import type { EventKind, HeatmapKind } from "./types";

/** Vivid, mutually distinct hues for human players (readable on a dark map). */
export const HUMAN_COLORS = [
  "#f5c518",
  "#4ea1ff",
  "#ff6b6b",
  "#46d39a",
  "#c78bff",
  "#ff9f45",
  "#38d0e0",
  "#ff7ac6",
  "#a3e635",
  "#9aa7ff",
];

/** All bots share one cool slate colour + a dashed stroke, so humans always read
 * first while bot routes stay legible against the satellite map. */
export const BOT_COLOR = "#8fa9cc";

export function humanColor(index: number): string {
  return HUMAN_COLORS[index % HUMAN_COLORS.length];
}

export const EVENT_STYLE: Record<
  EventKind,
  { color: string; label: string; glyph: string }
> = {
  kill: { color: "#ff5c5c", label: "Kill (this player got the kill)", glyph: "✦" },
  death: { color: "#e2e8f0", label: "Death (this player was killed)", glyph: "✕" },
  storm_death: { color: "#a970ff", label: "Storm death", glyph: "❃" },
  loot: { color: "#f5c518", label: "Loot pickup", glyph: "◆" },
};

/** Colour ramps for heatmap intensity, low -> high. */
export const HEATMAP_RAMP: Record<HeatmapKind, [number, number, number][]> = {
  traffic: [
    [12, 74, 110],
    [0, 180, 200],
    [120, 230, 120],
    [245, 220, 60],
  ],
  kill: [
    [60, 20, 20],
    [200, 90, 40],
    [255, 60, 60],
    [255, 210, 120],
  ],
  death: [
    [24, 40, 80],
    [70, 120, 230],
    [150, 100, 240],
    [225, 180, 255],
  ],
};

export function rampColor(
  ramp: [number, number, number][],
  t: number,
): [number, number, number] {
  const x = Math.max(0, Math.min(1, t)) * (ramp.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  if (i >= ramp.length - 1) return ramp[ramp.length - 1];
  const a = ramp[i];
  const b = ramp[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}
