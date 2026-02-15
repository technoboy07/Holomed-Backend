export default function Sidebar({ models, onSelectModel, selectedModel }) {
  // Show locally loaded models
  const displayModels = models || [];

  return (
    <aside className="sidebar">
      <h4>3D Models</h4>
      {displayModels.length > 0 ? (
        <ul>
          {displayModels.map((model) => (
            <li
              key={model.id || model.name}
              className={selectedModel?.id === model.id ? "active" : ""}
              onClick={() => onSelectModel(model)}
              style={{ cursor: 'pointer' }}
            >
              {model.name}
              {model.file_size && (
                <span style={{ fontSize: '11px', color: '#778da9', display: 'block', marginTop: '4px' }}>
                  {(model.file_size / 1024 / 1024).toFixed(2)} MB
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div style={{ color: '#778da9', padding: '10px', fontSize: '12px' }}>
          No models loaded yet. Click "+ Add Model" to load a 3D model from your computer.
        </div>
      )}
    </aside>
  );
}
