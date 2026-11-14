# Roulette Strategy Simulator — Project Plan

**Status:** Architecture plan with Phase 1 foundation and Phase 3 outcome-only primitives  
**Document role:** Authoritative source of truth for product scope and intended architecture until superseded by an approved revision.  
**Implementation status:** The React/Vite and FastAPI foundation and pure American outcome-sequence/replay primitives exist. No strategy rules, wager evaluation, financial calculations, complete simulation engine, authentication, production storage, 3D scene, or deployment is implemented.

## 1. Executive summary

Roulette Strategy Simulator is a responsive web application for authoring, organizing, simulating, replaying, and comparing roulette strategies. It will combine an interactive American roulette betting surface with a graphical strategy editor, a Python simulation engine, rich audit-oriented results, and—later—optional accounts and private server-side storage.

The initial product is intended to be inexpensive to operate and useful without registration. Guest-owned data is stored in the browser with IndexedDB. A registered-user tier may persist validated JSON strategy files and compressed simulation records in private, persistent server-side file storage. A storage-provider boundary keeps the application independent of the physical storage implementation and leaves room for SQLite, PostgreSQL, or object storage only when concrete requirements justify them.

The frontend is for presentation and user interaction. The backend simulation engine is the sole authority for outcomes, accepted wagers, payouts, and bankroll arithmetic. The engine determines an outcome before any wheel animation begins; the Three.js scene visualizes that predetermined outcome and never decides or changes it.

No strategy or recovery behavior has been specified yet. The strategy format and editor must therefore be extensible and configuration-driven, but must not assume, invent, or silently supply betting rules. Executable strategy specifications will be provided separately and must be approved before implementation.

## 2. Product vision and goals

### Vision

Provide a polished, approachable simulator where users can define a strategy using structured controls, test it against explicit roulette configurations and outcome sequences, inspect every spin and bankroll change, and compare runs without confusing animation with statistical truth.

### Product goals

- Offer a casino-inspired, accessible interface that works across desktop, tablet, and mobile layouts.
- Represent the American wheel accurately, including 0, 00, 1–36, correct wheel order, and red/black/green colors.
- Let users configure a strategy without writing or executing arbitrary scripts.
- Allow strategy create, view, edit, duplicate, import, export, and delete operations.
- Accept a starting bankroll, simulation length, roulette configuration, and either generated or supplied outcome sequences.
- Produce deterministic, inspectable simulations and a complete per-spin ledger.
- Make fast, non-animated simulation the normal path for large runs, while allowing completed runs to be replayed as a visual experience.
- Preserve useful guest workflows without accounts, registration, or server-side personal data.
- Keep hosting and operational requirements modest; avoid a dedicated database server until justified.
- Leave a clear path to authenticated storage and Capacitor packaging for Android and iOS.

### Non-goals and explicit boundaries

- The application is not a real-money gambling, casino, payment, or wagering service. No real-money transactions are planned.
- No betting progression, recovery method, strategy rule, or default strategy is defined by this plan.
- The 3D wheel is illustrative. It is not a source of randomness, a physical prediction model, or a method for choosing a winning pocket.
- There is no promise that a strategy can overcome roulette's house edge. Analytics must describe observed or calculated behavior accurately and must not imply guaranteed profit.
- This initialization does not implement a frontend, API, simulation engine, authentication, storage provider, database, 3D model, mobile package, or deployment.
- User-authored JavaScript, Python, HTML, or other executable strategy code will not be supported.

## 3. Users and primary workflows

### Guest workflow

1. Open the application without registering.
2. Select or configure a roulette table and bankroll/simulation parameters.
3. Create or edit a strategy using the shared strategy editor. Until supplied strategy semantics are approved, the editor may only manage configuration fields and must not imply executable rules exist.
4. Save strategies, preferences, supplied sequences, and simulation history in IndexedDB.
5. Request a simulation from the Python engine. Guest simulations may use a non-account API endpoint; no user account is required. The engine remains authoritative.
6. Review summary metrics, the ledger, and charts; replay a completed simulation using its recorded outcomes.
7. Export and later import strategy or simulation data in validated, versioned formats.

The product should degrade clearly if the backend is unavailable: locally saved data remains accessible, but authoritative simulation must be reported as unavailable rather than replaced by a second, inconsistent browser implementation.

### Registered-user workflow (later phase)

1. Register/sign in through a secure authentication flow.
2. Save strategies and simulation records to a private account namespace on the server.
3. List, view, update, import, export, and delete only owned records.
4. Optionally create a protected, revocable strategy-sharing link in a future feature.

### Strategy authoring workflow

The editor and read-only viewer are shared screens/components driven by a selected strategy JSON document. Do not generate a separate HTML page or bespoke application for each strategy. The editor loads a configuration, validates it, maps supported fields to controls, updates the configuration model, and sends it through the storage abstraction. Simulation consumes a validated immutable snapshot of the configuration; editing a strategy later must not retroactively alter an already completed run.

## 4. Proposed technology and rationale

| Area | Proposed choice | Rationale and constraints |
|---|---|---|
| Web UI | React, TypeScript, Vite | Component-based UI, explicit types for validated client contracts, quick static builds, and straightforward integration with Capacitor. Keep components focused on display and interaction rather than financial authority. |
| 3D | Three.js with React Three Fiber; Drei where useful | Three.js provides WebGL rendering; React Three Fiber integrates the scene with React composition; Drei can supply practical camera, controls, and helpers when they improve maintainability. Avoid loading large scene dependencies on screens that do not need them. |
| UI animation | Motion (formerly Framer Motion) or another maintained React animation library | Suitable for interface transitions and reduced-motion-aware feedback. It is separate from Three.js wheel physics/rendering and from engine outcomes. Confirm current package maintenance and API when implementation begins. |
| API/backend | Python with FastAPI | Gives the simulation engine a clean, testable home and offers typed request/response validation and ASGI deployment. Keep route handlers thin. |
| Validation | Pydantic | Validate request and persisted/imported documents at trust boundaries. Schema versioning and explicit size/depth limits are still required; validation does not replace authorization. |
| Backend tests | pytest | Unit-test pure domain/simulation behavior, API contracts, storage safety, and authorization boundaries. |
| Browser tests | Add an appropriate TypeScript test runner and browser automation during foundation phase | Select and pin tools when the frontend scaffold is implemented; test behavior and accessibility, not only component snapshots. |
| Mobile packaging | Capacitor, later | Reuses the responsive web UI for Android/iOS packaging. Mobile packaging does not make the Python engine local; the initial mobile product requires network access to the backend for authoritative simulation. |
| Persistence | IndexedDB for guests; private server-side files for registered users | Avoids mandatory account/database infrastructure and supports an inexpensive initial hosting profile. Use storage interfaces so migration remains possible. |

### Architecture principles

- Component-based frontend with explicit separation between display, view state, API clients, and storage adapters.
- Independent Python domain/simulation package that imports neither FastAPI routes nor React concepts.
- Clear boundaries among presentation, application orchestration, strategy schemas, simulation logic, and persistence.
- Backend-only authority for accepted wagers, outcomes, wins/losses, payouts, and bankroll values.
- Validate all untrusted input at boundaries; use typed/versioned contracts and stable identifiers.
- Keep guest and registered persistence implementations behind interfaces.
- Start as a modular monolith (one web frontend and one FastAPI service), not microservices.
- Do not add a dedicated database, queue, cache, or cloud service without measurable need.
- Keep animations optional and non-blocking; reduced-motion and low-power-device paths are first-class.

## 5. High-level system architecture

### Logical components

1. **React web client** — screens, accessible controls, strategy editor/viewer, number board, results, charts, replay controls, and API orchestration.
2. **Client storage adapters** — IndexedDB implementation for guest strategies, history, sequences, preferences, and settings; later authenticated API adapter for account-owned resources.
3. **FastAPI application layer** — request validation, identity extraction, authorization, limits, orchestration, and response mapping. It must not embed simulation rules in route functions.
4. **Domain/schema layer** — versioned roulette, strategy, simulation request/result, account-resource, and import/export contracts.
5. **Python simulation package** — deterministic, independently tested domain engine. Receives validated inputs and produces outcomes, ledger, and derived summary data.
6. **Storage providers** — browser IndexedDB and server-side file storage initially; optional SQLite, PostgreSQL, or object-storage providers later.
7. **Visualization layer** — charts and Three.js wheel replay driven exclusively by persisted engine outcomes and presentation timing.

