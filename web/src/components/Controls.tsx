import { useMemo, useState } from "react";
import { Legend } from "./Legend";
import { mmss, prettyDate, shortId } from "../lib/format";
import { matchActivity } from "../lib/matchStats";
import type {
  HeatmapKind,
  Manifest,
  ManifestMatch,
  MapId,
  MatchData,
} from "../lib/types";

interface Props {
  manifest: Manifest;
  mode: "journey" | "heatmap";
  setMode: (m: "journey" | "heatmap") => void;

  mapFilter: MapId | "all";
  setMapFilter: (m: MapId | "all") => void;
  dateFilter: string | "all";
  setDateFilter: (d: string | "all") => void;

  matches: ManifestMatch[];
  matchId: string | null;
  setMatchId: (id: string) => void;
  matchData: MatchData | null;
  loadingMatch: boolean;

  showHumans: boolean;
  setShowHumans: (b: boolean) => void;
  showBots: boolean;
  setShowBots: (b: boolean) => void;

  heatmapKind: HeatmapKind;
  setHeatmapKind: (k: HeatmapKind) => void;
}

export function Controls(p: Props) {
  const { manifest } = p;
  const [q, setQ] = useState("");

  const sorted = useMemo(() => {
    const list = [...p.matches];
    list.sort((a, b) => matchActivity(b) - matchActivity(a) || b.duration_ms - a.duration_ms);
    if (!q.trim()) return list;
    const needle = q.trim().toLowerCase();
    return list.filter(
      (m) =>
        m.match_id.toLowerCase().includes(needle) ||
        m.map_id.toLowerCase().includes(needle),
    );
  }, [p.matches, q]);

  const c = manifest.counts;

  return (
    <aside className="controls">
      <header className="brand">
        <div className="brand-mark">◇</div>
        <div>
          <h1>LILA BLACK</h1>
          <p>Player Journey Explorer</p>
        </div>
      </header>

      <p className="dataset-line">
        {c.matches} matches · {c.humans} players · {c.bots} bots ·{" "}
        {c.event_rows.toLocaleString()} events · {c.files_skipped} files skipped
      </p>

      <div className="seg" role="tablist" aria-label="View mode">
        <button
          role="tab"
          aria-selected={p.mode === "journey"}
          className={p.mode === "journey" ? "on" : ""}
          onClick={() => p.setMode("journey")}
        >
          Journeys
        </button>
        <button
          role="tab"
          aria-selected={p.mode === "heatmap"}
          className={p.mode === "heatmap" ? "on" : ""}
          onClick={() => p.setMode("heatmap")}
        >
          Heatmap
        </button>
      </div>

      <div className="field-row">
        <label className="field">
          <span>Map</span>
          <select
            value={p.mapFilter}
            onChange={(e) => p.setMapFilter(e.target.value as MapId | "all")}
          >
            {p.mode === "journey" && <option value="all">All maps</option>}
            {manifest.maps.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>{p.mode === "heatmap" ? "Date range" : "Date"}</span>
          <select
            value={p.dateFilter}
            onChange={(e) => p.setDateFilter(e.target.value)}
          >
            <option value="all">All days</option>
            {manifest.dates.map((d) => (
              <option key={d} value={d}>
                {prettyDate(d)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {p.mode === "journey" ? (
        <>
          <div className="list-head">
            <span>{sorted.length} matches</span>
            <input
              placeholder="filter id / map"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <ul className="match-list">
            {sorted.map((m) => (
              <li key={m.match_id}>
                <button
                  className={m.match_id === p.matchId ? "sel" : ""}
                  onClick={() => p.setMatchId(m.match_id)}
                >
                  <span className="mid">{shortId(m.match_id)}</span>
                  <span className="tags">
                    <span className="tag map">{m.map_id}</span>
                    <span className="tag">{prettyDate(m.date)}</span>
                    <span className="tag">{mmss(m.duration_ms)}</span>
                  </span>
                  <span className="counts">
                    <b>{m.human_count}H</b> {m.bot_count}B · {matchActivity(m)} events
                  </span>
                </button>
              </li>
            ))}
            {sorted.length === 0 && <li className="empty">No matches for this filter.</li>}
          </ul>

          <div className="toggles">
            <label>
              <input
                type="checkbox"
                checked={p.showHumans}
                onChange={(e) => p.setShowHumans(e.target.checked)}
              />
              Humans
            </label>
            <label>
              <input
                type="checkbox"
                checked={p.showBots}
                onChange={(e) => p.setShowBots(e.target.checked)}
              />
              Bots
            </label>
          </div>

          {p.matchData && (
            <div className="match-meta">
              <div>
                <span className="muted">Match</span> {p.matchData.match_id}
              </div>
              <div className="meta-grid">
                <span>{p.matchData.map_id}</span>
                <span>{prettyDate(p.matchData.date)}</span>
                <span>{mmss(p.matchData.duration_ms)}</span>
                <span>
                  {p.matchData.human_count}{" "}
                  {p.matchData.human_count === 1 ? "human" : "humans"} /{" "}
                  {p.matchData.bot_count} bots
                </span>
              </div>
              <div className="meta-events">
                {(["kill", "death", "storm_death", "loot"] as const).map((k) => (
                  <span key={k}>
                    {k.replace("_", " ")}: <b>{p.matchData!.event_counts[k]}</b>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="seg small">
            {(["traffic", "kill", "death"] as HeatmapKind[]).map((k) => (
              <button
                key={k}
                className={p.heatmapKind === k ? "on" : ""}
                onClick={() => p.setHeatmapKind(k)}
              >
                {k === "traffic" ? "Traffic" : k === "kill" ? "Kill zones" : "Death zones"}
              </button>
            ))}
          </div>
          <p className="hint muted">
            Aggregated across every match on <b>{p.mapFilter === "all" ? "—" : p.mapFilter}</b>
            {p.dateFilter === "all"
              ? " for all five days."
              : ` for ${prettyDate(p.dateFilter)}.`}{" "}
            Counts are bucketed per collection day, so any date range is exact.
          </p>
        </>
      )}

      <Legend mode={p.mode} heatmapKind={p.heatmapKind} />

      <footer className="foot muted">
        Static precompute · no backend · data {manifest.generated_at.slice(0, 10)}
      </footer>
    </aside>
  );
}
