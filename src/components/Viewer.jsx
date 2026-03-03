import React, { Suspense, useMemo, useState, useCallback, useEffect } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader";
import { VTKLoader } from "three/examples/jsm/loaders/VTKLoader";
import { Stage, Center, OrbitControls } from "@react-three/drei";
import { useHandTracking } from "../hooks/useHandTracking";

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

function Model({ transform, modelPath, modelFormat }) {
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
        // GLTFLoader returns a scene, extract the first mesh
        if (modelData?.scene) {
          const mesh = findFirstMesh(modelData.scene);
          if (mesh?.geometry) {
            return { geometry: mesh.geometry, object: null };
          }
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

  return (
    <mesh
      geometry={renderData.geometry}
      rotation={[transform.pitch * Math.PI / 180, transform.yaw * Math.PI / 180, 0]}
      scale={[transform.scale, transform.scale, transform.scale]}
    >
      <meshStandardMaterial color="#f0f0f0" roughness={0.3} metalness={0.2} />
    </mesh>
  );
}

export default function Viewer({ transform: initialTransform, modelPath, enableHandTracking = false, modelFormat = "stl" }) {
  const [transform, setTransform] = useState(initialTransform || { pitch: 0, yaw: 0, scale: 1.5 });
  const [handTrackingEnabled, setHandTrackingEnabled] = useState(enableHandTracking);

  const handleGesture = useCallback((gestureData) => {
    if (handTrackingEnabled) {
      setTransform(prev => ({
        pitch: prev.pitch + gestureData.rotation.pitch * 0.01,
        yaw: prev.yaw + gestureData.rotation.yaw * 0.01,
        scale: Math.max(0.2, Math.min(5.0, prev.scale * gestureData.scale))
      }));
    }
  }, [handTrackingEnabled]);

  const { videoRef, isTracking, isEnabled, enableTracking, disableTracking } = useHandTracking(handleGesture);

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

  return (
    <div className="viewer-area" style={{ position: 'relative' }}>
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
      
      <Canvas camera={{ position: [0, 0, 10], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} />
        <pointLight position={[-10, -10, -10]} intensity={0.3} />

        {modelPath ? (
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
                />
              </Center>
            </Stage>
          </Suspense>
        ) : (
          <mesh>
            <boxGeometry args={[2, 2, 2]} />
            <meshStandardMaterial color="#888888" />
          </mesh>
        )}

        {!handTrackingEnabled && <OrbitControls />}
      </Canvas>
    </div>
  );
}