### Simulation and animation sequencing

1. The client submits an explicit simulation request (strategy snapshot, roulette configuration, starting bankroll, spin count, and either a supplied sequence or generation request).
2. The backend validates limits and configuration, invokes the pure simulation engine, and constructs a complete result record containing the outcome sequence and provenance. Guest requests return this record without retaining guest user data on the server; authenticated requests may persist it through the account storage provider.
3. The API returns a summary and either the complete bounded ledger/sequence or a paginated/streamable representation for larger records, according to the agreed response budget.
4. The client renders the result. If the user selects replay, it reads the saved sequence and animates each predetermined outcome. Animation can be paused, skipped, or disabled without changing the simulation record.
5. The frontend must never compute a substitute ending bankroll, payout, or win/loss value. Any client-side chart aggregation is presentation-only and must be checkable against server summary fields.

### Strategy, API, and engine contracts

Treat the strategy document, execution request, and simulation result as distinct versioned contracts:

- **Strategy document:** portable JSON using a strategy schema version. Contains declarative, validated rule data only. It is editable and exportable; it is not executable code.
- **Simulation request:** references or embeds an immutable strategy snapshot, explicit roulette/table configuration, starting bankroll and precision/unit, requested spin count, and exactly one outcome mode: caller-supplied sequence or server-generated sequence. A persisted strategy ID alone is insufficient because it can change after submission.
- **Engine input:** a validated internal domain object created by the API/application service after schema validation and policy checks. The pure engine accepts this object and a sequence of typed pocket outcomes; it has no HTTP, filesystem, browser, or account concerns.
- **Simulation record/result:** immutable run provenance, actual outcome sequence, engine-generated per-spin/per-wager ledger, summary, and format versions. A result refers to the exact strategy snapshot and semantic rules version used.

The API should reject unknown or unsupported strategy schema versions and invalid configurations before execution. Schema validation checks shape and bounds; a separate semantic validator checks whether each rule is supported by the selected engine/ruleset version. No partially validated configuration reaches the engine. Errors identify the field/rule and a stable error code without echoing sensitive request contents.

The engine should expose a stable conceptual boundary equivalent to `validate(strategy, roulette_config)`, `generate_outcomes(request, count)`, and `simulate(validated_strategy, roulette_config, initial_state, outcomes) -> result`. These are interface intentions, not implemented signatures. Strategy evaluation must follow a documented deterministic rule order and consume one complete spin context at a time; the exact ordering, bankroll timing, and stop behavior are blocked on the supplied strategy specifications. New strategy families should be expressible as new declarative rule types understood by the backend, without changing React components for each strategy. If a truly new UI control is needed, it should be registered against a versioned schema field rather than hard-coded as a strategy-specific page. The engine must never load dynamically imported code from a strategy document.

At the contract level, each spin transition should be explicit: derive an immutable context from the validated strategy, roulette configuration, current bankroll, and prior ledger; evaluate the ordered declarative rules to produce typed wager intents or a stop/skip decision; validate intents against approved limits; consume the next pre-recorded outcome; have the engine settle wagers and update bankroll; append the ledger entry; then continue or terminate according to the approved stop semantics. Rule priority and conflict resolution must be explicit, not dependent on JSON/object iteration order. The exact timing of rule evaluation, whether a spin consumes an outcome when no wager is placed, and how recovery rules interact with ordinary rules remain user-specification decisions and must be fixed in the ruleset version before implementation. Strategy evaluators return intents, never mutate balances or write records themselves.

Keep three versions distinct: strategy document schema version (serialization shape), strategy semantics/ruleset version (meaning and evaluation order), and simulation engine version (implementation/build). A schema migration may update representation only if semantics are preserved; semantic changes require an explicit ruleset version and must not silently reinterpret old records. Historical results remain immutable snapshots. To audit a run under the original implementation, retain the original ledger and provenance; to independently recompute it, retain the snapshot, semantic/engine version or a compatible reference implementation, and exact sequence. A newer engine may offer a separate re-run, never overwrite the historical result.

### API boundary (planned, not implemented)

Exact routes and payloads are to be designed in the foundation phase, but likely resource groups include:

- Health/version metadata.
- Simulation submission, retrieval, and possibly cancellation/status for bounded asynchronous runs.
- Authenticated strategy and simulation CRUD/list operations.
- Validated import/export operations.
- Future sharing-link create/revoke/resolve operations.

Guest simulation requests should not require account credentials. Authentication, quotas, request-size controls, and rate limits still apply to public endpoints. Avoid allowing clients to select another account identifier; account scope is derived from verified server-side identity.

For a guest simulation, the initial API should be stateless with respect to user records: accept a bounded request, calculate, return a run result, and let the guest client persist it in IndexedDB. Do not retain guest strategies or results server-side by default. A future asynchronous job API is justified only if measured run duration or memory use exceeds the synchronous request budget; then define job ownership, expiry, cancellation, and cleanup explicitly.

## 6. Roulette representation and 3D experience

### American roulette domain representation

- Model wheel pockets as explicit stable values, not numeric coercions that collapse `00` into `0`.
- The common American wheel order, clockwise from 0, is: `0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, 00, 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2`. The visual orientation may rotate this list as a whole, but adjacent pocket order must remain correct and tests should verify it.
- Standard American red pockets are `1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36`; remaining numbered pockets are black; `0` and `00` are green. Keep table layout and wheel order as separate representations.
- Do not infer the result from wheel geometry or client randomness. These are configuration/rendering facts, not a strategy definition.

### Planned 3D scene

The eventual scene includes a recognizable wheel and frets, pocket labels, correct American order and colors, a moving ball, wheel rotation, ball deceleration and pocket-entry animation, suitable materials/lighting/shadows, and responsive camera framing. Models and textures should be optimized and licensed/created appropriately. The scene must expose a deterministic animation input such as the winning pocket and a replay timeline; no scene callback may feed a different result back to the engine.

Visual quality is subordinate to correct outcome presentation, accessibility, and performance. Include a non-3D result fallback (text and number board), keyboard-accessible replay controls, captions/status announcements where appropriate, and a reduced-motion mode that immediately presents the determined result.

### Performance and device considerations

- Lazy-load the 3D bundle and avoid initializing WebGL until the user enters a view that needs it.
- Cap device pixel ratio, geometry complexity, shadow quality, draw calls, and texture sizes; provide quality tiers and a 2D/fallback mode.
- Pause or reduce rendering when the scene is hidden/backgrounded; avoid unbounded render loops and memory leaks on replay/unmount.
- Use adaptive rendering and test integrated GPU/older desktop browsers as well as current browsers.
- On Android/iOS browsers and Capacitor WebViews, validate WebGL availability, thermal/battery behavior, memory pressure, touch targets, safe areas, orientation changes, and context loss. Do not assume desktop GPU performance.
- Keep the fast simulator independent from animation; thousands of spins must not produce thousands of rendered frames or scene objects.

### Web and future native-container responsibilities

The initial delivery is the web application. React owns presentation, local guest records, and API orchestration; Python owns all authoritative simulation and registered-user authorization/storage. Capacitor later packages the web client and may expose native capabilities (secure credential storage, sharing sheet, platform navigation) through narrow plugins, but it does not embed an independent financial engine or access server files. Mobile clients call the same versioned HTTPS API as browsers; configure the API origin per build/runtime without embedding credentials in static assets.

Guest IndexedDB records remain on that device and are available offline, but simulations requiring the Python engine require network access. The UI must clearly identify which functions are available offline; it must never present a cached/locally calculated outcome as a new authoritative simulation. If registered-user offline edits/synchronization are approved later, use a durable local outbox, stable operation IDs, server revisions/ETags, retry with idempotency keys, explicit conflict detection/merge UX, and bounded queue storage. Never silently last-write-wins an edited strategy or simulation record. Guest-to-account migration should be a deliberate import/claim flow with user confirmation, not implicit sync.

