# HoloMed

HoloMed is a medical visualization workspace with:

- **Web 3D viewer** (Three.js / React Three Fiber) with **hand tracking** controls
- **FastAPI backend** for authentication + artifact storage (currently 3D models)
- **CT AI workflow (in progress)**: CT detection/segmentation → 3D overlays for patient explanation

## Repo layout

- `src/`: frontend (Vite/React)
- `backend/`: FastAPI backend
- `ct-net-models/`: research CNN code for whole-volume chest CT abnormality prediction (classification)
- `lung_nodule_ct_detection/`: MONAI bundle folder for 3D lung nodule detection (boxes)
- `Basic_fucntionality_files/`: legacy desktop prototype + gesture reference
- `docs/`: architecture + roadmap docs

## Run the current app

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Backend: `http://localhost:8000`  
Docs: `http://localhost:8000/docs`

### Frontend

```bash
npm install
npm run dev
```

Frontend: `http://localhost:5173`

## Roadmap (starting now)

We are redesigning HoloMed around a **case → CT → findings → 3D overlays** workflow.

- MVP scope: `docs/PHASE_0.md`

