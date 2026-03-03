import React, { useState, useEffect, useCallback } from "react";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import Viewer from "./components/Viewer";
import InfoPanel from "./components/InfoPanel";
import LoginModal from "./components/LoginModal";
import ToastContainer from "./components/ToastContainer";
import { apiRequest, isUnauthorizedError } from "./utils/api";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000/api";
const API_ROOT = API_BASE.replace(/\/api\/?$/, "");

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

  const clearSelectedModelUrl = useCallback(() => {
    setSelectedModelUrl((prevUrl) => {
      if (prevUrl) {
        URL.revokeObjectURL(prevUrl);
      }
      return null;
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
      const modelData = await apiRequest(API_BASE, "/models", {
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
      const response = await fetch(`${API_ROOT}/health`);
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
    };
  }, [clearSelectedModelUrl]);

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
      const blob = await apiRequest(API_BASE, `/models/${model.id}/file`, {
        token,
        responseType: "blob",
      });
      setServiceHealth("api", "up");
      setServiceHealth("model", "up");
      const blobUrl = URL.createObjectURL(blob);
      setSelectedModelUrl(blobUrl);
      setError(null);
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

  const handleDeleteModel = async (model) => {
    if (!model?.id || !token) return;

    const shouldDelete = window.confirm(`Delete model "${model.name}"?`);
    if (!shouldDelete) return;

    try {
      await apiRequest(API_BASE, `/models/${model.id}`, {
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
      <Header 
        user={user} 
        onLogout={handleLogout}
        onModelUpload={handleModelUpload}
        API_BASE={API_BASE}
        token={token}
        onToast={addToast}
        healthStatus={healthStatus}
      />

      <div className="main-content">
        <Sidebar 
          models={models}
          onSelectModel={handleSelectModel}
          selectedModel={selectedModel}
          onDeleteModel={handleDeleteModel}
          loading={loadingModels}
        />

        <div className="viewer-container">
          {loadingModelFile && (
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
              Loading model...
            </div>
          )}
          {modelUrl ? (
            <Viewer 
              transform={data.transform} 
              modelPath={modelUrl}
              modelFormat={modelFormat}
              enableHandTracking={true}
            />
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
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#778da9',
              fontSize: '18px'
            }}>
              No model selected. Click "+ Add Model" to load a 3D model from your computer.
            </div>
          )}
          <InfoPanel metrics={data.metrics} />
        </div>
      </div>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
