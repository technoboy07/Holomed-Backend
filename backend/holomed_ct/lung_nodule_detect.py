from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional


@dataclass
class DetBoxCccwhd:
    """Detection box in (center_x, center_y, center_z, w, h, d) world coords (mm)."""

    c: List[float]  # len=3
    whd: List[float]  # len=3
    score: float


def _require_monai():
    try:
        import monai  # noqa: F401
        import torch  # noqa: F401
    except Exception as e:
        raise RuntimeError(
            "MONAI + PyTorch are required for lung nodule detection. "
            "Install backend deps: `pip install -r requirements.txt`."
        ) from e


def detect_lung_nodules_cccwhd_world(*, ct_path: str, bundle_root: str) -> List[DetBoxCccwhd]:
    """Run the MONAI RetinaNet lung nodule detector on a single NIfTI CT.

    Phase 2 implementation note:
    - This function is intentionally kept minimal and will be expanded to include proper
      postprocessing and configurable thresholds.
    - Requires MONAI + torch + nibabel (via MONAI's LoadImaged).
    """
    _require_monai()

    import os
    import torch
    from monai.apps.detection.networks.retinanet_detector import RetinaNetDetector
    from monai.apps.detection.networks.retinanet_network import RetinaNet
    from monai.apps.detection.utils.anchor_utils import AnchorGeneratorWithAnchorShape
    from monai.apps.detection.networks.retinanet_network import resnet_fpn_feature_extractor
    from monai.networks.nets.resnet import resnet50
    from monai.transforms import (
        Compose,
        EnsureChannelFirstd,
        EnsureTyped,
        LoadImaged,
        Orientationd,
        ScaleIntensityRanged,
        Spacingd,
    )
    from monai.apps.detection.transforms.dictionary import (
        AffineBoxToWorldCoordinated,
        ClipBoxToImaged,
        ConvertBoxModed,
    )

    device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")

    # Mirror the bundle config (lung_nodule_ct_detection/configs/inference.json)
    image_key = "image"
    preprocessing = Compose(
        [
            LoadImaged(keys=image_key),
            EnsureChannelFirstd(keys=image_key),
            Orientationd(keys=image_key, axcodes="RAS"),
            Spacingd(keys=image_key, pixdim=(0.703125, 0.703125, 1.25)),
            ScaleIntensityRanged(keys=image_key, a_min=-1024.0, a_max=300.0, b_min=0.0, b_max=1.0, clip=True),
            EnsureTyped(keys=image_key),
        ]
    )

    data = preprocessing({image_key: ct_path})
    img = data[image_key]  # MetaTensor

    # Network
    backbone = resnet50(spatial_dims=3, n_input_channels=1, conv1_t_stride=[2, 2, 1], conv1_t_size=[7, 7, 7])
    # Match the MONAI 1.5.x signature (no `extra_blocks` kwarg).
    feature_extractor = resnet_fpn_feature_extractor(
        backbone,
        spatial_dims=3,
        pretrained_backbone=False,
        returned_layers=[1, 2],
    )
    network = RetinaNet(
        spatial_dims=3,
        num_classes=1,
        num_anchors=3,
        feature_extractor=feature_extractor,
        size_divisible=(16, 16, 8),
        use_list_output=False,
    ).to(device)

    ckpt_path = os.path.join(bundle_root, "models", "model.pt")
    ckpt = torch.load(ckpt_path, map_location=device)
    # bundle checkpoint format: {"model": state_dict, ...} or direct state_dict
    state = ckpt.get("model", ckpt) if isinstance(ckpt, dict) else ckpt
    network.load_state_dict(state)
    network.eval()

    anchor_generator = AnchorGeneratorWithAnchorShape(
        feature_map_scales=[1, 2, 4],
        base_anchor_shapes=[[6, 8, 4], [8, 6, 5], [10, 10, 6]],
    )

    detector = RetinaNetDetector(
        network=network,
        anchor_generator=anchor_generator,
        spatial_dims=3,
        num_classes=1,
        size_divisible=(16, 16, 8),
        debug=False,
    )
    detector.set_target_keys(box_key="box", label_key="label")
    detector.set_box_selector_parameters(
        score_thresh=0.02,
        topk_candidates_per_level=1000,
        nms_thresh=0.22,
        detections_per_img=300,
    )

    # Inference expects list of tensors.
    inputs = [img.to(device)]
    detector.eval()
    try:
      with torch.no_grad():
          pred = detector(inputs)
          # pred is list[dict] length=batch. We'll use batch=1.
          pred0 = pred[0]
    except ValueError as e:
        # Handle numerical instabilities (NaN/Inf) by returning no detections
        msg = str(e)
        if "NaN or Inf" in msg:
            print("Warning: RetinaNet detection produced NaN/Inf; returning zero detections.")
            return []
        raise

    # Postprocess to world coords and convert box mode.
    post = Compose(
        [
            ClipBoxToImaged(box_keys="box", label_keys="label", box_ref_image_keys=image_key, remove_empty=True),
            AffineBoxToWorldCoordinated(box_keys="box", box_ref_image_keys=image_key, affine_lps_to_ras=True),
            ConvertBoxModed(box_keys="box", src_mode="xyzxyz", dst_mode="cccwhd"),
        ]
    )
    post_out = post({**pred0, image_key: img})

    boxes = post_out.get("box", [])
    scores = post_out.get("label_scores", [])
    # boxes: [N, 6] cccwhd; scores: [N, 1] maybe.
    out: List[DetBoxCccwhd] = []
    for i in range(len(boxes)):
        b = boxes[i]
        s = float(scores[i][0]) if hasattr(scores[i], "__len__") else float(scores[i])
        out.append(DetBoxCccwhd(c=[float(b[0]), float(b[1]), float(b[2])], whd=[float(b[3]), float(b[4]), float(b[5])], score=s))
    return out

