from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import schemas
from app.database import get_db
from app.services import jobs as jobs_service

router = APIRouter(tags=["jobs"])


def _sweep(db: Session = Depends(get_db)) -> None:
    jobs_service.sweep_dependency(db)


@router.get("/jobs", response_model=list[schemas.JobSummary])
def list_jobs(
    status: str | None = None, db: Session = Depends(get_db), _: None = Depends(_sweep)
) -> list[schemas.JobSummary]:
    return jobs_service.list_jobs(db, status=status)


@router.post("/jobs/train", response_model=schemas.JobSummary, status_code=201)
def submit_train_job(
    req: schemas.TrainJobRequest, db: Session = Depends(get_db), _: None = Depends(_sweep)
) -> schemas.JobSummary:
    return jobs_service.submit_job(
        db,
        job_type="train",
        model_id=req.model_id,
        batch=req.batch,
        precision=req.precision,
        priority_pref=req.priority_pref,
        sla_target=None,
    )


@router.post("/jobs/infer", response_model=schemas.JobSummary, status_code=201)
def submit_infer_job(
    req: schemas.InferJobRequest, db: Session = Depends(get_db), _: None = Depends(_sweep)
) -> schemas.JobSummary:
    return jobs_service.submit_job(
        db,
        job_type="infer",
        model_id=req.model_id,
        batch=req.batch,
        precision=req.precision,
        priority_pref=req.priority_pref,
        sla_target=req.sla_target,
    )
