import React, { Suspense, useMemo, useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { Canvas, useLoader } from "@react-three/fiber";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader";
import { VTKLoader } from "three/examples/jsm/loaders/VTKLoader";
import { Stage, Center, OrbitControls, Line, Html } from "@react-three/drei";
import { useHandTracking } from "../hooks/useHandTracking";
import { VolumeRaycastMesh } from "./VolumeRaycast";

const AI_OVERLAY_ZOOM_THRESHOLD = 1.25;

function getLoader(format) {
  const ext = format?.toLowerCase();
  switch(ext) {
    case 'stl': return STLLoader;
    case 'obj': return OBJLoader;
    case 'ply': return PLYLoader;
    case 'vtk': return VTKLoader;
    case 'gltf':
    case 'glb': return GLTFLoader;
    default: return STLLoader;
  }
}

function FindingMesh({ meshUrl, visible = true }) {
  if (!visible) return null;
  const gltf = useLoader(GLTFLoader, meshUrl);
  if (!gltf?.scene) return null;
  return <primitive object={gltf.scene} />;
}

function findFirstMesh(node) {
  if (!node) return null;

  if (node.isMesh && node.geometry) {
    return node;
  }

  if (!node.children || node.children.length === 0) {
    return null;
  }

  for (const child of node.children) {
    const mesh = findFirstMesh(child);
    if (mesh) return mesh;
  }

  return null;
}

function distance3D(a, b) {
  return Math.sqrt(
    (a[0] - b[0]) ** 2 +
    (a[1] - b[1]) ** 2 +
    (a[2] - b[2]) ** 2
  );
}

function midpoint3D(a, b) {
  return [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
    (a[2] + b[2]) / 2,
  ];
}

function MeasurementOverlay({ measurements, pendingPoint }) {
  return (
    <>
      {measurements.map((m) => (
        <group key={m.id}>
          <Line points={[m.start, m.end]} color="#00b4d8" lineWidth={2} />
          <mesh position={m.start}>
            <sphereGeometry args={[0.08, 14, 14]} />
            <meshStandardMaterial color="#00b4d8" />
          </mesh>
          <mesh position={m.end}>
            <sphereGeometry args={[0.08, 14, 14]} />
            <meshStandardMaterial color="#00b4d8" />
          </mesh>
          <Html position={midpoint3D(m.start, m.end)} center>
            <div style={{
              background: "rgba(0,0,0,0.75)",
              color: "#e0e1dd",
              fontSize: "11px",
              padding: "4px 6px",
              borderRadius: "4px",
              border: "1px solid #415a77",
              whiteSpace: "nowrap"
            }}>
              {m.distance.toFixed(2)} units
            </div>
          </Html>
        </group>
      ))}
      {pendingPoint && (
        <mesh position={pendingPoint}>
          <sphereGeometry args={[0.09, 14, 14]} />
          <meshStandardMaterial color="#ffd166" />
        </mesh>
      )}
    </>
  );
}

function AnnotationOverlay({ annotations }) {
  return (
    <>
      {annotations.map((annotation) => (
        <group key={annotation.id}>
          <mesh position={annotation.point}>
            <sphereGeometry args={[0.1, 16, 16]} />
            <meshStandardMaterial color="#ffd166" />
          </mesh>
          <Html position={[annotation.point[0], annotation.point[1] + 0.18, annotation.point[2]]} center>
            <div style={{
              background: "rgba(0,0,0,0.75)",
              color: "#e0e1dd",
              fontSize: "11px",
              padding: "4px 6px",
              borderRadius: "4px",
              border: "1px solid #415a77",
              whiteSpace: "nowrap",
              maxWidth: "220px",
              overflow: "hidden",
              textOverflow: "ellipsis"
            }}>
              {annotation.note}
            </div>
          </Html>
        </group>
      ))}
    </>
  );
}

function Model({ transform, modelPath, modelFormat, interactionMode, onSurfacePick }) {
  // For local files, modelPath is already a blob URL - no need for authentication
  // Only load if we have a valid path
  if (!modelPath || modelPath === '' || modelPath === 'undefined') {
    return (
      <mesh
        rotation={[transform.pitch * Math.PI / 180, transform.yaw * Math.PI / 180, 0]}
        scale={[transform.scale, transform.scale, transform.scale]}
      >
        <boxGeometry args={[2, 2, 2]} />
        <meshStandardMaterial color="#888888" roughness={0.3} metalness={0.2} />
      </mesh>
    );
  }

  const loader = getLoader(modelFormat);
  
  // useLoader MUST be called unconditionally
  const modelData = useLoader(
    loader, 
    modelPath, 
    undefined, 
    (error) => {
      console.error("Error loading model:", error);
    }
  );

  // Handle different loader return types
  const renderData = useMemo(() => {
    const format = modelFormat?.toLowerCase();

    try {
      if (format === 'gltf' || format === 'glb') {
        // GLTFLoader returns a full scene graph; render it directly.
        if (modelData?.scene) {
          return { geometry: null, object: modelData.scene.clone(true) };
        }
        return { geometry: null, object: null };
      } else if (format === 'obj') {
        // OBJLoader returns an object with children
        const mesh = findFirstMesh(modelData);
        if (mesh?.geometry) {
          return { geometry: mesh.geometry, object: null };
        }
        return { geometry: null, object: null };
      } else {
        // STL/PLY/VTK loaders return geometry directly
        return { geometry: modelData, object: null };
      }
    } catch (error) {
      console.error("Error extracting geometry:", error);
      return { geometry: null, object: null };
    }
  }, [modelData, modelFormat]);

  // Fallback to placeholder if extraction fails
  if (!renderData.geometry && !renderData.object) {
    return (
      <mesh
        rotation={[transform.pitch * Math.PI / 180, transform.yaw * Math.PI / 180, 0]}
        scale={[transform.scale, transform.scale, transform.scale]}
      >
        <boxGeometry args={[2, 2, 2]} />
        <meshStandardMaterial color="#ff6b6b" roughness={0.3} metalness={0.2} />
      </mesh>
    );
  }

  if (renderData.object) {
    return (
      <group
        rotation={[transform.pitch * Math.PI / 180, transform.yaw * Math.PI / 180, 0]}
        scale={[transform.scale, transform.scale, transform.scale]}
        onPointerDown={(event) => {
          if (interactionMode === "navigate" || !onSurfacePick) return;
          event.stopPropagation();
          onSurfacePick(event.point);
        }}
      >
        <primitive object={renderData.object} />
      </group>
    );
  }

  return (
    <mesh
      geometry={renderData.geometry}
      rotation={[transform.pitch * Math.PI / 180, transform.yaw * Math.PI / 180, 0]}
      scale={[transform.scale, transform.scale, transform.scale]}
      onPointerDown={(event) => {
        if (interactionMode === "navigate" || !onSurfacePick) return;
        event.stopPropagation();
        onSurfacePick(event.point);
      }}
    >
      <meshStandardMaterial color="#f0f0f0" roughness={0.3} metalness={0.2} />
    </mesh>
  );
}

export default function Viewer({
  transform: initialTransform,
  modelPath,
  enableHandTracking = false,
  modelFormat = "stl",
  findingMeshes = [],
  volumeData = null,
  volumeClipY = 10,
}) {
  const [transform, setTransform] = useState(initialTransform || { pitch: 0, yaw: 0, scale: 1.5 });
  const [handTrackingEnabled, setHandTrackingEnabled] = useState(enableHandTracking);
  const [interactionMode, setInteractionMode] = useState("navigate");
  const [pendingPoint, setPendingPoint] = useState(null);
  const [measurements, setMeasurements] = useState([]);
  const [annotations, setAnnotations] = useState([]);
  const [annotationDraft, setAnnotationDraft] = useState("Clinical note");
  const [toolsHost, setToolsHost] = useState(null);
  const aiOverlayVisible = transform.scale >= AI_OVERLAY_ZOOM_THRESHOLD;
  const hasFindingOverlays = Array.isArray(findingMeshes) && findingMeshes.some((m) => m?.url);

  const handleGesture = useCallback((gestureData) => {
    if (handTrackingEnabled) {
      setTransform(prev => ({
        pitch: prev.pitch + gestureData.rotation.pitch * 0.008,
        yaw: prev.yaw + gestureData.rotation.yaw * 0.008,
        scale: Math.max(0.2, Math.min(5.0, prev.scale * gestureData.scale))
      }));
    }
  }, [handTrackingEnabled]);

  const {
    videoRef,
    isTracking,
    isEnabled,
    enableTracking,
    disableTracking,
    trackingStatus,
    calibrationStatus,
    calibrationProgress,
    analytics,
    preset,
    settings,
    setPreset,
    updateSettings,
    startCalibration,
    presetOptions,
  } = useHandTracking(handleGesture, { initialPreset: "demo" });

  useEffect(() => {
    if (enableHandTracking && !isEnabled) {
      enableTracking();
    } else if (!enableHandTracking && isEnabled) {
      disableTracking();
    }
  }, [enableHandTracking, isEnabled, enableTracking, disableTracking]);

  // Update transform when initialTransform changes
  useEffect(() => {
    if (initialTransform) {
      setTransform(initialTransform);
    }
  }, [initialTransform]);

  useEffect(() => {
    if (interactionMode !== "measure") {
      setPendingPoint(null);
    }
  }, [interactionMode]);

  useEffect(() => {
    setMeasurements([]);
    setAnnotations([]);
    setPendingPoint(null);
  }, [modelPath, volumeData]);

  useEffect(() => {
    setToolsHost(document.getElementById("clinical-tools-host"));
  }, []);

  const addAnnotation = useCallback((point) => {
    const noteText = annotationDraft.trim() || `Annotation ${annotations.length + 1}`;
    const annotation = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      point,
      note: noteText,
    };
    setAnnotations((prev) => [...prev, annotation]);
  }, [annotationDraft, annotations.length]);

  const handleSurfacePick = useCallback((pointVector) => {
    const point = [pointVector.x, pointVector.y, pointVector.z];
    if (interactionMode === "annotate") {
      addAnnotation(point);
      return;
    }

    if (interactionMode !== "measure") return;

    if (!pendingPoint) {
      setPendingPoint(point);
      return;
    }

    const measurement = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      start: pendingPoint,
      end: point,
      distance: distance3D(pendingPoint, point),
    };
    setMeasurements((prev) => [...prev, measurement]);
    setPendingPoint(null);
  }, [pendingPoint, interactionMode, addAnnotation]);

  const removeMeasurement = useCallback((id) => {
    setMeasurements((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const updateAnnotationNote = useCallback((id, note) => {
    setAnnotations((prev) => prev.map((a) => (
      a.id === id ? { ...a, note } : a
    )));
  }, []);

  const removeAnnotation = useCallback((id) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clinicalToolsPanel = (
    <div style={{ color: "#e0e1dd" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <strong style={{ fontSize: 13 }}>Clinical Tools</strong>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <button
            onClick={() => setInteractionMode("navigate")}
            style={{
              background: interactionMode === "navigate" ? "#2ecc71" : "#00b4d8",
              border: "none",
              borderRadius: "4px",
              color: "#fff",
              padding: "4px 8px",
              cursor: "pointer",
              fontSize: "12px"
            }}
          >
            Navigate
          </button>
          <button
            onClick={() => setInteractionMode("measure")}
            style={{
              background: interactionMode === "measure" ? "#2ecc71" : "#00b4d8",
              border: "none",
              borderRadius: "4px",
              color: "#fff",
              padding: "4px 8px",
              cursor: "pointer",
              fontSize: "12px"
            }}
          >
            Measure
          </button>
          <button
            onClick={() => setInteractionMode("annotate")}
            style={{
              background: interactionMode === "annotate" ? "#2ecc71" : "#00b4d8",
              border: "none",
              borderRadius: "4px",
              color: "#fff",
              padding: "4px 8px",
              cursor: "pointer",
              fontSize: "12px"
            }}
          >
            Annotate
          </button>
        </div>
        <div style={{ fontSize: 12, color: "#778da9", marginBottom: 8 }}>
          {interactionMode === "measure"
            ? (pendingPoint ? "Pick second point on model..." : "Pick first point on model...")
            : interactionMode === "annotate"
              ? "Click model to place annotation pin"
              : "Pinch+drag to rotate, pinch open/close to zoom, or use mouse controls"}
        </div>
        <div style={{ borderTop: "1px solid #415a77", paddingTop: 8 }}>
          <strong style={{ fontSize: 12 }}>Measurements</strong>
        </div>
        <div style={{ maxHeight: 90, overflowY: "auto", marginBottom: 8 }}>
          {measurements.length === 0 ? (
            <div style={{ fontSize: 12, color: "#778da9" }}>No measurements yet</div>
          ) : (
            measurements.map((m, index) => (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: 12,
                  padding: "3px 0"
                }}
              >
                <span>M{index + 1}: {m.distance.toFixed(2)}</span>
                <button
                  onClick={() => removeMeasurement(m.id)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#ff6b6b",
                    cursor: "pointer",
                    fontSize: 12
                  }}
                >
                  remove
                </button>
              </div>
            ))
          )}
        </div>
        <button
          onClick={() => {
            setMeasurements([]);
            setPendingPoint(null);
          }}
          style={{
            width: "100%",
            background: "#415a77",
            border: "none",
            borderRadius: "4px",
            color: "#fff",
            padding: "6px",
            cursor: "pointer",
            fontSize: 12
          }}
        >
          Clear measurements
        </button>
        <div style={{ borderTop: "1px solid #415a77", paddingTop: 8, marginTop: 8 }}>
          <strong style={{ fontSize: 12 }}>Annotations</strong>
          <input
            value={annotationDraft}
            onChange={(e) => setAnnotationDraft(e.target.value)}
            placeholder="Default note text"
            style={{
              width: "100%",
              marginTop: 6,
              padding: "6px",
              borderRadius: "4px",
              border: "1px solid #415a77",
              background: "#0d1b2a",
              color: "#e0e1dd",
              fontSize: 12,
              boxSizing: "border-box"
            }}
          />
        </div>
        <div style={{ maxHeight: 90, overflowY: "auto", marginTop: 8 }}>
          {annotations.length === 0 ? (
            <div style={{ fontSize: 12, color: "#778da9" }}>No annotations yet</div>
          ) : (
            annotations.map((annotation, index) => (
              <div
                key={annotation.id}
                style={{ marginBottom: 8, borderBottom: "1px solid rgba(119,141,169,0.2)", paddingBottom: 6 }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "#778da9" }}>A{index + 1}</span>
                  <button
                    onClick={() => removeAnnotation(annotation.id)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#ff6b6b",
                      cursor: "pointer",
                      fontSize: 11
                    }}
                  >
                    remove
                  </button>
                </div>
                <input
                  value={annotation.note}
                  onChange={(e) => updateAnnotationNote(annotation.id, e.target.value)}
                  style={{
                    width: "100%",
                    marginTop: 4,
                    padding: "4px 6px",
                    borderRadius: "4px",
                    border: "1px solid #415a77",
                    background: "#0d1b2a",
                    color: "#e0e1dd",
                    fontSize: 11,
                    boxSizing: "border-box"
                  }}
                />
              </div>
            ))
          )}
        </div>
        <button
          onClick={() => setAnnotations([])}
          style={{
            width: "100%",
            background: "#415a77",
            border: "none",
            borderRadius: "4px",
            color: "#fff",
            padding: "6px",
            cursor: "pointer",
            fontSize: 12,
            marginTop: 6
          }}
        >
          Clear annotations
        </button>
        <div style={{ borderTop: "1px solid #415a77", paddingTop: 8, marginTop: 8 }}>
          <strong style={{ fontSize: 12 }}>Gesture Controls</strong>
          <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
            <label style={{ fontSize: 11, color: "#8da4bb" }}>
              Preset
              <select
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
                style={{
                  width: "100%",
                  marginTop: 4,
                  background: "#0d1b2a",
                  color: "#e0e1dd",
                  border: "1px solid #415a77",
                  borderRadius: "4px",
                  padding: "5px"
                }}
              >
                {presetOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 11, color: "#8da4bb" }}>
              Rotation Gain ({Math.round(settings.rotationGain)})
              <input
                type="range"
                min="40"
                max="180"
                step="1"
                value={settings.rotationGain}
                onChange={(e) => updateSettings({ rotationGain: Number(e.target.value) })}
                style={{ width: "100%" }}
              />
            </label>
            <label style={{ fontSize: 11, color: "#8da4bb" }}>
              Zoom Gain ({settings.zoomGain.toFixed(2)})
              <input
                type="range"
                min="1.0"
                max="1.8"
                step="0.01"
                value={settings.zoomGain}
                onChange={(e) => updateSettings({ zoomGain: Number(e.target.value) })}
                style={{ width: "100%" }}
              />
            </label>
            <label style={{ fontSize: 11, color: "#8da4bb" }}>
              Dead Zone ({settings.deadZone.toFixed(3)})
              <input
                type="range"
                min="0.004"
                max="0.02"
                step="0.001"
                value={settings.deadZone}
                onChange={(e) => updateSettings({ deadZone: Number(e.target.value) })}
                style={{ width: "100%" }}
              />
            </label>
            <label style={{ fontSize: 11, color: "#8da4bb" }}>
              Min Confidence ({settings.minConfidence.toFixed(2)})
              <input
                type="range"
                min="0.5"
                max="0.85"
                step="0.01"
                value={settings.minConfidence}
                onChange={(e) => updateSettings({ minConfidence: Number(e.target.value) })}
                style={{ width: "100%" }}
              />
            </label>
            <label style={{ fontSize: 11, color: "#8da4bb" }}>
              Frame Stride ({settings.frameStride})
              <input
                type="range"
                min="1"
                max="4"
                step="1"
                value={settings.frameStride}
                onChange={(e) => updateSettings({ frameStride: Number(e.target.value) })}
                style={{ width: "100%" }}
              />
            </label>
            <button
              onClick={startCalibration}
              className="insight-btn secondary"
              style={{ marginTop: 2 }}
            >
              Recalibrate Gestures
            </button>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: "#8da4bb", lineHeight: 1.45 }}>
            <div>Status: <strong style={{ color: "#e0e1dd" }}>{trackingStatus}</strong></div>
            <div>Calibration: <strong style={{ color: "#e0e1dd" }}>{calibrationStatus}</strong> ({calibrationProgress}%)</div>
            <div>Avg confidence: <strong style={{ color: "#e0e1dd" }}>{analytics.averageConfidence.toFixed(2)}</strong></div>
            <div>Active mode: <strong style={{ color: "#e0e1dd" }}>{analytics.activeMode}</strong></div>
            <div>Gestures detected: <strong style={{ color: "#e0e1dd" }}>{analytics.gesturesDetected}</strong></div>
            <div>False activations: <strong style={{ color: "#e0e1dd" }}>{analytics.falseActivations}</strong></div>
            <div>Dropped frames: <strong style={{ color: "#e0e1dd" }}>{analytics.droppedFrames}</strong></div>
          </div>
        </div>
      </div>
  );

  return (
    <div className="viewer-area" style={{ position: 'relative' }}>
      {toolsHost && createPortal(clinicalToolsPanel, toolsHost)}

      {handTrackingEnabled && (
        <div style={{
          position: 'absolute',
          top: 10,
          right: 10,
          zIndex: 10,
          borderRadius: '8px',
          overflow: 'hidden',
          border: '2px solid #00b4d8',
          boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
        }}>
          <video
            ref={videoRef}
            style={{
              width: 200,
              height: 150,
              display: 'block',
              transform: 'scaleX(-1)', // Mirror effect
              background: '#000'
            }}
            autoPlay
            playsInline
            muted
          />
          {isTracking && (
            <div style={{
              position: 'absolute',
              bottom: 5,
              left: 5,
              background: 'rgba(0, 180, 216, 0.8)',
              color: 'white',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 'bold'
            }}>
              Tracking Active
            </div>
          )}
        </div>
      )}

      {hasFindingOverlays && !aiOverlayVisible && (
        <div
          style={{
            position: "absolute",
            left: 12,
            bottom: 12,
            zIndex: 12,
            background: "rgba(10, 18, 30, 0.88)",
            color: "#e0e1dd",
            border: "1px solid #415a77",
            borderRadius: 6,
            padding: "8px 10px",
            fontSize: 12,
          }}
        >
          Zoom in to view AI GLB overlay
        </div>
      )}
      
      <Canvas style={{ width: "100%", height: "100%" }} camera={{ position: [0, 0, 10], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} />
        <pointLight position={[-10, -10, -10]} intensity={0.3} />

        {volumeData ? (
          <Suspense
            fallback={
              <mesh>
                <boxGeometry args={[2, 2, 2]} />
                <meshStandardMaterial color="#778da9" />
              </mesh>
            }
          >
            <Stage environment="city" intensity={0.55}>
              <Center>
                <group
                  rotation={[
                    (transform.pitch * Math.PI) / 180,
                    (transform.yaw * Math.PI) / 180,
                    0,
                  ]}
                  scale={[
                    transform.scale,
                    transform.scale,
                    transform.scale,
                  ]}
                >
                  <VolumeRaycastMesh
                    nx={volumeData.nx}
                    ny={volumeData.ny}
                    nz={volumeData.nz}
                    spacingMm={volumeData.spacing_mm}
                    intensity={volumeData.intensity}
                    tumor={volumeData.tumor}
                    clipLocalY={volumeClipY}
                  />
                </group>
              </Center>
            </Stage>
          </Suspense>
        ) : modelPath ? (
          <Suspense fallback={
            <mesh>
              <boxGeometry args={[2, 2, 2]} />
              <meshStandardMaterial color="#888888" />
            </mesh>
          }>
            <Stage environment="city" intensity={0.6}>
              <Center>
                <Model 
                  transform={transform} 
                  modelPath={modelPath}
                  modelFormat={modelFormat}
                  interactionMode={interactionMode}
                  onSurfacePick={handleSurfacePick}
                />
                <MeasurementOverlay measurements={measurements} pendingPoint={pendingPoint} />
                <AnnotationOverlay annotations={annotations} />
                {Array.isArray(findingMeshes) && findingMeshes
                  .filter((m) => m.visible && m.url)
                  .map((m) => (
                    <FindingMesh key={m.id} meshUrl={m.url} visible={aiOverlayVisible} />
                  ))}
              </Center>
            </Stage>
          </Suspense>
        ) : (
          <mesh>
            <boxGeometry args={[2, 2, 2]} />
            <meshStandardMaterial color="#888888" />
          </mesh>
        )}

        {!handTrackingEnabled && <OrbitControls enabled={interactionMode === "navigate"} />}
      </Canvas>
    </div>
  );
}
