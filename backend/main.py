"""
HoloMed Backend API
FastAPI server for managing users, 3D models, and sessions
"""

from fastapi import (
    FastAPI,
    Depends,
    HTTPException,
    UploadFile,
    File,
    Form,
    status,
    WebSocket,
    WebSocketDisconnect,
    Request,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from typing import List, Optional
import uvicorn
import os
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from bson import ObjectId
import json
import time
import asyncio
import subprocess
import sys

from database import init_db, close_db
from models import User, Model3D, Session as SessionModel, Case, Artifact, AnalysisRun, Finding
from auth import verify_token, get_current_user, create_access_token, hash_password, verify_password
from schemas import (
    UserCreate,
    UserResponse,
    ModelCreate,
    ModelResponse,
    SessionCreate,
    SessionResponse,
    CaseCreate,
    CaseResponse,
    ArtifactResponse,
    AnalyzeRequest,
    AnalysisRunResponse,
    FindingResponse,
    VolumeRenderMetaResponse,
)

# Lifespan events for database connection
@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await init_db()
    except Exception as e:
        print(f"STARTUP ERROR: {e}")
    yield
    try:
        await close_db()
    except Exception:
        pass

app = FastAPI(
    title="HoloMed API",
    description="Backend API for HoloMed - Holographic Medical Visualization",
    version="1.0.0",
    lifespan=lifespan
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log basic request diagnostics for API troubleshooting."""
    start_time = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start_time) * 1000
    print(
        f"{request.method} {request.url.path} "
        f"status={response.status_code} duration_ms={duration_ms:.2f}"
    )
    return response

# CORS configuration for web/mobile apps
allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:8081")
allowed_origins = [origin.strip() for origin in allowed_origins_env.split(",")]

# For desktop applications, allow all origins in development
# Note: Cannot use "*" with allow_credentials=True, so we disable credentials for "*"
if os.getenv("ENVIRONMENT") != "production":
    # Allow all origins but disable credentials (desktop apps don't need cookies)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,  # Must be False when using "*"
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
security = HTTPBearer()

# WebSocket connection manager for hand tracking
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
    
    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
    
    async def send_personal_message(self, message: dict, websocket: WebSocket):
        try:
            await websocket.send_json(message)
        except Exception as e:
            print(f"Error sending message: {e}")

manager = ConnectionManager()

upload_dir = "/tmp/uploads"
os.makedirs(upload_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=upload_dir), name="/tmp/uploads")

ct_upload_dir = os.path.join(upload_dir, "ct")
os.makedirs(ct_upload_dir, exist_ok=True)

derived_upload_dir = os.path.join(upload_dir, "derived")
os.makedirs(derived_upload_dir, exist_ok=True)

ai_output_dir = "/tmp/ai-output"
os.makedirs(ai_output_dir, exist_ok=True)
app.mount("/ai-output", StaticFiles(directory=ai_output_dir), name="ai-output")

async def _process_analysis_run(run_id: str):
    """Best-effort async background processing for a single analysis run.

    Phase 2: persists a Findings JSON artifact and Finding records.
    The actual ML inference hooks are added incrementally.
    """
    run = await AnalysisRun.get(ObjectId(run_id))
    if not run:
        return

    run.status = "running"
    run.started_at = datetime.now(timezone.utc)
    run.progress = 0.01
    run.error = None
    await run.save()

    try:
        # Load CT artifact
        ct_artifact = await Artifact.get(ObjectId(run.ct_artifact_id))
        if not ct_artifact or ct_artifact.user_id != run.user_id:
            raise RuntimeError("CT artifact not found for this run")

        # --- Brain volumetric pipeline (NIfTI → raw float32 + meta, no MONAI) ---
        if run.pipeline == "brain_volume_v1":
            from holomed_brain.persist_volumes import (
                persist_volume_render_artifacts,
                persist_brain_mesh_finding,
            )

            backend_dir = os.path.abspath(os.path.dirname(__file__))
            default_runner_py = os.path.join(backend_dir, "venv", "Scripts", "python.exe")
            runner_py = os.getenv("HOLOMED_CT_PYTHON") or (
                default_runner_py if os.path.exists(default_runner_py) else sys.executable
            )

            run_dir = os.path.join(derived_upload_dir, f"case_{run.case_id}_run_{run_id}")
            os.makedirs(run_dir, exist_ok=True)

            env = os.environ.copy()
            env["PYTHONPATH"] = backend_dir + (os.pathsep + env["PYTHONPATH"] if env.get("PYTHONPATH") else "")

            cmd = [
                runner_py,
                "-m",
                "holomed_brain.volume_runner",
                "--ct",
                ct_artifact.file_path,
                "--out-dir",
                run_dir,
                "--max-edge",
                "128",
            ]
            completed = subprocess.run(cmd, cwd=backend_dir, env=env, capture_output=True, text=True)
            if completed.returncode != 0:
                raise RuntimeError(
                    "Brain volume runner failed. "
                    f"stderr: {completed.stderr[-2000:]}"
                )

            run.progress = 0.9
            await run.save()

            vr_outputs = await persist_volume_render_artifacts(run=run, run_dir=run_dir)
            mesh_outputs = await persist_brain_mesh_finding(run=run, run_dir=run_dir)
            run.status = "succeeded"
            run.progress = 1.0
            run.finished_at = datetime.now(timezone.utc)
            run.outputs = {**vr_outputs, **mesh_outputs}
            await run.save()
            return

        from holomed_ct.pipeline import CtFinding, persist_findings_as_artifacts

        repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        bundle_root = os.path.join(repo_root, "lung_nodule_ct_detection")

        run.progress = 0.1
        await run.save()

        # Run the CT pipeline in a separate Python env (more robust than importing MONAI inside the API process).
        backend_dir = os.path.abspath(os.path.dirname(__file__))
        default_runner_py = os.path.join(backend_dir, "venv", "Scripts", "python.exe")
        runner_py = os.getenv("HOLOMED_CT_PYTHON") or (default_runner_py if os.path.exists(default_runner_py) else sys.executable)

        run_dir = os.path.join(derived_upload_dir, f"case_{run.case_id}_run_{run_id}")
        os.makedirs(run_dir, exist_ok=True)
        runner_out_json = os.path.join(run_dir, "runner_findings.json")

        env = os.environ.copy()
        env["PYTHONPATH"] = backend_dir + (os.pathsep + env["PYTHONPATH"] if env.get("PYTHONPATH") else "")

        cmd = [
            runner_py,
            "-m",
            "holomed_ct.ct_runner",
            "--ct",
            ct_artifact.file_path,
            "--bundle-root",
            bundle_root,
            "--vista3d-root",
            os.path.join(os.path.abspath(os.path.dirname(__file__)), "ml_bundles", "vista3d"),
            "--out-dir",
            run_dir,
            "--out-json",
            runner_out_json,
        ]

        completed = subprocess.run(cmd, cwd=backend_dir, env=env, capture_output=True, text=True)
        if completed.returncode != 0:
            stderr_tail = (completed.stderr or "")[-4000:]
            stdout_tail = (completed.stdout or "")[-2000:]
            warning_only = (
                "FutureWarning" in stderr_tail
                and "Traceback" not in stderr_tail
                and not stdout_tail.strip()
            )
            hint = (
                " Hint: nodule_seg_v1 targets lung nodule bundle and may fail on brain CT. "
                "Use pipeline=brain_volume_v1 for brain workflow."
                if warning_only
                else ""
            )
            raise RuntimeError(
                "CT runner failed. "
                f"stderr: {stderr_tail}\n"
                f"stdout: {stdout_tail}{hint}"
            )

        with open(runner_out_json, "r", encoding="utf-8") as f:
            runner_payload = json.load(f)

        findings: List[CtFinding] = []
        for f in runner_payload.get("findings", []):
            findings.append(
                CtFinding(
                    label=f.get("label", "unknown"),
                    score=f.get("score"),
                    centroid_world=f.get("centroid_world"),
                    bbox_world=f.get("bbox_world"),
                    volume_mm3=f.get("volume_mm3"),
                    diameter_mm=f.get("diameter_mm"),
                    mask_path=f.get("mask_path"),
                    mesh_path=f.get("mesh_path"),
                )
            )

        run.progress = 0.8
        await run.save()

        outputs = await persist_findings_as_artifacts(
            run=run,
            derived_upload_dir=derived_upload_dir,
            findings=findings,
            extra={"segmentation_method": "ellipsoid_from_detection_box_v0", "runner_python": runner_py},
        )

        run.status = "succeeded"
        run.progress = 1.0
        run.finished_at = datetime.now(timezone.utc)
        run.outputs = outputs
        await run.save()
    except Exception as e:
        run.status = "failed"
        run.progress = None
        run.finished_at = datetime.now(timezone.utc)
        run.error = str(e)
        await run.save()

# Health check endpoint
@app.get("/health")
async def health():
    mongo_url_set = os.getenv("MONGODB_URL", "").startswith("mongodb")
    return {
        "status": "ok",
        "mongodb_url_set": mongo_url_set,
        "environment": os.getenv("ENVIRONMENT", "not set")
    }

MAX_PASSWORD_LEN = 72  # bcrypt limit

@app.post("/api/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate):
    """Register a new user"""
    # Validate password length (bcrypt limit is 72 bytes)
    password_bytes = user_data.password.encode("utf-8")
    if len(password_bytes) > MAX_PASSWORD_LEN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Password too long. Maximum {MAX_PASSWORD_LEN} characters allowed."
        )
    
    # Check if user already exists
    existing_user = await User.find_one(User.email == user_data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user
    try:
        hashed_pw = hash_password(user_data.password)
        new_user = User(
            email=user_data.email,
            username=user_data.username,
            hashed_password=hashed_pw,
            subscription_tier="free"
        )
        await new_user.insert()
        
        return UserResponse(
            id=str(new_user.id),
            email=new_user.email,
            subscription_tier=new_user.subscription_tier,
            created_at=new_user.created_at
        )
    except Exception as e:
        # Handle any database errors (e.g., duplicate key, connection issues)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration failed: {str(e)}"
        )
        
@app.post("/api/auth/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """Authenticate user and return access token"""
    # Try to find user by email or username
    user = await User.find_one(
        {"$or": [
            {"email": form_data.username},  # username field contains email
            {"username": form_data.username}  # or username
        ]}
    )
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email/username or password"
        )
    
    access_token = create_access_token(data={"sub": user.email, "user_id": str(user.id)})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": UserResponse(
            id=str(user.id),
            email=user.email,
            subscription_tier=user.subscription_tier,
            created_at=user.created_at
        )
    }

@app.get("/api/auth/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user)
):
    """Get current authenticated user information"""
    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        subscription_tier=current_user.subscription_tier,
        created_at=current_user.created_at
    )

# 3D Model management endpoints
@app.post("/api/models/upload", response_model=ModelResponse, status_code=status.HTTP_201_CREATED)
async def upload_model(
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user)
):
    """Upload a 3D model file with optional custom name"""
    # Validate filename
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filename is required"
        )
    
    # Validate file format
    allowed_formats = [".stl", ".obj", ".ply", ".vtk", ".gltf", ".glb"]
    file_ext = os.path.splitext(file.filename)[1].lower()
    
    if file_ext not in allowed_formats:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format. Allowed: {', '.join(allowed_formats)}"
        )
    
    # Sanitize filename to prevent path traversal
    safe_filename = os.path.basename(file.filename)
    
    # Use custom name if provided, otherwise use filename (without extension)
    if name and name.strip():
        model_name = name.strip()
    else:
        model_name = os.path.splitext(safe_filename)[0]
    
    # File size validation (100MB limit)
    MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
    
    # Save file with error handling
    try:
        content = await file.read()
        
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File size exceeds maximum of {MAX_FILE_SIZE / 1024 / 1024}MB"
            )
        
        file_path = os.path.join(upload_dir, f"{current_user.id}_{datetime.now().timestamp()}_{safe_filename}")
        
        with open(file_path, "wb") as buffer:
            buffer.write(content)
    except IOError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save file: {str(e)}"
        )
    
    # Create database record
    new_model = Model3D(
        user_id=str(current_user.id),
        name=model_name,
        file_path=file_path,
        file_format=file_ext[1:],  # Remove the dot
        file_size=len(content)
    )
    await new_model.insert()
    
    return ModelResponse(
        id=str(new_model.id),
        name=new_model.name,
        file_path=new_model.file_path,
        file_format=new_model.file_format,
        file_size=new_model.file_size,
        created_at=new_model.created_at
    )

@app.get("/api/models", response_model=List[ModelResponse])
async def list_models(
    current_user: User = Depends(get_current_user)
):
    """List all models for the current user"""
    models = await Model3D.find(Model3D.user_id == str(current_user.id)).to_list()
    return [
        ModelResponse(
            id=str(m.id),
            name=m.name,
            file_path=m.file_path,
            file_format=m.file_format,
            file_size=m.file_size,
            created_at=m.created_at
        )
        for m in models
    ]

@app.get("/api/models/{model_id}", response_model=ModelResponse)
async def get_model(
    model_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a specific model by ID"""
    try:
        model_obj_id = ObjectId(model_id)
    except (ValueError, TypeError) as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid model ID format"
        )
    
    model = await Model3D.find_one(
        Model3D.id == model_obj_id,
        Model3D.user_id == str(current_user.id)
    )
    
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Model not found"
        )
    
    return ModelResponse(
        id=str(model.id),
        name=model.name,
        file_path=model.file_path,
        file_format=model.file_format,
        file_size=model.file_size,
        created_at=model.created_at
    )

