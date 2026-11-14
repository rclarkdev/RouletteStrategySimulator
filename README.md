# Roulette Strategy Simulator

A web application in early implementation for creating, simulating, replaying, and comparing roulette strategies. The full financial simulator and strategy rules have not been implemented.

Read [PROJECT_PLAN.md](PROJECT_PLAN.md) for the authoritative product vision, requirements, cross-layer contracts, outcome/replay and audit model, storage/concurrency/security requirements, mobile plan, quality strategy, hosting tradeoffs, revised roadmap, risks, and open decisions. Significant choices are summarized in [docs/ARCHITECTURE_DECISIONS.md](docs/ARCHITECTURE_DECISIONS.md).

The repository contains the Phase 1 foundation and Phase 3 outcome-only domain primitives. Strategy specifications have not been supplied; no strategy evaluation, financial simulation, authentication, user-data persistence, database, 3D scene, or deployment is implemented. Financial simulation remains blocked until strategy and recovery specifications are approved.

Phase 1 foundation code provides a minimal React/Vite placeholder and FastAPI health/version endpoints. Phase 3 currently adds only pure outcome-sequence generation and replay primitives; these do not evaluate strategies or calculate financial results. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for prerequisites, local setup, and check commands. The project plan remains authoritative for later scope and architecture decisions.
