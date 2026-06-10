import React, { useMemo } from "react";
import * as THREE from "three";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

function useBboxFromGltf(gltf) {
  return useMemo(() => {
    const scene = gltf?.scene;
    if (!scene) {
      return { center: new THREE.Vector3(0, 0, 0), radius: 0.04 };
    }
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const c = new THREE.Vector3();
    const s = new THREE.Vector3();
    box.getCenter(c);
    box.getSize(s);
    const maxDim = Math.max(s.x, s.y, s.z, 1e-5);
    // Deliberately tiny “crumb” so it reads as a particle, not a second mesh.
    const r = THREE.MathUtils.clamp(maxDim * 0.14, 0.022, 0.065);
    // Bias position toward the shared scene origin (brain center) so the marker reads inside the volume
    c.lerp(new THREE.Vector3(0, 0, 0), 0.48);
    return { center: c, radius: r };
  }, [gltf]);
}

/**
 * Small crumbled neon-yellow faceted chunk at tumor GLB bounds center.
 */
export function TumorSpheresAtBbox({ gltf }) {
  const { center, radius } = useBboxFromGltf(gltf);
  if (!gltf?.scene) return null;
  const p = [center.x, center.y, center.z];
  const neon = "#dfff0a";
  const em = "#8cff00";
  return (
    <group position={p}>
      <group rotation={[0.61, 0.38, 0.22]}>
        <mesh scale={[1, 0.88, 1.06]}>
          <icosahedronGeometry args={[radius, 0]} />
          <meshStandardMaterial
            color={neon}
            emissive={em}
            emissiveIntensity={0.55}
            roughness={0.62}
            metalness={0.05}
            flatShading
            envMapIntensity={0.25}
            transparent
            opacity={0.96}
            depthWrite
          />
        </mesh>
        <mesh
          rotation={[0.2, 0.9, 0.1]}
          position={[radius * 0.2, -radius * 0.16, radius * 0.1]}
        >
          <icosahedronGeometry args={[radius * 0.42, 0]} />
          <meshStandardMaterial
            color={neon}
            emissive={em}
            emissiveIntensity={0.4}
            roughness={0.75}
            flatShading
            transparent
            opacity={0.9}
            depthWrite
          />
        </mesh>
      </group>
    </group>
  );
}

function TumorLocationMarkersInner({ url }) {
  const gltf = useLoader(GLTFLoader, url);
  return <TumorSpheresAtBbox gltf={gltf} />;
}

/**
 * @param {string} tumorGlbUrl
 */
export default function TumorLocationMarkers({ tumorGlbUrl }) {
  if (!tumorGlbUrl) return null;
  return <TumorLocationMarkersInner url={tumorGlbUrl} />;
}