Authentication should be designed to support both environments before mobile launch. Same-origin web may use secure, HttpOnly cookie sessions and CSRF controls. Capacitor WebViews have platform-specific cookie and redirect behavior; do not assume browser cookie persistence is identical. If first-party/OIDC accounts are approved, evaluate authorization-code-with-PKCE using the system browser and store any refresh credential only in iOS Keychain/Android Keystore through a maintained Capacitor secure-storage integration; use short-lived access credentials and revocation. Select the auth protocol/provider and mobile session lifecycle before implementing accounts, but do not add native auth complexity to the guest-first web phase.

For mobile graphics, use adaptive quality, cap pixel ratio and frame rate, pause rendering when backgrounded, release GPU resources when leaving replay, and offer a 2D result fallback. Measure battery/thermal behavior, memory, startup bundle impact, touch interaction, WebGL context loss/recovery, and long replay performance on representative physical Android and iOS devices, not only simulators/emulators. No new backend service or native simulation engine is required solely for Capacitor.

## 7. Strategy configuration and editor

### Configuration model

Each strategy is a versioned JSON document. A proposed conceptual shape (illustrative only; it is not an executable strategy and defines no rule semantics) is:

```json
{
  "schemaVersion": "1.0",
  "rulesetVersion": "approved-ruleset-version",
  "strategyId": "generated-internal-or-portable-id",
  "name": "User-provided name",
  "description": "Optional plain text description",
  "createdAt": "UTC ISO-8601 timestamp",
  "modifiedAt": "UTC ISO-8601 timestamp",
  "roulette": {
    "wheel": "american",
    "tableConfiguration": "versioned configuration reference or snapshot"
  },
  "betting": {
    "baseUnit": "validated amount/configuration defined by approved rules"
  },
  "rules": [],
  "recoveryRules": [],
  "metadata": {}
}
```

This shape is a planning sketch, not a finalized schema. Before implementation, separately supplied strategy specifications must settle rule vocabulary, validation, execution order, monetary precision, limits, and error behavior. The empty arrays above mean “no strategy specified,” not a default no-op or a strategy users can simulate as if rules existed.

Requirements for the eventual schema:

- Stable identity and explicit `schemaVersion`; timestamps use UTC and a documented format.
- Human-readable name/description; optional metadata is constrained, size-limited, and non-executable.
- Explicit roulette/table configuration and betting configuration.
- Rule and recovery sections validated against approved, versioned declarative schemas.
- Version migrations are explicit and tested; preserve source version and provide a clear unsupported-version error rather than silently dropping fields.
- No HTML or executable scripts; render user strings as text and escape them in UI/export contexts.
- Immutable snapshot/hash in each simulation record so later edits do not change historical meaning.
- Keep schema version, strategy semantic/ruleset version, and simulation engine version as separate fields in run provenance; a serialization migration must not silently change strategy meaning.
- Define canonical JSON serialization (UTF-8, stable field ordering/number representation for hashing) before relying on content hashes; the hash identifies content but does not prove its origin or authorize access.
- Give rule types stable identifiers and explicit versioned parameter schemas. Unknown rule types or semantic versions are rejected for execution; import may preserve an unsupported document as opaque data only if the UI clearly marks it non-runnable and does not silently rewrite it.
- Use explicit money units and exact numeric representation once approved (prefer integer minor units or decimal-string values at JSON boundaries); do not encode financial values as imprecise binary floats.

### Editor and viewer behavior

One shared editor/viewer loads the selected strategy JSON and renders controls from supported schema fields. It validates drafts before save, shows field-level errors, preserves unknown fields only when safe and schema-approved, and uses the selected storage adapter. Autosave versus explicit save is a product decision for the foundation phase; whichever is chosen must prevent accidental loss and handle concurrent updates visibly. Duplicating a strategy creates a new identifier and timestamps. Import/export uses the universal JSON interchange format and validates before persistence.

Strategy configuration, simulation execution, and simulation results are separate resources. A strategy document must not contain run-specific results; a result references an immutable configuration snapshot/version instead.

### Compatibility and historical behavior

Before a strategy can run, the backend resolves its schema version and ruleset version, migrates only representation when a tested migration exists, validates semantic support, and freezes a canonical execution snapshot. The run record stores the original imported/editable configuration as needed for provenance, the normalized execution snapshot, content hash, schema version, semantic version, and engine version. Editing, duplicating, or migrating a strategy creates a new revision or record and never mutates prior simulation records. Replaying a completed run uses its stored outcome sequence and historical result/ledger; re-execution is an explicitly new run with new output, even when supplied the same sequence.

## 8. Storage architecture and data lifecycle

### A. Guest data — browser IndexedDB

Guests can use the application without account creation. IndexedDB stores, subject to browser quotas and user clearing behavior:

- Strategy configurations.
- Simulation history and required replay/audit data.
- User-supplied or saved roulette sequences.
- Preferences, accessibility choices, and application settings.

Use a client storage interface rather than calling IndexedDB from React components. Define database/schema version migrations, transaction boundaries, quota and storage-full handling, corruption recovery messaging, and export/restore workflows. Browser storage is device/browser-local, not a backup or cross-device sync service; communicate this clearly. Store only what is required, and avoid sensitive information because client-side data is controlled by the device owner and is not server-private.

Guest simulations still go to the Python simulation engine for authoritative calculations. The browser may call a public guest simulation API without account identity. If the backend is unreachable, the UI must not silently run an alternate JavaScript financial engine.

### B. Registered-user data — private server-side file storage

Initial registered-user persistence should be file-based, with JSON files for strategies and a compact, versioned compressed representation for simulation records. A possible deployment layout is:

```text
<configured-private-data-root>/
  Accounts/
    <generated-account-id>/
      account.json
      Strategies/
        <generated-strategy-file-id>.json
      Simulations/
        <generated-simulation-file-id>.json.gz
  Backups/
```

Names above illustrate a layout only. Never derive paths directly from user-supplied names, strategy IDs, or request strings. Use generated internal identifiers and resolve paths through a storage provider that enforces account scope. `account.json` should contain only necessary account metadata; authentication secrets/credential handling should be designed separately and should not be casually copied into user-facing JSON records.

The storage root is configured by environment settings (for example, `DATA_ROOT`) and must be an absolute persistent location in production. Do not place production data in the deployed application directory, the static frontend directory, a source checkout, a container's ephemeral layer, or a web-accessible path. The local `data/` directory is development-only and excluded from version control.

### Simulation file format and auditability

Avoid a file per spin. Store one logical record per completed simulation, using compressed JSON (for example gzip-compressed JSON) initially. The record should contain validated metadata and the outcome sequence/ledger in compact arrays or records. A versioned JSONL or columnar/compressed format can be evaluated if measurements show JSON compression or response paging is inadequate; interchange/export remains documented and readable. Large record retrieval should support bounded pages/ranges or streaming rather than loading unbounded payloads into memory.

For deterministic audit/replay, persist sufficient provenance: simulation ID, created time, engine build/version, roulette configuration version/snapshot, strategy schema and semantic versions, immutable canonical execution snapshot/hash, starting bankroll and unit/precision, requested and completed spin counts, outcome source, actual generated or supplied outcome sequence, validated execution inputs, per-spin/per-wager ledger, summary, and result/ledger format version. Store the exact pocket identity for every completed spin (`0` and `00` remain distinct). A replay must consume these recorded pockets and must not call a random generator.

For server-generated outcomes, use Python's operating-system-backed cryptographic randomness API (for example `secrets.randbelow(38)`) for unbiased selection across the 38 American pockets; map indices through a versioned wheel-order constant. Roulette simulation does not require secrecy, but a suitable OS-backed source avoids accidental modulo bias and unsafe ad hoc generators. The engine may support a user-requested deterministic seed for testing/research only, using an explicitly named and versioned PRNG algorithm. A seed is metadata, not the audit record: always persist the actual sequence. Do not promise identical generated sequences from the same seed across PRNG or engine changes unless the algorithm and mapping are pinned; replay is guaranteed by the stored sequence, not by regenerating it.

