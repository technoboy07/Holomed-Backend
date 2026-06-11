"""
Database configuration and session management for MongoDB
"""

from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient
import os

# MongoDB connection URL - use environment variable or default to local MongoDB
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "holomed")

# Global client instance
client: AsyncIOMotorClient = None

async def init_db():
    """Initialize MongoDB connection and Beanie"""
    global client
    
    try:
        # Create Motor client
        client = AsyncIOMotorClient(MONGODB_URL)
        
        # Test connection
        await client.admin.command('ping')
        
        # Initialize Beanie with the database
        from models import User, Model3D, Session, Case, Artifact, AnalysisRun, Finding
        await init_beanie(
            database=client[DATABASE_NAME],
            document_models=[User, Model3D, Session, Case, Artifact, AnalysisRun, Finding]
        )
        
        print(f"Successfully connected to MongoDB database: {DATABASE_NAME}")
        return client
    except Exception as e:
        error_msg = f"Failed to connect to MongoDB: {str(e)}"
        print(f"ERROR: {error_msg}")
        raise ConnectionError(error_msg) from e

async def close_db():
    """Close MongoDB connection"""
    global client
    if client:
        client.close()

def get_database():
    """Get database instance"""
    return client[DATABASE_NAME]