from sqlalchemy.orm import Session, selectinload

from app import models, schemas


def list_jobs(db: Session, status: str | None = None) -> list[schemas.JobSummary]:
    query = db.query(models.Job).options(selectinload(models.Job.model))
    if status is not None:
        query = query.filter(models.Job.status == status)

    return [
        schemas.JobSummary(
            id=job.id,
            model_id=job.model_id,
            model_name=job.model.name,
            type=job.type,
            status=job.status,
            batch=job.batch,
            precision=job.precision,
            priority_pref=job.priority_pref,
            sla_target=job.sla_target,
            submitted_at=job.submitted_at,
            started_at=job.started_at,
            finished_at=job.finished_at,
        )
        for job in query.all()
    ]
