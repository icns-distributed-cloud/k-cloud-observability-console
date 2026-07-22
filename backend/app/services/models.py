from sqlalchemy.orm import Session

from app import models, schemas


def get_model_layers(db: Session, model_id: int) -> schemas.ModelLayersResponse | None:
    model = db.query(models.Model).filter(models.Model.id == model_id).first()
    if model is None:
        return None

    layers = db.query(models.ModelLayer).filter(models.ModelLayer.model_id == model_id).all()
    layer_ids = [layer.id for layer in layers]
    edges = (
        db.query(models.ModelLayerEdge)
        .filter(models.ModelLayerEdge.from_layer_id.in_(layer_ids))
        .all()
        if layer_ids
        else []
    )

    return schemas.ModelLayersResponse(
        layers=[
            schemas.ModelLayerItem(
                id=layer.id,
                model_id=layer.model_id,
                op_name=layer.op_name,
                shape=layer.shape,
                gflops=layer.gflops,
                mem_mb=layer.mem_mb,
                characteristic=layer.characteristic,
            )
            for layer in layers
        ],
        edges=[
            schemas.ModelLayerEdgeItem(
                id=edge.id, from_layer_id=edge.from_layer_id, to_layer_id=edge.to_layer_id
            )
            for edge in edges
        ],
    )
