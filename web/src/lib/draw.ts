import { BOT_COLOR, EVENT_STYLE, HEATMAP_RAMP, rampColor } from "./palette";
import type { EventKind, Heatmap, HeatmapKind, MatchData, Player } from "./types";

const SRC = 1024; // pixel space the pipeline emits coords in

export interface MarkerHit {
  x: number;
  y: number;
  r: number;
  kind: EventKind;
  playerId: string;
  human: boolean;
  t: number;
}

export interface PathHit {
  playerId: string;
  human: boolean;
  eventCount: number;
}

export interface JourneyResult {
  markers: MarkerHit[];
}

interface JourneyOpts {
  tMs: number;
  showHumans: boolean;
  showBots: boolean;
  colorFor: (player: Player, index: number) => string;
  hoveredPlayerId: string | null;
}

function visibleUpTo(player: Player, tMs: number) {
  const pts = player.path;
  let i = pts.length;
  while (i > 0 && pts[i - 1][2] > tMs) i--;
  return pts.slice(0, i);
}

export function drawJourney(
  ctx: CanvasRenderingContext2D,
  size: number,
  match: MatchData,
  opts: JourneyOpts,
): JourneyResult {
  const k = size / SRC;
  const markers: MarkerHit[] = [];
  ctx.clearRect(0, 0, size, size);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const anyHover = opts.hoveredPlayerId != null;

  match.players.forEach((player, idx) => {
    if (player.human && !opts.showHumans) return;
    if (!player.human && !opts.showBots) return;

    const color = player.human ? opts.colorFor(player, idx) : BOT_COLOR;
    const isHover = opts.hoveredPlayerId === player.id;
    const dim = anyHover && !isHover;
    const pts = visibleUpTo(player, opts.tMs);
    if (pts.length === 0) return;

    // --- path line ---
    ctx.save();
    ctx.globalAlpha = dim ? 0.12 : player.human ? 0.95 : isHover ? 0.95 : 0.72;
    ctx.strokeStyle = color;
    ctx.lineWidth = player.human ? (isHover ? 3.5 : 2.4) : isHover ? 2.4 : 1.7;
    ctx.setLineDash(player.human ? [] : [5, 5]);
    ctx.beginPath();
    ctx.moveTo(pts[0][0] * k, pts[0][1] * k);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * k, pts[i][1] * k);
    ctx.stroke();
    ctx.restore();

    // --- start node ---
    const s = pts[0];
    ctx.save();
    ctx.globalAlpha = dim ? 0.15 : 0.9;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(s[0] * k, s[1] * k, 3.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // --- current-position head ---
    const h = pts[pts.length - 1];
    ctx.save();
    ctx.globalAlpha = dim ? 0.2 : 1;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = dim ? 0 : 8;
    ctx.beginPath();
    ctx.arc(h[0] * k, h[1] * k, player.human ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // --- event markers ---
    for (const ev of player.events) {
      if (ev.t > opts.tMs) continue;
      const x = ev.px * k;
      const y = ev.py * k;
      markers.push({
        x,
        y,
        r: 8,
        kind: ev.k,
        playerId: player.id,
        human: player.human,
        t: ev.t,
      });
      drawMarker(ctx, x, y, ev.k, dim ? 0.25 : 1, false);
    }
  });

  return { markers };
}

export function drawMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  kind: EventKind,
  alpha: number,
  hovered: boolean,
) {
  const style = EVENT_STYLE[kind];
  const r = hovered ? 9 : 6;
  ctx.save();
  ctx.globalAlpha = alpha;

  if (hovered) {
    ctx.strokeStyle = style.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r + 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = "#0b0e12";
  ctx.strokeStyle = style.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = style.color;
  ctx.strokeStyle = style.color;
  ctx.lineWidth = 1.8;
  const d = r - 1.5;
  switch (kind) {
    case "kill": // asterisk / spark
      for (let a = 0; a < Math.PI; a += Math.PI / 3) {
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(a) * d, y - Math.sin(a) * d);
        ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
        ctx.stroke();
      }
      break;
    case "death": // X
      ctx.beginPath();
      ctx.moveTo(x - d, y - d);
      ctx.lineTo(x + d, y + d);
      ctx.moveTo(x + d, y - d);
      ctx.lineTo(x - d, y + d);
      ctx.stroke();
      break;
    case "storm_death": // diamond ring + dot
      ctx.beginPath();
      ctx.moveTo(x, y - d);
      ctx.lineTo(x + d, y);
      ctx.lineTo(x, y + d);
      ctx.lineTo(x - d, y);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "loot": // filled diamond
      ctx.beginPath();
      ctx.moveTo(x, y - d);
      ctx.lineTo(x + d, y);
      ctx.lineTo(x, y + d);
      ctx.lineTo(x - d, y);
      ctx.closePath();
      ctx.fill();
      break;
  }
  ctx.restore();
}

