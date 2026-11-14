# Local development (foundation, outcome primitives, and guest storage)

This repository contains the project foundation, outcome-only American pocket sequence/replay primitives, and a guest-side IndexedDB adapter for non-runnable strategies, preferences, and saved sequences. The adapter exposes no simulation-history API. No strategy rules, wager evaluation, financial calculations, complete simulation, strategy editor, authentication, server-side user-data storage, or 3D wheel are implemented.

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

Frontend guest records are stored only in the browser through `frontend/src/storage`. The adapter validates non-runnable strategy documents, sequence digests, preferences, and versioned backup imports before writing. Imported generated-sequence provenance is treated as unverified. IndexedDB data is local to the browser profile and may be cleared by the user or browser; exports are the portability/backup mechanism. No simulation results or server/account records are persisted by this phase.
