"""Create Artifact rows for volume render outputs."""

from __future__ import annotations

import os
import json
from typing import Any, Dict

import numpy as np
import trimesh
from skimage.measure import marching_cubes

from models import AnalysisRun, Artifact
from models import Finding


async def persist_volume_render_artifacts(
    *,
    run: AnalysisRun,
    run_dir: str,
) -> Dict[str, Any]:
    """Register intensity + tumor raw files and volume_meta.json as artifacts."""
    meta_path = os.path.join(run_dir, "volume_meta.json")
    intensity_path = os.path.join(run_dir, "intensity_f32.raw")
    tumor_path = os.path.join(run_dir, "tumor_f32.raw")

    if not all(os.path.exists(p) for p in (meta_path, intensity_path, tumor_path)):
        raise RuntimeError("Volume pipeline did not produce expected files in run_dir")

    report_artifact = Artifact(
        user_id=run.user_id,
        case_id=run.case_id,
        type="report_json",
        name=os.path.basename(meta_path),
        file_path=meta_path,
        file_format="json",
        file_size=os.path.getsize(meta_path),
    )
    await report_artifact.insert()

    int_artifact = Artifact(
        user_id=run.user_id,
        case_id=run.case_id,
        type="intensity_volume",
        name="intensity_f32.raw",
        file_path=intensity_path,
        file_format="raw",
        file_size=os.path.getsize(intensity_path),
    )
    await int_artifact.insert()

    tumor_artifact = Artifact(
        user_id=run.user_id,
        case_id=run.case_id,
        type="mask_volume",
        name="tumor_f32.raw",
        file_path=tumor_path,
        file_format="raw",
        file_size=os.path.getsize(tumor_path),
    )
    await tumor_artifact.insert()

    return {
        "volume_render": {
            "format_version": 1,
            "meta_artifact_id": str(report_artifact.id),
            "intensity_artifact_id": str(int_artifact.id),
            "tumor_mask_artifact_id": str(tumor_artifact.id),
        }
    }


async def persist_brain_mesh_finding(
    *,
    run: AnalysisRun,
    run_dir: str,
) -> Dict[str, Any]:
    """Create a GLB mesh + Finding from brain_volume_v1 tumor mask output."""
    meta_path = os.path.join(run_dir, "volume_meta.json")
    tumor_path = os.path.join(run_dir, "tumor_f32.raw")
    if not os.path.exists(meta_path) or not os.path.exists(tumor_path):
        return {}

    with open(meta_path, "r", encoding="utf-8") as f:
        meta = json.load(f)

    nx = int(meta.get("nx", 0))
    ny = int(meta.get("ny", 0))
    nz = int(meta.get("nz", 0))
    spacing = meta.get("spacing_mm", [1.0, 1.0, 1.0])
    if nx <= 1 or ny <= 1 or nz <= 1:
        return {}

    raw = np.fromfile(tumor_path, dtype=np.float32)
    expected = nx * ny * nz
    if raw.size != expected:
        return {}

    mask = raw.reshape((nx, ny, nz), order="C")
    if np.max(mask) <= 0.01:
        return {}

    # Convert segmentation volume into an isosurface mesh.
    verts, faces, _, _ = marching_cubes(mask, level=0.5, spacing=tuple(float(v) for v in spacing))
    if verts.size == 0 or faces.size == 0:
        return {}

    # Normalize into a stable local frame around origin for consistent viewer placement.
    mins = verts.min(axis=0)
    maxs = verts.max(axis=0)
    center = (mins + maxs) / 2.0
    extent = np.maximum(maxs - mins, 1e-6)
    scale = float(np.max(extent))
    verts = (verts - center) / scale * 2.2

    mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=False)
    mesh_name = f"case_{run.case_id}_run_{str(run.id)}_brain_tumor_overlay.glb"
    mesh_path = os.path.join(run_dir, mesh_name)
    mesh.export(mesh_path)

    mesh_artifact = Artifact(
        user_id=run.user_id,
        case_id=run.case_id,
        type="mesh_anatomy",
        name=mesh_name,
        file_path=mesh_path,
        file_format="glb",
        file_size=os.path.getsize(mesh_path),
    )
    await mesh_artifact.insert()

    finding = Finding(
        user_id=run.user_id,
        case_id=run.case_id,
        run_id=str(run.id),
        label="brain_tumor_region",
        score=1.0,
        mesh_artifact_id=str(mesh_artifact.id),
    )
    await finding.insert()

    return {
        "brain_mesh": {
            "mesh_artifact_id": str(mesh_artifact.id),
            "finding_id": str(finding.id),
        }
    }