@app.get("/api/models/{model_id}/file")
async def get_model_file(
    model_id: str,
    current_user: User = Depends(get_current_user)
):
    """Serve the actual 3D model file"""
    try:
        model_obj_id = ObjectId(model_id)
    except (ValueError, TypeError) as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid model ID format"
        )
    
    model = await Model3D.find_one(
        Model3D.id == model_obj_id,
        Model3D.user_id == str(current_user.id)
    )
    
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Model not found"
        )
    
    if not os.path.exists(model.file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Model file not found on server"
        )
    
    return FileResponse(
        model.file_path,
        media_type="application/octet-stream",
        filename=model.name
    )

@app.delete("/api/models/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model(
    model_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a model"""
    try:
        model_obj_id = ObjectId(model_id)
    except (ValueError, TypeError) as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid model ID format"
        )
    
    model = await Model3D.find_one(
        Model3D.id == model_obj_id,
        Model3D.user_id == str(current_user.id)
    )
    
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Model not found"
        )
    
    # Delete file if it exists
    try:
        if os.path.exists(model.file_path):
            os.remove(model.file_path)
    except IOError as e:
        # Log error but don't fail the request if file deletion fails
        print(f"Warning: Failed to delete file {model.file_path}: {str(e)}")
    
    await model.delete()
    return None


# Case + CT artifact endpoints (Phase 1)
@app.post("/api/cases", response_model=CaseResponse, status_code=status.HTTP_201_CREATED)
async def create_case(
    case: CaseCreate,
    current_user: User = Depends(get_current_user),
):
    new_case = Case(user_id=str(current_user.id), name=case.name.strip() if case.name else None)
    await new_case.insert()
    return CaseResponse(id=str(new_case.id), name=new_case.name, created_at=new_case.created_at)


@app.get("/api/cases", response_model=List[CaseResponse])
async def list_cases(current_user: User = Depends(get_current_user)):
    cases = await Case.find(Case.user_id == str(current_user.id)).sort(-Case.created_at).to_list()
    return [CaseResponse(id=str(c.id), name=c.name, created_at=c.created_at) for c in cases]


@app.get("/api/cases/{case_id}", response_model=CaseResponse)
async def get_case(case_id: str, current_user: User = Depends(get_current_user)):
    try:
        case_obj_id = ObjectId(case_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid case ID format")

    case = await Case.find_one(Case.id == case_obj_id, Case.user_id == str(current_user.id))
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    return CaseResponse(id=str(case.id), name=case.name, created_at=case.created_at)


@app.post(
    "/api/cases/{case_id}/ct/upload",
    response_model=ArtifactResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_ct_to_case(
    case_id: str,
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    # Validate case
    try:
        case_obj_id = ObjectId(case_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid case ID format")

    case = await Case.find_one(Case.id == case_obj_id, Case.user_id == str(current_user.id))
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Filename is required")

    allowed_formats = [".nii", ".nii.gz"]
    lower_name = file.filename.lower()
    file_ext = ".nii.gz" if lower_name.endswith(".nii.gz") else os.path.splitext(lower_name)[1]
    if file_ext not in allowed_formats:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format. Allowed: {', '.join(allowed_formats)}",
        )

    safe_filename = os.path.basename(file.filename)
    artifact_name = name.strip() if name and name.strip() else safe_filename

    # Size limit: start conservative (512MB) for CT volumes
    MAX_FILE_SIZE = 512 * 1024 * 1024

    try:
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File size exceeds maximum of {MAX_FILE_SIZE / 1024 / 1024}MB",
            )

        file_path = os.path.join(
            ct_upload_dir,
            f"{current_user.id}_{case_id}_{datetime.now().timestamp()}_{safe_filename}",
        )
        with open(file_path, "wb") as buffer:
            buffer.write(content)
    except IOError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save file: {str(e)}",
        )

    artifact = Artifact(
        user_id=str(current_user.id),
        case_id=str(case_obj_id),
        type="ct_volume",
        name=artifact_name,
        file_path=file_path,
        file_format=file_ext.lstrip("."),
        file_size=len(content),
    )
    await artifact.insert()

    return ArtifactResponse(
        id=str(artifact.id),
        case_id=artifact.case_id,
        type=artifact.type,
        name=artifact.name,
        file_path=artifact.file_path,
        file_format=artifact.file_format,
        file_size=artifact.file_size,
        created_at=artifact.created_at,
    )


@app.get("/api/artifacts/{artifact_id}/file")
async def get_artifact_file(
    artifact_id: str,
    current_user: User = Depends(get_current_user),
):
    try:
        artifact_obj_id = ObjectId(artifact_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid artifact ID format")

    artifact = await Artifact.find_one(Artifact.id == artifact_obj_id, Artifact.user_id == str(current_user.id))
    if not artifact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artifact not found")

    if not os.path.exists(artifact.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artifact file not found on server")

    return FileResponse(
        artifact.file_path,
        media_type="application/octet-stream",
        filename=artifact.name,
    )


@app.post("/api/cases/{case_id}/analyze", response_model=AnalysisRunResponse, status_code=status.HTTP_201_CREATED)
async def start_case_analysis(
    case_id: str,
    request: AnalyzeRequest,
    current_user: User = Depends(get_current_user),
):
    try:
        case_obj_id = ObjectId(case_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid case ID format")

    case = await Case.find_one(Case.id == case_obj_id, Case.user_id == str(current_user.id))
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    ct_artifact_id = request.ct_artifact_id
    if ct_artifact_id:
        # Validate provided artifact id
        try:
            ct_obj_id = ObjectId(ct_artifact_id)
        except (ValueError, TypeError):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ct_artifact_id format")

        ct_artifact = await Artifact.find_one(
            Artifact.id == ct_obj_id,
            Artifact.user_id == str(current_user.id),
            Artifact.case_id == str(case_obj_id),
            Artifact.type == "ct_volume",
        )
        if not ct_artifact:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CT artifact not found for case")
    else:
        # Pick latest CT for case
        ct_list = await (
            Artifact.find(
                Artifact.user_id == str(current_user.id),
                Artifact.case_id == str(case_obj_id),
                Artifact.type == "ct_volume",
            )
            .sort(-Artifact.created_at)
            .limit(1)
            .to_list()
        )
        ct_artifact = ct_list[0] if ct_list else None
        if not ct_artifact:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No CT uploaded for this case yet",
            )
        ct_artifact_id = str(ct_artifact.id)

    run = AnalysisRun(
        user_id=str(current_user.id),
        case_id=str(case_obj_id),
        ct_artifact_id=str(ct_artifact_id),
        pipeline=request.pipeline,
        status="queued",
        created_at=datetime.now(timezone.utc),
    )
    await run.insert()

    # Fire-and-forget async processing (Phase 2 baseline).
    asyncio.create_task(_process_analysis_run(str(run.id)))

    return AnalysisRunResponse(
        id=str(run.id),
        case_id=run.case_id,
        ct_artifact_id=run.ct_artifact_id,
        pipeline=run.pipeline,
        status=run.status,
        progress=run.progress,
        error=run.error,
        outputs=run.outputs,
        started_at=run.started_at,
        finished_at=run.finished_at,
        created_at=run.created_at,
    )


@app.get("/api/cases/{case_id}/analysis/{run_id}", response_model=AnalysisRunResponse)
async def get_analysis_run(
    case_id: str,
    run_id: str,
    current_user: User = Depends(get_current_user),
):
    try:
        case_obj_id = ObjectId(case_id)
        run_obj_id = ObjectId(run_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ID format")

    run = await AnalysisRun.find_one(
        AnalysisRun.id == run_obj_id,
        AnalysisRun.user_id == str(current_user.id),
        AnalysisRun.case_id == str(case_obj_id),
    )
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis run not found")

    return AnalysisRunResponse(
        id=str(run.id),
        case_id=run.case_id,
        ct_artifact_id=run.ct_artifact_id,
        pipeline=run.pipeline,
        status=run.status,
        progress=run.progress,
        error=run.error,
        outputs=run.outputs,
        started_at=run.started_at,
        finished_at=run.finished_at,
        created_at=run.created_at,
    )


async def _volume_render_context(case_id: str, run_id: str, current_user: User):
    """Validate case/run and return (run, volume_render dict) or raise HTTPException."""
    try:
        case_obj_id = ObjectId(case_id)
        run_obj_id = ObjectId(run_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ID format")

    run = await AnalysisRun.find_one(
        AnalysisRun.id == run_obj_id,
        AnalysisRun.user_id == str(current_user.id),
        AnalysisRun.case_id == str(case_obj_id),
    )
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis run not found")

    if run.status != "succeeded":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Analysis run has not completed successfully yet",
        )
    vr = (run.outputs or {}).get("volume_render")
    if not vr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No volumetric output for this run (use brain_volume_v1 pipeline)",
        )
    return run, vr


@app.get("/api/cases/{case_id}/volumes/{run_id}", response_model=VolumeRenderMetaResponse)
async def get_volume_render_meta(
    case_id: str,
    run_id: str,
    current_user: User = Depends(get_current_user),
):
    _, vr = await _volume_render_context(case_id, run_id, current_user)
    try:
        meta_art = await Artifact.get(ObjectId(vr["meta_artifact_id"]))
    except Exception:
        meta_art = None
    if not meta_art or meta_art.user_id != str(current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Volume metadata artifact missing")

    if not os.path.exists(meta_art.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Volume metadata file not found")

    with open(meta_art.file_path, "r", encoding="utf-8") as f:
        payload = json.load(f)
    return VolumeRenderMetaResponse(**payload)


@app.get("/api/cases/{case_id}/volumes/{run_id}/intensity")
async def get_volume_intensity_raw(
    case_id: str,
    run_id: str,
    current_user: User = Depends(get_current_user),
):
    _, vr = await _volume_render_context(case_id, run_id, current_user)
    art = await Artifact.get(ObjectId(vr["intensity_artifact_id"]))
    if not art or art.user_id != str(current_user.id) or art.type != "intensity_volume":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Intensity volume not found")
    if not os.path.exists(art.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Intensity file missing on server")
    return FileResponse(art.file_path, media_type="application/octet-stream", filename="intensity_f32.raw")


@app.get("/api/cases/{case_id}/volumes/{run_id}/tumor")
async def get_volume_tumor_raw(
    case_id: str,
    run_id: str,
    current_user: User = Depends(get_current_user),
):
    _, vr = await _volume_render_context(case_id, run_id, current_user)
    art = await Artifact.get(ObjectId(vr["tumor_mask_artifact_id"]))
    if not art or art.user_id != str(current_user.id) or art.type != "mask_volume":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tumor mask volume not found")
    if not os.path.exists(art.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tumor mask file missing on server")
    return FileResponse(art.file_path, media_type="application/octet-stream", filename="tumor_f32.raw")


@app.get("/api/cases/{case_id}/findings", response_model=List[FindingResponse])
async def list_findings(
    case_id: str,
    run_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    try:
        case_obj_id = ObjectId(case_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid case ID format")

    query = [
        Finding.user_id == str(current_user.id),
        Finding.case_id == str(case_obj_id),
    ]
    if run_id:
        query.append(Finding.run_id == run_id)

    findings = await Finding.find(*query).sort(-Finding.created_at).to_list()
    return [
        FindingResponse(
            id=str(f.id),
            run_id=f.run_id,
            case_id=f.case_id,
            label=f.label,
            score=f.score,
            centroid_world=f.centroid_world,
            bbox_world=f.bbox_world,
            volume_mm3=f.volume_mm3,
            diameter_mm=f.diameter_mm,
            mask_artifact_id=f.mask_artifact_id,
            mesh_artifact_id=f.mesh_artifact_id,
            created_at=f.created_at,
        )
        for f in findings
    ]

# Session management endpoints
@app.post("/api/sessions", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    session_data: SessionCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new visualization session"""
    try:
        model_obj_id = ObjectId(session_data.model_id)
    except (ValueError, TypeError) as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid model ID format"
        )
    
    # Verify model belongs to user
    model = await Model3D.find_one(
        Model3D.id == model_obj_id,
        Model3D.user_id == str(current_user.id)
    )
    
    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Model not found"
        )
    
    new_session = SessionModel(
        user_id=str(current_user.id),
        model_id=str(model_obj_id)
    )
    await new_session.insert()
    
    return SessionResponse(
        id=str(new_session.id),
        user_id=new_session.user_id,
        model_id=new_session.model_id,
        started_at=new_session.started_at,
        ended_at=new_session.ended_at
    )

