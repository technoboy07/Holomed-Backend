export default function Sidebar({ models, onSelectModel, selectedModel, onDeleteModel, loading }) {
  const displayModels = models || [];

  return (
    <aside className="sidebar">
      <h4>3D Models</h4>
      {loading && (
        <div style={{ color: '#778da9', padding: '8px 0', fontSize: '12px' }}>
          Loading models...
        </div>
      )}
      {displayModels.length > 0 ? (
        <ul>
          {displayModels.map((model) => (
            <li
              key={model.id || model.name}
              className={selectedModel?.id === model.id ? "active" : ""}
              onClick={() => onSelectModel(model)}
              style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: '8px' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                {model.name}
                {model.file_size && (
                  <span style={{ fontSize: '11px', color: '#778da9', display: 'block', marginTop: '4px' }}>
                    {(model.file_size / 1024 / 1024).toFixed(2)} MB
                  </span>
                )}
              </div>
              {onDeleteModel && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteModel(model);
                  }}
                  title="Delete model"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#ff6b6b',
                    cursor: 'pointer',
                    fontSize: '14px',
                    lineHeight: '14px',
                    padding: '2px 4px'
                  }}
                >
                  x
                </button>
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
