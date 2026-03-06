"""
Pydantic schemas for request/response validation
"""

from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional, List, Dict, Any

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    username: Optional[str] = None  # Add optional username field



class UserResponse(BaseModel):
    id: str  # ObjectId as string
    email: str
    subscription_tier: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class ModelCreate(BaseModel):
    name: Optional[str] = None

class ModelResponse(BaseModel):
    id: str  # ObjectId as string
    name: str
    file_path: str
    file_format: str
    file_size: Optional[int]
    created_at: datetime
    
    class Config:
        from_attributes = True

class SessionCreate(BaseModel):
    model_id: str  # ObjectId as string

class SessionResponse(BaseModel):
    id: str  # ObjectId as string
    user_id: str  # ObjectId as string
    model_id: str  # ObjectId as string
    started_at: datetime
    ended_at: Optional[datetime]
    
    class Config:
        from_attributes = True


class CaseCreate(BaseModel):
    name: Optional[str] = None


class CaseResponse(BaseModel):
    id: str
    name: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class ArtifactResponse(BaseModel):
    id: str
    case_id: str
    type: str
    name: str
    file_path: str
    file_format: str
    file_size: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


class AnalyzeRequest(BaseModel):
    pipeline: str = "nodule_seg_v1"
    ct_artifact_id: Optional[str] = None  # if omitted, backend picks latest CT artifact for case


class AnalysisRunResponse(BaseModel):
    id: str
    case_id: str
    ct_artifact_id: str
    pipeline: str
    status: str
    progress: Optional[float]
    error: Optional[str]
    outputs: Optional[Dict[str, Any]]
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class FindingResponse(BaseModel):
    id: str
    run_id: str
    case_id: str
    label: str
    score: Optional[float]
    centroid_world: Optional[List[float]]
    bbox_world: Optional[Dict[str, List[float]]]
    volume_mm3: Optional[float]
    diameter_mm: Optional[float]
    mask_artifact_id: Optional[str]
    mesh_artifact_id: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True
