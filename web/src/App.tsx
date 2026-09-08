import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controls } from "./components/Controls";
import { DatasetBar } from "./components/DatasetBar";
import { Landing, type ProcJob } from "./components/Landing";
import { MapCanvas } from "./components/MapCanvas";
import { Timeline } from "./components/Timeline";
import { usePlayback } from "./hooks/usePlayback";
import { tryLoadBundled } from "./lib/bundled";
import {
  combineDatasets,
  deleteDataset,
  loadDatasets,
  saveDataset,
  type Dataset,
} from "./lib/datasets";
import { shortId } from "./lib/format";
import { matchActivity, playerLabels } from "./lib/matchStats";
import { humanColor } from "./lib/palette";
import type { HeatmapKind, Manifest, MapId, MatchData, Player } from "./lib/types";

// Code-split the pipeline (DuckDB-WASM JS + JSZip) — only loaded on first upload.
const loadPipeline = () => import("./lib/pipeline");

type Mode = "journey" | "heatmap";

function mostPlayedMap(m: Manifest): MapId {
  const tally = new Map<MapId, number>();
  for (const mt of m.matches) tally.set(mt.map_id, (tally.get(mt.map_id) ?? 0) + 1);
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? m.maps[0];
}

export default function App() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [jobs, setJobs] = useState<ProcJob[] | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [booted, setBooted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("journey");
  const [mapFilter, setMapFilter] = useState<MapId | "all">("all");
  const [dateFilter, setDateFilter] = useState<string | "all">("all");
  const [matchId, setMatchId] = useState<string | null>(null);
  const [showHumans, setShowHumans] = useState(true);
  const [showBots, setShowBots] = useState(true);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [mapDim, setMapDim] = useState(0.4);
  const [heatmapKind, setHeatmapKind] = useState<HeatmapKind>("traffic");

  const fileInput = useRef<HTMLInputElement>(null);

  // --- boot: bundled data (if any) + cached uploads ---
  const bootRef = useRef(false);
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    Promise.all([tryLoadBundled().catch(() => null), loadDatasets().catch(() => [])])
      .then(([bundled, cached]) => {
        const all = [...(bundled ? [bundled] : []), ...cached];
        setDatasets(all);
        if (all[0]) setActiveId(all[0].id);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setBooted(true));
  }, []);

  // --- process uploaded zips ---
  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    const zips = [...fileList].filter((f) => /\.zip$/i.test(f.name));
    if (zips.length === 0) return;
    setJobs(
      zips.map((f) => ({
        label: f.name.replace(/\.zip$/i, ""),
        msg: "queued",
        frac: 0,
      })),
    );

    const { processZip } = await loadPipeline();
    const done: Dataset[] = [];
    for (let i = 0; i < zips.length; i++) {
      try {
        const ds = await processZip(zips[i], (msg, frac) => {
          setJobs((cur) =>
            cur ? cur.map((j, k) => (k === i ? { ...j, msg, frac } : j)) : cur,
          );
        });
        await saveDataset(ds);
        done.push(ds);
        setDatasets((cur) => [...cur.filter((d) => d.id !== ds.id), ds]);
      } catch (e) {
        setJobs((cur) =>
          cur ? cur.map((j, k) => (k === i ? { ...j, error: String(e) } : j)) : cur,
        );
      }
    }
    if (done.length) setActiveId(done[done.length - 1].id);
    // leave failed jobs visible; clear a clean run after a moment
    setTimeout(() => setJobs((cur) => (cur?.some((j) => j.error) ? cur : null)), 1200);
  }, []);

  // Dev convenience: ?zip=<url> auto-loads a zip served by the dev server.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const u = new URLSearchParams(location.search).get("zip");
    if (u)
      fetch(u)
        .then((r) => r.blob())
        .then((b) => handleFiles([new File([b], u.split("/").pop() || "data.zip")]));
  }, [handleFiles]);

  // --- window drag & drop ---
  useEffect(() => {
    const stop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onOver = (e: DragEvent) => {
      stop(e);
      if (e.dataTransfer?.types.includes("Files")) setDragActive(true);
    };
    const onLeave = (e: DragEvent) => {
      stop(e);
      if (e.relatedTarget === null) setDragActive(false);
    };
    const onDrop = (e: DragEvent) => {
      stop(e);
      setDragActive(false);
      if (e.dataTransfer?.files.length) handleFiles(e.dataTransfer.files);
    };
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [handleFiles]);

  const uploads = useMemo(
    () => datasets.filter((d) => d.id !== "__bundled__"),
    [datasets],
  );
  const combined = useMemo(
    () => (uploads.length >= 2 ? combineDatasets(uploads) : null),
    [uploads],
  );
  const active: Dataset | null = useMemo(() => {
    if (activeId === "__combined__") return combined;
    return datasets.find((d) => d.id === activeId) ?? null;
  }, [activeId, datasets, combined]);

  const manifest = active?.manifest ?? null;

  // --- minimap object URLs for the active dataset ---
  const minimapUrls = useMemo(() => {
    const m = new Map<MapId, string>();
    if (active)
      for (const [k, blob] of active.minimaps) m.set(k, URL.createObjectURL(blob));
    return m;
  }, [active]);
  useEffect(
    () => () => minimapUrls.forEach((u) => URL.revokeObjectURL(u)),
    [minimapUrls],
  );

  // --- filtered match list ---
  const filteredMatches = useMemo(() => {
    if (!manifest) return [];
    return manifest.matches.filter(
      (m) =>
        (mapFilter === "all" || m.map_id === mapFilter) &&
        (dateFilter === "all" || m.date === dateFilter),
    );
  }, [manifest, mapFilter, dateFilter]);

  // Auto-select the busiest match on load, on dataset switch, and whenever the
  // current pick falls outside the map/date filter.
  const pickedFor = useRef<string>("");
  useEffect(() => {
    if (mode !== "journey" || !manifest) return;
    const stillValid = matchId && filteredMatches.some((m) => m.match_id === matchId);
    if (stillValid && pickedFor.current === activeId) return;
    pickedFor.current = activeId;
    const busiest = [...filteredMatches].sort(
      (a, b) => matchActivity(b) - matchActivity(a) || b.duration_ms - a.duration_ms,
    )[0];
    setMatchId(busiest?.match_id ?? null);
  }, [mode, manifest, filteredMatches, matchId, activeId]);

  useEffect(() => {
    if (mode === "heatmap" && mapFilter === "all" && manifest) {
      setMapFilter(mostPlayedMap(manifest));
    }
  }, [mode, mapFilter, manifest]);

  // reset per-match UI when the match or dataset changes
  useEffect(() => setFocusedId(null), [matchId, activeId]);

  const matchData: MatchData | null = matchId
    ? (active?.matches.get(matchId) ?? null)
    : null;

  const heatMapId: MapId | null =
    mode === "heatmap" && mapFilter !== "all" ? mapFilter : null;
  const heatmap =
    heatMapId && active
      ? (active.heatmaps.get(`${heatMapId}_${heatmapKind}`) ?? null)
      : null;

  const playback = usePlayback(matchData?.duration_ms ?? 0);
  const { toggle: togglePlay } = playback;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
      if (e.code === "Space" && mode === "journey") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "Escape") {
        setFocusedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, togglePlay]);

  const humanIndex = useMemo(() => {
    const m = new Map<string, number>();
    let i = 0;
    for (const pl of matchData?.players ?? []) if (pl.human) m.set(pl.id, i++);
    return m;
  }, [matchData]);
  const colorFor = useCallback(
    (player: Player) => humanColor(humanIndex.get(player.id) ?? 0),
    [humanIndex],
  );
  const labels = useMemo(() => playerLabels(matchData), [matchData]);
  const labelFor = useCallback((id: string) => labels.get(id) ?? shortId(id), [labels]);

  const allEvents = useMemo(() => {
    const out: { t: number; k: MatchData["players"][number]["events"][number]["k"] }[] =
      [];
    for (const pl of matchData?.players ?? []) {
      if (pl.human && !showHumans) continue;
      if (!pl.human && !showBots) continue;
      if (focusedId && pl.id !== focusedId) continue;
      for (const e of pl.events) out.push({ t: e.t, k: e.k });
    }
    return out.sort((a, b) => a.t - b.t);
  }, [matchData, showHumans, showBots, focusedId]);

  const activeMapId: MapId | null =
    mode === "heatmap" ? heatMapId : (matchData?.map_id ?? null);
  const heatmapDates = dateFilter === "all" ? null : [dateFilter];
  const toggleFocus = useCallback(
    (id: string | null) => setFocusedId((cur) => (cur === id ? null : id)),
    [],
  );

  const removeDataset = useCallback(async (id: string) => {
    await deleteDataset(id);
    setDatasets((cur) => {
      const next = cur.filter((d) => d.id !== id);
      setActiveId((a) => (a === id || a === "__combined__" ? (next[0]?.id ?? "") : a));
      return next;
    });
    setMatchId(null);
  }, []);

  if (error) {
    return (
      <div className="fatal">
        <h2>Could not start</h2>
        <pre>{error}</pre>
      </div>
    );
  }
  if (!booted) return <div className="booting">Loading…</div>;

  const pickFiles = () => fileInput.current?.click();

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept=".zip"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {!manifest ? (
        <Landing onPick={pickFiles} dragActive={dragActive} jobs={jobs} />
      ) : (
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
            showHumans={showHumans}
            setShowHumans={setShowHumans}
            showBots={showBots}
            setShowBots={setShowBots}
            mapDim={mapDim}
            setMapDim={setMapDim}
            focusedId={focusedId}
            onFocus={toggleFocus}
            colorFor={colorFor}
            labelFor={labelFor}
            heatmapKind={heatmapKind}
            setHeatmapKind={setHeatmapKind}
            datasetBar={
              <DatasetBar
                datasets={uploads}
                hasCombined={!!combined}
                activeId={activeId}
                onSelect={setActiveId}
                onAdd={pickFiles}
                onRemove={removeDataset}
                jobs={jobs}
              />
            }
          />

          <main className="stage">
            <MapCanvas
              mapId={activeMapId}
              minimapUrl={activeMapId ? (minimapUrls.get(activeMapId) ?? null) : null}
              match={matchData}
              mode={mode}
              heatmap={heatmap}
              heatmapKind={heatmapKind}
              heatmapDates={heatmapDates}
              tMs={playback.t}
              showHumans={showHumans}
              showBots={showBots}
              colorFor={colorFor}
              labelFor={labelFor}
              focusedId={focusedId}
              onFocus={toggleFocus}
              mapDim={mapDim}
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
      )}

      {dragActive && manifest && (
        <div className="drop-overlay">Drop .zip to add a dataset</div>
      )}
    </>
  );
}
