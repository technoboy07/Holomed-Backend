# Volume render contract (HoloMed brain / CT MVP)

## Format version

`format_version: 1`

## Axis convention

- Volumes are stored as **Fortran-order contiguous float32** arrays with logical shape **`(nx, ny, nz)`**.
- **World ↔ volume**: In the WebGL viewer, a unit axis-aligned box is **non-uniformly scaled** so edge lengths are proportional to `spacing_mm * dimensions` per axis. Shader raymarching uses **object space** aligned with that box; texture coordinates map linearly from box min corner to max corner.
- **NIfTI source**: nibabel array order follows the NIfTI file; the runner documents actual `nx, ny, nz` after any resample. For MVP, spacing defaults to **isotropic 1 mm** if absent from the header.

## Files (per analysis run directory)

| File | Description |
|------|-------------|
| `volume_meta.json` | Metadata (JSON, UTF-8). |
| `intensity_f32.raw` | Little-endian `float32`, length `nx*ny*nz`, C-order layout `idx = x + nx*(y + ny*z)`. |
| `tumor_f32.raw` | Same layout/shape, values in `[0, 1]` (probability or binary mask). |

## `volume_meta.json` schema

```json
{
  "format_version": 1,
  "nx": 256,
  "ny": 256,
  "nz": 128,
  "spacing_mm": [1.0, 1.0, 1.0],
  "intensity_file": "intensity_f32.raw",
  "tumor_file": "tumor_f32.raw",
  "intensity_min": 0.0,
  "intensity_max": 1.0,
  "notes": "optional"
}
```

## HTTP

- `GET /api/cases/{case_id}/volumes/{run_id}` returns `volume_meta.json` body (after auth).
- `GET /api/cases/{case_id}/volumes/{run_id}/intensity` returns `application/octet-stream` of `intensity_f32.raw`.
- `GET /api/cases/{case_id}/volumes/{run_id}/tumor` returns `application/octet-stream` of `tumor_f32.raw`.

Artifact IDs for these files are stored on `AnalysisRun.outputs.volume_render` for discovery.

## Clip plane (viewer)

- **Horizontal slice** is implemented as a **world-space Y** clipping plane (normal `(0, 1, 0)`), with offset driven by a UI slider. Samples with `position.y` above the plane threshold are discarded so the upper part of the volume is “removed,” revealing the interior. The tumor channel uses the same clip so both stay registered.
