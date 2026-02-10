import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.storage.database import init_db, close_db
from app.storage.vector import init_qdrant

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await init_qdrant()
    logger.info("ready")
    yield
    await close_db()


app = FastAPI(
    title="Axios",
    description="evidence-grounded mediator assistant",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.routers import intake, session, challenge, evidence, zoom  # noqa: E402

app.include_router(intake.router, prefix="/api/intake", tags=["intake"])
app.include_router(session.router, prefix="/api", tags=["sessions"])
app.include_router(challenge.router, prefix="/api/challenge", tags=["challenge"])
app.include_router(evidence.router, prefix="/api/evidence", tags=["evidence"])
app.include_router(zoom.router, prefix="/api/zoom", tags=["zoom"])


@app.get("/api/health")
async def health():
    from app.config import settings
    return {
        "status": "ok",
        "openai_configured": bool(settings.openai_api_key),
        "cohere_configured": bool(settings.cohere_api_key),
    }
