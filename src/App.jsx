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
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(null);
  const [loading, setLoading] = useState(true);
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
      fetchModels();
    } else {
      setLoading(false);
      setShowLogin(true);
    }
  }, [token]);

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

  const fetchModels = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/models`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const modelsData = await response.json();
        setModels(modelsData);
        if (modelsData.length > 0 && !selectedModel) {
          setSelectedModel(modelsData[0]);
        }
      } else {
        setError('Failed to load models');
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
      setError('Failed to connect to server');
      // Fallback to default model
      setSelectedModel({ id: 'default', name: 'Default Brain', file_format: 'stl' });
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (newToken, userData) => {
    setToken(newToken);
    setUser(userData);
    localStorage.setItem('token', newToken);
    setShowLogin(false);
    fetchModels();
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setModels([]);
    setSelectedModel(null);
    setShowLogin(true);
  };

  const handleModelUpload = () => {
    fetchModels();
  };

  // Determine model URL
  const modelUrl = selectedModel?.id === 'default' 
    ? "/models/brain.stl"
    : selectedModel 
    ? `${API_BASE}/models/${selectedModel.id}/file`
    : "/models/brain.stl";

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
        token={token}
        API_BASE={API_BASE}
      />

      <div className="main-content">
        <Sidebar 
          models={models}
          onSelectModel={setSelectedModel} 
          selectedModel={selectedModel}
          loading={loading}
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
          <Viewer 
            transform={data.transform} 
            modelPath={modelUrl}
            modelFormat={modelFormat}
            enableHandTracking={true}
          />
          <InfoPanel metrics={data.metrics} />
        </div>
      </div>
    </div>
  );
}

export default App;
