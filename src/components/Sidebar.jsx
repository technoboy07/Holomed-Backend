import React, { useMemo, useState } from "react";

export default function Sidebar({ models, onSelectModel, selectedModel, onDeleteModel, loading }) {
  const displayModels = models || [];
  const [query, setQuery] = useState("");

  const filteredModels = useMemo(() => {
    if (!query.trim()) return displayModels;
    const q = query.trim().toLowerCase();
    return displayModels.filter((m) =>
      (m.name || "").toLowerCase().includes(q) ||
      (m.file_format || "").toLowerCase().includes(q)
    );
  }, [displayModels, query]);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h4>Case Models</h4>
        <span className="sidebar-count">{displayModels.length}</span>
      </div>
      <input
        className="sidebar-search"
        placeholder="Search models..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {loading && (
        <div className="sidebar-loading">
          Loading models...
        </div>
      )}
      {filteredModels.length > 0 ? (
        <ul className="model-list">
          {filteredModels.map((model) => (
            <li
              key={model.id || model.name}
              className={`model-item ${selectedModel?.id === model.id ? "active" : ""}`}
              onClick={() => onSelectModel(model)}
            >
              <div className="model-main">
                <div className="model-name">{model.name}</div>
                <div className="model-meta">
                  <span>{model.file_format?.toUpperCase() || "N/A"}</span>
                  {model.file_size && (
                    <span>
                      {(model.file_size / 1024 / 1024).toFixed(2)} MB
                    </span>
                  )}
                </div>
                {model.created_at && (
                  <span className="model-date">
                    {new Date(model.created_at).toLocaleDateString()}
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
                  className="delete-model-btn"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="sidebar-empty">
          {query.trim()
            ? "No matching models found."
            : 'No models loaded yet. Click "+ Add Model" to upload a case model.'}
        </div>
      )}
    </aside>
  );
}