For an auditable completed run, persist atomically as one logical record (or immutable chunks plus a committed manifest for very large runs). Record whether outcomes were generated or supplied, sequence length, and a cryptographic digest over canonical outcome bytes plus an integrity digest over the canonical record payload (strategy/table snapshot, provenance, ledger, and summary, excluding the digest field itself). These digests detect accidental mismatch only when the record is trusted; they are not proof against a privileged server operator. For stronger tamper evidence, consider a separately protected append-only audit log or signed manifest only if a concrete compliance/trust requirement arises. A replay endpoint or client must verify sequence length, pocket validity, and stored digests before rendering/recalculation. Recalculation must run against the exact saved strategy/table snapshot and sequence, then compare ledger and summary; it must not overwrite the immutable original record.

The engine should generate or accept the full bounded sequence before evaluation (or persist each generated outcome before it can affect state) so a process failure cannot leave an apparently complete result without its inputs. If a strategy stops before the requested count, retain the generated requested sequence or clearly record the consumed prefix and unused suffix; use one documented policy consistently. Persist a simulation only after the outcome sequence and completed result are valid, using a temporary record and atomic commit/manifest update.

### Outcome and replay invariants

- The American outcome domain is exactly 38 distinct values; every generated index maps to exactly one valid pocket with equal selection probability under the chosen source.
- Supplied sequences are validated for exact pocket identity, length, and configured size limits before execution.
- Each completed spin references one recorded outcome and a ledger transition; financial values are derived only by the Python engine.
- Replay is deterministic from the stored sequence plus the immutable execution snapshot and compatible engine/ruleset version. If an old engine is unavailable, the stored original ledger remains the historical result; do not claim independent recalculation with a different semantic version.
- The client animation consumes the sequence in order, and reduced-motion/skip/pause controls only affect presentation timing.
- Generated and supplied sequences are distinguished in the record and UI; no seed-only record is considered independently replayable.

### C. Storage contract and providers

The strategy editor and simulation engine consume application-level interfaces, not file paths or IndexedDB calls. Plan separate contracts for strategy storage, simulation-record storage, and preferences/sequences as appropriate. Operations should include create/read/list/update/delete, import/export, and simulation persistence/retrieval, with ownership context passed by trusted backend services (not accepted from the browser as authorization proof).

Initial providers:

- Browser IndexedDB for guest-owned client data.
- Authenticated HTTP API backed by private server-side JSON/compressed files for registered users.

The initial server-file provider is appropriate only for a modest single-host deployment with a persistent local filesystem, low-to-moderate write concurrency, and no horizontal scaling requirement. File operations must be addressed through resource identifiers and account context; the adapter owns all canonical path construction. Keep storage operations behind repository interfaces that return typed records and errors, not raw paths or open file handles to UI/engine code. Separate metadata/index access from large simulation payload access so a future index can move to SQLite/PostgreSQL while records move to object storage without changing strategy or simulation domain contracts.

Future providers may include SQLite for lightweight metadata/indexing, PostgreSQL for multi-instance transactional/concurrent workloads, or object storage for durable large records/backups. Adding a provider should require evidence such as concurrent write contention, query needs, multiple application instances, restore/retention requirements, or operational limits—not preference alone.

### D. File safety, quotas, backup, and consistency

- Validate documents on input and again on read where appropriate; define maximum request/file size, nesting depth, collection length, and decompressed-size limits to prevent resource exhaustion.
- Use atomic replacement (write a temporary file in the same filesystem/directory, flush as appropriate, then replace) so an interrupted update cannot leave truncated JSON. Atomic rename prevents torn files but does not prevent lost updates. Add per-record/account version checks (ETag/revision) and a cross-process lock around read-modify-write transactions. On a single Linux host, advisory OS file locks can coordinate multiple worker processes if every writer uses the same locking protocol and the filesystem honors it; a process-local mutex alone is insufficient. Prefer a single backend instance/process for the initial file-backed account launch unless cross-process locking has been tested. Use bounded lock waits and return a retryable conflict/busy response rather than blocking indefinitely.
- Do not assume local file locks and atomic rename have equivalent semantics on NFS, shared container volumes, or object storage mounts. Multiple application instances must not independently write account files unless the selected shared filesystem's lock and consistency semantics are documented and validated. For multi-instance operation, migrate coordination/metadata to a transactional store or use a storage service with conditional writes/transactions; do not bolt on an ad hoc distributed lock.
- Keep account directories private and generated. Verify account ownership in the application service for every read/write and resolve paths only from a server-verified account ID plus generated record ID. Directory ACLs limit OS access but do not replace app ownership checks.
- Add integrity metadata/checksums and validate/decompress with strict maximum output size before parsing. On detected corruption, quarantine or mark the record and report a recoverable error; do not silently return partial or fabricated results.
- Apply per-account storage quotas and global operational limits; make limit failures explicit and non-destructive.
- Maintain backups outside the live data tree or in a separately protected destination; define retention, encryption-at-rest responsibilities, restore drills, and recovery-point expectations before production.
- Backups must include data and any index/manifest needed to locate it, be consistent with in-flight writes, have access controls separate from the public service path, and be periodically restored into a test location. Define the maximum acceptable data loss (RPO) and restore time (RTO) before account launch.
- Do not accept user-generated HTML, deserialize unsafe object formats, or execute imported scripts.
- Use checksums/hashes where useful for integrity and provenance; do not treat a hash as authorization or confidentiality.
- Plan deletion and export behavior, including backup retention and account deletion policy, before account launch.

## 9. Authentication, permissions, and security model

### Three distinct security layers

1. **Operating-system directory permissions:** Restrict the private data root to the application service account and authorized server administrators. This protects files from unrelated OS users/processes. It does not distinguish website users handled by the same service process.
2. **Application-level account authorization:** Every backend operation checks that the verified identity owns or is authorized to access the requested strategy/simulation. This is the boundary that isolates account A from account B for web requests. Apply it to list, read, create, update, delete, import, export, and any future sharing action.
3. **Authentication and password verification:** Establish a verified identity before protected operations. Store no plaintext passwords; use a maintained password-hashing implementation with a modern memory-hard algorithm (Argon2id is the proposed baseline, configured and reviewed at implementation time). Protect registration, login, reset, and session lifecycle separately from resource authorization.

Directory permissions alone are never considered individual website-user isolation. The browser never accesses server filesystem paths directly.

### Planned controls for registered features

- Derive account identity on the server from a validated session/token; never trust a client-supplied `accountId` as authority.
- Prefer secure session cookies for a same-origin web deployment (`HttpOnly`, `Secure`, appropriate `SameSite`), plus CSRF protection for state-changing requests. If a token architecture is selected, define secure storage, expiry, revocation, and refresh behavior; do not place sensitive long-lived tokens in browser local storage.
- Enforce ownership checks at the service/storage boundary for every operation, not only in UI navigation or route-level list filters.
- Use generated internal IDs, canonical path resolution, allowlisted resource operations, and path traversal defenses. Reject separators, traversal, unexpected encoding, and symlink escapes; do not expose raw paths.
- Parse JSON as data only, validate schema and bounds, reject unexpected content types/oversize payloads, and safely render plain text.
- Rate-limit login, password reset, and future sharing-password attempts; use generic authentication errors where appropriate and monitor abuse without logging secrets.
- Apply HTTPS in production, secure headers, CORS allowlists, dependency updates, secret management through deployment environment/secret storage, and structured logs with passwords/tokens/private payloads excluded.
- Ensure guest APIs have resource limits and rate limits even though they are unauthenticated.
- Verify authorization for read/write/delete/import/export and sharing through negative cross-account tests.
- Administrative access is a separately authorized and audited operational role; it must not be an implicit public endpoint.

### Optional protected sharing (future only)

