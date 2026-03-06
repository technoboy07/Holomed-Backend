from __future__ import annotations

from dataclasses import dataclass
from typing import List, Tuple

import numpy as np


@dataclass
class RoiEllipsoidSegmentation:
    """A minimal, replaceable ROI 'segmentation' used as a Phase 2 placeholder.

    It generates a smooth binary mask shaped like an ellipsoid that fits the detection box.
    Replace this with a true ROI segmentation model in the next iteration.
    """

    mask: np.ndarray  # Z,Y,X (voxel)


def ellipsoid_mask_from_box_cccwhd(
    *,
    image_shape_zyx: Tuple[int, int, int],
    center_zyx: Tuple[float, float, float],
    radii_zyx: Tuple[float, float, float],
) -> np.ndarray:
    """Create a binary ellipsoid mask in voxel coordinates.

    This is purely geometric and is meant to be swapped out.
    """
    z, y, x = image_shape_zyx
    cz, cy, cx = center_zyx
    rz, ry, rx = radii_zyx
    rz = max(rz, 1e-3)
    ry = max(ry, 1e-3)
    rx = max(rx, 1e-3)

    zz, yy, xx = np.ogrid[:z, :y, :x]
    dist = ((zz - cz) / rz) ** 2 + ((yy - cy) / ry) ** 2 + ((xx - cx) / rx) ** 2
    return (dist <= 1.0).astype(np.uint8)

