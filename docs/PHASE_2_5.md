## Phase 2.5 — true segmentation (VISTA3D point prompt)

Phase 2 produced overlay meshes from detection boxes. Phase 2.5 upgrades this to **mask-based overlays**:

1) detect lung nodules (MONAI RetinaNet, `lung_nodule_ct_detection/`)  
2) segment “that part” using VISTA3D with a **point prompt** at each detection center  
3) convert mask → world-aligned GLB mesh (using the CT NIfTI affine)  

### Where it lives

- Runner: `backend/holomed_ct/ct_runner.py`
- Mask → mesh: `backend/holomed_ct/mesh.py` (`mask_xyz_to_glb_mesh_world`)
- Backend orchestration: `backend/main.py` (`_process_analysis_run`)

### Bundle location

For Phase 2.5 the backend expects:

- `backend/ml_bundles/vista3d/` (downloaded bundle root)

This folder is gitignored.

### Download the VISTA3D bundle (once)

Run with the **backend venv python**:

```powershell
cd backend
.\venv\Scripts\python.exe -m pip install "monai[fire,ignite]" nibabel
.\venv\Scripts\python.exe -m monai.bundle download vista3d --bundle_dir ".\ml_bundles"
```

This should create `backend/ml_bundles/vista3d/` with `configs/` and `models/`.

### Notes / constraints

- VISTA3D doesn’t have a dedicated “nodule” class. We use **zero-shot** segmentation:
  - `label_prompt: [133]` with `points` + `point_labels`.
- Points are in **original image voxel space**. We convert detection center (world) → voxel using the CT affine.
- If VISTA3D fails or returns an empty mask, we fall back to the ellipsoid mesh so the workflow still completes.

