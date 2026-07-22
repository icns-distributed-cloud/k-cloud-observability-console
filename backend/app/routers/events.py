from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import schemas
from app.database import get_db
from app.services import events as events_service
from app.services import jobs as jobs_service

router = APIRouter(tags=["events"])


@router.get("/events", response_model=list[schemas.EventItem])
def list_events(
    since: datetime,
    db: Session = Depends(get_db),
    _: None = Depends(jobs_service.sweep_dependency),
) -> list[schemas.EventItem]:
    return events_service.list_events(db, since=since)
