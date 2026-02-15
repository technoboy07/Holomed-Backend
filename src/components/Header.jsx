import React, { useRef } from "react";

export default function Header({ user, onLogout, onModelUpload, token, API_BASE }) {
  const fileInputRef = useRef(null);

  const handleAddModel = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    const allowedFormats = ['.stl', '.obj', '.ply', '.vtk', '.gltf', '.glb'];
    const fileExt = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!allowedFormats.includes(fileExt)) {
      alert(`Unsupported file format. Allowed: ${allowedFormats.join(', ')}`);
      return;
    }

    // Validate file size (100MB limit)
    const MAX_SIZE = 100 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      alert(`File size exceeds 100MB limit`);
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE}/models/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (response.ok) {
        alert('Model uploaded successfully!');
        onModelUpload();
      } else {
        const error = await response.json();
        alert(`Upload failed: ${error.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload model. Please try again.');
    }

    // Reset file input
    e.target.value = '';
  };

  return (
    <header className="header">
      <h2>HOLOMED</h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {user && (
          <span style={{ fontSize: '14px', color: '#778da9' }}>
            {user.email}
          </span>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".stl,.obj,.ply,.vtk,.gltf,.glb"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
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
  );
}
