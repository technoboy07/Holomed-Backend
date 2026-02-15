"""
HoloMed Backend API
FastAPI server for managing users, 3D models, and sessions
"""

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, status, WebSocket, WebSocketDisconnect
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

from database import init_db, close_db
from models import User, Model3D, Session as SessionModel
from auth import verify_token, get_current_user, create_access_token, hash_password, verify_password
from schemas import UserCreate, UserResponse, ModelCreate, ModelResponse, SessionCreate, SessionResponse

# Lifespan events for database connection
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize database
    await init_db()
    yield
    # Shutdown: Close database
    await close_db()

app = FastAPI(
    title="HoloMed API",
    description="Backend API for HoloMed - Holographic Medical Visualization",
    version="1.0.0",
    lifespan=lifespan
)

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

# Static file serving for uploaded models
upload_dir = "uploads"
os.makedirs(upload_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=upload_dir), name="uploads")

# Health check endpoint
@app.get("/health")
async def health():
    return {"status": "healthy", "service": "HoloMed API"}

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
