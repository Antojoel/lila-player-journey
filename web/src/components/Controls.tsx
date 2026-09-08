import { useMemo, useState, type ReactNode } from "react";
import { Legend } from "./Legend";
import { mmss, prettyDate, shortId } from "../lib/format";
import {
  describeMatch,
  matchActivity,
  playerEventCounts,
  quickPicks,
} from "../lib/matchStats";
import { BOT_COLOR } from "../lib/palette";
import type {
  HeatmapKind,
  Manifest,
  ManifestMatch,
  MapId,
  MatchData,
  Player,
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
  datasetBar: ReactNode;

  showHumans: boolean;
  setShowHumans: (b: boolean) => void;
  showBots: boolean;
  setShowBots: (b: boolean) => void;
  mapDim: number;
  setMapDim: (n: number) => void;
  focusedId: string | null;
  onFocus: (id: string | null) => void;
  colorFor: (p: Player) => string;
  labelFor: (id: string) => string;

  heatmapKind: HeatmapKind;
  setHeatmapKind: (k: HeatmapKind) => void;
}

export function Controls(p: Props) {
  const { manifest } = p;
  const [q, setQ] = useState("");

  const picks = useMemo(() => quickPicks(p.matches), [p.matches]);

  const sorted = useMemo(() => {
    const list = [...p.matches];
    list.sort(
      (a, b) => matchActivity(b) - matchActivity(a) || b.duration_ms - a.duration_ms,
    );
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

      {p.datasetBar}

      <p className="intro">
        See how players move through a match, or switch to a heatmap of where fights and
        traffic concentrate across every match on a map.
      </p>

      <div className="seg" role="tablist" aria-label="View mode">
        <button
          role="tab"
          aria-selected={p.mode === "journey"}
          className={p.mode === "journey" ? "on" : ""}
          onClick={() => p.setMode("journey")}
        >
          One match
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
          <span>{p.mode === "heatmap" ? "Days" : "Date"}</span>
          <select
            value={p.dateFilter}
            onChange={(e) => p.setDateFilter(e.target.value)}
          >
            <option value="all">All 5 days</option>
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
          {picks.length > 0 && (
            <div className="picks">
              <span className="picks-label">Quick picks</span>
              <div className="picks-row">
                {picks.map((qp) => (
                  <button
                    key={qp.key}
                    className={qp.match.match_id === p.matchId ? "on" : ""}
                    title={qp.hint}
                    onClick={() => p.setMatchId(qp.match.match_id)}
                  >
                    {qp.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="list-head">
            <span>{sorted.length} matches</span>
            <input
              placeholder="find by id / map"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <ul className="match-list">
            {sorted.slice(0, 300).map((m) => {
              const d = describeMatch(m);
              return (
                <li key={m.match_id}>
                  <button
                    className={m.match_id === p.matchId ? "sel" : ""}
                    onClick={() => p.setMatchId(m.match_id)}
                  >
                    <span className="m-headline">{d.headline}</span>
                    <span className="m-roster">{d.roster}</span>
                    <span className="m-fights">{d.fights}</span>
                    <span className="m-id">
                      {shortId(m.match_id)} · {prettyDate(m.date)}
                    </span>
                  </button>
                </li>
              );
            })}
            {sorted.length === 0 && (
              <li className="empty">No matches for this map / date.</li>
            )}
            {sorted.length > 300 && (
              <li className="empty">
                Showing the 300 busiest — narrow with the map / date filter or search.
              </li>
            )}
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
              <div className="mm-title">
                {p.matchData.map_id} · {mmss(p.matchData.duration_ms)} ·{" "}
                {prettyDate(p.matchData.date)}
              </div>
              <div className="mm-players">
                <span className="mm-players-hd">
                  Players — click one to isolate it on the map
                </span>
                {[...p.matchData.players]
                  .sort((a, b) => Number(b.human) - Number(a.human))
                  .map((pl) => {
                    const ec = playerEventCounts(pl);
                    const on = p.focusedId === pl.id;
                    return (
                      <button
                        key={pl.id}
                        className={`mm-player${on ? " on" : ""}`}
                        onClick={() => p.onFocus(pl.id)}
                      >
                        <span
                          className={`sw${pl.human ? "" : " bot"}`}
                          style={
                            pl.human
                              ? { background: p.colorFor(pl) }
                              : { color: BOT_COLOR }
                          }
                        />
                        <span className="mm-name">{p.labelFor(pl.id)}</span>
                        <span className="mm-ec">
                          {ec.kill}K {ec.death}D {ec.loot}L
                        </span>
                      </button>
                    );
                  })}
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
                {k === "traffic"
                  ? "Traffic"
                  : k === "kill"
                    ? "Kill zones"
                    : "Death zones"}
              </button>
            ))}
          </div>
          <p className="hint muted">
            Every match on <b>{p.mapFilter === "all" ? "—" : p.mapFilter}</b>
            {p.dateFilter === "all"
              ? " across all 5 days"
              : ` on ${prettyDate(p.dateFilter)}`}
            , combined. Counts are bucketed per day, so the date filter is exact.
          </p>
        </>
      )}

      <label className="dim-control">
        <span className="muted">Map brightness</span>
        <input
          type="range"
          min={0}
          max={0.75}
          step={0.05}
          value={p.mapDim}
          onChange={(e) => p.setMapDim(Number(e.target.value))}
        />
      </label>

      <Legend mode={p.mode} heatmapKind={p.heatmapKind} />

      <footer className="foot muted">
        Static precompute · no backend · data {manifest.generated_at.slice(0, 10)} ·{" "}
        {c.matches} matches / {c.humans} players / {c.event_rows.toLocaleString()}{" "}
        events
      </footer>
    </aside>
  );
}
