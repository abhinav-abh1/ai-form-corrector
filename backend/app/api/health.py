"""
Health-check endpoint.

This is deliberately the very first real endpoint in the project. It doesn't touch the
database or do anything ML-related — its only job is to answer "is this service up and
responding?" Docker healthchecks, load balancers, and uptime monitors all rely on an
endpoint exactly like this one. Building it first also gives us the smallest possible
slice through the whole stack (client -> backend -> response) to prove the environment
works before any real feature code exists.
"""

from fastapi import APIRouter

from app.core.config import settings

router = APIRouter()


@router.get("/health")
def health_check() -> dict:
    return {
        "status": "ok",
        "environment": settings.environment,
    }
