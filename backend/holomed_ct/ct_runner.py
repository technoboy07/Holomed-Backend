from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from typing import Any, Dict, List

from holomed_ct.lung_nodule_detect import detect_lung_nodules_cccwhd_world
from holomed_ct.mesh import ellipsoid_glb_from_world_box_cccwhd, mask_xyz_to_glb_mesh_world


def _select_component_near_point(mask_xyz, pt_xyz):
    """Return a binary mask of the connected component that contains pt, else nearest component.

    mask_xyz: (X,Y,Z) uint8
    pt_xyz: [x,y,z] int in same voxel space
    """
    import numpy as np
    from scipy import ndimage

    mask = (mask_xyz > 0).astype(np.uint8)
    if mask.max() == 0:
        return mask

    labeled, n = ndimage.label(mask)
    if n <= 1:
        return mask

    x, y, z = pt_xyz
    if 0 <= x < labeled.shape[0] and 0 <= y < labeled.shape[1] and 0 <= z < labeled.shape[2]:
        lab = int(labeled[x, y, z])
        if lab > 0:
            return (labeled == lab).astype(np.uint8)

    # otherwise pick the component with centroid closest to pt
    centroids = ndimage.center_of_mass(mask, labeled, index=list(range(1, n + 1)))
    pt = np.array([x, y, z], dtype=np.float32)
    best_i = None
    best_d = None
    for i, c in enumerate(centroids, start=1):
        if c is None:
            continue
        c = np.array(c, dtype=np.float32)
        d = float(np.sum((c - pt) ** 2))
        if best_d is None or d < best_d:
            best_d = d
            best_i = i
    if best_i is None:
        return mask
    return (labeled == best_i).astype(np.uint8)


