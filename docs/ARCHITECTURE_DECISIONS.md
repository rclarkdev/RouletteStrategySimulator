# Architecture Decision Records

These records summarize the recommended decisions from the planning review. The detailed requirements, contracts, constraints, and roadmap in the root [PROJECT_PLAN.md](../PROJECT_PLAN.md) are authoritative. These are planning decisions, not implemented behavior; obtain explicit user approval for the plan before implementation. Requirements already specified by the user (such as Python being authoritative) are treated as fixed constraints, while other choices are recommendations that may be revised after the open questions are resolved.

## ADR-001 — Python engine is authoritative

- **Decision:** The Python domain/simulation engine is the sole authority for roulette outcomes, accepted wagers, settlements, bankroll, and financial metrics.
- **Context:** The React client needs interactive controls and visualization, but duplicate financial implementations can disagree and undermine auditability.
- **Options considered:** Browser-only simulation; duplicated client and server calculations; independent Python engine called through an API.
- **Selected approach:** Independent Python engine, with FastAPI as a thin validation/orchestration boundary and React as presentation/API client.
- **Reasoning:** Keeps rules testable independently, centralizes exact financial semantics, and allows web/mobile clients to share results.
- **Consequences:** Authoritative simulations require network access initially; browser failure must not trigger substitute calculations. API and engine contracts require versioning.
- **Revisit when:** Offline authoritative simulation becomes a confirmed requirement and a separate, parity-verified portable engine is approved.

## ADR-002 — Declarative, versioned strategy JSON; no user code

- **Decision:** Strategies are validated versioned JSON configurations, never imported scripts or user-generated HTML. Strategy schema version, strategy semantic/ruleset version, and simulation engine version are distinct.
- **Context:** The user will supply strategy rules separately; the editor should be generic and avoid a page per strategy.
- **Options considered:** Hard-coded strategy classes/pages; executable user scripts; declarative versioned rule documents evaluated by a backend registry.
- **Selected approach:** Shared schema-driven editor/viewer and a backend rule-type registry with deterministic, explicitly versioned semantics.
- **Reasoning:** Supports extensibility without changing React for each strategy and prevents arbitrary imported code execution. Separating schema shape from rule meaning prevents silent historical reinterpretation.
- **Consequences:** Unknown rule types/semantic versions fail closed; engine work is blocked until rule specifications and worked reference examples are approved; old results retain immutable snapshots.
- **Revisit when:** A new strategy family cannot be expressed safely using the declarative model; propose an explicit extension and security review rather than enabling arbitrary code.

## ADR-003 — Persist actual outcomes; seed is supplementary

- **Decision:** Every completed simulation stores the exact ordered pocket sequence, including distinct `0` and `00`, along with its execution snapshot, ledger, summary, provenance, and integrity digest. A seed alone is never sufficient for replay or audit.
- **Context:** PRNG algorithms, runtime versions, and mappings can change; wheel animation must not choose outcomes.
- **Options considered:** Store only seed; store outcomes only; store both sequence and generation provenance.
- **Selected approach:** Save actual outcomes and provenance. Use OS-backed Python randomness for normal generation; optional explicitly versioned seed mode is for controlled research/testing.
- **Reasoning:** The saved sequence makes replay and independent re-execution possible regardless of future generator implementation. The exact ledger allows historical results to remain viewable when an old engine is no longer available.
- **Consequences:** Larger records require bounded/compressed storage and paging. The client animates a predetermined sequence only. A digest detects accidental corruption but is not a signature against a privileged operator.
- **Revisit when:** Record size or a formal audit/compliance requirement justifies chunking, signatures, or a separately protected append-only log.

## ADR-004 — Guest-first IndexedDB and a storage provider boundary

- **Decision:** Guests use browser IndexedDB for strategies, history, saved sequences, and preferences. Storage interfaces isolate app/domain logic from IndexedDB, server files, or future providers.
- **Context:** Registration should not be required and hosting should remain inexpensive; guest records are device-local and not backups.
- **Options considered:** Require accounts/database; use browser localStorage; use IndexedDB with an adapter; add a cloud database immediately.
- **Selected approach:** IndexedDB for guest data, with schema migrations, quota handling, and explicit import/export; no server persistence of guest records by default.
- **Reasoning:** IndexedDB supports larger structured records and transactions better than simple key/value storage, while avoiding account infrastructure.
- **Consequences:** Data may be cleared or unavailable on another device; simulation still requires backend connectivity. Local records are user-controlled and not server-private.
- **Revisit when:** Cross-device sync, large datasets, or browser storage limitations become a confirmed requirement.

## ADR-005 — Private files for modest, single-host registered storage

