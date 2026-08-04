from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import schemas
from app.database import get_db
from app.services import models as models_service

router = APIRouter(tags=["models"])


@router.get("/models", response_model=list[schemas.ModelSummary])
def list_models(db: Session = Depends(get_db)) -> list[schemas.ModelSummary]:
    return models_service.list_models(db)


@router.get("/models/{model_id}/layers", response_model=schemas.ModelLayersResponse)
def get_model_layers(model_id: int, db: Session = Depends(get_db)) -> schemas.ModelLayersResponse:
    result = models_service.get_model_layers(db, model_id)
    if result is None:
        raise HTTPException(status_code=404, detail="model not found")
    return result


@router.get("/datasets", response_model=list[schemas.DatasetItem])
def list_datasets(model_id: int | None = None, db: Session = Depends(get_db)) -> list[schemas.DatasetItem]:
    return models_service.list_datasets(db, model_id)
