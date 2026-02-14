export default function InfoPanel({ metrics }) {
  return (
    <div className="diagnosis-panel">
      <div className="metric-item">
        <span>DISEASE</span>
        <strong>{metrics.disease}</strong>
      </div>

      <div className="metric-item">
        <span>DIAGNOSIS</span>
        <strong>{metrics.diagnosis}</strong>
      </div>

      <div className="metric-item">
        <span>TREATMENT</span>
        <strong>{metrics.treatment}</strong>
      </div>

      <div className="metric-item">
        <span>VOLUME (V)</span>
        <strong>{metrics.volume} mm³</strong>
      </div>

      <div className="metric-item">
        <span>SPHERICITY (Ψ)</span>
        <strong>{metrics.sphericity}</strong>
      </div>
    </div>
  );
}
