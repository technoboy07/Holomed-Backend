"""
Pydantic schemas for request/response validation
"""

from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional

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
