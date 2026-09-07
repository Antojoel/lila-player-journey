import { EVENT_STYLE } from "../lib/palette";
import { mmss } from "../lib/format";
import type { Playback } from "../hooks/usePlayback";
import type { EventKind } from "../lib/types";

interface Props {
  duration: number;
  playback: Playback;
  events: { t: number; k: EventKind }[]; // sorted by t
}

const SPEEDS = [10, 30, 60, 120];

export function Timeline({ duration, playback, events }: Props) {
  const { t, playing, speed, toggle, seek, setSpeed } = playback;
  const pct = duration > 0 ? (t / duration) * 100 : 0;
  const disabled = duration === 0;

  const nextEvent = events.find((e) => e.t > t + 1)?.t;
  const prevEvent = [...events].reverse().find((e) => e.t < t - 1)?.t;

  return (
    <div className="timeline">
      <div className="tl-transport">
        <button
          className="tl-step"
          onClick={() => prevEvent != null && seek(prevEvent)}
          disabled={prevEvent == null}
          aria-label="Previous event"
          title="Jump to previous event"
        >
          ⏮
        </button>
        <button
          className="play-btn"
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
          title={playing ? "Pause (Space)" : "Play (Space)"}
          disabled={disabled}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <button
          className="tl-step"
          onClick={() => nextEvent != null && seek(nextEvent)}
          disabled={nextEvent == null}
          aria-label="Next event"
          title="Jump to next event"
        >
          ⏭
        </button>
      </div>

      <div className="scrub">
        <div className="scrub-track">
          <div className="scrub-fill" style={{ width: `${pct}%` }} />
          {events.map((e, i) => (
            <span
              key={i}
              className="scrub-tick"
              title={`${EVENT_STYLE[e.k].label} · ${mmss(e.t)}`}
              style={{
                left: `${duration > 0 ? (e.t / duration) * 100 : 0}%`,
                background: EVENT_STYLE[e.k].color,
              }}
            />
          ))}
          <input
            type="range"
            min={0}
            max={Math.max(1, duration)}
            step={1000}
            value={Math.round(t)}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Match time"
          />
        </div>
        <div className="scrub-time">
          <span>{mmss(t)}</span>
          <span className="muted">
            {events.length} event{events.length === 1 ? "" : "s"} · space = play
          </span>
          <span className="muted">{mmss(duration)}</span>
        </div>
      </div>

      <label className="speed">
        <span className="muted">speed</span>
        <select
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          disabled={disabled}
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
