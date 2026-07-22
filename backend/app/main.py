from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.config import settings
from app.database import engine
from app.routers import caching, events, infra, jobs, models

app = FastAPI(title="K-Cloud Observability Console API")


@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": str(exc.orig)})

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(infra.router, prefix="/api/v1")
app.include_router(jobs.router, prefix="/api/v1")
app.include_router(events.router, prefix="/api/v1")
app.include_router(models.router, prefix="/api/v1")
app.include_router(caching.router, prefix="/api/v1")


@app.get("/health")
def health() -> dict:
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"status": "ok", "db": "connected"}
