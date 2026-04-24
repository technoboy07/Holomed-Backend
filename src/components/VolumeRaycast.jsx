import React, { useRef, useMemo, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const VOL_VERT = /* glsl */ `#version 300 es
precision highp float;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 uCamPos;
uniform mat4 uInvModel;
in vec3 position;
out vec3 vRayOrigin;
out vec3 vRayDir;

void main() {
  vec4 camLocal = uInvModel * vec4(uCamPos, 1.0);
  vRayOrigin = camLocal.xyz;
  vRayDir = position - camLocal.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const VOL_FRAG = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler3D;

in vec3 vRayOrigin;
in vec3 vRayDir;

uniform sampler3D mapIntensity;
uniform sampler3D mapTumor;
uniform float clipLocalY;
uniform float uMaxSteps;

out vec4 fragColor;

vec2 hitBox(vec3 orig, vec3 dir) {
  vec3 box_min = vec3(-0.5);
  vec3 box_max = vec3(0.5);
  vec3 inv_dir = 1.0 / dir;
  vec3 tmin = (box_min - orig) * inv_dir;
  vec3 tmax = (box_max - orig) * inv_dir;
  vec3 t1 = min(tmin, tmax);
  vec3 t2 = max(tmin, tmax);
  float tNear = max(max(t1.x, t1.y), t1.z);
  float tFar = min(min(t2.x, t2.y), t2.z);
  return vec2(tNear, tFar);
}

void main() {
  vec3 rayDir = normalize(vRayDir);
  vec2 bounds = hitBox(vRayOrigin, rayDir);
  if (bounds.x > bounds.y) discard;
  float t0 = max(bounds.x, 0.0);
  float t1 = bounds.y;
  float len = t1 - t0;
  float nSteps = max(8.0, min(uMaxSteps, 256.0));
  float dt = len / nSteps;
  vec3 p = vRayOrigin + t0 * rayDir;

  vec4 acc = vec4(0.0);
  for (int i = 0; i < 256; i++) {
    if (float(i) >= nSteps) break;
    if (p.y > clipLocalY) {
      p += rayDir * dt;
      continue;
    }
    vec3 uvw = p + vec3(0.5);
    float d = texture(mapIntensity, uvw).r;
    float tu = texture(mapTumor, uvw).r;
    vec3 gray = vec3(0.72, 0.75, 0.8) * (0.15 + 0.85 * d);
    vec3 tcol = vec3(1.0, 0.12, 0.1);
    vec3 col = mix(gray, tcol, clamp(tu, 0.0, 1.0));
    // Slightly stronger opacity so small/low-contrast volumes remain visible.
    float alpha = 0.02 + d * 0.055 + tu * 0.2;
    acc.rgb += (1.0 - acc.a) * alpha * col;
    acc.a += (1.0 - acc.a) * alpha;
    if (acc.a > 0.96) break;
    p += rayDir * dt;
  }

  if (acc.a < 0.001) discard;
  fragColor = vec4(acc.rgb, acc.a);
}
`;

function make3DTexture(floatArray, nx, ny, nz) {
  const tex = new THREE.Data3DTexture(floatArray, nx, ny, nz);
  tex.format = THREE.RedFormat;
  tex.type = THREE.FloatType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.wrapR = THREE.ClampToEdgeWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

export function VolumeRaycastMesh({
  nx,
  ny,
  nz,
  spacingMm = [1, 1, 1],
  intensity,
  tumor,
  clipLocalY = 10,
  maxSteps = 160,
}) {
  const meshRef = useRef(null);
  const { camera } = useThree();

  const { material, disposeTextures } = useMemo(() => {
    const texI = make3DTexture(intensity, nx, ny, nz);
    const texT = make3DTexture(tumor, nx, ny, nz);
    const u = {
      mapIntensity: { value: texI },
      mapTumor: { value: texT },
      uCamPos: { value: new THREE.Vector3() },
      uInvModel: { value: new THREE.Matrix4() },
      clipLocalY: { value: 10.0 },
      uMaxSteps: { value: maxSteps },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: VOL_VERT,
      fragmentShader: VOL_FRAG,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      glslVersion: THREE.GLSL3,
    });
    const disposeTextures = () => {
      texI.dispose();
      texT.dispose();
      mat.dispose();
    };
    return { material: mat, disposeTextures };
  }, [intensity, tumor, nx, ny, nz, maxSteps]);

  useEffect(() => () => disposeTextures(), [disposeTextures]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const mat = mesh.material;
    mesh.updateMatrixWorld(true);
    mat.uniforms.uInvModel.value.copy(mesh.matrixWorld).invert();
    mat.uniforms.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
    mat.uniforms.clipLocalY.value = clipLocalY;
  });

  const sx = (spacingMm[0] || 1) * nx;
  const sy = (spacingMm[1] || 1) * ny;
  const sz = (spacingMm[2] || 1) * nz;
  const mx = Math.max(sx, sy, sz, 1e-6);
  const scale = [(sx / mx) * 3.2, (sy / mx) * 3.2, (sz / mx) * 3.2];

  return (
    <mesh ref={meshRef} scale={scale} material={material}>
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  );
}

export default function VolumeRaycast(props) {
  return <VolumeRaycastMesh {...props} />;
}
