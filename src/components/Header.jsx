import React, { useState } from "react";
import UploadModal from "./UploadModal";

function statusClass(status) {
  if (status === "up") return "status-up";
  if (status === "down") return "status-down";
  return "status-unknown";
}

export default function Header({
  user,
  onLogout,
  onModelUpload,
  API_BASE,
  token,
  onToast,
  healthStatus,
  selectedModel,
  presentationMode,
  onTogglePresentationMode,
}) {
  const [showUploadModal, setShowUploadModal] = useState(false);

  const handleAddModel = () => {
    setShowUploadModal(true);
  };

  const handleUploadSuccess = (model) => {
    onModelUpload(model);
  };

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>HOLOMED</h2>
          <div className="case-context">
            <span className="case-badge">Demo Case</span>
            <span className="case-value">
              {selectedModel?.name || "No model selected"}
            </span>
            <span className="case-meta">
              {selectedModel?.file_format?.toUpperCase() || "--"} / {selectedModel?.file_size ? `${(selectedModel.file_size / 1024 / 1024).toFixed(1)} MB` : "--"}
            </span>
          </div>
        </div>

        <div className="header-actions">
          <div className="health-strip" title="Service health indicators">
            <span className="health-item">
              <span className={`status-dot ${statusClass(healthStatus?.api)}`} />
              API
            </span>
            <span className="health-item">
              <span className={`status-dot ${statusClass(healthStatus?.auth)}`} />
              Auth
            </span>
            <span className="health-item">
              <span className={`status-dot ${statusClass(healthStatus?.model)}`} />
              Model
            </span>
          </div>
          <button className="add-btn secondary" onClick={onTogglePresentationMode}>
            {presentationMode ? "Exit Presentation" : "Presentation Mode"}
          </button>
          {user && (
            <span style={{ fontSize: '14px', color: '#778da9' }}>
              {user.email}
            </span>
          )}
          <button className="add-btn" onClick={handleAddModel}>
            + Add Model
          </button>
          {user && (
            <button 
              className="add-btn" 
              onClick={onLogout}
              style={{ background: '#6c757d', marginLeft: '5px' }}
            >
              Logout
            </button>
          )}
        </div>
      </header>
      <UploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUploadSuccess={handleUploadSuccess}
        API_BASE={API_BASE}
        token={token}
        onToast={onToast}
      />
    </>
  );
}
