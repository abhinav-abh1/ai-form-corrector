from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import health
from app.core.config import settings

app = FastAPI(
    title="AI Form Corrector API",
    version="0.1.0",
)

# The frontend runs on a different origin (localhost:3000) than the API (localhost:8000)
# during local development, so the browser will block requests without this. In production
# this should be locked down to the real deployed frontend origin, not left wide open.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api", tags=["health"])
