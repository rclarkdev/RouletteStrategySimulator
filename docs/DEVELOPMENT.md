# Local development (Phase 1 and outcome-only Phase 3)

This repository contains the project foundation and outcome-only American pocket sequence/replay primitives. No strategy rules, wager evaluation, financial calculations, complete simulation, strategy editor, authentication, user-data storage, or 3D wheel are implemented.

## Prerequisites

- Node.js 22 LTS (npm is included).
- Python 3.11 or newer.
- GitHub Actions uses Node.js 22 and Python 3.12 for CI.

## Frontend

From `frontend/`:

```powershell
npm ci
npm run dev
```

Available checks:

```powershell
npm test
npm run lint
npm run format:check
npm run build
```

Vite prints the local development URL. The current page is a foundation placeholder only.

## Backend

From `backend/`, create and activate a virtual environment, then install the project and development dependencies:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e ".[dev]"
```

Run the API locally:

```powershell
python -m uvicorn app.main:app --reload
```

The Phase 1 service provides `GET /api/health`, `GET /api/version`, and FastAPI's local OpenAPI documentation at `/docs`. These endpoints report liveness/build metadata only; they do not imply simulation functionality.

Run checks:

```powershell
python -m pytest
python -m ruff check app tests
python -m ruff format --check app tests
```

The API reads `APP_ENV` (`development`, `test`, or `production`) and `APP_VERSION` (semantic version, default `0.1.0`) from the process environment. Invalid values stop app construction. It does not automatically load `.env` files. No authentication secret or storage setting is consumed in this phase.

## CI

GitHub Actions runs frontend install, lint, formatting check, tests, and production build, plus backend editable install, Ruff checks, and pytest. CI dependency installation occurs in an isolated runner; local setup is performed explicitly by the developer using the commands above.
