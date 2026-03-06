export default function InfoPanel({
  metrics,
  selectedModel,
  findings = [],
  analysisCaseId,
  analysisRunId,
  onChangeAnalysisCaseId,
  onChangeAnalysisRunId,
  onLoadFindings,
  onToggleFinding,
}) {
  const formatDate = (isoDate) => {
    if (!isoDate) return "--";
    return new Date(isoDate).toLocaleString();
  };

  return (
    <aside className="insights-panel">
      <div className="insights-card">
        <h4>Case Summary</h4>
        <div className="insight-row">
          <span>Model</span>
          <strong>{selectedModel?.name || "No model selected"}</strong>
        </div>
        <div className="insight-row">
          <span>Format</span>
          <strong>{selectedModel?.file_format?.toUpperCase() || "--"}</strong>
        </div>
        <div className="insight-row">
          <span>Uploaded</span>
          <strong>{formatDate(selectedModel?.created_at)}</strong>
        </div>
      </div>

      <div className="insights-card">
        <h4>Clinical Metrics</h4>
        <div className="insight-row">
          <span>Disease</span>
          <strong>{metrics.disease}</strong>
        </div>
        <div className="insight-row">
          <span>Diagnosis</span>
          <strong>{metrics.diagnosis}</strong>
        </div>
        <div className="insight-row">
          <span>Treatment</span>
          <strong>{metrics.treatment}</strong>
        </div>
        <div className="insight-row">
          <span>Volume</span>
          <strong>{metrics.volume} mm³</strong>
        </div>
        <div className="insight-row">
          <span>Sphericity</span>
          <strong>{metrics.sphericity}</strong>
        </div>
      </div>

      <div className="insights-card">
        <h4>Workflow Actions</h4>
        <button className="insight-btn">Capture Snapshot</button>
        <button className="insight-btn">Export Report</button>
        <button className="insight-btn secondary">Mark as Reviewed</button>
      </div>

      <div className="insights-card">
        <h4>AI Findings (CT)</h4>
        <div className="insight-row">
          <span>Case ID</span>
          <input
            className="insight-input"
            placeholder="Paste case_id"
            value={analysisCaseId || ""}
            onChange={(e) =>
              onChangeAnalysisCaseId && onChangeAnalysisCaseId(e.target.value)
            }
          />
        </div>
        <div className="insight-row">
          <span>Run ID</span>
          <input
            className="insight-input"
            placeholder="Paste run_id"
            value={analysisRunId || ""}
            onChange={(e) =>
              onChangeAnalysisRunId && onChangeAnalysisRunId(e.target.value)
            }
          />
        </div>
        <button
          className="insight-btn"
          onClick={() => onLoadFindings && onLoadFindings()}
        >
          Load Findings & Overlays
        </button>
        {findings.length > 0 ? (
          <div className="findings-list">
            {findings.map((f) => (
              <div key={f.id} className="insight-row finding-row">
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    defaultChecked
                    onChange={() => onToggleFinding && onToggleFinding(f.id)}
                  />
                  <span>{f.label || "finding"}</span>
                </label>
                {typeof f.score === "number" && (
                  <strong>{(f.score * 100).toFixed(1)}%</strong>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="insight-row">
            <span style={{ color: "#778da9", fontSize: 12 }}>
              No findings loaded yet.
            </span>
          </div>
        )}
      </div>

      <div className="insights-card">
        <h4>Clinical Tools</h4>
        <div id="clinical-tools-host" />
      </div>
    </aside>
  );
}
