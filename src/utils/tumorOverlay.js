/**
 * Identifies mesh overlay entries that represent the AI tumor GLB
 * (main viewer / holomed-ai output).
 */
export function isTumorOverlayMesh(entry) {
  if (!entry) return false;
  const label = String(entry.label || "").toLowerCase();
  const id = String(entry.id ?? "").toLowerCase();
  return label.includes("tumor") || id.includes("tumor");
}

export const TUMOR_DISPLAY = {
  GLB: "glb",
  SPHERES: "spheres",
  BOTH: "both",
};