/** Nearest marker within tolerance of (mx,my), or null. */
export function pickMarker(
  markers: MarkerHit[],
  mx: number,
  my: number,
): MarkerHit | null {
  let best: MarkerHit | null = null;
  let bestD = Infinity;
  for (const m of markers) {
    const d = Math.hypot(m.x - mx, m.y - my);
    if (d <= m.r + 5 && d < bestD) {
      best = m;
      bestD = d;
    }
  }
  return best;
}

/** Player whose visible path passes closest to the cursor, within tolerance. */
export function pickPath(
  match: MatchData,
  size: number,
  tMs: number,
  showHumans: boolean,
  showBots: boolean,
  mx: number,
  my: number,
): PathHit | null {
  const k = size / SRC;
  const tol = 6;
  let best: PathHit | null = null;
  let bestD = tol;
  for (const p of match.players) {
    if (p.human && !showHumans) continue;
    if (!p.human && !showBots) continue;
    const pts = visibleUpTo(p, tMs);
    for (let i = 1; i < pts.length; i++) {
      const d = distToSeg(
        mx,
        my,
        pts[i - 1][0] * k,
        pts[i - 1][1] * k,
        pts[i][0] * k,
        pts[i][1] * k,
      );
      if (d < bestD) {
        bestD = d;
        best = { playerId: p.id, human: p.human, eventCount: p.events.length };
      }
    }
  }
  return best;
}

function distToSeg(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// --- heatmap ---------------------------------------------------------------

export function sumHeatmap(
  hm: Heatmap,
  dates: string[] | null,
): {
  cells: Float64Array;
  max: number;
} {
  const n = hm.grid * hm.grid;
  const cells = new Float64Array(n);
  const keys = dates ?? Object.keys(hm.dates);
  for (const d of keys) {
    const rows = hm.dates[d];
    if (!rows) continue;
    for (const [idx, c] of rows) cells[idx] += c;
  }
  let max = 0;
  for (let i = 0; i < n; i++) if (cells[i] > max) max = cells[i];
  return { cells, max };
}

export function drawHeatmap(
  ctx: CanvasRenderingContext2D,
  size: number,
  hm: Heatmap,
  kind: HeatmapKind,
  dates: string[] | null,
) {
  ctx.clearRect(0, 0, size, size);
  const { cells, max } = sumHeatmap(hm, dates);
  if (max === 0) return;

  const g = hm.grid;
  const off = document.createElement("canvas");
  off.width = g;
  off.height = g;
  const octx = off.getContext("2d")!;
  const img = octx.createImageData(g, g);
  const ramp = HEATMAP_RAMP[kind];

  for (let i = 0; i < g * g; i++) {
    const v = cells[i];
    if (v <= 0) continue;
    // sqrt keeps low-traffic areas visible against a few hot cells
    const t = Math.sqrt(v / max);
    const [r, gr, b] = rampColor(ramp, t);
    const o = i * 4;
    img.data[o] = r;
    img.data[o + 1] = gr;
    img.data[o + 2] = b;
    img.data[o + 3] = Math.round(40 + 205 * t);
  }
  octx.putImageData(img, 0, 0);

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.globalAlpha = 0.82;
  ctx.globalCompositeOperation = "screen";
  ctx.drawImage(off, 0, 0, g, g, 0, 0, size, size);
  ctx.restore();
}