- **Decision:** If registered accounts launch, begin with private JSON strategy files and compressed simulation records on a durable, configured server filesystem, outside application and public directories. Do not add a database server by default.
- **Context:** The expected initial scale is modest and the project seeks low hosting costs. Files are readable and simple but require careful consistency and operations.
- **Options considered:** Local files; SQLite; PostgreSQL; managed object storage; a multi-service stack.
- **Selected approach:** File provider behind typed storage interfaces, one host and controlled writers, generated IDs, app-level ownership, atomic replacement, cross-process locks/revisions, quotas, checksums, and external backups.
- **Reasoning:** Lowest operational complexity for a single-host use case while preserving migration paths. Atomic rename handles torn writes, but not lost updates; locking and revision checks are required.
- **Consequences:** This is not a safe default for ephemeral container disks, unverified network filesystems, or independent multi-instance writers. Backup/restore and process-level concurrency need testing on the target provider.
- **Revisit when:** Host storage is ephemeral; multiple hosts must write; lock/atomic semantics are not reliable; contention, indexing, availability, or recovery objectives exceed file capabilities. Consider SQLite for single-host metadata transactions; PostgreSQL for multi-instance transactions/query needs; object storage for large immutable blobs/backups.

## ADR-006 — Modular monolith, no premature infrastructure

- **Decision:** Begin with one React static client and one modular FastAPI service, not microservices, Kubernetes, Redis, or a message broker.
- **Context:** No demonstrated scale, independent deployment requirement, or distributed workload exists.
- **Options considered:** Modular monolith; microservices; distributed jobs/queues from the outset.
- **Selected approach:** Keep API, application services, domain engine, and storage adapter as explicit modules in one backend deployment.
- **Reasoning:** Reduces hosting cost and operational failure modes while preserving testable boundaries.
- **Consequences:** Large runs must be bounded synchronously at first. A background job system requires measured need plus explicit lifecycle and persistence design.
- **Revisit when:** Benchmarks show synchronous requests cannot meet latency/resource targets or deployment scaling requires independent components.

## ADR-007 — Web first; Capacitor as a later shell

- **Decision:** Build and validate the responsive web application first. Capacitor later reuses the UI and same Python HTTPS API; no duplicate native financial engine is planned.
- **Context:** Mobile Android/iOS is desired, but web is the initial priority and WebView/auth/GPU behavior differs from desktop browsers.
- **Options considered:** Native-first apps; separate mobile client; shared responsive React app packaged by Capacitor.
- **Selected approach:** Shared web client with narrow native plugins only for platform capabilities; API origin configured per build; mobile packaging after stable web contracts.
- **Reasoning:** Reuses most UI and keeps server authority consistent while limiting native complexity.
- **Consequences:** Offline guest record access can work, but authoritative simulations require network. Account sync needs explicit conflict handling. Mobile auth may require PKCE/system browser and Keychain/Keystore-backed storage; cookies cannot be assumed identical in WebViews.
- **Revisit when:** Product requires reliable offline simulation or native-specific functionality that cannot be met through the web shell.

## ADR-008 — Small Linux host only with durable storage and recovery evidence

- **Decision:** Prefer an inexpensive Linux VPS or comparable Python host with static frontend assets, FastAPI ASGI behind HTTPS reverse proxy, and a persistent private volume; initial file-backed account deployment is single-host.
- **Context:** Cost is a priority but user records must survive restarts and remain private.
- **Options considered:** Ephemeral serverless/container filesystem; VPS local disk; managed file/object service; database-centric platform.
- **Selected approach:** Single host only after validating durable volume behavior, backup/restore, permissions, and lock semantics. Static frontend may be served separately or by the proxy.
- **Reasoning:** Keeps architecture simple and inexpensive without pretending ephemeral local storage is persistent.
- **Consequences:** Host/disk is a single point of failure; backups, restore drills, monitoring, and rollback are required. No deployment provider has been selected or purchased.
- **Revisit when:** Availability, traffic, data region, or durability goals require managed storage or multiple application instances.

## ADR-009 — Quality gates are layered and financial calculations independently tested

- **Decision:** Use pytest unit/reference/property tests; API, storage/concurrency/security integration tests; frontend unit/integration tests; browser E2E; and representative physical mobile/performance testing.
- **Context:** Correctness spans configuration validation, engine calculations, persistence, authorization, and replay—not only visible UI.
- **Options considered:** UI-only testing; unit tests only; layered test strategy with known reference vectors and invariants.
- **Selected approach:** Layered testing and measurable phase-specific gates; financial expected values come from independently reviewed reference vectors.
- **Reasoning:** Isolates bugs and makes deterministic replay and authorization guarantees verifiable. Statistical tests alone cannot prove arithmetic or sampling correctness.
- **Consequences:** Test fixtures and device/performance budgets are ongoing project artifacts; numeric caps must be measured and approved before release.
- **Revisit when:** New storage providers, authentication flows, platforms, or execution models are introduced; extend test layers rather than removing them.
