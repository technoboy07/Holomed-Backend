import React, { useState, useRef, useCallback } from "react";

export default function UploadModal({ isOpen, onClose, onUploadSuccess }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);
  const xhrRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileSize, setFileSize] = useState(null);
  const [modelName, setModelName] = useState('');
  const [showNameInput, setShowNameInput] = useState(false);

  const allowedFormats = ['.stl', '.obj', '.ply', '.vtk', '.gltf', '.glb'];
  const MAX_SIZE = 100 * 1024 * 1024; // 100MB

  const validateFile = (file) => {
    if (!file) return { valid: false, error: 'No file selected' };

    const fileExt = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowedFormats.includes(fileExt)) {
      return { 
        valid: false, 
        error: `Unsupported file format. Allowed: ${allowedFormats.join(', ')}` 
      };
    }

    if (file.size > MAX_SIZE) {
      return { 
        valid: false, 
        error: `File size exceeds 100MB limit (${(file.size / 1024 / 1024).toFixed(2)}MB)` 
      };
    }

    return { valid: true };
  };

  const handleFileSelect = (file) => {
    const validation = validateFile(file);
    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    setError(null);
    setSelectedFile(file);
    setFileSize(file.size);
    setModelName(file.name.replace(/\.[^/.]+$/, '')); // Default name without extension
    setShowNameInput(true);
  };

  const handleFileUpload = async () => {
    if (!selectedFile) return;

    if (!modelName.trim()) {
      setError('Please enter a name for your model');
      return;
    }

    setError(null);
    setUploading(true);
    setProgress(0);

    try {
      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 50);

      // Create blob URL from file
      const blobUrl = URL.createObjectURL(selectedFile);
      
      // Get file extension
      const fileExt = selectedFile.name.split('.').pop().toLowerCase();
      
      // Create model object
      const model = {
        id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: modelName.trim(),
        file_format: fileExt,
        file_size: selectedFile.size,
        blob_url: blobUrl,
        created_at: new Date().toISOString()
      };

      // Complete progress
      clearInterval(progressInterval);
      setProgress(100);

      // Show success briefly before closing
      setTimeout(() => {
        onUploadSuccess(model);
        handleClose();
      }, 500);
    } catch (error) {
      console.error('Error processing file:', error);
      setError('Failed to process file. Please try again.');
      setUploading(false);
      setProgress(0);
    }
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }, []);

  const handleClose = () => {
    if (!uploading || progress === 100) {
      // Clean up XHR if still active
      if (xhrRef.current && uploading && progress < 100) {
        xhrRef.current.abort();
        xhrRef.current = null;
      }
      setError(null);
      setProgress(0);
      setSelectedFile(null);
      setFileSize(null);
      setModelName('');
      setShowNameInput(false);
      setDragActive(false);
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      onClose();
    }
  };

  if (!isOpen) return null;

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000
      }}
      onClick={handleClose}
    >
      <div 
        style={{
          background: '#1b263b',
          padding: '30px',
          borderRadius: '8px',
          width: '500px',
          maxWidth: '90%',
          border: '1px solid #415a77',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, color: '#00b4d8' }}>Upload 3D Model</h2>
          {!uploading && (
            <button
              onClick={handleClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#778da9',
                fontSize: '24px',
                cursor: 'pointer',
                padding: '0',
                width: '30px',
                height: '30px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ×
            </button>
          )}
        </div>

        {error && (
          <div style={{
            background: 'rgba(255, 0, 0, 0.2)',
            color: '#ff6b6b',
            padding: '12px',
            borderRadius: '4px',
            marginBottom: '20px',
            border: '1px solid #ff6b6b'
          }}>
            {error}
          </div>
        )}

        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${dragActive ? '#00b4d8' : '#415a77'}`,
            borderRadius: '8px',
            padding: '40px',
            textAlign: 'center',
            background: dragActive ? 'rgba(0, 180, 216, 0.1)' : 'transparent',
            transition: 'all 0.3s ease',
            cursor: uploading ? 'not-allowed' : 'pointer',
            marginBottom: '20px'
          }}
          onClick={() => !uploading && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".stl,.obj,.ply,.vtk,.gltf,.glb"
            style={{ display: 'none' }}
            onChange={handleFileInputChange}
            disabled={uploading}
          />
          
          {uploading ? (
            <div>
              <div style={{ fontSize: '48px', marginBottom: '10px' }}>📤</div>
              <p style={{ color: '#e0e1dd', margin: '10px 0' }}>Uploading {modelName}...</p>
              <div style={{
                width: '100%',
                height: '8px',
                background: '#0d1b2a',
                borderRadius: '4px',
                overflow: 'hidden',
                marginTop: '15px'
              }}>
                <div style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: '#00b4d8',
                  transition: 'width 0.3s ease',
                  borderRadius: '4px'
                }} />
              </div>
              <p style={{ color: '#778da9', fontSize: '14px', marginTop: '10px' }}>
                {progress.toFixed(1)}% • {fileSize ? formatFileSize((progress / 100) * fileSize) : ''} / {fileSize ? formatFileSize(fileSize) : ''}
              </p>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '48px', marginBottom: '10px' }}>📁</div>
              <p style={{ color: '#e0e1dd', margin: '10px 0', fontSize: '18px' }}>
                Drag and drop your 3D model here
              </p>
              <p style={{ color: '#778da9', margin: '5px 0', fontSize: '14px' }}>
                or click to browse
              </p>
              <p style={{ color: '#778da9', margin: '15px 0 0 0', fontSize: '12px' }}>
                Supported formats: STL, OBJ, PLY, VTK, GLTF, GLB
              </p>
              <p style={{ color: '#778da9', margin: '5px 0', fontSize: '12px' }}>
                Max file size: 100MB
              </p>
            </div>
          )}
        </div>

        {showNameInput && !uploading && selectedFile && (
          <div style={{ marginBottom: '20px' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '8px', 
              color: '#e0e1dd',
              fontSize: '14px',
              fontWeight: '500'
            }}>
              Model Name
            </label>
            <input
              type="text"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="Enter a name for your model"
              style={{
                width: '100%',
                padding: '10px',
                background: '#0d1b2a',
                border: '1px solid #415a77',
                borderRadius: '4px',
                color: '#e0e1dd',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
              autoFocus
            />
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginTop: '15px'
            }}>
              <button
                onClick={() => {
                  setSelectedFile(null);
                  setShowNameInput(false);
                  setModelName('');
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }}
                style={{
                  background: 'transparent',
                  border: '1px solid #415a77',
                  padding: '8px 16px',
                  borderRadius: '4px',
                  color: '#778da9',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Change File
              </button>
              <button
                onClick={handleFileUpload}
                disabled={!modelName.trim()}
                style={{
                  background: modelName.trim() ? '#00b4d8' : '#415a77',
                  border: 'none',
                  padding: '8px 20px',
                  borderRadius: '4px',
                  color: 'white',
                  cursor: modelName.trim() ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}
              >
                Upload Model
              </button>
            </div>
            <p style={{ 
              color: '#778da9', 
              fontSize: '12px', 
              marginTop: '8px',
              marginBottom: 0
            }}>
              Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
            </p>
          </div>
        )}

        {uploading && progress === 100 && (
          <div style={{
            textAlign: 'center',
            marginTop: '20px',
            color: '#00b4d8',
            fontSize: '16px',
            fontWeight: 'bold'
          }}>
            ✓ Upload Complete!
          </div>
        )}

        {uploading && progress < 100 && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: '20px'
          }}>
            <button
              onClick={() => {
                // Properly abort the XHR request
                if (xhrRef.current) {
                  xhrRef.current.abort();
                  xhrRef.current = null;
                }
                setUploading(false);
                setProgress(0);
                setError('Upload cancelled');
                setSelectedFile(null);
                setFileSize(null);
                setModelName('');
                setShowNameInput(false);
              }}
              style={{
                background: '#6c757d',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '4px',
                color: 'white',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.background = '#5a6268'}
              onMouseLeave={(e) => e.target.style.background = '#6c757d'}
            >
              Cancel Upload
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