A future user may create a revocable, optionally password-protected read-only strategy link. It requires a purpose-limited unguessable token, server-side authorization/expiry/revocation, password hashing (not plaintext), attempt rate limits, minimal exposed fields, and non-indexing/appropriate cache controls. It must not expose simulation history or account data by default. Secret filenames or obscure URLs are not security. Do not implement sharing in this initialization.

### Threats to address in design and tests

Cross-account IDOR/access, path traversal and symlink attacks, forged account identity, weak password storage, brute force, CSRF, XSS through names/descriptions, oversized/decompression-bomb files, malicious deeply nested JSON, race conditions, data loss on interrupted writes, backup exposure, secret leakage in logs, insecure CORS, and denial-of-service through unbounded simulations or rendering. Conduct a threat review before registered accounts and production deployment.

### Resource protection and operational audit

- Enforce request-body and decompressed-file byte limits before full parsing; separately cap JSON depth, object/array sizes, strategy rule count, sequence length, output ledger size, and result retrieval page size.
- Put a hard maximum spin count and bounded execution time on synchronous simulation. Measure worst-case CPU and memory per spin against the actual rule model, and choose limits from deployment capacity rather than the illustrative `.env.example` values. If a valid run cannot fit a request budget, introduce bounded jobs only with explicit quotas, concurrency caps, expiry, cancellation, and cleanup.
- Apply per-IP throttling to anonymous simulation endpoints, global concurrent-run limits, and per-account request/storage quotas. Rate limits need a shared implementation or single-instance guarantee if more than one process/instance serves traffic. Return retry information without exposing internals.
- Ensure parsed input and output sizes are bounded, avoid retaining duplicate copies of large sequences/ledgers, and stream/page persisted results. Reject decompression bombs using an output-size ceiling.
- Audit security-sensitive administrative actions and account/resource access outcomes with request correlation IDs and actor/resource IDs where appropriate. Never log passwords, tokens, full private strategy contents, or raw simulation payloads by default. Define retention and access controls for audit logs.
- Administrative access must use a separate authenticated role and explicit authorization policy, with least privilege and auditable actions; operating-system administrator access is a separate operational boundary. There is no implicit “admin bypass” in public APIs.

## 10. Python simulation engine

### Responsibilities and boundaries

The engine is a pure, independently testable Python domain package, separate from FastAPI routing and React. FastAPI validates and orchestrates requests; engine modules implement only approved roulette and strategy semantics. Persistence is performed through application services/providers, not by the core engine reaching into arbitrary filesystem paths.

The engine will eventually:

- Accept validated, versioned strategy snapshots and roulette configurations.
- Support American roulette initially and represent `0` and `00` distinctly.
- Accept supplied sequences or generate sequences through an explicitly versioned random source.
- Record actual generated outcomes for audit and replay.
- Produce a complete per-spin ledger and accurate bankroll transitions.
- Record simulation-engine and strategy-configuration versions.
- Replay deterministically from the same immutable configuration and saved sequence.
- Handle large non-animated simulations efficiently with bounded memory and clear request limits.
- Return structured validation/limit errors rather than silently coercing invalid bets or values.

### Financial correctness requirements

All money-like values need a defined representation and rounding policy before implementation. Prefer integer minor units or another exact decimal strategy over binary floating-point arithmetic for authoritative bankroll and wager calculations. Define valid precision, currency/unit semantics, non-negative/maximum constraints, and overflow handling. The engine validates all wager decisions against approved table/rule constraints. No calculations are to be implemented until the separate strategy specifications settle semantics such as bet placement, payout, settlement, bankroll exhaustion, and recovery sequencing.

### Testing expectations

- Unit tests for wheel pocket identity/order/color and validation boundaries.
- Table-driven tests for every approved rule and edge case once rules are supplied.
- Invariants: each spin has one valid outcome; bankroll transitions reconcile with ledger entries; summary totals reconcile with the per-spin/per-wager ledger; replay over the same saved sequence and versions is identical.
- Property-based or generated-input testing for schema boundaries, sequence length, and bankroll limits where suitable.
- Statistical smoke checks may detect gross sampling defects but must not be used as proof of correctness or as flaky exact-probability assertions.
- Fast and animated/replay paths must consume the same engine result, not separate calculation implementations.

## 11. Results, analysis, and replay

### Planned results interface

A completed run should present:

- Starting bankroll, ending bankroll, net profit/loss, and total spins.
- Total wager placements and total amount wagered as distinct measures.
- Winning and losing wagers, with a precise definition for pushes/voids if any are later specified.
- Win/loss counts and rates with denominator clearly labeled (spins, wager placements, or another defined unit).
- Maximum drawdown with an approved calculation definition.
- Largest single-spin loss and winning/losing streak measures with the streak unit defined (spins or wager outcomes).
- Bankroll-over-time history and detailed per-spin/per-wager ledger.
- Strategy/run comparisons using compatible configurations and explicit metric definitions.
- Replay controls to animate the actual saved outcomes.

Metric definitions must be finalized alongside engine contracts. For example, net profit/loss is ending bankroll minus starting bankroll; total amount wagered is not the same as the number of placements. Any derived statistic must identify its source fields and denominator.

### Truth and provenance

Clearly label:

- **Actual roulette outcomes:** supplied or generated pocket values recorded for the run.
- **Engine ledger:** validated bets and engine-calculated settlements/bankroll transitions.
- **Derived statistics:** aggregations/charts computed from the persisted ledger.
- **Animation:** a visual replay of an already decided outcome sequence.

Do not fabricate demonstration results that could be mistaken for real engine output. Empty states and clearly labeled synthetic design fixtures may be used in later UI development, but production views must use actual API/record data and distinguish fixtures from results. Comparisons must warn when wheel configurations, strategy snapshots, spin counts, or other inputs differ.

## 12. Testing and quality strategy

Trustworthiness is a release requirement. Tests must verify deterministic rules and invariants, not merely that the UI renders. Tests do not establish that a strategy is profitable or that a random sample predicts future outcomes.

### Backend and simulation tests

- **Python unit tests (pytest):** pocket identity/order/color; schema and semantic validation; each approved strategy rule and boundary; exact monetary arithmetic; sequence mapping; bankroll state transitions; stop conditions; summary calculations; version migration behavior. Financial calculations must be callable and testable without FastAPI, filesystem, or frontend imports.
- **Reference vectors:** for every approved rule, maintain independently reviewed input/sequence → expected bets, settlements, per-spin balances, and final metrics. A second implementation or hand-reviewed calculation should validate these vectors; do not generate expected results by calling the code under test.
- **Property/invariant tests:** balance transitions reconcile exactly with wager settlement; ledger sums reconcile with net result; every completed spin maps to exactly one valid pocket; no invalid bet or negative/overflow state bypasses rules; repeated run with same snapshot and supplied sequence gives byte-equivalent canonical ledger/summary.
- **Randomness tests:** test range, mapping, and absence of modulo bias by design review and deterministic boundary tests. Statistical sampling checks are broad diagnostic tests only, use non-flaky confidence bounds, and are not the sole proof of uniformity.
- **Replay/audit tests:** persist a run, reload it after process restart, verify digest/sequence, replay from stored outcomes, and compare the regenerated ledger and summary to the immutable original. Separately test unsupported old-engine/ruleset behavior: historical results remain viewable, but recomputation is not mislabeled as identical.
- **Simulation limits:** benchmark worst-case supported strategy complexity; assert the configured max spin count, runtime/cancellation, memory/output bounds, and invalid input rejection. Record the test environment and thresholds.

### API, storage, and security tests

