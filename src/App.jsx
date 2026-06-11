import React, { useState, useEffect, useCallback } from "react";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import Viewer from "./components/Viewer";
import InfoPanel from "./components/InfoPanel";
import LoginModal from "./components/LoginModal";
import ToastContainer from "./components/ToastContainer";
import BrainScreen from "./components/BrainScreen";
import CutawayViewer from "./components/CutawayViewer";
import { apiRequest, isUnauthorizedError } from "./utils/api";
import { TUMOR_DISPLAY } from "./utils/tumorOverlay";
import "./App.css";

const API_BASE = "https://holomed-backend.onrender.com";
const API_ROOT = API_BASE.replace(/\/api\/?$/, "");
const AI_OUTPUT_BASE = `${API_ROOT}/ai-output`;

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(null);
  const [selectedModelUrl, setSelectedModelUrl] = useState(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingModelFile, setLoadingModelFile] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [error, setError] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [modelFileError, setModelFileError] = useState(null);
  const [presentationMode, setPresentationMode] = useState(false);
  const [healthStatus, setHealthStatus] = useState({
    api: "unknown",
    auth: "unknown",
    model: "unknown",
  });

  const [data] = useState({
    transform: { pitch: 0, yaw: 0, scale: 1.5 },
    metrics: {
      disease: "None",
      diagnosis: "Scanning...",
      treatment: "Awaiting analysis",
      volume: "1240",
      sphericity: "0.88"
    }
  });

  const [analysisCaseId, setAnalysisCaseId] = useState("");
  const [analysisRunId, setAnalysisRunId] = useState("");
  const [analysisFindings, setAnalysisFindings] = useState([]);
  const [overlayMeshes, setOverlayMeshes] = useState([]);
  const [analysisPipeline, setAnalysisPipeline] = useState("brain_volume_v1");
  const [displayMode, setDisplayMode] = useState("volume");
  const [volumeRenderData, setVolumeRenderData] = useState(null);
  const [volumeLoading, setVolumeLoading] = useState(false);
  const [volumeClipY, setVolumeClipY] = useState(10);
  const [analysisPolling, setAnalysisPolling] = useState(false);
  const [brainScreenOpen, setBrainScreenOpen] = useState(false);
  const [cutawayEnabled, setCutawayEnabled] = useState(false);
  const [tumorDisplayMode, setTumorDisplayMode] = useState(TUMOR_DISPLAY.BOTH);

  const clearSelectedModelUrl = useCallback(() => {
    setSelectedModelUrl((prevUrl) => {
      if (prevUrl) {
        URL.revokeObjectURL(prevUrl);
      }
      return null;
    });
  }, []);

  const clearOverlayMeshes = useCallback(() => {
    setOverlayMeshes((prev) => {
      prev.forEach((m) => {
        if (m.url) {
          URL.revokeObjectURL(m.url);
        }
      });
      return [];
    });
  }, []);

  const setServiceHealth = useCallback((service, status) => {
    setHealthStatus((prev) => {
      if (prev[service] === status) return prev;
      return { ...prev, [service]: status };
    });
  }, []);

  const handleAuthFailure = useCallback(() => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setModels([]);
    setSelectedModel(null);
    clearSelectedModelUrl();
    setModelFileError(null);
    setServiceHealth("auth", "down");
    setShowLogin(true);
  }, [clearSelectedModelUrl, setServiceHealth]);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback(({ type = "info", message }) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      dismissToast(id);
    }, 5000);
  }, [dismissToast]);

  const fetchModels = useCallback(async () => {
    if (!token) return;

    setLoadingModels(true);
    try {
      const modelData = await apiRequest(API_BASE, "/api/models", {
        token,
      });
      setServiceHealth("api", "up");
      setModels(modelData);

      if (selectedModel) {
        const exists = modelData.some((m) => m.id === selectedModel.id);
        if (!exists) {
          setSelectedModel(null);
          clearSelectedModelUrl();
        }
      }
    } catch (fetchError) {
      if (isUnauthorizedError(fetchError)) {
        setServiceHealth("api", "up");
        handleAuthFailure();
        return;
      }
      setServiceHealth("api", "down");
      console.error('Failed to fetch models:', fetchError);
      const message = fetchError.message || 'Failed to fetch models';
      setError(message);
      addToast({ type: "error", message });
    } finally {
      setLoadingModels(false);
    }
  }, [token, handleAuthFailure, selectedModel, clearSelectedModelUrl, addToast, setServiceHealth]);

  const fetchUserInfo = useCallback(async () => {
    try {
      const userData = await apiRequest(API_BASE, "/auth/me", {
        token,
      });
      setServiceHealth("api", "up");
      setServiceHealth("auth", "up");
      setUser(userData);
    } catch (fetchError) {
      if (isUnauthorizedError(fetchError)) {
        setServiceHealth("api", "up");
        handleAuthFailure();
        return;
      }
      setServiceHealth("api", "down");
      console.error('Failed to fetch user info:', fetchError);
      const message = fetchError.message || 'Failed to connect to server';
      setError(message);
      addToast({ type: "error", message });
    }
  }, [token, handleAuthFailure, addToast, setServiceHealth]);

  const checkApiHealth = useCallback(async () => {
    try {
      const response = await fetch(`${API_ROOT}/api/health`);
      setServiceHealth("api", response.ok ? "up" : "down");
    } catch {
      setServiceHealth("api", "down");
    }
  }, [setServiceHealth]);

  useEffect(() => {
    if (token) {
      fetchUserInfo();
      fetchModels();
    } else {
      setShowLogin(true);
      setModels([]);
    }
  }, [token, fetchUserInfo, fetchModels]);

  useEffect(() => {
    checkApiHealth();
    const interval = setInterval(checkApiHealth, 30000);
    return () => clearInterval(interval);
  }, [checkApiHealth]);

  useEffect(() => {
    if (!error) return undefined;
    const timeout = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timeout);
  }, [error]);

  useEffect(() => {
    return () => {
      clearSelectedModelUrl();
      clearOverlayMeshes();
    };
  }, [clearSelectedModelUrl, clearOverlayMeshes]);

  const handleLogin = (newToken, userData) => {
    setToken(newToken);
    setUser(userData);
    localStorage.setItem('token', newToken);
    setShowLogin(false);
    setError(null);
    setServiceHealth("auth", "up");
    addToast({ type: "success", message: `Welcome ${userData.email}` });
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setModels([]);
    setSelectedModel(null);
    clearSelectedModelUrl();
    setModelFileError(null);
    setAnalysisCaseId("");
    setAnalysisRunId("");
    setAnalysisFindings([]);
    clearOverlayMeshes();
    setVolumeRenderData(null);
    setVolumeClipY(10);
    setShowLogin(true);
    setServiceHealth("auth", "down");
    addToast({ type: "info", message: "Logged out successfully" });
  };

  const handleModelUpload = (newModel) => {
    setModels((prev) => [newModel, ...prev]);
    setSelectedModel(newModel);
    setModelFileError(null);
    loadModelFile(newModel);
    setError(null);
  };

  const loadModelFile = async (model) => {
    if (!model?.id || !token) return;

    setLoadingModelFile(true);
    clearSelectedModelUrl();
    setModelFileError(null);

    try {
      setServiceHealth("api", "up");
      setServiceHealth("model", "up");
    
      setSelectedModelUrl(model.file_path);
  } catch (fileError) {
      if (isUnauthorizedError(fileError)) {
        setServiceHealth("api", "up");
        handleAuthFailure();
        return;
      }
      setServiceHealth("api", "down");
      setServiceHealth("model", "down");
      console.error('Failed to load model file:', fileError);
      const message = fileError.message || 'Failed to load model file';
      setError(message);
      setModelFileError(message);
      addToast({ type: "error", message });
    } finally {
      setLoadingModelFile(false);
    }
  };

  const handleSelectModel = async (model) => {
    setSelectedModel(model);
    setServiceHealth("model", "unknown");
    await loadModelFile(model);
  };

  useEffect(() => {
    if (!token) return;
    if (selectedModel || loadingModels || models.length === 0) return;

    // Auto-load the first model so users don't land on an empty viewer.
    const firstModel = models[0];
    setSelectedModel(firstModel);
    loadModelFile(firstModel);
    addToast({ type: "info", message: `Auto-loaded model: ${firstModel.name}` });
  }, [token, selectedModel, loadingModels, models, loadModelFile, addToast]);

  const handleDeleteModel = async (model) => {
    if (!model?.id || !token) return;

    const shouldDelete = window.confirm(`Delete model "${model.name}"?`);
    if (!shouldDelete) return;

    try {
      await apiRequest(API_BASE, `/api/models/${model.id}`, {
        method: "DELETE",
        token,
        responseType: "none",
      });

      setModels((prev) => prev.filter((m) => m.id !== model.id));
      if (selectedModel?.id === model.id) {
        setSelectedModel(null);
        clearSelectedModelUrl();
        setModelFileError(null);
        setServiceHealth("model", "unknown");
      }
      addToast({ type: "success", message: `Deleted "${model.name}"` });
    } catch (deleteError) {
      if (isUnauthorizedError(deleteError)) {
        handleAuthFailure();
        return;
      }
      console.error('Failed to delete model:', deleteError);
      const message = deleteError.message || 'Failed to delete model';
      setError(message);
      addToast({ type: "error", message });
    }
  };

  const modelUrl = selectedModelUrl || null;
  const modelFormat = selectedModel?.file_format || "stl";
  const tumorOverlayUrl =
    overlayMeshes?.find((m) => m?.url && m.visible !== false)?.url || null;
  const canShowCutaway =
    displayMode === "mesh" &&
    cutawayEnabled &&
    modelUrl &&
    (modelFormat?.toLowerCase() === "glb" ||
      modelFormat?.toLowerCase() === "gltf") &&
    tumorOverlayUrl;

  const loadFindingsAndMeshes = useCallback(async () => {
    if (!token) {
      addToast({ type: "error", message: "Login required to load findings" });
      return;
    }
    if (!analysisCaseId || !analysisRunId) {
      addToast({ type: "error", message: "Enter case ID and run ID" });
      return;
    }
    try {
      const encodedRunId = encodeURIComponent(analysisRunId);
      const findings = await apiRequest(
        API_BASE,
        `/cases/${analysisCaseId}/findings?run_id=${encodedRunId}`,
        { token }
      );
      setAnalysisFindings(findings);
      clearOverlayMeshes();

      const meshes = [];
      for (const f of findings) {
        if (!f.mesh_artifact_id) continue;
        const blob = await apiRequest(
          API_BASE,
          `/artifacts/${f.mesh_artifact_id}/file`,
          { token, responseType: "blob" }
        );
        const blobUrl = URL.createObjectURL(blob);
        meshes.push({
          id: f.id,
          url: blobUrl,
          label: f.label,
          score: f.score,
          visible: true,
        });
      }
      setOverlayMeshes(meshes);
      if (meshes.length) {
        setDisplayMode("mesh");
        setVolumeRenderData(null);
        setVolumeClipY(10);
        addToast({
          type: "success",
          message: `Loaded ${meshes.length} AI overlays. Switched to Mesh Overlay mode.`,
        });
      } else if (analysisPipeline === "brain_volume_v1") {
        addToast({
          type: "info",
          message: "No mesh overlays for brain_volume_v1. Use 'Load volumetric CT viewer' for this pipeline.",
        });
      } else {
        addToast({ type: "info", message: "No AI overlays found for this run" });
      }
    } catch (err) {
      console.error("Failed to load findings:", err);
      const message = err.message || "Failed to load findings";
      setError(message);
      addToast({ type: "error", message });
    }
  }, [token, analysisCaseId, analysisRunId, clearOverlayMeshes, addToast, analysisPipeline]);

  const toggleFindingVisibility = useCallback((findingId) => {
    setOverlayMeshes((prev) =>
      prev.map((m) =>
        m.id === findingId ? { ...m, visible: !m.visible } : m
      )
    );
  }, []);

  const loadVolumeRender = useCallback(async () => {
    if (!token) {
      addToast({ type: "error", message: "Login required" });
      return;
    }
    if (!analysisCaseId?.trim() || !analysisRunId?.trim()) {
      addToast({ type: "error", message: "Enter case ID and run ID" });
      return;
    }
    const cid = analysisCaseId.trim();
    const rid = analysisRunId.trim();
    setVolumeLoading(true);
    try {
      const meta = await apiRequest(API_BASE, `/cases/${cid}/volumes/${rid}`, {
        token,
      });
      const intBlob = await apiRequest(
        API_BASE,
        `/cases/${cid}/volumes/${rid}/intensity`,
        { token, responseType: "blob" }
      );
      const tumorBlob = await apiRequest(
        API_BASE,
        `/cases/${cid}/volumes/${rid}/tumor`,
        { token, responseType: "blob" }
      );
      const intBuf = new Float32Array(await intBlob.arrayBuffer());
      const tumorBuf = new Float32Array(await tumorBlob.arrayBuffer());
      const expected = meta.nx * meta.ny * meta.nz;
      if (intBuf.length !== expected || tumorBuf.length !== expected) {
        throw new Error(
          `Buffer size mismatch (expected ${expected} floats each)`
        );
      }
      setVolumeRenderData({
        nx: meta.nx,
        ny: meta.ny,
        nz: meta.nz,
        spacing_mm: meta.spacing_mm,
        intensity: intBuf,
        tumor: tumorBuf,
      });
      // Start with minimal clipping so users can actually see the full volume immediately.
      setVolumeClipY(0.55);
      setDisplayMode("volume");
      addToast({ type: "success", message: "Volumetric CT loaded. Switched to Volume CT mode." });
    } catch (err) {
      console.error("Volume load failed:", err);
      const message = err.message || "Failed to load volume data";
      setError(message);
      addToast({ type: "error", message });
    } finally {
      setVolumeLoading(false);
    }
  }, [token, analysisCaseId, analysisRunId, addToast]);

  const runCaseAnalysis = useCallback(async () => {
    if (!token) {
      addToast({ type: "error", message: "Login required" });
      return;
    }
    if (!analysisCaseId?.trim()) {
      addToast({ type: "error", message: "Enter case ID" });
      return;
    }
    const cid = analysisCaseId.trim();
    try {
      const res = await apiRequest(API_BASE, `/cases/${cid}/analyze`, {
        method: "POST",
        token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipeline: analysisPipeline }),
      });
      setAnalysisRunId(res.id);
      addToast({
        type: "info",
        message: `Analysis queued (run ${res.id}). Poll until succeeded, then load volume.`,
      });
    } catch (err) {
      console.error("Analyze failed:", err);
      const message = err.message || "Failed to start analysis";
      addToast({ type: "error", message });
    }
  }, [token, analysisCaseId, analysisPipeline, addToast]);

  const loadSimpleAiOutputs = useCallback(async () => {
    try {
      setLoadingModelFile(true);
      clearSelectedModelUrl();
      clearOverlayMeshes();
      setModelFileError(null);
      setVolumeRenderData(null);
      setVolumeClipY(10);
      setDisplayMode("mesh");
      setCutawayEnabled(false);

      const [brainRes, tumorRes] = await Promise.all([
        fetch(`/brain.glb`),
        fetch(`/tumor.glb`),
      ]);

      if (!brainRes.ok) {
        throw new Error("brain.glb not found in holomed-ai/output");
      }
      if (!tumorRes.ok) {
        throw new Error("tumor.glb not found in holomed-ai/output");
      }

      const brainBlob = await brainRes.blob();
      const tumorBlob = await tumorRes.blob();
      const brainUrl = URL.createObjectURL(brainBlob);
      const tumorUrl = URL.createObjectURL(tumorBlob);

      setSelectedModel({
        id: "ai-brain-local",
        name: "AI Brain Output",
        file_format: "glb",
        created_at: new Date().toISOString(),
      });
      setSelectedModelUrl(brainUrl);
      setOverlayMeshes([
        { id: "ai-tumor-overlay", url: tumorUrl, label: "tumor", score: 1, visible: true },
      ]);
      addToast({ type: "success", message: "Loaded brain.glb + tumor.glb from holomed-ai/output" });
    } catch (err) {
      const message = err.message || "Failed to load files from holomed-ai/output";
      setModelFileError(message);
      addToast({ type: "error", message });
    } finally {
      setLoadingModelFile(false);
    }
  }, [clearSelectedModelUrl, clearOverlayMeshes, addToast]);

  useEffect(() => {
    if (displayMode !== "mesh") return;
    if (!volumeRenderData) return;
    setVolumeRenderData(null);
    setVolumeClipY(10);
  }, [displayMode, volumeRenderData]);

  const pollAnalysisRun = useCallback(async () => {
    if (!token || !analysisCaseId?.trim() || !analysisRunId?.trim()) {
      addToast({ type: "error", message: "Enter case ID and run ID" });
      return;
    }
    const cid = analysisCaseId.trim();
    const rid = analysisRunId.trim();
    setAnalysisPolling(true);
    try {
      for (let i = 0; i < 60; i++) {
        const run = await apiRequest(API_BASE, `/cases/${cid}/analysis/${rid}`, {
          token,
        });
        if (run.status === "succeeded") {
          addToast({ type: "success", message: "Analysis finished" });
          return;
        }
        if (run.status === "failed") {
          addToast({
            type: "error",
            message: run.error || "Analysis failed",
          });
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      addToast({ type: "error", message: "Polling timed out; check run status manually" });
    } catch (err) {
      addToast({ type: "error", message: err.message || "Poll failed" });
    } finally {
      setAnalysisPolling(false);
    }
  }, [token, analysisCaseId, analysisRunId, addToast]);

  if (showLogin) {
    return (
      <div className="app-container">
        <LoginModal 
          onLogin={handleLogin} 
          onClose={() => {}} 
          API_BASE={API_BASE}
          onToast={addToast}
        />
      </div>
    );
  }

  return (
    <div className="app-container">
      {brainScreenOpen && (
        <BrainScreen
          apiRoot={API_ROOT}
          onClose={() => setBrainScreenOpen(false)}
          tumorDisplayMode={tumorDisplayMode}
        />
      )}
      <Header 
        user={user} 
        onLogout={handleLogout}
        onModelUpload={handleModelUpload}
        API_BASE={API_BASE}
        token={token}
        onToast={addToast}
        healthStatus={healthStatus}
        selectedModel={selectedModel}
        presentationMode={presentationMode}
        onTogglePresentationMode={() => setPresentationMode((prev) => !prev)}
      />

      <div className="main-content">
        {!presentationMode && (
          <Sidebar 
            models={models}
            onSelectModel={handleSelectModel}
            selectedModel={selectedModel}
            onDeleteModel={handleDeleteModel}
            loading={loadingModels}
          />
        )}

        <div className="viewer-container">
          {(loadingModelFile || volumeLoading) && (
            <div style={{
              position: 'absolute',
              top: 10,
              right: 10,
              background: 'rgba(0, 0, 0, 0.6)',
              color: '#e0e1dd',
              padding: '8px 12px',
              borderRadius: '4px',
              zIndex: 1000
            }}>
              {volumeLoading ? "Loading CT volume…" : "Loading model..."}
            </div>
          )}
          {volumeRenderData || modelUrl ? (
            canShowCutaway ? (
              <CutawayViewer
                brainUrl={modelUrl}
                tumorUrl={tumorOverlayUrl}
              />
            ) : (
              <Viewer 
                transform={data.transform} 
                modelPath={displayMode === "volume" && volumeRenderData ? null : modelUrl}
                modelFormat={modelFormat}
                enableHandTracking={true}
                findingMeshes={overlayMeshes}
                tumorDisplayMode={tumorDisplayMode}
                volumeData={displayMode === "volume" ? volumeRenderData : null}
                volumeClipY={volumeClipY}
              />
            )
          ) : selectedModel && modelFileError ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#e0e1dd',
              textAlign: 'center',
              gap: '12px',
              padding: '20px'
            }}>
              <h3 style={{ margin: 0, color: '#ff6b6b' }}>Failed to load selected model</h3>
              <p style={{ margin: 0, color: '#778da9' }}>{modelFileError}</p>
              <button
                className="add-btn"
                onClick={() => loadModelFile(selectedModel)}
                disabled={loadingModelFile}
              >
                Retry Loading
              </button>
            </div>
          ) : (
            <div className="viewer-empty">
              No model in view. Use "Load AI Output Files" in the insights panel to load
              brain.glb and tumor.glb directly from holomed-ai/output.
            </div>
          )}
        </div>
        {!presentationMode && (
          <InfoPanel
            metrics={data.metrics}
            selectedModel={selectedModel}
            findings={analysisFindings}
            analysisCaseId={analysisCaseId}
            analysisRunId={analysisRunId}
            onChangeAnalysisCaseId={setAnalysisCaseId}
            onChangeAnalysisRunId={setAnalysisRunId}
            onLoadFindings={loadFindingsAndMeshes}
            onToggleFinding={toggleFindingVisibility}
            analysisPipeline={analysisPipeline}
            onChangeAnalysisPipeline={setAnalysisPipeline}
            onRunCaseAnalysis={runCaseAnalysis}
            onPollAnalysis={pollAnalysisRun}
            analysisPolling={analysisPolling}
            onLoadVolumeRender={loadVolumeRender}
            volumeLoading={volumeLoading}
            volumeActive={displayMode === "volume" && !!volumeRenderData}
            volumeClipY={volumeClipY}
            displayMode={displayMode}
            onChangeDisplayMode={setDisplayMode}
            onLoadSimpleAiOutputs={loadSimpleAiOutputs}
            onOpenBrainScreen={() => setBrainScreenOpen(true)}
            cutawayEnabled={cutawayEnabled}
            onToggleCutaway={() => setCutawayEnabled((prev) => !prev)}
            tumorDisplayMode={tumorDisplayMode}
            onTumorDisplayModeChange={setTumorDisplayMode}
            onVolumeClipYChange={setVolumeClipY}
            onClearVolumeView={() => {
              setVolumeRenderData(null);
              setVolumeClipY(10);
            }}
          />
        )}
      </div>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
