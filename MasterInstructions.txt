# HoloMed — Master instructions

This document is the step-by-step guide to **implement** (install dependencies and configure environment) and **run** the HoloMed stack: the **Vite + React** web app, the **FastAPI** backend, and **MongoDB**.

---

## What this project is

- **Frontend** (repository root): `src/`, Vite dev server on port **5173**. Uses **React**, **Three.js** / **React Three Fiber** for 3D viewing, **MediaPipe Hands** for hand tracking, and **@niivue/dcm2niix** for DICOM-related tooling.
- **Backend** (`backend/`): **FastAPI** on port **8000**, **MongoDB** for data (users, models, sessions, CT workflow documents), JWT auth.

Optional folders (`ct-net-models/`, `lung_nodule_ct_detection/`, ML pipelines) support research and server-side CT workflows; running the **web UI + API day-to-day** does not require building those separately unless you are developing those features.

---

## Prerequisites

| Requirement | Notes |
|---------------|--------|
| **Node.js** | Current LTS (e.g. 20.x or 22.x). Needed for `npm`. |
| **Python** | **3.10+** (`python --version`). |
| **MongoDB** | Local (**27017**), Docker, or [MongoDB Atlas](https://www.mongodb.com/cloud/atlas). |
| **pip** | Comes with Python. Use a **virtual environment** for the backend (strongly recommended). |

On Windows, use **PowerShell** or **Command Prompt** for the commands below unless noted.

---

## 1. Get the code

If you use Git:

```bash
git clone <repository-url>
cd holomed-frontend
```

If you received a zip, extract it and open a terminal in the **folder that contains** `package.json` and the `backend/` directory.

---

## 2. MongoDB

The API **must** be able to connect to MongoDB before it will start successfully.

**Pick one:**

- **Local:** Install MongoDB Community and ensure the service is running (default `mongodb://localhost:27017`).
- **Docker:**  
  `docker run -d -p 27017:27017 --name holomed-mongo mongo:latest`
- **Atlas:** Create a cluster, database user, IP allowlist, and copy a connection string (see `backend/MONGODB_ATLAS_SETUP.md` if present).

Test connectivity (if `mongosh` is installed): `mongosh` and run a simple command, or rely on the backend `/health` check in step 5.

---

## 3. Backend — install and run

### 3.1 Open a terminal and go to the backend

```bash
cd backend
```

### 3.2 Create and activate a virtual environment

**Windows:**

```bash
python -m venv venv
venv\Scripts\activate
```

**macOS / Linux:**

```bash
python3 -m venv venv
source venv/bin/activate
```

### 3.3 Install Python dependencies

```bash
pip install -r requirements.txt
```

> **Note:** `requirements.txt` includes PyTorch-related packages (`torch`, `monai`, etc.). The first install can take several minutes and needs several gigabytes of disk space.

### 3.4 Environment variables

The backend reads configuration from the process environment (and optionally a `.env` file if you use tooling that loads it—otherwise set variables in the shell).

Create **`backend/.env`** (or export in the shell) with at least:

| Variable | Purpose | Example |
|----------|---------|---------|
| `MONGODB_URL` | MongoDB connection string | `mongodb://localhost:27017` |
| `DATABASE_NAME` | Database name | `holomed` (default if omitted) |
| `SECRET_KEY` | JWT signing secret | Long random string (do not reuse examples) |

Generate a secret (run once, paste into `.env`):

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

If the repo contains `backend/.env.example`, you can copy it:  
`copy .env.example .env` (Windows) or `cp .env.example .env` (Unix).

### 3.5 Start the API server

From **`backend/`** with the virtual environment activated:

```bash
uvicorn main:app --reload
```

- API base URL: **`http://localhost:8000`**
- Interactive docs: **`http://localhost:8000/docs`**
- Quick health check: **`http://localhost:8000/health`** (expect a JSON “healthy” style response)

If port 8000 is busy:

```bash
uvicorn main:app --reload --port 8001
```

If you change the port, set the frontend `VITE_API_BASE` accordingly (see section 4).

Leave this terminal running while developing.

---

## 4. Frontend — install and run

Open a **second** terminal at the **repository root** (the folder with `package.json`, next to `backend/`).

### 4.1 Install Node dependencies

```bash
npm install
```

### 4.2 Point the app at your API (optional)

By default the app uses:

```text
http://localhost:8000/api
```

This comes from `VITE_API_BASE` in `src/App.jsx` via Vite’s `import.meta.env`.

To override (e.g. different host or backend port **8001**), create **`.env`** in the **repository root**:

```env
VITE_API_BASE=http://localhost:8001/api
```

Restart `npm run dev` after changing `.env`.

### 4.3 Development server

```bash
npm run dev
```

Then open **`http://localhost:5173`** in a modern Chromium-based browser (hand tracking and WebGL work best there).

Keep this terminal running alongside the backend.

---

## 5. End-to-end check

With **MongoDB** running, **backend** on **8000** (or your chosen port), and **frontend** on **5173**:

1. Visit **`http://localhost:8000/health`** — should succeed.
2. Visit **`http://localhost:5173`** — UI should load.
3. Use **Register / Login** if the UI exposes auth; JWT is stored client-side (`localStorage` per current app behavior).

If the UI cannot reach the API, confirm **no mixed-content issues** (both are `http://localhost`) and that `VITE_API_BASE` matches your backend `/api` prefix.

---

## 6. Other npm scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite development server with HMR |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Serve the production build locally (after `npm run build`) |
| `npm run lint` | Run ESLint on the project |

---

## 7. Typical folder reference

| Path | Role |
|------|------|
| `src/` | React application (components, utils, assets) |
| `public/` | Static assets served as-is |
| `backend/` | FastAPI application (`main.py`, `database.py`, `auth.py`, …) |
| `docs/` | Architecture, APIs, phased roadmap |

---

## 8. Troubleshooting

| Symptom | What to try |
|---------|--------------|
| Backend exits on startup with MongoDB error | Start MongoDB or fix `MONGODB_URL`; verify firewall / Atlas IP allowlist |
| `ModuleNotFoundError` in Python | Activate `venv`, reinstall `pip install -r requirements.txt` |
| Frontend shows auth/API errors | Confirm backend URL and `/api` path; check browser network tab |
| Camera / hand tracking not working | HTTPS may be required in some deployments; localhost is usually OK. Grant camera permission. |
| Slow or failed `pip install` | Ensure enough disk RAM; retry on a stable network (PyTorch wheels are large) |

For deeper backend setup, see `backend/SETUP.md` and `backend/QUICK_START.md` inside this repository.

---

## 9. Summary — minimal daily startup

1. Start **MongoDB**.
2. `cd backend` → activate **`venv`** → `uvicorn main:app --reload`.
3. In repo root: `npm run dev`.
4. Browser: **`http://localhost:5173`**.
