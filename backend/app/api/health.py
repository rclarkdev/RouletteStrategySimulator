"""Health and build metadata endpoints only."""

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.settings import Settings

router = APIRouter(tags=["service"])


class HealthResponse(BaseModel):
    status: Literal["ok"]


class VersionResponse(BaseModel):
    name: Literal["roulette-strategy-simulator-api"]
    version: str
    environment: Literal["development", "test", "production"]
    api_version: Literal["v1"]


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Report process liveness; does not imply downstream services are configured."""
    return HealthResponse(status="ok")


def version_response(settings: Settings) -> VersionResponse:
    """Build service metadata using already-validated settings."""
    return VersionResponse(
        name="roulette-strategy-simulator-api",
        version=settings.app_version,
        environment=settings.app_env,
        api_version="v1",
    )
