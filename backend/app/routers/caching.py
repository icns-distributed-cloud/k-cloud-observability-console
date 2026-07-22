from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import schemas
from app.database import get_db
from app.services import caching as caching_service

router = APIRouter(tags=["caching"])


@router.get("/cache-prediction-points", response_model=list[schemas.CachePredictionPointItem])
def list_cache_prediction_points(
    db: Session = Depends(get_db),
) -> list[schemas.CachePredictionPointItem]:
    return caching_service.list_cache_prediction_points(db)
