# HoloMed — Viva Q&A (short answers)

Brief answers an examiner expects. Expand with demos or formulas if they probe deeper.

---

## Project overview and motivation

**What problem does HoloMed solve, and for whom?**  
Interactive 3D visualization and touchless exploration of medical imaging (e.g., CT-derived models/nodules). Target users: clinicians, researchers, educators—not a regulated diagnostic product as-is.

**How is this different from PACS / desktop viewers?**  
Runs in the browser (low install friction), couples WebGL 3D with optional hand tracking and a custom API/backend for workflows and persistence.

**Risks of misuse?**  
Model outputs can be wrong; JWT in localStorage can leak on XSS; camera use needs consent. Treat AI as assistance, not ground truth.

---

## System architecture

**Why separate Vite/React frontend and FastAPI backend?**  
Separation of UI from data/auth/API; scale and deploy independently; API can serve multiple clients.

**Why MongoDB?**  
Flexible JSON documents suit evolving schemas (sessions, models, CT workflow blobs, user records).

**How does the frontend reach the API?**  
`VITE_API_BASE` (e.g. `http://localhost:8000/api`). Same-origin or correct CORS; avoid HTTPS page calling HTTP API (mixed content).

**Login → load model flow?**  
User logs in → JWT issued → frontend stores token → authorized requests fetch metadata/assets or triggers backend jobs → 3D layer renders returned data.

---

## Security and auth

**How does JWT auth work here?**  
Server signs tokens with `SECRET_KEY`; client sends token (e.g. `Authorization`) on requests; server verifies signature/expiry.

**Weak or leaked `SECRET_KEY`?**  
Attackers forge tokens → full account impersonation. Use long random secrets, rotation, secrets management.

**Role-based access?**  
Add roles to user document + JWT claims; middleware checks role per route/resource.

---

## 3D visualization and interaction

**Why Three.js / R3F?**  
Industry-standard WebGL; R3F fits React declarative patterns and state.

**Performance?**  
Reduce draw calls/mesh complexity, sensible textures, frustum culling, avoid huge geometries in RAM; profile on target hardware.

**MediaPipe Hands + scene?**  
Hand landmarks in camera/image space → map via calibration/homography or simple scaling to orbit/pan gestures in scene space.

---

## Medical imaging fundamentals

**DICOM vs NIfTI?**  
DICOM: slices + rich metadata + networking standard. NIfTI: common research format, single volume + affine header.

**Spacing, origin, direction?**  
Map voxel indices to millimetre positions in patient/world frame; wrong metadata = wrong “location” overlay.

**Voxel vs world coordinates?**  
Voxel = grid index (i, j, k). World = physical mm via affine (conceptually: x = A·i + origin).

---

## Tumour / nodule localization (detection)

**Segmentation or detection?**  
Bundled lung nodule path is **3D object detection** (boxes + scores), not voxel-wise segmentation unless you add it.

**What does output represent?**  
3D bounding box per candidate; **position** is usually **box centre** after coordinate conversion.

**`xyzxyz` vs `cccwhd`?**  
`xyzxyz`: two opposite corners (x₁,y₁,z₁,x₂,y₂,z₂). `cccwhd`: centre (cx,cy,cz) and size (w,h,d).

**Affine and LPS/RAS?**  
Affine maps indices to mm. LPS/RAS are axis conventions; flips/swaps may align viewer and scanner (`affine_lps_to_ras` in config for LUNA-style data).

**Why resample CT?**  
Normalize voxel spacing so the detector sees consistent geometry matching training.

**NMS / thresholds?**  
Suppress overlapping redundant boxes; threshold drops low-confidence spurious hits.

---

## Model training and evaluation

**Dataset (e.g. LUNA16)?**  
Public lung CT nodules; not all populations/scanners—**domain shift** in real clinics.

**Metrics?**  
mAP / IoU-based detection metrics; clinically you also care FP/scan vs sensitivity.

**Data leakage?**  
Same patient/scan in train and validation inflates scores—split by patient/study, not slice.

**Non-determinism?**  
GPU ops, NMS ties, cuDNN—runs may vary slightly; document seeds and versions.

---

## Backend / CT workflow placeholder

**Ellipsoid placeholder segmentation?**  
Fills detection box with a smooth synthetic mask until a real segmentation model replaces it—not diagnostic truth.

---

## Ethics, regulation, deployment

**Medical device?**  
Depends on jurisdiction/claims; research prototype ≠ cleared device. Regulatory path if used for diagnosis.

**Patient data / consent / de-ID?**  
Minimize PHI, secure transport/storage, audit access, consent for camera/hand tracking locally.

**Audit logging?**  
Log user, timestamp, asset ID, **model/version**—essential for reproducibility and safety review.

**Browser camera/hand tracking**  
Prefer HTTPS in production; clear UX for permissions; no silent recording.

---

## Limitations and future work

**When does detection fail?**  
Small/low-contrast nodules, noise, motion, unusual protocols, scanners unlike training—expect false positives/negatives.

**Hospital validation?**  
Retrain/fine-tune or calibrate thresholds on local data; monitor drift.

**Next steps?**  
True 3D segmentation, uncertainty estimates, clinician-in-the-loop review UI, versioning of models.

---

## Stress-style

**AI says nodule, radiologist says no?**  
Default to clinician; investigate threshold, preprocessing, artefact mimicking lesions; report confidence and failure cases.

**Position mismatch across viewers?**  
Check affine/convention (LPS/RAS), resampling alignment, rounding, wrong series—validate with known landmarks.

**Two positions for same finding?**  
Different series/reconstructions, resampling grids, crop vs full volume coords, or detection centre vs segmentation centroid.
