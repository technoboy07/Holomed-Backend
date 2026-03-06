from beanie import Document
from pydantic import Field, EmailStr, ConfigDict  # Import ConfigDict
from typing import Optional, Literal, List, Dict, Any
from datetime import datetime, timezone

class User(Document):
    email: EmailStr = Field(..., unique=True, index=True)
    username: Optional[str] = None  # Add username field
    hashed_password: str
    subscription_tier: str = Field(default="free")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    class Settings:
        name = "users"
        indexes = ["email"]

class Model3D(Document):
    # This allows Pydantic to ignore the "model_" prefix protection
    model_config = ConfigDict(protected_namespaces=()) 
    
    user_id: str = Field(..., index=True)
    name: str
    file_path: str
    file_format: str
    file_size: Optional[int] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    class Settings:
        name = "models"
        indexes = ["user_id"]

class Session(Document):
    # This fixes the warning for the 'model_id' field
    model_config = ConfigDict(protected_namespaces=())

    user_id: str = Field(..., index=True)
    model_id: str = Field(..., index=True)
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc)) # Updated to non-deprecated factory
    ended_at: Optional[datetime] = None
    gesture_data: Optional[dict] = None
    
    class Settings:
        name = "sessions"
        indexes = ["user_id", "model_id"]


class Case(Document):
    """A user-owned container for CT + derived artifacts."""

    user_id: str = Field(..., index=True)
    name: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "cases"
        indexes = ["user_id"]


ArtifactType = Literal["ct_volume", "mask_volume", "mesh_finding", "mesh_anatomy", "report_json"]


class Artifact(Document):
    """A file-based asset belonging to a case (CT, mask, meshes, reports)."""

    user_id: str = Field(..., index=True)
    case_id: str = Field(..., index=True)
    type: ArtifactType
    name: str
    file_path: str
    file_format: str
    file_size: Optional[int] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "artifacts"
        indexes = ["user_id", "case_id", "type"]


AnalysisStatus = Literal["queued", "running", "succeeded", "failed"]


class AnalysisRun(Document):
    """One execution of an AI pipeline for a case (typically against one CT artifact)."""

    user_id: str = Field(..., index=True)
    case_id: str = Field(..., index=True)
    ct_artifact_id: str = Field(..., index=True)
    pipeline: str
    status: AnalysisStatus = Field(default="queued")
    progress: Optional[float] = None  # 0..1
    error: Optional[str] = None
    outputs: Optional[Dict[str, Any]] = None  # artifact ids / filenames / summary
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "analysis_runs"
        indexes = ["user_id", "case_id", "ct_artifact_id", "status"]


class Finding(Document):
    """A localized abnormality instance produced by an analysis run."""

    user_id: str = Field(..., index=True)
    case_id: str = Field(..., index=True)
    run_id: str = Field(..., index=True)
    label: str
    score: Optional[float] = None
    centroid_world: Optional[List[float]] = None  # [x,y,z] in mm (RAS)
    bbox_world: Optional[Dict[str, List[float]]] = None  # {min:[x,y,z], max:[x,y,z]}
    volume_mm3: Optional[float] = None
    diameter_mm: Optional[float] = None
    mask_artifact_id: Optional[str] = None
    mesh_artifact_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "findings"
        indexes = ["user_id", "case_id", "run_id", "label"]
