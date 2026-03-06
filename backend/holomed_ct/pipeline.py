from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId

from models import AnalysisRun, Artifact, Finding


@dataclass
class CtFinding:
    label: str
    score: Optional[float]
    centroid_world: Optional[List[float]]
    bbox_world: Optional[Dict[str, List[float]]]
    volume_mm3: Optional[float]
    diameter_mm: Optional[float]
    mask_path: Optional[str]
    mesh_path: Optional[str]


async def persist_findings_as_artifacts(
    *,
    run: AnalysisRun,
    derived_upload_dir: str,
    findings: List[CtFinding],
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Persist findings to DB and write a JSON report artifact.

    Phase 2 returns: {report_artifact_id, findings_count, finding_ids}.
    """
    payload = {
        "pipeline": run.pipeline,
        "case_id": run.case_id,
        "ct_artifact_id": run.ct_artifact_id,
        "run_id": str(run.id),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "findings": [
            {
                "label": f.label,
                "score": f.score,
                "centroid_world": f.centroid_world,
                "bbox_world": f.bbox_world,
                "volume_mm3": f.volume_mm3,
                "diameter_mm": f.diameter_mm,
                "mask_path": f.mask_path,
                "mesh_path": f.mesh_path,
            }
            for f in findings
        ],
        "extra": extra or {},
    }

    report_filename = f"case_{run.case_id}_run_{str(run.id)}_findings.json"
    report_path = os.path.join(derived_upload_dir, report_filename)
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    report_artifact = Artifact(
        user_id=run.user_id,
        case_id=run.case_id,
        type="report_json",
        name=report_filename,
        file_path=report_path,
        file_format="json",
        file_size=os.path.getsize(report_path),
    )
    await report_artifact.insert()

    finding_ids: List[str] = []
    for idx, f in enumerate(findings):
        finding = Finding(
            user_id=run.user_id,
            case_id=run.case_id,
            run_id=str(run.id),
            label=f.label,
            score=f.score,
            centroid_world=f.centroid_world,
            bbox_world=f.bbox_world,
            volume_mm3=f.volume_mm3,
            diameter_mm=f.diameter_mm,
        )
        await finding.insert()
        finding_ids.append(str(finding.id))

        if f.mask_path and os.path.exists(f.mask_path):
            mask_name = os.path.basename(f.mask_path)
            mask_artifact = Artifact(
                user_id=run.user_id,
                case_id=run.case_id,
                type="mask_volume",
                name=mask_name,
                file_path=f.mask_path,
                file_format=os.path.splitext(mask_name)[1].lstrip(".") or "nii.gz",
                file_size=os.path.getsize(f.mask_path),
            )
            await mask_artifact.insert()
            finding.mask_artifact_id = str(mask_artifact.id)
            await finding.save()

        if f.mesh_path and os.path.exists(f.mesh_path):
            mesh_name = os.path.basename(f.mesh_path)
            mesh_artifact = Artifact(
                user_id=run.user_id,
                case_id=run.case_id,
                type="mesh_finding",
                name=mesh_name,
                file_path=f.mesh_path,
                file_format=os.path.splitext(mesh_name)[1].lstrip(".") or "glb",
                file_size=os.path.getsize(f.mesh_path),
            )
            await mesh_artifact.insert()
            finding.mesh_artifact_id = str(mesh_artifact.id)
            await finding.save()

    return {
        "report_artifact_id": str(report_artifact.id),
        "findings_count": len(findings),
        "finding_ids": finding_ids,
    }

