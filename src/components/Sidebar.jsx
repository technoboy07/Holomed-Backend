export default function Sidebar({ onSelectModel, selectedModel }) {
  const models = [
    { name: "Brain Model", file: "brain.stl" },
    { name: "Skull Model", file: "scene_NIH3D.stl" },
    { name: "Heart Model", file: "heart.stl" }
  ];

  return (
    <aside className="sidebar">
      <h4>3D Models</h4>
      <ul>
        {models.map((model) => (
          <li
            key={model.file}
            className={selectedModel === model.file ? "active" : ""}
            onClick={() => onSelectModel(model.file)}
          >
            {model.name}
          </li>
        ))}
      </ul>
    </aside>
  );
}
