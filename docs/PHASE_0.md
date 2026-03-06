## Phase 0 — MVP scope + repo curation (HoloMed)

This doc locks the **first shippable version** of the redesigned HoloMed workflow and how it maps to the current repo.

### What exists today (repo reality)

- **Frontend**: Vite/React app in repo root (`src/`) with a Three.js/R3F viewer and hand tracking.
- **Backend**: FastAPI in `backend/` providing auth + 3D model CRUD + file serving.
- **ML code (vendor / research)**:
  - `ct-net-models/`: classification over whole CT volumes (labels only, no localization).
  - `lung_nodule_ct_detection/`: MONAI bundle folder for **3D lung nodule detection** (outputs boxes).

### Problem we are solving

We want:

1. CT scan abnormalities (AI)  
2. Abnormality regions localized (boxes / masks)  
3. Localized regions converted to **3D overlays** that can be visualized alongside anatomy/mesh for patient explanation

We are choosing **segmentation-based overlays** for “that particular part”.

---

## MVP we will build first (Phase 0 output)

### MVP input format

- **Primary**: NIfTI (`.nii` / `.nii.gz`) CT volumes.
  - Reason: stable, single-file volume, preserves affine (world coordinates).
- **Not in MVP**: raw DICOM upload (added later as a separate ingestion pipeline).

### MVP AI scope

- **Target class (MVP)**: lung nodules (because we already have a detection bundle in-repo).
- **Pipeline (MVP)**:
  1. Run `lung_nodule_ct_detection` to get candidate **3D boxes** (world coordinates + score).
  2. For each box: run **segmentation** inside that ROI to produce a binary mask for that lesion.
  3. Convert each lesion mask into an abnormality mesh (GLB) via marching cubes.

> Note: the repo currently contains detection, not segmentation. For MVP segmentation we will add a segmentation stage (ROI segmentation). We will pick the fastest-to-integrate option in Phase 1 planning (likely MONAI-based ROI U-Net or a promptable segmenter if we adopt it).

### MVP outputs (stored + served)

For each CT analysis run:

- **Findings JSON**: list of findings, each with:
  - `id`, `label`, `score`
  - `centroid_world` (mm), `bbox_world` (mm)
  - `volume_mm3`, `diameter_mm` (approx)
- **Segmentation mask volume**: stored as `mask.nii.gz` (or per-finding masks).
- **Meshes**:
  - `finding_<id>.glb` per lesion component
  - (optional) `anatomy.glb` derived from CT later

### Visualization (frontend MVP)

- A “case” view where you can:
  - open a CT case,
  - see a list of findings,
  - toggle finding meshes on/off,
  - click finding → highlight + focus camera,
  - measure/annotate in the existing 3D viewer.

### Non-goals for MVP

- Perfect clinical-grade segmentation for all 83 CT-Net abnormalities
- Deformable registration between unrelated meshes and CT
- Multi-user case sharing, PACS integration, HL7/FHIR

---

## Coordinate system rule (critical)

All overlays must be generated and stored in a **consistent world coordinate system**.

- Canonical source of truth: **CT affine** (from NIfTI).
- Any generated mesh must be exported in the CT’s world space, so overlays align.

If a “given 3D mesh” is not derived from the same CT, we treat alignment as out-of-scope for MVP (registration later).

---

## Repo structure decision (Phase 0)

We will keep the existing layout (to avoid breaking the current app), but introduce a clean place for the CT workflow.

### Proposed additions (incremental, safe)

- `docs/`  
  - This Phase 0 doc and future architecture notes.
- `backend/holomed_ct/` (new package in Phase 1)  
  - CT ingestion, analysis orchestration, artifact storage helpers.
- `backend/uploads_ct/` (or under existing `backend/uploads/`)  
  - CT volumes, masks, meshes (separate subfolders).

### ML assets

We will treat `ct-net-models/` and `lung_nodule_ct_detection/` as **vendor/research** code.
In Phase 1 we’ll add a thin “adapter” layer in backend to call them in a controlled way.

---

## Phase 0 deliverables (what “done” means)

By the end of Phase 0 we must have:

- A written MVP contract:
  - supported inputs,
  - expected outputs,
  - storage conventions,
  - API endpoints to be added (names + payload shapes),
  - UI screens to be added.
- A repo-level README that describes HoloMed (not the default Vite template).

