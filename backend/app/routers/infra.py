from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import schemas
from app.database import get_db
from app.services import infra as infra_service

router = APIRouter(tags=["infra"])


@router.get("/providers", response_model=list[schemas.ProviderTree])
def list_providers(db: Session = Depends(get_db)) -> list[schemas.ProviderTree]:
    return infra_service.list_providers(db)


@router.get("/clusters/{cluster_id}", response_model=schemas.ClusterDetail)
def get_cluster_detail(cluster_id: int, db: Session = Depends(get_db)) -> schemas.ClusterDetail:
    detail = infra_service.get_cluster_detail(db, cluster_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="cluster not found")
    return detail


@router.get("/clusters/{cluster_id}/metric-profiles", response_model=list[schemas.MetricProfilePoint])
def get_cluster_metric_profiles(
    cluster_id: int, db: Session = Depends(get_db)
) -> list[schemas.MetricProfilePoint]:
    profiles = infra_service.get_cluster_metric_profiles(db, cluster_id)
    if profiles is None:
        raise HTTPException(status_code=404, detail="cluster not found")
    return profiles


@router.get("/clusters/{cluster_id}/assignments", response_model=list[schemas.AssignmentItem])
def list_cluster_assignments(cluster_id: int, db: Session = Depends(get_db)) -> list[schemas.AssignmentItem]:
    assignments = infra_service.list_cluster_assignments(db, cluster_id)
    if assignments is None:
        raise HTTPException(status_code=404, detail="cluster not found")
    return assignments


@router.get("/nodes/{node_id}", response_model=schemas.NodeDetail)
def get_node_detail(node_id: int, db: Session = Depends(get_db)) -> schemas.NodeDetail:
    detail = infra_service.get_node_detail(db, node_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="node not found")
    return detail


@router.get("/accelerators/{accelerator_id}", response_model=schemas.AcceleratorDetail)
def get_accelerator_detail(accelerator_id: int, db: Session = Depends(get_db)) -> schemas.AcceleratorDetail:
    detail = infra_service.get_accelerator_detail(db, accelerator_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="accelerator not found")
    return detail
