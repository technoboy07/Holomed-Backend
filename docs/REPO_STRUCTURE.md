## Repo structure — current vs target

This repo is currently a working monorepo with:

- frontend at repo root (`src/`, `public/`, `package.json`)
- backend in `backend/`
- ML research/bundles in `ct-net-models/` and `lung_nodule_ct_detection/`

### Guiding principle

We will avoid large file moves until the CT workflow is working end-to-end.
Phase 0–2 changes should be **additive** (new folders, new modules), not disruptive.

---

## Minimal (recommended now): additive structure

Keep existing layout and add:

- `docs/`
  - architecture + MVP definitions
- `backend/holomed_ct/` (new Python package)
  - CT ingestion utilities
  - analysis job orchestration
  - mask/mesh storage helpers
  - adapters to call ML bundles/models

ML folders stay where they are for now, but backend will call them through adapters.

---

## Optimal (later): clean monorepo layout

Once MVP is stable, we can migrate to:

- `apps/frontend/`  (move current Vite app here)
- `apps/backend/`   (move current `backend/` here)
- `ml/`
  - `bundles/`      (MONAI bundles)
  - `pipelines/`    (inference/segmentation scripts, adapters)
- `docs/`

This improves:
- dependency isolation (frontend vs backend vs ML)
- deploy clarity (you can containerize services separately)
- onboarding (one obvious entry point per app)

---

## Phase 0 decision

We will implement the **Minimal** plan first.

