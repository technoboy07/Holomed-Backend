from __future__ import annotations

from typing import Tuple, List


def _require_mesh_deps():
    try:
        import numpy  # noqa: F401
        import nibabel  # noqa: F401
        import trimesh  # noqa: F401
    except Exception as e:
        raise RuntimeError(
            "Mesh generation requires numpy + trimesh (and scikit-image for mask meshing). "
            "Install backend deps: `pip install -r requirements.txt`."
        ) from e


def mask_to_glb_mesh(
    *,
    mask_zyx,
    voxel_spacing_zyx: Tuple[float, float, float],
    out_path: str,
) -> str:
    """Convert a binary mask (Z,Y,X) to a GLB mesh via marching cubes."""
    _require_mesh_deps()

    import numpy as np
    from skimage import measure
    import trimesh

    vol = np.asarray(mask_zyx, dtype=np.float32)
    if vol.max() <= 0:
        raise ValueError("Empty mask; cannot create mesh")

    verts, faces, _normals, _values = measure.marching_cubes(vol, level=0.5, spacing=voxel_spacing_zyx)
    mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=False)
    mesh.export(out_path, file_type="glb")
    return out_path


def mask_xyz_to_glb_mesh_world(
    *,
    mask_xyz,
    affine_xyz_to_world,
    out_path: str,
) -> str:
    """Convert a binary mask (X,Y,Z) to a GLB mesh in CT world coordinates.

    - `mask_xyz` should be in the array order returned by nibabel (`img.get_fdata()`).
    - The output mesh vertices are transformed using the full NIfTI affine.
    """
    _require_mesh_deps()

    import numpy as np
    from skimage import measure
    import nibabel as nib
    import trimesh

    vol_xyz = np.asarray(mask_xyz, dtype=np.float32)
    if vol_xyz.max() <= 0:
        raise ValueError("Empty mask; cannot create mesh")

    # marching_cubes expects axis0~z, axis1~y, axis2~x. We transpose so that
    # returned vertices are in (z,y,x) voxel index space.
    vol_zyx = np.transpose(vol_xyz, (2, 1, 0))
    verts_zyx, faces, _normals, _values = measure.marching_cubes(vol_zyx, level=0.5)

    # Convert verts from (z,y,x) -> (x,y,z) voxel indices
    verts_xyz = np.stack([verts_zyx[:, 2], verts_zyx[:, 1], verts_zyx[:, 0]], axis=1)

    # Apply affine to get world coordinates (mm)
    verts_world = nib.affines.apply_affine(affine_xyz_to_world, verts_xyz)

    mesh = trimesh.Trimesh(vertices=verts_world, faces=faces, process=False)
    mesh.export(out_path, file_type="glb")
    return out_path


def ellipsoid_glb_from_world_box_cccwhd(
    *,
    center_world_xyz: List[float],
    whd_world: List[float],
    out_path: str,
) -> str:
    """Create a GLB ellipsoid mesh aligned with a detection box in world coordinates.

    This is the Phase 2 'segmentation placeholder': geometry derived from the detector.
    Replace with a true segmentation mask → mesh in the next iteration.
    """
    _require_mesh_deps()

    import trimesh

    cx, cy, cz = center_world_xyz
    w, h, d = whd_world
    sx, sy, sz = max(w / 2.0, 1e-3), max(h / 2.0, 1e-3), max(d / 2.0, 1e-3)

    sphere = trimesh.creation.icosphere(subdivisions=3, radius=1.0)
    sphere.apply_scale([sx, sy, sz])
    sphere.apply_translation([cx, cy, cz])
    sphere.export(out_path, file_type="glb")
    return out_path