@app.get("/api/sessions", response_model=List[SessionResponse])
async def list_sessions(
    current_user: User = Depends(get_current_user)
):
    """List all sessions for the current user"""
    sessions = await SessionModel.find(SessionModel.user_id == str(current_user.id)).to_list()
    return [
        SessionResponse(
            id=str(s.id),
            user_id=str(s.user_id),
            model_id=str(s.model_id),
            started_at=s.started_at,
            ended_at=s.ended_at
        )
        for s in sessions
    ]

@app.patch("/api/sessions/{session_id}/end", response_model=SessionResponse)
async def end_session(
    session_id: str,
    current_user: User = Depends(get_current_user)
):
    """End a session"""
    try:
        session_obj_id = ObjectId(session_id)
    except (ValueError, TypeError) as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid session ID format"
        )
    
    session = await SessionModel.find_one(
        SessionModel.id == session_obj_id,
        SessionModel.user_id == str(current_user.id)
    )
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
    
    session.ended_at = datetime.now(timezone.utc)
    await session.save()
    
    return SessionResponse(
        id=str(session.id),
        user_id=str(session.user_id),
        model_id=str(session.model_id),
        started_at=session.started_at,
        ended_at=session.ended_at
    )

# WebSocket endpoint for real-time hand tracking
@app.websocket("/ws/hand-tracking/{session_id}")
async def websocket_hand_tracking(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for real-time hand tracking data"""
    await manager.connect(websocket)
    try:
        while True:
            # Receive hand tracking data from frontend
            data = await websocket.receive_json()
            
            # Process gesture data (rotation, scale, etc.)
            gesture_data = {
                "rotation": data.get("rotation", {"pitch": 0, "yaw": 0, "roll": 0}),
                "scale": data.get("scale", 1.0),
                "gestures": data.get("gestures", []),
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            
            # Optionally update session with gesture data
            try:
                session_obj_id = ObjectId(session_id)
                session = await SessionModel.find_one(SessionModel.id == session_obj_id)
                if session:
                    session.gesture_data = gesture_data
                    await session.save()
            except Exception as e:
                print(f"Error updating session: {e}")
            
            # Echo back processed data (or broadcast to other clients)
            await manager.send_personal_message({
                "status": "ok",
                "data": gesture_data
            }, websocket)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"WebSocket error: {e}")
        manager.disconnect(websocket)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
