from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import schemas
from app.database import get_db
from app.services import jobs as jobs_service

router = APIRouter(tags=["jobs"])


@router.get("/jobs", response_model=list[schemas.JobSummary])
def list_jobs(status: str | None = None, db: Session = Depends(get_db)) -> list[schemas.JobSummary]:
    return jobs_service.list_jobs(db, status=status)
