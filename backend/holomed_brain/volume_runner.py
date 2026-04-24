"""
CLI: load NIfTI CT, optional Keras tumor slice model, emit float32 raw volumes + volume_meta.json.

Usage:
  python -m holomed_brain.volume_runner --ct /path/to/vol.nii.gz --out-dir /path/to/run_dir
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np
import nibabel as nib
from scipy import ndimage as ndi
from skimage.transform import resize


def _load_nifti_volume(path: str) -> tuple[np.ndarray, np.ndarray | None]:
    img = nib.load(path)
    data = np.ascontiguousarray(img.get_fdata(dtype=np.float32))
    if data.ndim > 3:
        data = data[..., 0]
    if data.ndim != 3:
        raise ValueError(f"Expected 3D volume, got shape {data.shape}")
    zooms = img.header.get_zooms()[:3]
    spacing = np.array(zooms, dtype=np.float64)
    if np.any(spacing <= 0) or spacing.size < 3:
        spacing = np.array([1.0, 1.0, 1.0], dtype=np.float64)
    return data, spacing


def _resample_volume(vol: np.ndarray, target_max: int) -> tuple[np.ndarray, np.ndarray]:
    """Downsample so max edge <= target_max; returns (resampled, scale_factors old/new per axis)."""
    nx, ny, nz = vol.shape
    m = max(nx, ny, nz)
    if m <= target_max:
        return vol, np.ones(3, dtype=np.float64)
    factor = target_max / float(m)
    new_shape = (
        max(4, int(round(nx * factor))),
        max(4, int(round(ny * factor))),
        max(4, int(round(nz * factor))),
    )
    zoom_factors = (new_shape[0] / nx, new_shape[1] / ny, new_shape[2] / nz)
    resampled = ndi.zoom(vol, zoom_factors, order=1, mode="nearest")
    # spacing scales inversely when downsampling voxel count
    scale = np.array([nx / new_shape[0], ny / new_shape[1], nz / new_shape[2]], dtype=np.float64)
    return resampled.astype(np.float32), scale


def _normalize_intensity_window(vol: np.ndarray) -> np.ndarray:
    lo, hi = np.percentile(vol, (1.0, 99.0))
    if hi <= lo:
        lo, hi = float(vol.min()), float(vol.max()) + 1e-6
    out = (vol - lo) / (hi - lo)
    return np.clip(out, 0.0, 1.0).astype(np.float32)


def _brain_mask(intensity: np.ndarray) -> np.ndarray:
    """Simple brain-ish mask on normalized intensity."""
    m = intensity > 0.12
    m = ndi.binary_closing(m, iterations=2)
    m = ndi.binary_fill_holes(m)
    return m.astype(np.float32)


def _heuristic_tumor_mask(intensity: np.ndarray, brain: np.ndarray) -> np.ndarray:
    """Bright-region mask inside brain when no Keras model (demo / dev)."""
    inside = brain > 0.5
    thr = np.percentile(intensity[inside], 97.0) if np.any(inside) else 0.9
    t = ((intensity >= thr) & inside).astype(np.float32)
    t = ndi.binary_opening(t > 0.5, iterations=1).astype(np.float32)
    t = ndi.binary_dilation(t > 0.5, iterations=2).astype(np.float32)
    if np.sum(t) < 8:
        # tiny seed for empty volumes — still geometrically plausible
        cx, cy, cz = [s // 2 for s in intensity.shape]
        t[cx - 4 : cx + 4, cy - 4 : cy + 4, cz - 4 : cz + 4] = 1.0
    return t.astype(np.float32)


def _keras_tumor_mask(intensity: np.ndarray, model_path: str) -> np.ndarray:
    from tensorflow.keras.models import load_model  # type: ignore

    model = load_model(model_path)
    nx, ny, nz = intensity.shape
    masks = []
    for z in range(nz):
        sl = intensity[:, :, z]
        sl256 = resize(sl, (256, 256), order=1, preserve_range=True, anti_aliasing=True).astype(
            np.float32
        )
        mx = float(sl256.max())
        if mx > 0:
            sl256 = sl256 / mx
        x = sl256[np.newaxis, ..., np.newaxis]
        pred = model.predict(x, verbose=0)[0]
        mask = (pred[:, :, 0] > 0.3).astype(np.float32)
        mask_rs = resize(mask, (nx, ny), order=0, preserve_range=True).astype(np.float32)
        masks.append(mask_rs)
    return np.stack(masks, axis=-1).astype(np.float32)


def run_pipeline(*, ct_path: str, out_dir: str, target_max_edge: int = 128) -> str:
    os.makedirs(out_dir, exist_ok=True)
    vol, spacing = _load_nifti_volume(ct_path)
    vol_r, scale = _resample_volume(vol, target_max_edge)
    spacing_adj = spacing * scale

    intensity = _normalize_intensity_window(vol_r)
    brain = _brain_mask(intensity)

    model_path = os.environ.get("HOLOMED_BRAIN_MODEL", "").strip()
    if model_path and os.path.isfile(model_path):
        try:
            tumor = _keras_tumor_mask(intensity, model_path)
        except Exception as e:
            print(f"Keras inference failed, using heuristic: {e}", file=sys.stderr)
            tumor = _heuristic_tumor_mask(intensity, brain)
    else:
        tumor = _heuristic_tumor_mask(intensity, brain)

    nx, ny, nz = intensity.shape
    meta = {
        "format_version": 1,
        "nx": int(nx),
        "ny": int(ny),
        "nz": int(nz),
        "spacing_mm": [float(spacing_adj[0]), float(spacing_adj[1]), float(spacing_adj[2])],
        "intensity_file": "intensity_f32.raw",
        "tumor_file": "tumor_f32.raw",
        "intensity_min": 0.0,
        "intensity_max": 1.0,
        "notes": "HoloMed brain_volume_v1 pipeline",
    }

    intensity_path = os.path.join(out_dir, "intensity_f32.raw")
    tumor_path = os.path.join(out_dir, "tumor_f32.raw")
    meta_path = os.path.join(out_dir, "volume_meta.json")

    intensity.ravel(order="C").tofile(intensity_path)
    tumor.ravel(order="C").tofile(tumor_path)
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    print(f"Wrote volume_meta.json and raw volumes under {out_dir}", file=sys.stderr)
    return meta_path


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--ct", required=True, help="Path to NIfTI .nii or .nii.gz")
    p.add_argument("--out-dir", required=True)
    p.add_argument("--max-edge", type=int, default=128, help="Max voxel extent after resample")
    args = p.parse_args()
    try:
        run_pipeline(ct_path=args.ct, out_dir=args.out_dir, target_max_edge=args.max_edge)
    except Exception as e:
        print(str(e), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
