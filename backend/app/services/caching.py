from sqlalchemy.orm import Session

from app import models, schemas


def list_cache_prediction_points(db: Session) -> list[schemas.CachePredictionPointItem]:
    points = db.query(models.CachePredictionPoint).all()
    return [
        schemas.CachePredictionPointItem(id=p.id, predicted=p.predicted, actual=p.actual)
        for p in points
    ]
