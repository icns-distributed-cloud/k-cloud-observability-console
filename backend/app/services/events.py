from datetime import datetime

from sqlalchemy.orm import Session

from app import models, schemas


def list_events(
    db: Session, since: datetime | None = None, job_id: int | None = None
) -> list[schemas.EventItem]:
    query = db.query(models.Event)
    if since is not None:
        query = query.filter(models.Event.occurred_at >= since)
    if job_id is not None:
        query = query.filter(models.Event.job_id == job_id)
    events = query.order_by(models.Event.occurred_at).all()
    return [
        schemas.EventItem(
            id=e.id,
            type=e.type,
            job_id=e.job_id,
            node_id=e.node_id,
            cluster_id=e.cluster_id,
            payload=e.payload,
            occurred_at=e.occurred_at,
        )
        for e in events
    ]