- **API tests:** request/response contract and version tests; malformed JSON/content type; too-large body; invalid pocket/rule/schema versions; guest simulation without account; timeouts/limits; generic error behavior; no sensitive data in logs.
- **Authorization tests:** create two identities and prove cross-account read, list, update, delete, import/export, and future share access are denied; forged account IDs and IDs belonging to another account never grant access.
- **Storage tests:** atomic replacement under injected interruption; revision conflicts; cross-process locking with two independent processes; bounded lock timeout; concurrent create/update/delete; quota accounting; decompression limits; corruption detection/quarantine; backup/restore and migration checks. Run lock tests on the actual deployment filesystem class before launch.
- **Import/export tests:** valid round trip; unsupported schema version; malformed/deep/oversized JSON; duplicate IDs; malicious strings rendered as text; no partial persistence when any item fails validation.
- **Rate/resource tests:** anonymous and authenticated throttling, global concurrent-run ceiling, per-account quotas, adversarial request shape, and measured CPU/RAM under configured maximums. Verify that multi-worker deployment shares rate/limit state or is prohibited by deployment configuration.

### Frontend and end-to-end tests

- **Frontend unit tests:** editor field mapping and validation, serialization round trips, IndexedDB adapter/migrations, quota/error states, keyboard/touch controls, exact display of `0` versus `00`, and rendering of backend result fields without recomputing money.
- **Frontend integration tests:** mocked API contract tests for guest requests, error/timeout states, result and ledger pagination, import/export flow, local persistence across reload, and replay controls using a known server fixture.
- **End-to-end tests:** browser scenarios from guest strategy editing through API simulation, IndexedDB save, reload, ledger inspection, replay, and export/import. Registered-user scenarios must include cross-account denial and session expiry after account features exist. Fixtures are clearly labeled and cannot appear as production results.
- **Accessibility/compatibility:** automated accessibility checks plus manual keyboard/screen-reader review; supported desktop browsers and responsive viewports; reduced-motion mode; WebGL-disabled fallback.
- **Mobile/device tests:** Capacitor builds on physical representative Android/iOS devices; IndexedDB persistence; network interruption/retry; auth/session lifecycle; app background/resume; safe areas; touch targets; WebGL context loss; 3D fallback; battery/thermal and memory monitoring.
- **Performance tests:** agree numeric budgets before implementation release (initial targets proposed below); measure frontend initial route without 3D, lazy 3D chunk, API latency, max-size simulation runtime/RAM, ledger paging, and device replay. Keep the simulation path independent of frame rate.

### Proposed measurable release gates (to be confirmed against target hosting/devices)

- Every deterministic financial reference vector and replay invariant passes in CI; zero known arithmetic reconciliation failures.
- Every cross-account negative authorization test passes; no path traversal test reads/writes outside configured private root.
- Configured max request/run/import sizes are enforced at boundary and cannot exceed measured CPU/memory budget. Select numeric caps from benchmarks; `.env.example` numbers are placeholders only.
- Storage interruption leaves either the prior valid record or the new valid record, never a partial file; concurrent writes produce a valid revision or explicit conflict, never silent lost updates.
- Guest workflows continue to load and use local records after reload and do not require account creation; server outage is presented as inability to run an authoritative simulation.
- 3D is lazy-loaded; the non-3D initial route remains usable with WebGL unavailable. Set and test numeric bundle, frame-rate, memory, and runtime targets for named device tiers before declaring mobile ready.
- Backup restore test meets approved RPO/RTO; production release is blocked if no restore evidence exists.

These are planned quality criteria; no tests have been executed as part of this documentation review.

## 13. Hosting and deployment strategy

### Initial low-cost target

A reasonable first production target is a small Linux VPS or comparable Python-compatible host running one FastAPI ASGI service behind a reverse proxy, with the Vite-built React application served as static files by the proxy or a static hosting service. Use HTTPS, a persistent private data mount outside the application tree, environment-based configuration, automated backups, and monitoring. Keep the frontend and API same-origin where practical to simplify cookies and CORS.

This target is conditional on the provider offering a durable disk/volume that survives process restart, application redeploy, and host restart. Many serverless/container platforms have ephemeral local filesystems or replaceable instances; direct account-file persistence is unsuitable there unless a persistent volume is explicitly provisioned and its locking/atomicity semantics are verified. A VPS keeps the initial topology inexpensive but creates a host-level availability and disk-failure risk; external backups and a tested restore process are mandatory. Pin the deployment initially to one application instance; additional Uvicorn/Gunicorn workers still need cross-process file locking, and multiple hosts require a different storage/coordination decision.

Expected topology:

- Browser / future Capacitor webview → HTTPS reverse proxy.
- Static React assets served by proxy/CDN/static host.
- `/api` requests routed to FastAPI ASGI workers.
- Persistent private volume mounted at configured `DATA_ROOT`, inaccessible over HTTP.
- Separate protected backup target and documented restore process.

Do not purchase hosting or deploy as part of this task. Production sizing, provider selection, data residency, expected traffic, backup retention, and availability targets remain decisions for deployment planning.

### Storage and infrastructure tradeoffs

| Option | Advantages | Costs/risks | Initial position |
|---|---|---|---|
| Local persistent disk/files | Lowest complexity and cost for a single instance; human-inspectable JSON; aligns with modest record needs | Single-host durability/availability; locking and backup responsibility; difficult horizontal scaling; filesystem permissions and restore testing required | Start here for registered files, outside app/static directories, behind storage abstraction. |
| Managed object/file storage | Durable, scalable, lifecycle/versioning options; separates data from host | Usage/egress/request costs, credentials and IAM, additional integration/operations | Consider when backups, multi-instance deployment, or volume reliability justify it. |
| SQLite | Lightweight transactional metadata/index, no server process | Concurrent write limits, backup/migration discipline; not a replacement for all large records automatically | Optional for account/index metadata only when concrete query/concurrency needs appear. |
| PostgreSQL or other dedicated DB | Strong concurrent transactions, querying, indexing, mature access patterns | Recurring service/operations cost, migrations, monitoring, backups, more infrastructure | Do not add by default; justify through multi-instance workload, query needs, or transactional requirements. |
| Redis/queue services | Useful for distributed jobs/cache at scale | Adds operational cost and failure modes | Not part of initial architecture; introduce only after measured need for distributed simulation jobs or shared state. |

**File-storage exit criteria:** move away from direct local files if the host offers ephemeral storage only; if more than one app instance must write; if the chosen shared filesystem lacks proven cross-process locking/atomicity; if account-level quotas/indexes require expensive directory scans; if concurrent updates or corruption become recurring; or if backup/restore objectives cannot be met. SQLite is reasonable for a single-host transactional metadata/index need, but should not be placed on an unsupported network filesystem. PostgreSQL is justified by concurrent multi-instance transactions, querying, or operational availability needs. Object storage is appropriate for large immutable simulation blobs and independently durable backups, paired with a transactional metadata/index store if needed. The storage abstraction should permit mixed metadata/blob providers without changing engine contracts.

### Deployment controls

- Build static frontend artifacts separately from the API process.
- Use a production ASGI server configuration and a reverse proxy with request-size/time limits.
- Store secrets outside source control and the public frontend build; never place secrets in `VITE_*` variables.
- Configure persistent `DATA_ROOT` and verify it is not inside the release directory.
- Use HTTPS, secure headers, health checks, bounded simulation resource limits, logs/metrics, and dependency patching.
- Back up data automatically and test restoration before launch; backups are themselves private data.
- Document release/rollback and schema migrations. Avoid automatic destructive migrations of user files.

## 14. Proposed repository structure

```text
RouletteStrategySimulator/
├── PROJECT_PLAN.md                 # authoritative full product/architecture plan
├── README.md                       # project introduction and plan pointer
├── .gitignore                      # excludes build outputs, secrets, and local data
├── .editorconfig                   # consistent text formatting
├── .env.example                    # variable names and safe local defaults; no secrets
├── frontend/
│   └── src/                        # future React/TypeScript application
├── backend/
│   ├── app/
│   │   ├── api/                    # thin FastAPI routes/dependencies
│   │   ├── core/                   # settings, errors, cross-cutting configuration
│   │   ├── schemas/                # Pydantic and domain contract schemas
│   │   ├── services/               # orchestration, auth, policy, use cases
│   │   ├── simulation/             # pure roulette/strategy engine package
│   │   └── storage/                # storage interfaces and provider adapters
│   └── tests/                      # pytest unit, API, security, and integration tests
├── docs/                           # future ADRs, API contract, operations/security docs
├── data/                           # local development only; ignored by Git
│   └── .gitkeep
└── deployment/                     # future deployment manifests/runbooks; no production secrets
```

