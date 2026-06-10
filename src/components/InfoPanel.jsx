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
  analysisPipeline = "brain_volume_v1",
  onChangeAnalysisPipeline,
  onRunCaseAnalysis,
  onPollAnalysis,
  analysisPolling = false,
  onLoadVolumeRender,
  onLoadSimpleAiOutputs,
  onOpenBrainScreen,
  cutawayEnabled = false,
  onToggleCutaway,
  tumorDisplayMode = "both",
  onTumorDisplayModeChange,
  volumeLoading = false,
  volumeActive = false,
  volumeClipY = 10,
  displayMode = "volume",
  onChangeDisplayMode,
  onVolumeClipYChange,
  onClearVolumeView,
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
        <h4>Simple AI Output</h4>
        <div className="insight-row" style={{ alignItems: "flex-start", flexDirection: "column", gap: 6 }}>
          <span>Display Mode</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="insight-btn secondary"
              style={{ opacity: displayMode === "mesh" ? 1 : 0.75 }}
              onClick={() => onChangeDisplayMode && onChangeDisplayMode("mesh")}
            >
              Mesh Overlay
            </button>
            <button
              type="button"
              className="insight-btn"
              style={{ opacity: displayMode === "volume" ? 1 : 0.75 }}
              onClick={() => onChangeDisplayMode && onChangeDisplayMode("volume")}
            >
              Volume CT
            </button>
          </div>
        </div>
        <div className="insight-row" style={{ alignItems: "flex-start", flexDirection: "column", gap: 6, marginTop: 4 }}>
          <span>Tumor view (AI overlay)</span>
          <select
            value={tumorDisplayMode}
            onChange={(e) => onTumorDisplayModeChange && onTumorDisplayModeChange(e.target.value)}
            disabled={displayMode !== "mesh" || !onTumorDisplayModeChange}
            style={{
              width: "100%",
              maxWidth: 320,
              padding: "6px 8px",
              borderRadius: 6,
              background: displayMode === "mesh" ? "#0d1b2a" : "#0d1b2a",
              color: "#e0e1dd",
              border: "1px solid #415a77",
              fontSize: 12,
            }}
            title={displayMode !== "mesh" ? "Switch to Mesh Overlay to change tumor view" : ""}
          >
            <option value="both">CT mesh (GLB) + yellow marker</option>
            <option value="spheres">Yellow marker only (clearer in demos)</option>
            <option value="glb">CT mesh (GLB) only</option>
          </select>
          <p style={{ margin: 0, fontSize: 10, color: "#778da9", lineHeight: 1.35 }}>
            A tiny neon marker is placed from the tumor GLB bounds. Cutaway view always shows GLB + marker. Use “Annotate” for custom pins.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          <button
            type="button"
            className="insight-btn"
            onClick={() => onLoadSimpleAiOutputs && onLoadSimpleAiOutputs()}
          >
            Load AI Output Files (brain.glb + tumor.glb)
          </button>
          <button
            type="button"
            className="insight-btn secondary"
            onClick={() => onToggleCutaway && onToggleCutaway()}
            style={{ opacity: displayMode === "mesh" ? 1 : 0.55 }}
            disabled={displayMode !== "mesh"}
            title={displayMode !== "mesh" ? "Switch to Mesh Overlay mode first" : ""}
          >
            {cutawayEnabled ? "Disable cutaway (main viewer)" : "Enable cutaway (main viewer)"}
          </button>
          <button
            type="button"
            className="insight-btn secondary"
            onClick={() => onOpenBrainScreen && onOpenBrainScreen()}
          >
            Open brain.glb in new screen
          </button>
          <p style={{ margin: 0, fontSize: 11, color: "#778da9", lineHeight: 1.4 }}>
            This loads files directly from <strong>holomed-ai/output</strong> with no case ID or run ID.
          </p>
        </div>
        {volumeActive && onVolumeClipYChange && (
          <div className="insight-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
            <span>Horizontal clip (remove tissue above Y)</span>
            <input
              type="range"
              min={-0.55}
              max={0.55}
              step={0.01}
              value={volumeClipY > 2 ? 0.55 : volumeClipY}
              onChange={(e) => onVolumeClipYChange(Number(e.target.value))}
            />
            <button type="button" className="insight-btn secondary" onClick={() => onClearVolumeView && onClearVolumeView()}>
              Clear volumetric view
            </button>
          </div>
        )}
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