def main():
    parser = argparse.ArgumentParser(description="HoloMed CT runner (Phase 2).")
    parser.add_argument("--ct", required=True, help="Path to CT NIfTI (.nii/.nii.gz)")
    parser.add_argument("--bundle-root", required=True, help="Path to lung_nodule_ct_detection bundle root")
    parser.add_argument("--vista3d-root", default=None, help="Path to VISTA3D bundle root (optional)")
    parser.add_argument("--out-dir", required=True, help="Directory to write derived meshes")
    parser.add_argument("--out-json", required=True, help="Path to write findings JSON")
    parser.add_argument("--max-findings", type=int, default=50)
    args = parser.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)

    # Load CT affine for world<->voxel conversion (required for point prompts + world-aligned meshes)
    import nibabel as nib
    import numpy as np

    ct_img = nib.load(args.ct)
    ct_affine = ct_img.affine
    inv_affine = np.linalg.inv(ct_affine)

    detections = detect_lung_nodules_cccwhd_world(ct_path=args.ct, bundle_root=args.bundle_root)

    findings: List[Dict[str, Any]] = []
    for i, det in enumerate(detections[: args.max_findings]):
        cx, cy, cz = det.c
        w, h, d = det.whd
        bbox_world = {
            "min": [cx - w / 2.0, cy - h / 2.0, cz - d / 2.0],
            "max": [cx + w / 2.0, cy + h / 2.0, cz + d / 2.0],
        }

        # Phase 2.5: prefer true mask-based segmentation using VISTA3D (point prompt).
        # If VISTA3D not configured, fall back to ellipsoid.
        mesh_filename = f"finding_{i+1:03d}.glb"
        mesh_path = os.path.join(args.out_dir, mesh_filename)

        segmentation_method = "ellipsoid_from_detection_box_v0"
        mask_path = None

        if args.vista3d_root:
            # Convert world center (RAS mm) -> voxel indices (x,y,z) in original image space.
            vx, vy, vz = nib.affines.apply_affine(inv_affine, [cx, cy, cz]).tolist()
            pt = [int(round(vx)), int(round(vy)), int(round(vz))]

            out_seg_dir = os.path.join(args.out_dir, f"vista3d_{i+1:03d}")
            os.makedirs(out_seg_dir, exist_ok=True)

            # Use zero-shot label_prompt in [133..254] with point prompts.
            input_dict = {
                "image": os.path.abspath(args.ct),
                "label_prompt": [133],
                "points": [pt],
                "point_labels": [1],
            }

            cmd = [
                sys.executable,
                "-m",
                "monai.bundle",
                "run",
                "--config_file",
                os.path.join(args.vista3d_root, "configs", "inference.json"),
                "--input_dict",
                json.dumps(input_dict),
                "--output_dir",
                out_seg_dir,
            ]

            completed = subprocess.run(cmd, capture_output=True, text=True)
            if completed.returncode == 0:
                # VISTA3D writes: output_dir/<basename>/<basename>_trans.nii.gz (separate_folder=true)
                base = os.path.basename(args.ct)
                base = base[:-7] if base.lower().endswith(".nii.gz") else os.path.splitext(base)[0]
                pred_path = os.path.join(out_seg_dir, base, f"{base}_trans.nii.gz")
                if os.path.exists(pred_path):
                    pred_img = nib.load(pred_path)
                    pred = pred_img.get_fdata()

                    # Build a binary mask and mesh it in CT world coordinates
                    mask_xyz = (pred > 0.5).astype(np.uint8)
                    mask_xyz = _select_component_near_point(mask_xyz, pt)
                    if mask_xyz.max() > 0:
                        mask_path = pred_path
                        segmentation_method = "vista3d_point_prompt_zeroshot_133"
                        mask_xyz_to_glb_mesh_world(mask_xyz=mask_xyz, affine_xyz_to_world=pred_img.affine, out_path=mesh_path)
                    else:
                        ellipsoid_glb_from_world_box_cccwhd(center_world_xyz=det.c, whd_world=det.whd, out_path=mesh_path)
                else:
                    ellipsoid_glb_from_world_box_cccwhd(center_world_xyz=det.c, whd_world=det.whd, out_path=mesh_path)
            else:
                ellipsoid_glb_from_world_box_cccwhd(center_world_xyz=det.c, whd_world=det.whd, out_path=mesh_path)
        else:
            ellipsoid_glb_from_world_box_cccwhd(center_world_xyz=det.c, whd_world=det.whd, out_path=mesh_path)

        # Metrics: if we produced a mask, compute from mask; otherwise approximate from box.
        if mask_path:
            spacing = ct_img.header.get_zooms()[:3]  # (x,y,z) mm
            voxel_vol = float(spacing[0] * spacing[1] * spacing[2])
            voxel_count = int(mask_xyz.sum())
            volume_mm3 = voxel_count * voxel_vol

            coords = np.argwhere(mask_xyz > 0)
            if coords.size:
                mn = coords.min(axis=0).tolist()
                mx = coords.max(axis=0).tolist()
                # bbox in world
                mn_w = nib.affines.apply_affine(ct_affine, mn).tolist()
                mx_w = nib.affines.apply_affine(ct_affine, mx).tolist()
                bbox_world = {"min": [float(v) for v in mn_w], "max": [float(v) for v in mx_w]}
                diameter_mm = float(max(abs(mx_w[0] - mn_w[0]), abs(mx_w[1] - mn_w[1]), abs(mx_w[2] - mn_w[2])))
            else:
                diameter_mm = max(w, h, d)
        else:
            rx, ry, rz = w / 2.0, h / 2.0, d / 2.0
            volume_mm3 = (4.0 / 3.0) * 3.141592653589793 * rx * ry * rz
            diameter_mm = max(w, h, d)

        findings.append(
            {
                "label": "lung_nodule",
                "score": det.score,
                "centroid_world": [cx, cy, cz],
                "bbox_world": bbox_world,
                "volume_mm3": volume_mm3,
                "diameter_mm": diameter_mm,
                "mesh_path": mesh_path,
                "mask_path": mask_path,
                "segmentation_method": segmentation_method,
            }
        )

    with open(args.out_json, "w", encoding="utf-8") as f:
        json.dump({"findings": findings}, f, indent=2)


if __name__ == "__main__":
    main()

