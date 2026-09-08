export interface ProcJob {
  label: string;
  msg: string;
  frac: number;
  error?: string;
}

interface Props {
  onPick: () => void;
  dragActive: boolean;
  jobs: ProcJob[] | null;
}

export function Landing({ onPick, dragActive, jobs }: Props) {
  return (
    <div className="landing">
      <div className="landing-card">
        <div className="brand">
          <div className="brand-mark">◇</div>
          <div>
            <h1>LILA BLACK</h1>
            <p>Player Journey Explorer</p>
          </div>
        </div>

        {jobs ? (
          <div className="proc">
            {jobs.map((j, i) => (
              <div key={i} className={`proc-row${j.error ? " err" : ""}`}>
                <div className="proc-head">
                  <span>{j.label}</span>
                  <span className="muted">{j.error ? "failed" : j.msg}</span>
                </div>
                <div className="proc-bar">
                  <div style={{ width: `${Math.round(j.frac * 100)}%` }} />
                </div>
                {j.error && <div className="proc-err">{j.error}</div>}
              </div>
            ))}
          </div>
        ) : (
          <button
            type="button"
            className={`drop${dragActive ? " over" : ""}`}
            onClick={onPick}
          >
            <strong>Drop a dataset .zip here</strong>
            <span>or click to choose files — you can add several at once</span>
          </button>
        )}

        <p className="landing-note">
          A zip of the LILA telemetry: day folders of <code>*.nakama-0</code> files,
          plus a <code>minimaps/</code> folder. Everything is unpacked and analysed{" "}
          <em>in your browser</em> — nothing is uploaded, and processed datasets are
          cached locally so a refresh keeps them.
        </p>
      </div>
    </div>
  );
}
