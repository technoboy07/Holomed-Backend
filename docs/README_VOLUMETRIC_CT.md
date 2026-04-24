# HoloMed volumetric CT (brain pipeline)

This document describes the **volumetric CT viewer**: NIfTI upload, `brain_volume_v1` analysis, raw float32 volumes, REST APIs, and the WebGL2 raymarching UI with a horizontal clip plane.

For byte-level layout of files and arrays, see **[VOLUME_RENDER_CONTRACT.md](VOLUME_RENDER_CONTRACT.md)**.

---

## What it does

1. A case stores a **CT volume** as a NIfTI artifact (`.nii` or `.nii.gz`).
2. Starting an analysis with pipeline **`brain_volume_v1`** runs a subprocess (`holomed_brain.volume_runner`) that:
   - loads and resamples the volume (default max edge **128** voxels for GPU limits),
   - builds a normalized **intensity** volume and a **tumor mask** volume (Keras if configured, otherwise a heuristic mask for development),
   - writes `volume_meta.json`, `intensity_f32.raw`, and `tumor_f32.raw` under `uploads/derived/...`.
3. MongoDB **Artifact** rows and `AnalysisRun.outputs["volume_render"]` point to those files.
4. The frontend fetches metadata and binaries, uploads them as **`Data3DTexture`**, and raymarches inside a box with a **Y clip** slider (horizontal cut).

The legacy **`nodule_seg_v1`** pipeline (MONAI / lung) is unchanged and does **not** produce `volume_render` outputs.

---

## Requirements

- **Backend**: Python env used for the subprocess must include `numpy`, `nibabel`, `scipy`, `scikit-image` (see [backend/requirements.txt](../backend/requirements.txt)). Optional: **TensorFlow** + `HOLOMED_BRAIN_MODEL` for real slice-wise Keras inference.
- **Browser**: **WebGL2** (required for `Data3DTexture` and GLSL 3.00 shaders).
- **CT format**: NIfTI only for `ct_volume` uploads (see `POST /api/cases/{case_id}/ct/upload` in the backend).

---

## Environment variables

| Variable | Purpose |
|----------|---------|
| `HOLOMED_CT_PYTHON` | Optional absolute path to the Python executable that runs `holomed_brain.volume_runner` (defaults to `backend/venv/Scripts/python.exe` on Windows if present, else `sys.executable`). |
| `HOLOMED_BRAIN_MODEL` | Optional path to a Keras `.h5` model. If set and loadable, the runner uses slice inference; otherwise it uses the built-in heuristic tumor mask. |

---

## Backend layout

| Path | Role |
|------|------|
| [backend/holomed_brain/volume_runner.py](../backend/holomed_brain/volume_runner.py) | CLI module: `--ct`, `--out-dir`, `--max-edge`. |
| [backend/holomed_brain/persist_volumes.py](../backend/holomed_brain/persist_volumes.py) | Registers artifacts after a successful run. |
| [backend/main.py](../backend/main.py) | Branches `_process_analysis_run` on `pipeline == "brain_volume_v1"`; volume HTTP routes. |

Manual run (from repo `backend/` directory, `PYTHONPATH` including backend):

```bash
python -m holomed_brain.volume_runner --ct path/to/volume.nii.gz --out-dir ./tmp_vol --max-edge 128
```

---

## HTTP API (authenticated)

All routes require the same **Bearer** token as the rest of `/api/*`.

| Method | Path | Description |
|--------|------|----------------|
| `POST` | `/api/cases/{case_id}/analyze` | Body JSON: `{ "pipeline": "brain_volume_v1" }` (optional `ct_artifact_id`). Queues processing. |
| `GET` | `/api/cases/{case_id}/analysis/{run_id}` | Poll `status` until `succeeded` or `failed`. |
| `GET` | `/api/cases/{case_id}/volumes/{run_id}` | JSON metadata (`VolumeRenderMetaResponse`). |
| `GET` | `/api/cases/{case_id}/volumes/{run_id}/intensity` | Raw `float32` intensity blob. |
| `GET` | `/api/cases/{case_id}/volumes/{run_id}/tumor` | Raw `float32` tumor mask blob. |

Volume routes return **404** if the run has no `outputs.volume_render` (for example, a lung `nodule_seg_v1` run). They return **409** if the run has not finished with `status: succeeded`.

---

## Frontend workflow

In the app **Insights** panel (case / CT workflow):

1. Enter **Case ID** and ensure a **NIfTI CT** is uploaded for that case.
2. Select pipeline **`brain_volume_v1`**.
3. Click **Start analysis for case**; note the **run id** (also shown in a toast).
4. Click **Poll run until finished** (or poll manually with the analysis GET).
5. Click **Load volumetric CT viewer** to fetch volumes and open the raymarch view.
6. Use **Horizontal clip** to remove tissue above a local **Y** plane and expose the interior; tumor is drawn in the same volume space.

**Clear volumetric view** returns the viewer to mesh-only mode when no 3D model blob is loaded.

---

## Troubleshooting

| Symptom | Things to check |
|---------|------------------|
| Analyze fails immediately | Runner Python missing deps; stderr is attached to the API error string. Confirm `HOLOMED_CT_PYTHON` if you use a separate venv. |
| Volume load 404 | Run used `nodule_seg_v1`, or run failed, or outputs missing. |
| Black or empty volume | WebGL2 disabled; texture size too large (lower `--max-edge` in code or env); check browser console for shader compile errors. |
| Tumor looks wrong | Axis / spacing from NIfTI; heuristic mask is not clinical truth. Use `HOLOMED_BRAIN_MODEL` for model-driven masks. |

---

## Related docs

- [VOLUME_RENDER_CONTRACT.md](VOLUME_RENDER_CONTRACT.md) — on-disk and shader sampling conventions.
- [API_CONTRACT_MVP.md](API_CONTRACT_MVP.md) — broader case/artifact API (if present in your tree).
