import React, { useState } from "react";
import UploadModal from "./UploadModal";

export default function Header({ user, onLogout, onModelUpload }) {
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
        <h2>HOLOMED</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
      />
    </>
  );
}