This is intentionally a directory skeleton, not a framework scaffold. It keeps conceptual boundaries visible while avoiding premature package choices and implementation. Production user data must be mounted/configured outside this repository. Add dependency manifests, lockfiles, CI, frontend tests, and backend packaging during the foundation phase after selecting compatible versions.

## 15. Phased implementation roadmap

No calendar dates are commitments. Effort estimates are omitted because strategy semantics, traffic, hosting, and visual fidelity remain open. The sequence below is revised to freeze contracts before engine/editor work, establish the authoritative engine before persistence of results, deliver readable results before 3D polish, and defer registered storage until the guest/domain flows are proven. Security and test practices apply in every phase, not only the last phase.

### Phase 1 — Project foundation and boundaries

- **Objectives:** Establish a reproducible development baseline and clean component boundaries.
- **Deliverables:** React/TypeScript/Vite and Python/FastAPI/Pydantic/pytest scaffolds; lint/format/test commands; CI; environment settings validation; local setup documentation; architecture decision record; thin health/version endpoint. No strategy calculations.
- **Dependencies:** Plan approval; select supported runtime/package versions and browser baseline.
- **Risks:** Premature implementation of unresolved rules; incompatible dependency/tool versions.
- **Acceptance criteria:** A clean checkout can run documented frontend/backend checks; CI passes; no secrets or local private data are tracked; engine package imports without FastAPI; health endpoint returns service/API version; no financial result is produced.

### Phase 2 — Domain, strategy, API, and result contracts

- **Objectives:** Freeze version boundaries and data flow before implementing rule semantics or UI controls.
- **Deliverables:** Strategy JSON schema and rule-type registry; separate schema/ruleset/engine version semantics; roulette and outcome types; simulation request/result/ledger contracts; validation error model; API contract; money representation; size/compute budgets; canonicalization and snapshot/hash rules; migration compatibility policy.
- **Dependencies:** Phase 1; strategy specifications supplied by the user. If those specifications are unavailable, complete only neutral contract scaffolding and keep execution schema explicitly non-runnable.
- **Risks:** Contract designed around invented rules; ambiguous amount units; schema migrations accidentally changing semantics.
- **Acceptance criteria:** Contract examples validate/reject as expected; all three version dimensions are explicit; unknown strategy types/versions fail closed; immutable run snapshot fields and ledger fields are documented; contracts do not contain executable script fields; API and Python schemas have parity tests.

### Phase 3 — Authoritative simulation engine

- **Objectives:** Implement the pure, deterministic-on-sequence Python simulation core for approved rules.
- **Deliverables:** American wheel domain model; supplied and generated outcome paths; approved strategy evaluator; exact arithmetic; per-spin/per-wager ledger; summary; engine provenance; replay/recalculation function; unit/reference-vector/property tests.
- **Dependencies:** Phases 1–2 and approved rule semantics, stop behavior, precision, limits, and outcome-generation policy.
- **Risks:** Rule ambiguity, numerical errors, PRNG drift, excessive CPU/RAM, hidden HTTP/storage coupling.
- **Acceptance criteria:** Every approved reference vector passes; engine accepts supplied 0/00-distinct outcomes; repeated execution over the same snapshot/sequence yields canonical identical ledger/summary; ledger and summary reconcile exactly; engine imports without API/storage; configured work limits reject over-limit requests.

### Phase 4 — Guest storage and simulation persistence

- **Objectives:** Deliver registration-free client persistence and a bounded simulation-record format.
- **Deliverables:** IndexedDB adapters/migrations for strategy/configuration, simulation history, saved sequences, preferences/settings; local storage interface; compressed/versioned simulation record serialization; integrity validation; quota and storage-full UX; export-ready representation.
- **Dependencies:** Phases 2–3 result/schema contracts.
- **Risks:** Browser quota variation, large records, interrupted writes, stale schema, browser data eviction.
- **Acceptance criteria:** Guest records survive reload; migrations are tested from each supported prior schema; simulated run persists one logical record (not one file/record per spin); sequence, snapshot, ledger, and digest survive round trip; malformed/corrupt/over-quota writes do not partially replace a valid record; UI explains local-only limitations.

### Phase 5 — Strategy builder and viewer

- **Objectives:** Provide one reusable editor for declarative, approved strategy configurations.
- **Deliverables:** Shared editor/viewer, create/edit/duplicate/save flow, field errors, schema-aware control mapping, draft validation, immutable execution snapshot creation, accessible keyboard and screen-reader behavior.
- **Dependencies:** Phase 2 finalized schema; Phase 4 storage interface; Phase 3 validation/evaluation contract (not necessarily every rule family implemented).
- **Risks:** UI embeds semantics that differ from Python; unsupported fields are dropped; user assumes a placeholder config is runnable.
- **Acceptance criteria:** Same editor loads at least two distinct valid configurations without strategy-specific pages; valid configurations round-trip field-for-field; invalid or unsupported configurations cannot execute; duplicate gets a new identity; existing simulation snapshots remain unchanged after editing; no rule absent from approved specs is offered.

### Phase 6 — Roulette board and run controls

- **Objectives:** Implement responsive American table selection and simulation parameter input.
- **Deliverables:** Correct table layout for 0, 00, 1–36; pocket colors; accessible wager-selection/amount controls only for approved wager types; bankroll, spin count, supplied/generated outcome options; request progress and error states.
- **Dependencies:** Phases 2–3 contracts and approved wager/table constraints; design and accessibility review.
- **Risks:** Confusing table layout with wheel order; invalid input reaches engine; mobile touch/accessibility issues.
- **Acceptance criteria:** 38 pockets are individually selectable and render correct labels/colors; keyboard and touch paths can create the same valid request; client-side validation matches API error semantics; frontend does not calculate authoritative wager/payout/balance; documented viewports pass responsive/accessibility checks.

### Phase 7 — Results, analytics, comparison, and text replay

- **Objectives:** Make engine outputs auditable and useful before adding 3D.
- **Deliverables:** Summary cards; bankroll history; ledger with bounded paging; defined win/loss/drawdown/streak metrics; provenance and outcome-source display; comparisons with compatibility warnings; deterministic text/2D replay controls.
- **Dependencies:** Phase 3 stable result contract; Phase 4 persistence; Phase 6 run flow; metric definitions approved.
- **Risks:** Misleading denominators, UI recomputing money, large payloads, false equivalence in comparisons.
- **Acceptance criteria:** All displayed metrics match reference fixtures; client display reconciles with backend summary; page boundaries do not omit/duplicate ledger entries; actual outcomes are distinguished from derived statistics; compare view warns on incompatible inputs; replay presents the saved sequence without invoking RNG.

### Phase 8 — Three.js wheel and ball replay

- **Objectives:** Add a polished but optional visualization of already completed outcomes.
- **Deliverables:** Lazy-loaded React Three Fiber scene; correct American wheel order/colors; ball motion/deceleration/pocket entry; adaptive camera/material/light quality; reduced-motion and WebGL-disabled fallback; replay integration.
- **Dependencies:** Phase 7 result/sequence interface; approved/licensed assets; performance budgets and representative device matrix.
- **Risks:** Animation/result desynchronization, WebGL/mobile limitations, bundle/memory cost.
- **Acceptance criteria:** For a fixed fixture, displayed pocket equals the corresponding saved outcome on every replay; pause/skip/reduced-motion never mutate the record; scene is not downloaded/initialized on non-3D route; fallback works with WebGL disabled; named desktop/mobile device tiers meet numeric bundle, memory, frame-time, and thermal budgets set before implementation.

### Phase 9 — Registered accounts and private file storage

