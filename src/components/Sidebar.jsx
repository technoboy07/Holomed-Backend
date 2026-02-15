export default function Sidebar({ models, onSelectModel, selectedModel, loading }) {
  // Fallback to default models if no backend models available
  const defaultModels = [
    { id: 'default', name: "Brain Model", file_format: 'stl' }
  ];

  const displayModels = models && models.length > 0 ? models : defaultModels;

  return (
    <aside className="sidebar">
      <h4>3D Models</h4>
      {loading ? (
        <div style={{ color: '#778da9', padding: '10px' }}>Loading models...</div>
      ) : (
        <ul>
          {displayModels.map((model) => (
            <li
              key={model.id || model.name}
              className={selectedModel?.id === model.id ? "active" : ""}
              onClick={() => onSelectModel(model)}
              style={{ cursor: 'pointer' }}
            >
              {model.name || model.file}
              {model.file_size && (
                <span style={{ fontSize: '11px', color: '#778da9', display: 'block', marginTop: '4px' }}>
                  {(model.file_size / 1024 / 1024).toFixed(2)} MB
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {models && models.length === 0 && !loading && (
        <div style={{ color: '#778da9', padding: '10px', fontSize: '12px' }}>
          No models uploaded yet. Click "+ Add Model" to upload.
        </div>
      )}
    </aside>
  );
}
