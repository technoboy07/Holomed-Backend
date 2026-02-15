# HoloMed Integration Guide

This document describes the integration of the holographic viewer from `Basic_fucntionality_files` with the web frontend.

## What Was Implemented

### Backend Changes (`backend/`)

1. **WebSocket Support** (`backend/main.py`)
   - Added `ConnectionManager` class for managing WebSocket connections
   - Added `/ws/hand-tracking/{session_id}` endpoint for real-time hand tracking data
   - WebSocket endpoint receives gesture data and optionally stores it in session records

2. **Model File Serving** (`backend/main.py`)
   - Added `GET /api/models/{model_id}/file` endpoint
   - Serves actual 3D model files to authenticated users
   - Validates file existence and user permissions

3. **Dependencies** (`backend/requirements.txt`)
   - Added `websockets==12.0` for WebSocket support

### Frontend Changes (`src/`)

1. **Hand Tracking Hook** (`src/hooks/useHandTracking.js`)
   - Custom React hook using MediaPipe Hands for browser-based hand tracking
   - Implements pinch-to-rotate and two-hand zoom gestures
   - Mirrors the functionality from `Basic_fucntionality_files/mesh_model.py`
   - Provides enable/disable controls

2. **Viewer Component** (`src/components/Viewer.jsx`)
   - Enhanced to support multiple 3D model formats (STL, OBJ, GLTF, GLB)
   - Integrated hand tracking with video preview overlay
   - Falls back to mouse controls (OrbitControls) when hand tracking is disabled
   - Handles model loading errors gracefully

3. **App Component** (`src/App.jsx`)
   - Integrated with backend API for model fetching
   - Authentication flow with token management
   - Fetches user's models from backend
   - Handles model selection and loading

4. **Authentication** (`src/components/LoginModal.jsx`)
   - New component for user login and registration
   - Integrates with backend `/api/auth/login` and `/api/auth/register` endpoints
   - Automatic login after registration

5. **Header Component** (`src/components/Header.jsx`)
   - Added model upload functionality
   - Displays logged-in user email
   - Logout button
   - File upload with validation (format and size)

6. **Sidebar Component** (`src/components/Sidebar.jsx`)
   - Updated to display models from backend
   - Shows model file sizes
   - Loading states
   - Fallback to default model if no backend models available

7. **Dependencies** (`package.json`)
   - Added `@mediapipe/hands` and `@mediapipe/camera_utils` for hand tracking

## How It Works

### Hand Tracking Flow

1. User enables hand tracking in the viewer
2. Browser requests camera permission
3. MediaPipe Hands processes video frames
4. Gesture detection:
   - **One hand pinch**: Detects thumb and index finger proximity
   - **Two hand zoom**: Calculates distance between two index fingers
5. Gesture data updates 3D model transform in real-time
6. Optional: Gesture data can be sent to backend via WebSocket for session tracking

### Model Loading Flow

1. User logs in via `LoginModal`
2. App fetches user's models from `/api/models`
3. User selects a model from sidebar
4. App requests model file from `/api/models/{model_id}/file`
5. Three.js loader (STLLoader, OBJLoader, or GLTFLoader) loads the model
6. Model is displayed in the viewer with hand tracking controls

## Setup Instructions

### Backend Setup

1. **Install dependencies:**
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

2. **Start MongoDB** (if not already running):
   ```bash
   # Windows: Usually runs as service
   # macOS/Linux: mongod
   # Docker: docker run -d -p 27017:27017 --name mongodb mongo:latest
   ```

3. **Set environment variables** (optional):
   ```bash
   export MONGODB_URL="mongodb://localhost:27017"
   export DATABASE_NAME="holomed"
   export SECRET_KEY="your-secret-key-here"
   ```

4. **Run the backend:**
   ```bash
   uvicorn main:app --reload
   ```

### Frontend Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create `.env` file** (optional, defaults to `http://localhost:8000/api`):
   ```
   VITE_API_BASE=http://localhost:8000/api
   ```

3. **Run the frontend:**
   ```bash
   npm run dev
   ```

4. **Access the application:**
   - Frontend: `http://localhost:5173` (or port shown by Vite)
   - Backend API docs: `http://localhost:8000/docs`

## Usage

1. **First Time Setup:**
   - Open the application
   - Register a new account (or login if you have one)
   - Grant camera permissions when prompted (for hand tracking)

2. **Upload a Model:**
   - Click "+ Add Model" in the header
   - Select a 3D model file (STL, OBJ, PLY, VTK, GLTF, or GLB)
   - Wait for upload to complete
   - Model appears in sidebar

3. **View and Interact:**
   - Select a model from the sidebar
   - Model loads in the viewer
   - **Hand Tracking Controls:**
     - Pinch thumb and index finger together and move to rotate
     - Use two hands - bring closer to zoom in, move apart to zoom out
   - **Mouse Controls:** Available when hand tracking is disabled

4. **Camera Preview:**
   - Small video preview appears in top-right when hand tracking is active
   - Shows "Tracking Active" indicator when hands are detected

## Key Features

✅ **Browser-based hand tracking** - No Python dependencies needed in browser
✅ **Multiple 3D model formats** - STL, OBJ, GLTF, GLB support
✅ **User authentication** - Secure login/registration
✅ **Model management** - Upload, list, and delete models
✅ **Session tracking** - Optional WebSocket integration for gesture logging
✅ **Fallback controls** - Mouse/touch controls when hand tracking unavailable
✅ **Error handling** - Graceful degradation and user feedback

## Differences from Python Desktop App

The original Python app (`Basic_fucntionality_files/main.py`) used:
- PyVista for native OpenGL rendering
- MediaPipe Python for hand tracking
- Tkinter for file selection

The web integration uses:
- Three.js/React Three Fiber for WebGL rendering in browser
- MediaPipe JavaScript for browser-based hand tracking
- React components for UI
- FastAPI backend for model storage and authentication

## Troubleshooting

### Hand Tracking Not Working
- Ensure camera permissions are granted
- Check browser console for errors
- Verify MediaPipe CDN is accessible
- Try refreshing the page

### Models Not Loading
- Check backend is running on correct port
- Verify authentication token is valid
- Check browser console for CORS errors
- Ensure model file exists on server

### Backend Connection Issues
- Verify MongoDB is running
- Check backend logs for errors
- Ensure CORS is configured correctly
- Check network tab in browser dev tools

## Next Steps (Optional Enhancements)

- [ ] Add gesture calibration UI
- [ ] Implement WebSocket for real-time gesture streaming
- [ ] Add model preview thumbnails
- [ ] Support for model textures and materials
- [ ] Session recording and playback
- [ ] Multi-user collaboration features
- [ ] Mobile device support with touch gestures