- **Objectives:** Add opt-in account persistence while retaining guest operation.
- **Deliverables:** Approved authentication/session system; server-derived identity and ownership policy; private file provider; generated IDs; atomic writes, cross-process locks/revisions, quotas, audit-safe logs; persistent-volume deployment proof; backup/restore procedure.
- **Dependencies:** Threat model; Phase 2 storage contracts; Phases 3–4 records; approved account/recovery/retention policies; hosting provider with durable single-host volume.
- **Risks:** IDOR, weak recovery, lost updates, ephemeral volume, multi-process filesystem semantics, exposed backups.
- **Acceptance criteria:** Negative cross-account tests deny list/read/write/delete/import/export; two independent processes cannot silently overwrite one another; interrupted write yields old or new complete file; quota and corruption cases are tested; live data is outside app/static directories; restore test meets approved RPO/RTO; guest workflow remains account-free.

### Phase 10 — Import/export, optional sharing, and mobile packaging

- **Objectives:** Enable portable data workflows and prepare a verified Capacitor build.
- **Deliverables:** Strategy JSON import/export; simulation export/import with provenance; conflict resolution; optional protected, revocable read-only strategy sharing only after separate approval; Capacitor Android/iOS packages; API configuration; mobile auth/session and offline behavior; secure native credential storage if required.
- **Dependencies:** Stable schemas/results and Phase 9 auth for sharing/account sync; explicit sharing approval; mobile device/store/privacy requirements.
- **Risks:** Malicious files, privacy leakage, WebView auth differences, offline merge conflicts, platform signing/permission behavior.
- **Acceptance criteria:** Valid supported documents round-trip; unsupported/oversize/malformed imports fail without partial writes; sharing tests prove revocation, expiry, attempt throttling, and no unrelated data exposure; if sharing is not approved, it remains absent. Physical Android/iOS test matrix verifies guest IndexedDB persistence, secure auth, network loss/retry, app resume, WebGL fallback, and no silent last-write-wins sync.

### Phase 11 — Production security, performance, and deployment

- **Objectives:** Release on the least complex hosting that satisfies durability, security, and measured capacity requirements.
- **Deliverables:** Linux VPS or comparable runtime deployment; static React hosting and FastAPI ASGI behind HTTPS reverse proxy; environment/secrets management; persistent private volume; rate/resource limits; monitoring/log redaction; automated backups; tested restore/rollback and operations runbook.
- **Dependencies:** Production feature scope decision; provider/data-region/budget approval; completed threat review; resource budgets and data retention/RPO/RTO decisions.
- **Risks:** VPS single point of failure, disk loss/fullness, misconfiguration, unbounded anonymous CPU use, cost growth, unsupported hosting filesystem.
- **Acceptance criteria:** HTTPS and security headers verified; no private data reachable through static/public routes; deployment restarts preserve records; configured rate/run/storage limits pass abuse tests; benchmarked CPU/RAM fit agreed instance capacity with headroom; backup restore meets approved targets; rollback documented and exercised; deployment only after explicit user approval.

## 16. Assumptions and principal risks

### Working assumptions

- The first implementation targets a responsive web app; Capacitor is a later packaging path, not a second application or a local authoritative engine.
- American roulette is the only initial wheel; pocket order and colors are fixed domain facts and must be testable.
- Guest data is browser-local and guest simulations are computed by the API without server-side user-record persistence by default.
- Registered-user file storage is a later optional capability, initially constrained to one Linux host with persistent local disk and a controlled writer topology.
- Strategy and recovery specifications will be supplied separately. No placeholder/default rule is executable.
- Exact financial arithmetic, saved actual outcomes, immutable run snapshots, and no frontend financial authority are mandatory.
- Seeded generation is for controlled research/testing only unless the user approves a different policy; actual generated outcomes are persisted regardless.
- A first release may omit registered accounts, protected sharing, offline synchronization, or 3D on devices that cannot support it without compromising core guest use.

### Principal risks and mitigation

| Risk | Impact | Mitigation / release gate |
|---|---|---|
| Strategy semantics arrive late or remain ambiguous | Rework or incorrect financial behavior | Freeze schema and semantic contracts before engine implementation; block execution until user-approved rule specifications and reference examples exist. |
| Historical simulation cannot be independently checked | Loss of trust/replay correctness | Persist exact sequence, immutable canonical strategy/table snapshot, versions, ledger, summary, and digest; maintain independent reference vectors; never rely on seed alone. |
| File storage races or provider has ephemeral disk | Corruption/lost account data | Single-host persistent-volume gate; atomic replace plus cross-process locks/revisions; test on actual filesystem; migrate on stated exit criteria; backup/restore test before account launch. |
| Anonymous simulation exhausts CPU or memory | Outage / cost spikes | Hard request/spin/time/output limits, per-IP throttling, global concurrency ceiling, memory-aware sequence/ledger handling, measured benchmarks; jobs only when justified. |
| Cross-account authorization defect | Exposure or modification of private data | Backend-derived identity, ownership checks at service/storage boundary, negative tests for every operation, generated IDs and path confinement. |
| Mobile WebView/auth/3D behavior differs | Broken login, data loss, poor battery/performance | Keep mobile later; choose auth flow before packaging; physical-device matrix; secure native credential storage; adaptive 3D and tested fallback. |
| Statistics or charts imply guaranteed profitability | User misunderstanding | Define metric denominators, distinguish observed results from derived measures, label sample size/inputs, avoid predictive/guarantee claims. |
| Backups expose private records or cannot restore | Privacy/data loss | Separate protected backup target, least privilege, retention policy, restore drills, approved RPO/RTO, no backup path under web root. |

## 17. Open decisions and required inputs

Before implementation of dependent features, resolve:

1. **Blocking:** Provide actual strategy/recovery specifications, rule ordering, wager vocabulary, payouts/settlement, stop conditions, and bankroll-exhaustion behavior. Recommendation: include worked examples and edge cases that can become independent reference vectors.
2. **Blocking:** Approve monetary unit/precision and maximum wager/bankroll. Recommendation: exact integer minor units or decimal-string boundaries with explicit scale; no binary floating point for authoritative money.
3. **Product:** Confirm whether additional roulette variants are needed after American roulette.
4. **Capacity:** Approve maximum spins, request duration, expected concurrency, output/retention limits, and whether asynchronous jobs are necessary. Recommendation: begin synchronous with conservative measured caps.
5. **Architecture:** Confirm generated outcomes use OS-backed randomness and optional versioned seeded research mode; actual sequences are always persisted. Recommendation: accept this model; seed-only reproduction is not sufficient.
6. **Accounts:** Choose identity provider versus first-party registration, email verification/password reset, account deletion, and data retention. Recommendation: defer account launch until these policies are approved.
7. **Product/hosting:** Decide whether registered accounts are required in first release. Recommendation: launch guest-first if product goals permit.
8. **Hosting:** Select provider/data region, durable volume, backup retention, availability target, and budget. Recommendation: start single-host only if persistent disk and restore evidence are available; prohibit multi-instance file writes until coordination is migrated/validated.
9. **Quality:** Approve target browser/device matrix, accessibility baseline, and numeric 3D/bundle/memory/frame budgets. Recommendation: define device tiers before 3D implementation.
10. **Optional feature:** Approve or reject protected strategy sharing and define privacy, expiry, revocation, and password policy. Recommendation: exclude from initial release.
11. **Compatibility:** Set strategy import/version support and simulation-record portability/retention policy. Recommendation: version schemas explicitly; preserve historical records even when old-engine recomputation is unavailable.
12. **Mobile:** Decide whether registered-user offline edits/sync are in scope. Recommendation: initially allow local guest data offline, require network for authoritative simulation, and defer account sync until conflict UX and auth protocol are approved.
13. **Operations/privacy:** Approve audit-log retention, account-data retention/deletion, RPO/RTO, and administrator access policy before registered storage goes live.

Until these are decided, do not implement defaults that could be mistaken for approved product rules.

## 18. Definition of planning completion

This architecture review is complete when this plan and the decision log are reviewed and approved. No working application behavior is implied and no tests are claimed as run. A future coding agent should read this document first, confirm blocking open decisions, obtain approval for Phase 1, and implement only the approved phase and its acceptance criteria. Stop after this documentation review; implementation requires separate explicit approval.
