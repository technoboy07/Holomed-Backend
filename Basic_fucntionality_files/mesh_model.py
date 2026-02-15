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
import os
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
    DEFAULT_COLOR = "lightgray"  # Fallback color for models without textures

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
        
        # 2. Load Model with Fallback
        self.mesh, self.texture = self.load_and_normalize_mesh(model_path)

        # 3. Display model with original texture
        if self.texture is not None:
            # Model has texture - apply it
            self.actor = self.plotter.add_mesh(
                self.mesh,
                texture=self.texture,
                style='surface',
                show_edges=False,
                lighting=True,
                smooth_shading=True
            )
            print("✓ Loaded model with texture")
        else:
            # No texture - use default material
            self.actor = self.plotter.add_mesh(
                self.mesh,
                color=Config.DEFAULT_COLOR,
                style='surface',
                show_edges=False,
                lighting=True,
                smooth_shading=True
            )
            print("✓ Loaded model without texture (using default material)")

        # 4. AR Background Plane
        self.bg_plane = pv.Plane(
            center=(0, 0, -Config.BG_DISTANCE), 
            direction=(0, 0, 1), 
            i_size=32, j_size=18
        )
        self.bg_actor = self.plotter.add_mesh(self.bg_plane, lighting=False)
        self.bg_texture = None

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
            title="Select 3D Model with Texture",
            filetypes=[
                ("3D Models", "*.stl *.obj *.ply *.vtk *.glb *.gltf *.fbx"),
                ("OBJ Files", "*.obj"),
                ("All Files", "*.*")
            ]
        )
        
        root.destroy() # Cleanup
        return file_path

    def load_and_normalize_mesh(self, path: str):
        """Loads a mesh with texture and forces it to a standard size/position."""
        texture = None
        
        try:
            if not path:
                raise ValueError("No file selected")
                
            print(f"Loading: {path}")
            
            # Try to load mesh with texture support
            if path.lower().endswith('.obj'):
                # OBJ files may have textures - try to load them
                mesh, texture = self.load_obj_with_texture(path)
            else:
                # For other formats, try standard loading
                mesh = pv.read(path)
                # Check if mesh has texture coordinates
                if hasattr(mesh, 'texture_coordinates') and mesh.texture_coordinates is not None:
                    texture = self.load_texture_from_path(path)
                    
        except Exception as e:
            print(f"⚠️ Could not load custom file: {e}")
            print("↺ Reverting to Default Brain Model")
            mesh = pv.examples.download_brain()
            texture = None

        # Normalization Routine
        # 1. Center at origin
        mesh.translate(-np.array(mesh.center), inplace=True)
        
        # 2. Rotate 90 degrees if it's an OBJ (often they come in lying down)
        if path and path.lower().endswith('.obj'):
            mesh.rotate_x(-90, inplace=True)

        # 3. Scale to fit screen (target size ~10 units)
        bounds = mesh.bounds
        max_dim = max(
            bounds[1] - bounds[0], 
            bounds[3] - bounds[2], 
            bounds[5] - bounds[4]
        )
        
        if max_dim > 0:
            scale_factor = 5.0 / max_dim
            mesh.scale(scale_factor, inplace=True)
            
        return mesh, texture
    
    def load_obj_with_texture(self, obj_path: str):
        """Loads OBJ file and attempts to load associated texture files."""
        mesh = pv.read(obj_path)
        texture = None
        
        # OBJ files often have associated .mtl files and texture images
        obj_dir = Path(obj_path).parent
        obj_name = Path(obj_path).stem
        
        # Common texture file extensions
        texture_extensions = ['.png', '.jpg', '.jpeg', '.bmp', '.tga', '.tiff']
        
        # Try to find texture files in the same directory
        for ext in texture_extensions:
            # Try various naming conventions
            possible_names = [
                obj_name + ext,
                obj_name + '_texture' + ext,
                obj_name + '_diffuse' + ext,
                'texture' + ext,
                'diffuse' + ext,
            ]
            
            for tex_name in possible_names:
                tex_path = obj_dir / tex_name
                if tex_path.exists():
                    try:
                        texture = pv.read_texture(str(tex_path))
                        print(f"✓ Found texture: {tex_path}")
                        return mesh, texture
                    except Exception as e:
                        print(f"⚠️ Could not load texture {tex_path}: {e}")
                        continue
        
        # Try loading from MTL file if it exists
        mtl_path = obj_dir / (obj_name + '.mtl')
        if mtl_path.exists():
            texture = self.load_texture_from_mtl(str(mtl_path), obj_dir)
            if texture is not None:
                return mesh, texture
        
        # Check if mesh already has texture coordinates but no texture loaded
        if hasattr(mesh, 'texture_coordinates') and mesh.texture_coordinates is not None:
            # Try to find any image file in the directory
            for img_file in obj_dir.glob('*.png'):
                try:
                    texture = pv.read_texture(str(img_file))
                    print(f"✓ Found texture: {img_file}")
                    return mesh, texture
                except:
                    continue
            for img_file in obj_dir.glob('*.jpg'):
                try:
                    texture = pv.read_texture(str(img_file))
                    print(f"✓ Found texture: {img_file}")
                    return mesh, texture
                except:
                    continue
        
        return mesh, None
    
    def load_texture_from_mtl(self, mtl_path: str, obj_dir: Path):
        """Attempts to load texture referenced in MTL file."""
        try:
            with open(mtl_path, 'r') as f:
                for line in f:
                    line = line.strip()
                    # Look for map_Kd (diffuse texture) or map_Ka (ambient texture)
                    if line.startswith('map_Kd') or line.startswith('map_Ka'):
                        tex_file = line.split()[-1]
                        # Handle relative paths
                        tex_path = obj_dir / tex_file
                        if tex_path.exists():
                            return pv.read_texture(str(tex_path))
                        # Try with just filename if path doesn't work
                        tex_path = obj_dir / Path(tex_file).name
                        if tex_path.exists():
                            return pv.read_texture(str(tex_path))
        except Exception as e:
            print(f"⚠️ Error reading MTL file: {e}")
        return None
    
    def load_texture_from_path(self, model_path: str):
        """Attempts to find and load texture file based on model path."""
        model_dir = Path(model_path).parent
        model_name = Path(model_path).stem
        
        texture_extensions = ['.png', '.jpg', '.jpeg', '.bmp', '.tga']
        for ext in texture_extensions:
            tex_path = model_dir / (model_name + ext)
            if tex_path.exists():
                try:
                    return pv.read_texture(str(tex_path))
                except:
                    continue
        return None

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