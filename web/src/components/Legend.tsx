import { EVENT_STYLE, HEATMAP_RAMP, rampColor } from "../lib/palette";
import type { EventKind, HeatmapKind } from "../lib/types";

const EVENT_ORDER: EventKind[] = ["kill", "death", "storm_death", "loot"];

function Glyph({ kind }: { kind: EventKind }) {
  const c = EVENT_STYLE[kind].color;
  const common = { stroke: c, strokeWidth: 2, fill: "none" } as const;
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <circle cx="9" cy="9" r="6.5" fill="#0b0e12" stroke={c} strokeWidth="2" />
      {kind === "kill" && (
        <g {...common}>
          <line x1="9" y1="3.5" x2="9" y2="14.5" />
          <line x1="4" y1="6.25" x2="14" y2="11.75" />
          <line x1="14" y1="6.25" x2="4" y2="11.75" />
        </g>
      )}
      {kind === "death" && (
        <g {...common}>
          <line x1="5.5" y1="5.5" x2="12.5" y2="12.5" />
          <line x1="12.5" y1="5.5" x2="5.5" y2="12.5" />
        </g>
      )}
      {kind === "storm_death" && (
        <g {...common}>
          <path d="M9 3.5 L14 9 L9 14.5 L4 9 Z" />
          <circle cx="9" cy="9" r="1.4" fill={c} />
        </g>
      )}
      {kind === "loot" && <path d="M9 3.5 L14 9 L9 14.5 L4 9 Z" fill={c} />}
    </svg>
  );
}

export function Legend({
  mode,
  heatmapKind,
}: {
  mode: "journey" | "heatmap";
  heatmapKind: HeatmapKind;
}) {
  return (
    <div className="legend">
      <h3>Legend</h3>

      {mode === "journey" ? (
        <>
          <div className="legend-row">
            <svg width="34" height="14" aria-hidden>
              <line x1="1" y1="7" x2="33" y2="7" stroke="#f5c518" strokeWidth="2.6" />
            </svg>
            <span>Human player — solid, one colour each</span>
          </div>
          <div className="legend-row">
            <svg width="34" height="14" aria-hidden>
              <line
                x1="1" y1="7" x2="33" y2="7"
                stroke="#8fa9cc" strokeWidth="2" strokeDasharray="5 5"
              />
            </svg>
            <span>Bot — dashed, muted grey</span>
          </div>
          <div className="legend-row">
            <svg width="34" height="14" aria-hidden>
              <circle cx="17" cy="7" r="4" fill="#f5c518" />
            </svg>
            <span>Filled dot = position at current time</span>
          </div>
          <div className="legend-sep" />
          {EVENT_ORDER.map((k) => (
            <div className="legend-row" key={k}>
              <Glyph kind={k} />
              <span>{EVENT_STYLE[k].label}</span>
            </div>
          ))}
        </>
      ) : (
        <>
          <div className="legend-row">
            <RampBar kind={heatmapKind} />
          </div>
          <div className="legend-scale muted">
            <span>low</span>
            <span>high</span>
          </div>
          <p className="legend-note muted">
            {heatmapKind === "traffic" && "Density of position samples — where players spend time."}
            {heatmapKind === "kill" && "Where the killing player was standing."}
            {heatmapKind === "death" && "Where players died, including storm deaths."}
          </p>
        </>
      )}
    </div>
  );
}

function RampBar({ kind }: { kind: HeatmapKind }) {
  const stops = Array.from({ length: 24 }, (_, i) => {
    const [r, g, b] = rampColor(HEATMAP_RAMP[kind], i / 23);
    return `rgb(${r},${g},${b}) ${(i / 23) * 100}%`;
  });
  return (
    <div
      className="ramp-bar"
      style={{ background: `linear-gradient(90deg, ${stops.join(",")})` }}
    />
  );
}
