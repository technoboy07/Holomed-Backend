import React, { useCallback, useEffect, useMemo, useState } from "react";
import Viewer from "./Viewer";
import CutawayViewer from "./CutawayViewer";
export default function BrainScreen({ apiRoot, onClose, tumorDisplayMode }) {
  const brainUrl = useMemo(() => "/brain.glb");
  const tumorUrl = useMemo(() => "/tumor.glb" );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [brainBlobUrl, setBrainBlobUrl] = useState(null); 
  const [tumorBlobUrl, setTumorBlobUrl] = useState(null);
  const [mode, setMode] = useState("cutaway"); // "cutaway" | "normal"

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setBrainBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setTumorBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    try {
      const [brainRes, tumorRes] = await Promise.all([
        fetch(brainUrl),
        fetch(tumorUrl),
      ]);
      if (!brainRes.ok) throw new Error("brain.glb not found in holomed-ai/output");
      if (!tumorRes.ok) throw new Error("tumor.glb not found in holomed-ai/output");
      const [brainBlob, tumorBlob] = await Promise.all([brainRes.blob(), tumorRes.blob()]);
      setBrainBlobUrl(URL.createObjectURL(brainBlob));
      setTumorBlobUrl(URL.createObjectURL(tumorBlob));
    } catch (e) {
      setError(e?.message || "Failed to load brain.glb");
    } finally {
      setLoading(false);
    }
  }, [brainUrl, tumorUrl]);

  useEffect(() => {
    load();
    return () => {
      setBrainBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setTumorBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [load]);

  return (
    <div
      role="dialog"
      aria-label="Brain output viewer"
      style={{
        position: "fixed",
        inset: 0,
        background: "#0b1220",
        zIndex: 2000,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 12px",
          borderBottom: "1px solid rgba(65,90,119,0.5)",
          background: "rgba(10, 18, 30, 0.9)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ color: "#e0e1dd", fontWeight: 800, fontSize: 14 }}>Brain Output</div>
          <div style={{ color: "#8da4bb", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70vw" }}>
            {brainUrl}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setMode("cutaway")}
              className="insight-btn secondary"
              style={{ padding: "6px 10px", opacity: mode === "cutaway" ? 1 : 0.7 }}
            >
              Cutaway
            </button>
            <button
              type="button"
              onClick={() => setMode("normal")}
              className="insight-btn secondary"
              style={{ padding: "6px 10px", opacity: mode === "normal" ? 1 : 0.7 }}
            >
              Normal
            </button>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="insight-btn secondary"
            style={{ padding: "6px 10px" }}
          >
            {loading ? "Loading…" : "Reload"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="insight-btn"
            style={{ padding: "6px 10px" }}
          >
            Close
          </button>
        </div>
      </div>

      <div style={{ position: "relative", flex: 1 }}>
        {error && (
          <div
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              zIndex: 10,
              background: "rgba(0,0,0,0.6)",
              border: "1px solid rgba(255,107,107,0.6)",
              color: "#ff6b6b",
              padding: "10px 12px",
              borderRadius: 8,
              maxWidth: 520,
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Failed to load brain.glb</div>
            <div style={{ fontSize: 12, color: "#e0e1dd" }}>{error}</div>
          </div>
        )}

        {mode === "cutaway" ? (
          brainBlobUrl && tumorBlobUrl ? (
            <CutawayViewer
              brainUrl={brainBlobUrl}
              tumorUrl={tumorBlobUrl}
            />
          ) : (
            <Viewer
              transform={{ pitch: 0, yaw: 0, scale: 1.5 }}
              modelPath={brainBlobUrl}
              modelFormat="glb"
              enableHandTracking={false}
              findingMeshes={tumorBlobUrl ? [{ id: "tumor", url: tumorBlobUrl, visible: true, label: "tumor" }] : []}
              tumorDisplayMode={tumorDisplayMode}
              volumeData={null}
              volumeClipY={10}
            />
          )
        ) : (
          <Viewer
            transform={{ pitch: 0, yaw: 0, scale: 1.5 }}
            modelPath={brainBlobUrl}
            modelFormat="glb"
            enableHandTracking={false}
            findingMeshes={tumorBlobUrl ? [{ id: "tumor", url: tumorBlobUrl, visible: true, label: "tumor" }] : []}
            tumorDisplayMode={tumorDisplayMode}
            volumeData={null}
            volumeClipY={10}
          />
        )}
      </div>
    </div>
  );
}

