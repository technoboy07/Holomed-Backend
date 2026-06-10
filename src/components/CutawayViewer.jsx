import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Center, Html, OrbitControls, Stage, useProgress } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { useHandTracking } from "../hooks/useHandTracking";
import { TumorSpheresAtBbox } from "./TumorLocationMarkers";

// Same as Viewer: mesh_model.py style deltas + frame-rate agnostic feel
const GESTURE_ROT_DEG_PER_UNIT = 0.5;

function LoadingOverlay() {
  const { active, progress, item } = useProgress();
  if (!active) return null;
  return (
    <Html center>
      <div
        style={{
          background: "rgba(10, 18, 30, 0.88)",
          border: "1px solid #415a77",
          borderRadius: 8,
          padding: "10px 12px",
          color: "#e0e1dd",
          minWidth: 240,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
          Loading cutaway…
        </div>
        <div
          style={{
            fontSize: 11,
            color: "#8da4bb",
            marginBottom: 8,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: 360,
          }}
        >
          {item || "Preparing assets"}
        </div>
        <div
          style={{
            height: 8,
            background: "rgba(65,90,119,0.35)",
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${Math.max(2, Math.min(100, progress))}%`,
              height: "100%",
              background: "#00b4d8",
            }}
          />
        </div>
        <div style={{ fontSize: 11, color: "#8da4bb", marginTop: 6 }}>
          {Math.round(progress)}%
        </div>
      </div>
    </Html>
  );
}

function cloneWithMaterials(scene) {
  const clone = scene.clone(true);
  clone.traverse((obj) => {
    if (!obj.isMesh) return;
    const mat = obj.material;
    if (Array.isArray(mat)) {
      obj.material = mat.map((m) => (m?.isMaterial ? m.clone() : m));
    } else if (mat?.isMaterial) {
      obj.material = mat.clone();
    }
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => {
        if (!m?.isMaterial) return;
        m.side = THREE.DoubleSide;
        m.depthWrite = true;
        m.transparent = false;
        m.opacity = 1;
        m.clippingPlanes = null;
        m.clipIntersection = false;
        m.needsUpdate = true;
      });
    }
  });
  return clone;
}

function applyClipping(scene, plane) {
  scene.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((m) => {
      if (!m?.isMaterial) return;
      m.clippingPlanes = [plane];
      m.clipIntersection = false;
      m.needsUpdate = true;
    });
  });
}

function setSceneOpacity(scene, opacity) {
  scene.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((m) => {
      if (!m?.isMaterial) return;
      m.transparent = opacity < 0.999;
      m.opacity = opacity;
      // When transparent, don't write depth, otherwise it still blocks the tumor.
      m.depthWrite = opacity >= 0.999;
      m.needsUpdate = true;
    });
  });
}

function CutawayScene({
  brainUrl,
  tumorUrl,
  cutY,
  separation,
  fadeTopOnView = true,
  viewTransform = { pitch: 0, yaw: 0, scale: 1.5 },
}) {
  const brain = useLoader(GLTFLoader, brainUrl);
  const tumorGltf = useLoader(GLTFLoader, tumorUrl);
  // Cutaway: always show GLB + small marker together (avoids mode mismatches; main viewer still uses the dropdown)
  const showTumorGlb = true;
  const showTumorSpheres = true;

  const topRef = useRef();
  const bottomRef = useRef();

  const { topScene, bottomScene } = useMemo(() => {
    const topScene = brain?.scene ? cloneWithMaterials(brain.scene) : null;
    const bottomScene = brain?.scene ? cloneWithMaterials(brain.scene) : null;
    return { topScene, bottomScene };
  }, [brain]);

  const planes = useMemo(() => {
    // Plane equation: normal · p + constant = 0
    // Fragments with distance < 0 are clipped.
    // Top half: keep y >= cutY  => normal (0, 1, 0), constant = -cutY
    // Bottom: keep y <= cutY    => normal (0,-1, 0), constant =  cutY
    const topPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -cutY);
    const bottomPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), cutY);
    return { topPlane, bottomPlane };
  }, [cutY]);

  useEffect(() => {
    if (!topScene || !bottomScene) return;
    applyClipping(topScene, planes.topPlane);
    applyClipping(bottomScene, planes.bottomPlane);
    // Start fully opaque; view-based fade updates in the render loop.
    setSceneOpacity(topScene, 1);
    setSceneOpacity(bottomScene, 1);
  }, [topScene, bottomScene, planes]);

  useEffect(() => {
    if (!fadeTopOnView) {
      if (topScene) setSceneOpacity(topScene, 1);
      if (bottomScene) setSceneOpacity(bottomScene, 1);
    }
  }, [fadeTopOnView, topScene, bottomScene]);

  // Crown is the +Y half (y >= cut after local clip). Fade that half when the view is top-down.
  useFrame(({ camera }) => {
    if (!fadeTopOnView) return;
    const scene = topRef.current?.userData?.scene;
    if (!scene) return;
    if (bottomScene) setSceneOpacity(bottomScene, 1);
    const dir = new THREE.Vector3(0, 0, 0).sub(camera.position).normalize();
    const t = THREE.MathUtils.clamp((-dir.y - 0.25) / 0.55, 0, 1);
    const opacity = 1 - 0.75 * t;
    setSceneOpacity(scene, opacity);
  });

  /** Align tumor GLB so its bbox center matches the full brain (shared pipeline local space). */
  const tumorAlign = useMemo(() => {
    if (!brain?.scene || !tumorGltf?.scene) return [0, 0, 0];
    brain.scene.updateMatrixWorld(true);
    tumorGltf.scene.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(brain.scene);
    const tb = new THREE.Box3().setFromObject(tumorGltf.scene);
    const bc = new THREE.Vector3();
    const tc = new THREE.Vector3();
    bb.getCenter(bc);
    tb.getCenter(tc);
    return [bc.x - tc.x, bc.y - tc.y, bc.z - tc.z];
  }, [brain, tumorGltf]);

  const [centerObject, setCenterObject] = useState(null);

  const halfGap = separation / 2;

  const s = viewTransform?.scale ?? 1.5;
  const pitch = viewTransform?.pitch ?? 0;
  const yaw = viewTransform?.yaw ?? 0;

  // Stage + Center: `object` only measures the two brain halves so the brain is centered;
  // the tumor is placed via bbox alignment, not the union bbox (avoids the tumor yanking the scene).
  // `adjustCamera={false}`: fixed Canvas camera.
  return (
    <Stage environment="city" intensity={0.6} adjustCamera={false}>
      <Center object={centerObject} cacheKey={centerObject ? 1 : 0}>
        <group
          rotation={[(pitch * Math.PI) / 180, (yaw * Math.PI) / 180, 0]}
          scale={[s, s, s]}
        >
          <group ref={(node) => setCenterObject(node)}>
            {bottomScene && (
              <group ref={bottomRef} position={[0, -halfGap, 0]} userData={{ scene: bottomScene }}>
                <primitive object={bottomScene} dispose={null} />
              </group>
            )}
            {topScene && (
              <group ref={topRef} position={[0, halfGap, 0]} userData={{ scene: topScene }}>
                <primitive object={topScene} dispose={null} />
              </group>
            )}
          </group>
          {(showTumorGlb || showTumorSpheres) && tumorGltf?.scene && (
            <group position={tumorAlign}>
              {showTumorGlb && <primitive object={tumorGltf.scene} dispose={null} />}
              {showTumorSpheres && <TumorSpheresAtBbox gltf={tumorGltf} />}
            </group>
          )}
        </group>
      </Center>
    </Stage>
  );
}

export default function CutawayViewer({
  brainUrl,
  tumorUrl,
  defaultCutY = 0,
  defaultSeparation = 0.55,
}) {
  const [cutY, setCutY] = useState(defaultCutY);
  const [separation, setSeparation] = useState(defaultSeparation);
  const [fadeTopOnView, setFadeTopOnView] = useState(true);
  // Default off so mouse orbit + scroll work like the main viewer; enable for pinch / two-finger zoom
  const [handZoomEnabled, setHandZoomEnabled] = useState(false);
  const [viewTransform, setViewTransform] = useState({ pitch: 0, yaw: 0, scale: 1.5 });

  const handleGesture = useCallback((gestureData) => {
    if (!handZoomEnabled) return;
    setViewTransform((prev) => ({
      pitch: prev.pitch + gestureData.rotation.pitch * GESTURE_ROT_DEG_PER_UNIT,
      yaw: prev.yaw + gestureData.rotation.yaw * GESTURE_ROT_DEG_PER_UNIT,
      scale: Math.max(0.2, Math.min(5.0, prev.scale * gestureData.scale)),
    }));
  }, [handZoomEnabled]);

  const {
    videoRef,
    isTracking,
    isEnabled,
    enableTracking,
    disableTracking,
  } = useHandTracking(handleGesture, { initialPreset: "demo" });

  useEffect(() => {
    if (handZoomEnabled && !isEnabled) {
      enableTracking();
    } else if (!handZoomEnabled && isEnabled) {
      disableTracking();
    }
  }, [handZoomEnabled, isEnabled, enableTracking, disableTracking]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        style={{
          position: "absolute",
          left: 12,
          top: 12,
          zIndex: 20,
          background: "rgba(10, 18, 30, 0.88)",
          border: "1px solid #415a77",
          borderRadius: 10,
          padding: "10px 12px",
          color: "#e0e1dd",
          width: 280,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>Cutaway controls</div>

        <label style={{ display: "block", fontSize: 11, color: "#8da4bb" }}>
          Cut position (Y): <strong style={{ color: "#e0e1dd" }}>{cutY.toFixed(2)}</strong>
          <input
            type="range"
            min={-1.0}
            max={1.0}
            step={0.01}
            value={cutY}
            onChange={(e) => setCutY(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </label>

        <label style={{ display: "block", fontSize: 11, color: "#8da4bb", marginTop: 10 }}>
          Separation: <strong style={{ color: "#e0e1dd" }}>{separation.toFixed(2)}</strong>
          <input
            type="range"
            min={0}
            max={2.0}
            step={0.01}
            value={separation}
            onChange={(e) => setSeparation(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={fadeTopOnView}
            onChange={(e) => setFadeTopOnView(e.target.checked)}
          />
          Fade upper (crown) in top-down view
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={handZoomEnabled}
            onChange={(e) => setHandZoomEnabled(e.target.checked)}
          />
          Hand gestures (pinch = rotate, two index = zoom)
        </label>
        <div style={{ fontSize: 10, color: "#778da9", marginTop: 6, lineHeight: 1.35 }}>
          Mouse: drag to orbit, scroll to zoom (full range including top-down). Optional: enable hands for pinch rotate + two-finger zoom on the model.
        </div>
      </div>

      {handZoomEnabled && (
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            zIndex: 30,
            borderRadius: "8px",
            overflow: "hidden",
            border: "2px solid #00b4d8",
            boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
          }}
        >
          <video
            ref={videoRef}
            style={{
              width: 200,
              height: 150,
              display: "block",
              transform: "scaleX(-1)",
              background: "#000",
            }}
            autoPlay
            playsInline
            muted
          />
          {isTracking && (
            <div
              style={{
                position: "absolute",
                bottom: 5,
                left: 5,
                background: "rgba(0, 180, 216, 0.8)",
                color: "white",
                padding: "4px 8px",
                borderRadius: "4px",
                fontSize: "12px",
                fontWeight: "bold",
              }}
            >
              Tracking
            </div>
          )}
        </div>
      )}

      <Canvas
        style={{ width: "100%", height: "100%" }}
        camera={{ position: [2.5, 3.2, 9], fov: 45 }}
        onCreated={({ gl }) => {
          gl.localClippingEnabled = true;
        }}
      >
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} />
        <pointLight position={[-10, -10, -10]} intensity={0.3} />

        <Suspense fallback={<LoadingOverlay />}>
          <CutawayScene
            brainUrl={brainUrl}
            tumorUrl={tumorUrl}
            cutY={cutY}
            separation={separation}
            fadeTopOnView={fadeTopOnView}
            viewTransform={viewTransform}
          />
        </Suspense>

        {/* Always on: hand-guesture mode previously removed OrbitControls, blocking mouse orbit to top-down */}
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          minPolarAngle={0}
          maxPolarAngle={Math.PI}
          minDistance={2}
          maxDistance={40}
          target={[0, 0, 0]}
        />
      </Canvas>
    </div>
  );
}

