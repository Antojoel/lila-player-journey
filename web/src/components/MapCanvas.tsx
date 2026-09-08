import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  drawHeatmap,
  drawJourney,
  drawMarker,
  pickMarker,
  pickPath,
  type MarkerHit,
} from "../lib/draw";
import { EVENT_STYLE } from "../lib/palette";
import { mmss } from "../lib/format";
import type { Heatmap, HeatmapKind, MapId, MatchData, Player } from "../lib/types";

interface Props {
  mapId: MapId | null;
  minimapUrl: string | null;
  match: MatchData | null;
  mode: "journey" | "heatmap";
  heatmap: Heatmap | null;
  heatmapKind: HeatmapKind;
  heatmapDates: string[] | null;
  tMs: number;
  showHumans: boolean;
  showBots: boolean;
  colorFor: (player: Player, index: number) => string;
  labelFor: (id: string) => string;
  focusedId: string | null;
  onFocus: (id: string | null) => void;
  mapDim: number;
}

interface Tip {
  x: number;
  y: number;
  lines: { text: string; color?: string }[];
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver(() => setSize(el.clientWidth));
    ro.observe(el);
    setSize(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export function MapCanvas(props: Props) {
  const {
    mapId,
    minimapUrl,
    match,
    mode,
    heatmap,
    heatmapKind,
    heatmapDates,
    tMs,
    showHumans,
    showBots,
    colorFor,
    labelFor,
    focusedId,
    onFocus,
    mapDim,
  } = props;

  const [wrapRef, size] = useElementSize<HTMLDivElement>();
  const heatRef = useRef<HTMLCanvasElement | null>(null);
  const journeyRef = useRef<HTMLCanvasElement | null>(null);
  const markersRef = useRef<MarkerHit[]>([]);
  const [hoverMarker, setHoverMarker] = useState<MarkerHit | null>(null);
  const [hoverPlayer, setHoverPlayer] = useState<string | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  const highlightId = focusedId ?? hoverPlayer;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const setupCanvas = useCallback(
    (c: HTMLCanvasElement | null) => {
      if (!c || !size) return null;
      c.width = size * dpr;
      c.height = size * dpr;
      const ctx = c.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return ctx;
    },
    [size, dpr],
  );

  // --- heatmap layer ---
  useEffect(() => {
    const ctx = setupCanvas(heatRef.current);
    if (!ctx || !size) return;
    if (mode === "heatmap" && heatmap) {
      drawHeatmap(ctx, size, heatmap, heatmapKind, heatmapDates);
    } else {
      ctx.clearRect(0, 0, size, size);
    }
  }, [setupCanvas, size, mode, heatmap, heatmapKind, heatmapDates]);

  // --- journey layer ---
  useEffect(() => {
    const ctx = setupCanvas(journeyRef.current);
    if (!ctx || !size) return;
    if (mode === "journey" && match) {
      const { markers } = drawJourney(ctx, size, match, {
        tMs,
        showHumans,
        showBots,
        colorFor,
        hoveredPlayerId: highlightId,
      });
      markersRef.current = markers;
      if (hoverMarker) {
        drawMarker(ctx, hoverMarker.x, hoverMarker.y, hoverMarker.kind, 1, true);
      }
    } else {
      markersRef.current = [];
      ctx.clearRect(0, 0, size, size);
    }
  }, [
    setupCanvas,
    size,
    mode,
    match,
    tMs,
    showHumans,
    showBots,
    colorFor,
    highlightId,
    hoverMarker,
  ]);

  const hitTest = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const m = pickMarker(markersRef.current, mx, my);
    const p = m ? null : pickPath(match!, size, tMs, showHumans, showBots, mx, my);
    return { mx, my, m, p };
  };

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (mode !== "journey" || !match) return;
    const { mx, my, m, p } = hitTest(e);

    if (m) {
      setHoverMarker(m);
      setHoverPlayer(m.playerId);
      setTip({
        x: mx,
        y: my,
        lines: [
          { text: EVENT_STYLE[m.kind].label, color: EVENT_STYLE[m.kind].color },
          { text: labelFor(m.playerId) },
          { text: `at ${mmss(m.t)}` },
        ],
      });
      return;
    }

    setHoverMarker(null);
    if (p) {
      setHoverPlayer(p.playerId);
      setTip({
        x: mx,
        y: my,
        lines: [
          { text: labelFor(p.playerId) },
          { text: `${p.eventCount} event${p.eventCount === 1 ? "" : "s"} on route` },
          { text: "click to isolate" },
        ],
      });
    } else {
      setHoverPlayer(null);
      setTip(null);
    }
  };

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (mode !== "journey" || !match) return;
    const { m, p } = hitTest(e);
    const id = m?.playerId ?? p?.playerId ?? null;
    onFocus(id); // App toggles: same id clears, null clears
  };

  const onLeave = () => {
    setHoverMarker(null);
    setHoverPlayer(null);
    setTip(null);
  };

  const showEmpty = mode === "journey" && !match;

  return (
    <div className="map-stage">
      <div
        className={`map-wrap${mode === "journey" && match ? " interactive" : ""}`}
        ref={wrapRef}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        onClick={onClick}
      >
        {mapId && minimapUrl ? (
          <img
            className="map-img"
            src={minimapUrl}
            alt={`${mapId} minimap`}
            draggable={false}
          />
        ) : (
          <div className="map-grid" />
        )}
        <div className="map-dim" style={{ opacity: mapDim }} />
        <canvas className="map-layer" ref={heatRef} />
        <canvas className="map-layer" ref={journeyRef} />

        {focusedId && match && (
          <button
            className="focus-chip"
            onClick={(e) => {
              e.stopPropagation();
              onFocus(null);
            }}
          >
            Isolated: {labelFor(focusedId)} &nbsp;✕
          </button>
        )}

        {showEmpty && (
          <div className="map-note">
            Pick a match on the left — or a quick pick — to trace its player journeys.
          </div>
        )}
        {mode === "heatmap" && heatmap && heatmapDates?.length === 0 && (
          <div className="map-note">No events on the selected date.</div>
        )}

        {tip && (
          <div
            className="tooltip"
            style={{
              left: Math.min(tip.x + 14, size - 150),
              top: Math.max(tip.y - 10, 6),
            }}
          >
            {tip.lines.map((l, i) => (
              <div key={i} style={l.color ? { color: l.color } : undefined}>
                {l.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
