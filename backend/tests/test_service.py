from fastapi.testclient import TestClient
import pytest

from app.core.settings import Settings
from app.main import create_app


def test_health_endpoint_reports_liveness() -> None:
    client = TestClient(create_app(Settings(app_env="test", app_version="1.2.3")))

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_version_endpoint_reports_validated_metadata() -> None:
    client = TestClient(create_app(Settings(app_env="test", app_version="1.2.3")))

    response = client.get("/api/version")

    assert response.status_code == 200
    assert response.json() == {
        "name": "roulette-strategy-simulator-api",
        "version": "1.2.3",
        "environment": "test",
        "api_version": "v1",
    }


def test_settings_reject_invalid_environment_value(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "staging")

    with pytest.raises(ValueError):
        Settings.from_environment()


def test_settings_reject_invalid_version() -> None:
    with pytest.raises(ValueError):
        Settings(app_version="next-release")
