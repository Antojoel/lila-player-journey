import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controls } from "./components/Controls";
import { MapCanvas } from "./components/MapCanvas";
import { Timeline } from "./components/Timeline";
import { usePlayback } from "./hooks/usePlayback";
import { loadHeatmap, loadManifest, loadMatch } from "./lib/api";
import { matchActivity } from "./lib/matchStats";
import { humanColor } from "./lib/palette";
import type {
  Heatmap,
  HeatmapKind,
  Manifest,
  MapId,
  MatchData,
  Player,
} from "./lib/types";

type Mode = "journey" | "heatmap";

function mostPlayedMap(m: Manifest): MapId {
  const tally = new Map<MapId, number>();
  for (const mt of m.matches) tally.set(mt.map_id, (tally.get(mt.map_id) ?? 0) + 1);
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? m.maps[0];
}

export default function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("journey");
  const [mapFilter, setMapFilter] = useState<MapId | "all">("all");
  const [dateFilter, setDateFilter] = useState<string | "all">("all");
  const [matchId, setMatchId] = useState<string | null>(null);
  const [matchData, setMatchData] = useState<MatchData | null>(null);
  const [loadingMatch, setLoadingMatch] = useState(false);

  const [showHumans, setShowHumans] = useState(true);
  const [showBots, setShowBots] = useState(true);
  const [heatmapKind, setHeatmapKind] = useState<HeatmapKind>("traffic");
  const [heatmap, setHeatmap] = useState<Heatmap | null>(null);

  // --- manifest bootstrap ---
  useEffect(() => {
    loadManifest()
      .then((m) => {
        setManifest(m);
        const best = [...m.matches].sort(
          (a, b) => matchActivity(b) - matchActivity(a),
        )[0];
        if (best) setMatchId(best.match_id);
      })
      .catch((e) => setError(String(e)));
  }, []);

  // --- filtered match list ---
  const filteredMatches = useMemo(() => {
    if (!manifest) return [];
    return manifest.matches.filter(
      (m) =>
        (mapFilter === "all" || m.map_id === mapFilter) &&
        (dateFilter === "all" || m.date === dateFilter),
    );
  }, [manifest, mapFilter, dateFilter]);

  // keep selection valid when filters change; default to the busiest match so the
  // selection lines up with the top of the (activity-sorted) list.
  useEffect(() => {
    if (mode !== "journey" || !manifest) return;
    if (matchId && filteredMatches.some((m) => m.match_id === matchId)) return;
    const busiest = [...filteredMatches].sort(
      (a, b) => matchActivity(b) - matchActivity(a) || b.duration_ms - a.duration_ms,
    )[0];
    setMatchId(busiest?.match_id ?? null);
  }, [mode, manifest, filteredMatches, matchId]);

  // --- load selected match ---
  const reqRef = useRef(0);
  useEffect(() => {
    if (!matchId) {
      setMatchData(null);
      return;
    }
    const id = ++reqRef.current;
    setLoadingMatch(true);
    loadMatch(matchId)
      .then((d) => {
        if (id === reqRef.current) setMatchData(d);
      })
      .catch((e) => setError(String(e)))
      .finally(() => {
        if (id === reqRef.current) setLoadingMatch(false);
      });
  }, [matchId]);

  // --- heatmap mode needs a concrete map ---
  useEffect(() => {
    if (mode === "heatmap" && mapFilter === "all" && manifest) {
      setMapFilter(mostPlayedMap(manifest));
    }
  }, [mode, mapFilter, manifest]);

  const heatMapId: MapId | null =
    mode === "heatmap" && mapFilter !== "all" ? mapFilter : null;

  useEffect(() => {
    if (!heatMapId) {
      setHeatmap(null);
      return;
    }
    let alive = true;
    loadHeatmap(heatMapId, heatmapKind)
      .then((h) => alive && setHeatmap(h))
      .catch((e) => setError(String(e)));
    return () => {
      alive = false;
    };
  }, [heatMapId, heatmapKind]);

  // --- playback ---
  const playback = usePlayback(matchData?.duration_ms ?? 0);

  // --- stable per-match colour assignment for humans ---
  const humanIndex = useMemo(() => {
    const map = new Map<string, number>();
    let i = 0;
    for (const pl of matchData?.players ?? []) {
      if (pl.human) map.set(pl.id, i++);
    }
    return map;
  }, [matchData]);

  const colorFor = useCallback(
    (player: Player) => humanColor(humanIndex.get(player.id) ?? 0),
    [humanIndex],
  );

  const allEvents = useMemo(() => {
    const out: { t: number; k: MatchData["players"][number]["events"][number]["k"] }[] = [];
    for (const pl of matchData?.players ?? []) {
      if (pl.human && !showHumans) continue;
      if (!pl.human && !showBots) continue;
      for (const e of pl.events) out.push({ t: e.t, k: e.k });
    }
    return out;
  }, [matchData, showHumans, showBots]);

  const activeMapId: MapId | null =
    mode === "heatmap" ? heatMapId : (matchData?.map_id ?? null);
  const heatmapDates = dateFilter === "all" ? null : [dateFilter];

  if (error) {
    return (
      <div className="fatal">
        <h2>Could not load data</h2>
        <pre>{error}</pre>
      </div>
    );
  }
  if (!manifest) return <div className="booting">Loading dataset…</div>;

  return (
    <div className="app">
      <Controls
        manifest={manifest}
        mode={mode}
        setMode={setMode}
        mapFilter={mapFilter}
        setMapFilter={setMapFilter}
        dateFilter={dateFilter}
        setDateFilter={setDateFilter}
        matches={filteredMatches}
        matchId={matchId}
        setMatchId={setMatchId}
        matchData={matchData}
        loadingMatch={loadingMatch}
        showHumans={showHumans}
        setShowHumans={setShowHumans}
        showBots={showBots}
        setShowBots={setShowBots}
        heatmapKind={heatmapKind}
        setHeatmapKind={setHeatmapKind}
      />

      <main className="stage">
        <MapCanvas
          mapId={activeMapId}
          match={matchData}
          loadingMatch={loadingMatch}
          mode={mode}
          heatmap={heatmap}
          heatmapKind={heatmapKind}
          heatmapDates={heatmapDates}
          tMs={playback.t}
          showHumans={showHumans}
          showBots={showBots}
          colorFor={colorFor}
        />

        {mode === "journey" && (
          <Timeline
            duration={matchData?.duration_ms ?? 0}
            playback={playback}
            events={allEvents}
          />
        )}
      </main>
    </div>
  );
}
