import React, { Suspense, useMemo } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { Stage, Center, OrbitControls } from "@react-three/drei";

function Model({ transform, modelPath }) {
  const geometry = useLoader(STLLoader, "/models/brain.stl");

  return (
    <mesh
      geometry={geometry}
      rotation={[transform.pitch, transform.yaw, 0]}
      scale={[transform.scale, transform.scale, transform.scale]}
    >
      <meshStandardMaterial color="#f0f0f0" roughness={0.3} metalness={0.2} />
    </mesh>
  );
}


export default function Viewer({ transform, modelPath }) {
  return (
    <div className="viewer-area">
      <Canvas camera={{ position: [0, 0, 10], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} />

        <Suspense fallback={null}>
          <Stage environment="city" intensity={0.6}>
            <Center>
              <Model transform={transform} modelPath={modelPath} />
            </Center>
          </Stage>
        </Suspense>

        <OrbitControls />
      </Canvas>
    </div>
  );
}
