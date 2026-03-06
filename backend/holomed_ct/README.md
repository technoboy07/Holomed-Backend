## `backend/holomed_ct`

This package will host the new CT-centric workflow:

- CT upload + storage conventions
- Preprocessing (resample, HU window, orientation)
- AI pipeline adapters:
  - `lung_nodule_ct_detection/` for candidate detection (boxes)
  - a segmentation stage for “that part” (ROI segmentation)
  - optional `ct-net-models/` for classification labels later
- Mask → mesh conversion for 3D overlays
- AnalysisRun state + persistence

Phase 0 only scaffolds the package.

