import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    admin,
    analysis,
    health,
    insights,
    music,
    session,
    stories,
    taste,
    uploads,
)
from app.core import errors
from app.core.config import check_settings, get_settings
from app.services.music import trending

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
# httpx logs full request URLs at INFO; keep it quiet so query params never reach logs.
logging.getLogger("httpx").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    check_settings(settings)
    # Warm the trending charts so the first Stories can already prefer trending songs.
    warm = asyncio.gather(*(trending.refresh(lang, settings) for lang in trending.CHART_COUNTRIES))
    yield
    warm.cancel()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Tasteframe API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=None if settings.environment == "production" else "/docs",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Content-Type", "X-Session-Token", "Authorization"],
        expose_headers=["X-Request-ID"],
    )
    errors.install(app)
    for r in (health, session, uploads, taste, analysis, stories, music, insights, admin):
        app.include_router(r.router)
    return app


app = create_app()
