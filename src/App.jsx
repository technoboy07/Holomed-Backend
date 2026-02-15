import React, { useState, useEffect } from "react";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import Viewer from "./components/Viewer";
import InfoPanel from "./components/InfoPanel";
import LoginModal from "./components/LoginModal";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000/api";

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  const [models, setModels] = useState(() => {
    // Load models from localStorage on mount
    const saved = localStorage.getItem('localModels');
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedModel, setSelectedModel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [error, setError] = useState(null);

  const [data, setData] = useState({
    transform: { pitch: 0, yaw: 0, scale: 1.5 },
    metrics: {
      disease: "None",
      diagnosis: "Scanning...",
      treatment: "Awaiting analysis",
      volume: "1240",
      sphericity: "0.88"
    }
  });

  // Fetch user info on mount if token exists
  useEffect(() => {
    if (token) {
      fetchUserInfo();
    } else {
      setLoading(false);
      setShowLogin(true);
    }
  }, [token]);

  // Save models to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('localModels', JSON.stringify(models));
  }, [models]);

  const fetchUserInfo = async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else {
        // Token invalid, clear it
        localStorage.removeItem('token');
        setToken(null);
        setShowLogin(true);
      }
    } catch (error) {
      console.error('Failed to fetch user info:', error);
      setError('Failed to connect to server');
    }
  };

  // No need to fetch models from backend - they're stored locally

  const handleLogin = (newToken, userData) => {
    setToken(newToken);
    setUser(userData);
    localStorage.setItem('token', newToken);
    setShowLogin(false);
    // Models are already loaded from localStorage
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setModels([]);
    setSelectedModel(null);
    setShowLogin(true);
  };

  const handleModelUpload = (newModel) => {
    // Add new model to local state
    setModels(prev => [...prev, newModel]);
    // Automatically select the newly added model
    setSelectedModel(newModel);
  };

  // Determine model URL - use blob URL for local models
  const modelUrl = selectedModel?.blob_url || null;
  const modelFormat = selectedModel?.file_format || "stl";

  if (showLogin) {
    return (
      <div className="app-container">
        <LoginModal 
          onLogin={handleLogin} 
          onClose={() => {}} 
          API_BASE={API_BASE}
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
      />

      <div className="main-content">
        <Sidebar 
          models={models}
          onSelectModel={setSelectedModel} 
          selectedModel={selectedModel}
        />

        <div className="viewer-container">
          {error && (
            <div style={{
              position: 'absolute',
              top: 10,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(255, 0, 0, 0.8)',
              color: 'white',
              padding: '10px 20px',
              borderRadius: '4px',
              zIndex: 1000
            }}>
              {error}
            </div>
          )}
          {modelUrl ? (
            <Viewer 
              transform={data.transform} 
              modelPath={modelUrl}
              modelFormat={modelFormat}
              enableHandTracking={true}
            />
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
    </div>
  );
}

export default App;
