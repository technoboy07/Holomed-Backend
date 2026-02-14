import React, { useState } from "react";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import Viewer from "./components/Viewer";
import InfoPanel from "./components/InfoPanel";
import "./App.css";

function App() {
  const [selectedModel, setSelectedModel] = useState("scene_NIH3D.stl");

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

  return (
    <div className="app-container">
      <Header />

      <div className="main-content">
        <Sidebar onSelectModel={setSelectedModel} selectedModel={selectedModel} />

        <div className="viewer-container">
          <Viewer transform={data.transform} modelPath={selectedModel} />
          <InfoPanel metrics={data.metrics} />
        </div>
      </div>
    </div>
  );
}

export default App;
