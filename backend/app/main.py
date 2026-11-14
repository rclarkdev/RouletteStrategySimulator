"""FastAPI application factory for the Phase 1 service foundation."""

from fastapi import FastAPI

from app.api.health import VersionResponse, router as health_router, version_response
from app.core.settings import Settings


def create_app(settings: Settings | None = None) -> FastAPI:
    """Create the API app, validating environment configuration at startup."""
    resolved_settings = settings or Settings.from_environment()
    app = FastAPI(
        title="Roulette Strategy Simulator API",
        version=resolved_settings.app_version,
        description="Foundation API; simulation and strategy endpoints are not implemented.",
    )
    app.include_router(health_router, prefix="/api")

    @app.get("/api/version", response_model=VersionResponse, tags=["service"])
    def version() -> VersionResponse:
        return version_response(resolved_settings)

    return app


app = create_app()
