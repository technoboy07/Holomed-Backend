from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import Optional, Tuple

import numpy as np


@dataclass
class SharedState:
    """Thread-safe shared state between the tracker loop and renderer loop."""

    video_frame: Optional[np.ndarray] = None
    rotation_delta: Tuple[float, float, float] = (0.0, 0.0, 0.0)  # pitch,yaw,roll
    scale_factor: float = 1.0
    is_tracking: bool = False
    new_frame_available: bool = False
    lock: threading.Lock = field(default_factory=threading.Lock)

