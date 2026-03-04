export default function InfoPanel({ metrics, selectedModel }) {
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
        <h4>Clinical Tools</h4>
        <div id="clinical-tools-host" />
      </div>
    </aside>
  );
}
