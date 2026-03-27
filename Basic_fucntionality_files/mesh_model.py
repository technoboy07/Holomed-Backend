import cv2
import mediapipe as mp
import pyvista as pv
import numpy as np
import threading
import time
import tkinter as tk
from tkinter import filedialog
from typing import Optional, Tuple
from dataclasses import dataclass
from pathlib import Path

# --- Configuration ---
class Config:
    PINCH_THRESHOLD = 0.05
    ROTATION_SENSITIVITY = 120
    SCALE_SENSITIVITY = 1.5
    TARGET_FPS = 30
    CAMERA_INDEX = 0
    MESH_SCALE_BASE = 1.0 
    
    # Rendering settings
    BG_DISTANCE = 20.0  # How far back the camera plane sits
    #DEFAULT_COLOR = "lightgray"Fallback color for models without textures

@dataclass
class SharedState:
    """Thread-safe state."""
    video_frame: Optional[np.ndarray] = None
    # (d_pitch, d_yaw, d_roll)
    rotation_delta: Tuple[float, float, float] = (0.0, 0.0, 0.0) 
    scale_factor: float = 1.0
    is_tracking: bool = False
    lock: threading.Lock = None
    new_frame_available: bool = False
    
    def __post_init__(self):
        if self.lock is None: self.lock = threading.Lock()

class HandTracker(threading.Thread):
    def __init__(self, shared_state: SharedState):
        super().__init__(daemon=True)
        self.state = shared_state
        self.running = True
        self.cap = cv2.VideoCapture(Config.CAMERA_INDEX)
        
        # Optimization: faster tracking
        self.hands = mp.solutions.hands.Hands(
            max_num_hands=2,
            model_complexity=0, 
            min_detection_confidence=0.7,
            min_tracking_confidence=0.7
        )
        
        # Interaction memory
        self.last_pinch_pos = None
        self.last_pinch_dist = None
        
    def run(self):
        while self.running and self.cap.isOpened():
            success, frame = self.cap.read()
            if not success: continue

            # Flip for mirror effect, convert to RGB
            frame = cv2.flip(frame, 1)
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = self.hands.process(rgb)
            
            # --- Logic Calculation ---
            rot_delta = (0, 0, 0)
            scale_mult = 1.0
            tracking = False

            if results.multi_hand_landmarks:
                tracking = True
                
                # Check for "Pinch" (Rotation) - One Hand
                # Index (8) and Thumb (4)
                h1 = results.multi_hand_landmarks[0]
                p1 = np.array([h1.landmark[8].x, h1.landmark[8].y])
                p2 = np.array([h1.landmark[4].x, h1.landmark[4].y])
                pinch_dist = np.linalg.norm(p1 - p2)

                # Gesture 1: One-handed Pinch to Rotate
                if pinch_dist < Config.PINCH_THRESHOLD:
                    center = (p1 + p2) / 2
                    if self.last_pinch_pos is not None:
                        # Calculate movement delta
                        dx = (center[0] - self.last_pinch_pos[0]) * Config.ROTATION_SENSITIVITY
                        dy = (center[1] - self.last_pinch_pos[1]) * Config.ROTATION_SENSITIVITY
                        rot_delta = (dy, dx, 0) # Pitch, Yaw
                    self.last_pinch_pos = center
                else:
                    self.last_pinch_pos = None

                # Gesture 2: Two-handed Zoom
                if len(results.multi_hand_landmarks) == 2:
                    h2 = results.multi_hand_landmarks[1]
                    # Distance between wrists or index fingers of both hands
                    h1_pos = np.array([h1.landmark[8].x, h1.landmark[8].y])
                    h2_pos = np.array([h2.landmark[8].x, h2.landmark[8].y])
                    hand_dist = np.linalg.norm(h1_pos - h2_pos)

                    if self.last_pinch_dist is not None:
                        # Ratio change
                        if self.last_pinch_dist > 0.01:
                            scale_mult = hand_dist / self.last_pinch_dist
                    self.last_pinch_dist = hand_dist
                else:
                    self.last_pinch_dist = None
            else:
                self.last_pinch_pos = None
                self.last_pinch_dist = None

            # Update Shared State
            with self.state.lock:
                self.state.video_frame = rgb # Keep RGB for texture
                self.state.new_frame_available = True
                self.state.rotation_delta = rot_delta
                self.state.scale_factor = scale_mult
                self.state.is_tracking = tracking

    def stop(self):
        self.running = False
        self.cap.release()

