"""Validated application settings loaded from the process environment."""

from __future__ import annotations

import os
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator


class Settings(BaseModel):
    """Minimal settings for the foundation API; no storage or secret settings yet."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    app_env: Literal["development", "test", "production"] = "development"
    app_version: str = "0.1.0"

    @field_validator("app_version")
    @classmethod
    def validate_app_version(cls, value: str) -> str:
        """Require a simple semantic version to avoid ambiguous version metadata."""
        if not re.fullmatch(r"\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?", value):
            raise ValueError("APP_VERSION must be a semantic version such as 0.1.0")
        return value

    @classmethod
    def from_environment(cls) -> Settings:
        """Read supported values from the process environment and validate them."""
        return cls(
            app_env=os.environ.get("APP_ENV", "development"),
            app_version=os.environ.get("APP_VERSION", "0.1.0"),
        )
