from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    # Interaction
    PINCH_THRESHOLD: float = 0.05
    ROTATION_SENSITIVITY: float = 120
    SCALE_SENSITIVITY: float = 1.5

    # Runtime
    TARGET_FPS: int = 30
    CAMERA_INDEX: int = 0

    # Render / aesthetics
    HOLO_COLOR: str = "cyan"
    HOLO_EDGE_COLOR: str = "white"
    BG_DISTANCE: float = 20.0  # how far back the camera plane sits

