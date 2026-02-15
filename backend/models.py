from beanie import Document
from pydantic import Field, EmailStr, ConfigDict # Import ConfigDict
from typing import Optional
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