class JarvisVisualizer:
    def __init__(self):
        self.state = SharedState()
        self.tracker = HandTracker(self.state)
        
        # --- NEW: File Picker Logic ---
        print("Initializing Jarvis System...")
        model_path = self.select_file_gui()
        
        # 1. Setup Scene
        self.plotter = pv.Plotter(window_size=(1280, 720))
        self.plotter.set_background('black')
        self.plotter.disable()
        
        # 2. Load Model with Fallback (mesh only, no textures)
        self.mesh = self.load_and_normalize_mesh(model_path)

        # 3. Display model (solid color)
        self.actor = self.plotter.add_mesh(
            self.mesh,
            # color=Config.DEFAULT_COLOR,
            style='surface',
            show_edges=False,
            lighting=True,
            smooth_shading=True
        )
        print("✓ Loaded model")

        # 4. AR Background Plane
        self.bg_plane = pv.Plane(
            center=(0, 0, -Config.BG_DISTANCE),
            direction=(0, 0, 1),
            i_size=32, j_size=18
        )
        self.bg_actor = self.plotter.add_mesh(self.bg_plane, lighting=False)

        # Camera setup
        self.plotter.camera.position = (0, 0, 10)
        self.plotter.camera.focal_point = (0, 0, 0)
        self.plotter.camera.up = (0, 1, 0)

        # Interaction persistence
        self.current_rot = [0, 0, 0]
        self.current_scale = 1.0

    def select_file_gui(self) -> str:
        """Opens a native system file picker to choose a 3D model."""
        # Create a hidden root window (we don't want a full GUI, just the popup)
        root = tk.Tk()
        root.withdraw() 
        
        print("Waiting for file selection...")
        file_path = filedialog.askopenfilename(
            title="Select 3D Model",
            filetypes=[
                ("3D Models", "*.stl *.obj *.ply *.vtk *.glb *.gltf *.fbx"),
                ("OBJ Files", "*.obj"),
                ("All Files", "*.*")
            ]
        )
        
        root.destroy() # Cleanup
        return file_path

    def load_and_normalize_mesh(self, path: str):
        """Loads a mesh and forces it to a standard size/position. No textures."""
        try:
            if not path:
                raise ValueError("No file selected")
            print(f"Loading: {path}")
            mesh = pv.read(path)
        except Exception as e:
            print(f"⚠️ Could not load custom file: {e}")
            print("↺ Reverting to Default Brain Model")
            mesh = pv.examples.download_brain()

        # Normalization: center at origin
        mesh.translate(-np.array(mesh.center), inplace=True)
        # Rotate 90 degrees if OBJ (often lying down)
        if path and path.lower().endswith('.obj'):
            mesh.rotate_x(-90, inplace=True)
        # Scale to fit screen
        bounds = mesh.bounds
        max_dim = max(
            bounds[1] - bounds[0],
            bounds[3] - bounds[2],
            bounds[5] - bounds[4]
        )
        if max_dim > 0:
            mesh.scale(5.0 / max_dim, inplace=True)
        return mesh

    def update_loop(self):
        # ... (Keep the exact same update logic from previous response) ...
        with self.state.lock:
            frame = self.state.video_frame
            has_new_frame = self.state.new_frame_available
            rot_delta = self.state.rotation_delta
            scale_mult = self.state.scale_factor
            self.state.new_frame_available = False

        if has_new_frame and frame is not None:
            tex = pv.numpy_to_texture(frame)
            self.bg_actor.texture = tex

        if rot_delta != (0,0,0):
            self.current_rot[0] += rot_delta[0]
            self.current_rot[1] += rot_delta[1]
            self.actor.orientation = self.current_rot

        if scale_mult != 1.0:
            self.current_scale *= scale_mult
            self.current_scale = max(0.2, min(self.current_scale, 5.0))
            self.actor.scale = [self.current_scale] * 3

    def start(self):
        # ... (Keep same start logic) ...
        self.tracker.start()
        self.plotter.show(interactive_update=True)
        while self.plotter.iren.initialized:
            start_t = time.time()
            self.update_loop()
            self.plotter.update()
            dt = time.time() - start_t
            time.sleep(max(0, (1/Config.TARGET_FPS) - dt))
        self.tracker.stop()
        
if __name__ == "__main__":
    app = JarvisVisualizer()
    app.start()