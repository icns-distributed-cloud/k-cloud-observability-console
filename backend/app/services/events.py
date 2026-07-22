from datetime import datetime

from sqlalchemy.orm import Session

from app import models, schemas


def list_events(db: Session, since: datetime) -> list[schemas.EventItem]:
    events = (
        db.query(models.Event)
        .filter(models.Event.occurred_at >= since)
        .order_by(models.Event.occurred_at)
        .all()
    )
    return [
        schemas.EventItem(
            id=e.id,
            type=e.type,
            job_id=e.job_id,
            node_id=e.node_id,
            accelerator_id=e.accelerator_id,
            cluster_id=e.cluster_id,
            payload=e.payload,
            occurred_at=e.occurred_at,
        )
        for e in events
    ]
