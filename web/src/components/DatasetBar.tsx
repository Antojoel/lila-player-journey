import { useState } from "react";
import type { Dataset } from "../lib/datasets";
import type { ProcJob } from "./Landing";

interface Props {
  datasets: Dataset[];
  hasCombined: boolean;
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  jobs: ProcJob[] | null;
}

export function DatasetBar(p: Props) {
  const [showWarn, setShowWarn] = useState<string | null>(null);

  const entries: { id: string; label: string; warnings: number }[] = [
    ...p.datasets.map((d) => ({
      id: d.id,
      label: d.label,
      warnings: d.warnings.length,
    })),
  ];
  if (p.hasCombined)
    entries.push({ id: "__combined__", label: "Combined", warnings: 0 });

  const warnDs = p.datasets.find((d) => d.id === showWarn);

  return (
    <div className="ds-bar">
      <div className="ds-head">
        <span>Dataset</span>
        <button className="ds-add" onClick={p.onAdd}>
          ＋ Add data
        </button>
      </div>

      <div className="ds-list">
        {entries.map((e) => (
          <div key={e.id} className={`ds-item${e.id === p.activeId ? " on" : ""}`}>
            <button className="ds-pick" onClick={() => p.onSelect(e.id)}>
              {e.label}
              {e.warnings > 0 && (
                <span
                  className="ds-warn"
                  title={`${e.warnings} warning${e.warnings === 1 ? "" : "s"}`}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setShowWarn(showWarn === e.id ? null : e.id);
                  }}
                >
                  ⚠ {e.warnings}
                </span>
              )}
            </button>
            {e.id !== "__combined__" && e.id !== "__bundled__" && (
              <button
                className="ds-x"
                title="Remove this dataset"
                onClick={() => p.onRemove(e.id)}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {p.jobs && (
        <div className="ds-jobs">
          {p.jobs.map((j, i) => (
            <div key={i} className={`ds-job${j.error ? " err" : ""}`}>
              <span>{j.label}</span>
              <span className="muted">{j.error ? "failed" : j.msg}</span>
              <div className="ds-job-bar">
                <div style={{ width: `${Math.round(j.frac * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {warnDs && warnDs.warnings.length > 0 && (
        <ul className="ds-warnlist">
          {warnDs.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
