## MVP API contract (CT segmentation → 3D overlays)

This defines the endpoints we will add to the existing FastAPI backend.
It is written to match the current style of `/api/models/*` endpoints.

### New concepts

- **Case**: container for CT + analysis + derived artifacts (meshes).
- **CT Artifact**: uploaded NIfTI volume.
- **Analysis Run**: an execution record for “run AI on CT”.
- **Finding**: one localized abnormality instance with a mesh overlay.

---

## Endpoints (proposed)

### Cases

- `POST /api/cases`
  - body: `{ "name": "Optional display name" }`
  - returns: `{ id, name, created_at }`

- `GET /api/cases`
  - returns: list of cases for current user

- `GET /api/cases/{case_id}`
  - returns: case summary + attached artifacts + latest analysis status

### CT upload

- `POST /api/cases/{case_id}/ct/upload`
  - multipart form: `file` (NIfTI), optional `name`
  - returns: CT artifact metadata `{ id, case_id, file_format, file_size, created_at }`

### Start analysis (segmentation pipeline)

- `POST /api/cases/{case_id}/analyze`
  - body: `{ "pipeline": "nodule_seg_v1" }`
  - returns: `{ run_id, status }`

- `GET /api/cases/{case_id}/analysis/{run_id}`
  - returns: `{ status, progress?, error?, outputs }`

### Findings + derived meshes

- `GET /api/cases/{case_id}/findings`
  - returns: list of findings with metrics and links to mesh artifact ids

- `GET /api/artifacts/{artifact_id}/file`
  - streams the artifact file (CT, mask, or GLB mesh)

---

## MVP responses (shape)

### Finding object

```json
{
  "id": "finding_001",
  "label": "lung_nodule",
  "score": 0.93,
  "centroid_world": [12.3, -48.1, 102.0],
  "bbox_world": {
    "min": [8.1, -52.0, 98.7],
    "max": [16.7, -44.2, 105.1]
  },
  "volume_mm3": 312.4,
  "diameter_mm": 9.8,
  "mesh_artifact_id": "..."
}
```

---

## Phase 0 decision

We will implement endpoints incrementally:

1) upload CT into a case  
2) run analysis synchronously in dev (to validate)  
3) switch to background job/worker for real usage

