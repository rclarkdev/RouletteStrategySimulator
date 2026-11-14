"""Versioned domain and wire contracts (no FastAPI or simulation dependencies).

Strategy documents are transportable declarative data, but all documents produced
by this contract are explicitly non-runnable until strategy semantics are approved
and implemented in a later phase.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import timedelta
from typing import Annotated, Any, Literal, TypeVar
from uuid import UUID

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StrictInt,
    ValidationError,
    field_validator,
    model_validator,
)


StrategySchemaVersion = Literal["1.0"]
ResultFormatVersion = Literal["1.0"]
ApiVersion = Literal["v1"]
WheelType = Literal["american"]
RoulettePocket = Literal[
    "0",
    "00",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
    "12",
    "13",
    "14",
    "15",
    "16",
    "17",
    "18",
    "19",
    "20",
    "21",
    "22",
    "23",
    "24",
    "25",
    "26",
    "27",
    "28",
    "29",
    "30",
    "31",
    "32",
    "33",
    "34",
    "35",
    "36",
]

# Financial values are exact, non-exponent decimal strings at the wire boundary.
# Currency/unit and scale remain intentionally unspecified until user approval.
NonNegativeAmountText = Annotated[str, Field(pattern=r"^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$")]
SignedAmountText = Annotated[str, Field(pattern=r"^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$")]
VersionText = Annotated[str, Field(min_length=1)]
EngineVersionText = Annotated[
    str,
    Field(pattern=r"^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$"),
]


class ContractModel(BaseModel):
    """Base for strict, camelCase JSON contracts with no silently ignored fields."""

    model_config = ConfigDict(
        alias_generator=lambda field_name: re.sub(
            r"_([a-z])", lambda match: match.group(1).upper(), field_name
        ),
        populate_by_name=True,
        extra="forbid",
        frozen=True,
        str_strip_whitespace=True,
    )


class FrozenDict(dict[str, Any]):
    """JSON object that rejects mutation, including ordinary dict mutator methods."""

    @staticmethod
    def _immutable(*_args: Any, **_kwargs: Any) -> None:
        raise TypeError("validated contract data is immutable")

    __setitem__ = _immutable
    __delitem__ = _immutable
    clear = _immutable
    pop = _immutable
    popitem = _immutable
    setdefault = _immutable
    update = _immutable
    __ior__ = _immutable


def _deep_freeze(value: Any) -> Any:
    """Recursively freeze JSON containers after Pydantic validation."""
    if isinstance(value, dict):
        frozen = dict.__new__(FrozenDict)
        dict.__init__(frozen, {key: _deep_freeze(item) for key, item in value.items()})
        return frozen
    if isinstance(value, list):
        return tuple(_deep_freeze(item) for item in value)
    if isinstance(value, tuple):
        return tuple(_deep_freeze(item) for item in value)
    return value


class RouletteConfiguration(ContractModel):
    """Roulette configuration identity; American is the only supported wheel here."""

    wheel: WheelType
    configuration_version: VersionText


class RuleDocument(ContractModel):
    """Opaque declarative rule data; this contract does not define rule semantics."""

    rule_id: UUID
    type_id: Annotated[str, Field(min_length=1)]
    rule_version: VersionText
    parameters: dict[str, Any]

    @field_validator("parameters")
    @classmethod
    def parameters_must_be_json_data(cls, value: dict[str, Any]) -> dict[str, Any]:
        _assert_json_data(value)
        return _deep_freeze(value)


class StrategyDocument(ContractModel):
    """Versioned strategy interchange document. Never executable in Phase 2."""

    schema_version: StrategySchemaVersion
    ruleset_version: VersionText | None
    strategy_id: UUID
    name: Annotated[str, Field(min_length=1)]
    description: str
    created_at: AwareDatetime
    modified_at: AwareDatetime
    roulette_configuration: RouletteConfiguration
    betting_configuration: dict[str, Any]
    rules: tuple[RuleDocument, ...]
    recovery_rules: tuple[RuleDocument, ...]
    metadata: dict[str, Any]
    execution_status: Literal["non_runnable"] = "non_runnable"

    @field_validator("created_at", "modified_at")
    @classmethod
    def timestamps_must_be_utc(cls, value: AwareDatetime) -> AwareDatetime:
        if value.utcoffset() != timedelta(0):
            raise ValueError("timestamps must use UTC")
        return value

    @field_validator("betting_configuration", "metadata")
    @classmethod
    def objects_must_be_json_data(cls, value: dict[str, Any]) -> dict[str, Any]:
        _assert_json_data(value)
        return _deep_freeze(value)

    @field_validator("rules", "recovery_rules")
    @classmethod
    def rule_collections_are_immutable(
        cls, value: tuple[RuleDocument, ...]
    ) -> tuple[RuleDocument, ...]:
        return tuple(value)


class SuppliedOutcomeSource(ContractModel):
    """Caller-supplied sequence; sequence values are distinct pocket strings."""

    mode: Literal["supplied"]
    outcomes: tuple[RoulettePocket, ...]


class GeneratedOutcomeSource(ContractModel):
    """Request for server generation; this is declarative and generates nothing."""

    mode: Literal["server_generated"]


OutcomeSource = Annotated[
    SuppliedOutcomeSource | GeneratedOutcomeSource,
    Field(discriminator="mode"),
]


class SimulationRequest(ContractModel):
    """Structural simulation request contract; acceptance does not imply runnable rules."""

    api_version: ApiVersion
    strategy: StrategyDocument
    roulette_configuration: RouletteConfiguration
    starting_bankroll: NonNegativeAmountText
    requested_spin_count: Annotated[StrictInt, Field(gt=0)]
    outcome_source: OutcomeSource

    @model_validator(mode="after")
    def supplied_sequence_matches_requested_count(self) -> SimulationRequest:
        if self.roulette_configuration != self.strategy.roulette_configuration:
            raise ValueError("roulette configuration must match the strategy document")
        if (
            isinstance(self.outcome_source, SuppliedOutcomeSource)
            and len(self.outcome_source.outcomes) != self.requested_spin_count
        ):
            raise ValueError("supplied outcome count must match requestedSpinCount")
        return self


class WagerLedgerEntry(ContractModel):
    """Per-wager result shape; fields have no settlement semantics in this phase."""

    wager_id: UUID
    rule_id: UUID
    wager_type: Annotated[str, Field(min_length=1)]
    selection: dict[str, Any]
    stake: NonNegativeAmountText
    gross_return: NonNegativeAmountText
    net_change: SignedAmountText
    bankroll_before: NonNegativeAmountText
    bankroll_after: NonNegativeAmountText
    settlement_code: Annotated[str, Field(min_length=1)]

    @field_validator("selection")
    @classmethod
    def selection_must_be_json_data(cls, value: dict[str, Any]) -> dict[str, Any]:
        _assert_json_data(value)
        return _deep_freeze(value)


class SpinLedgerEntry(ContractModel):
    """One indexed roulette outcome and its associated wager entries."""

    spin_index: Annotated[StrictInt, Field(ge=1)]
    outcome: RoulettePocket
    bankroll_before: NonNegativeAmountText
    bankroll_after: NonNegativeAmountText
    wagers: tuple[WagerLedgerEntry, ...]


class SimulationSummary(ContractModel):
    """Summary fields contract only; no arithmetic or aggregation is implemented."""

    starting_bankroll: NonNegativeAmountText
    ending_bankroll: NonNegativeAmountText
    net_change: SignedAmountText
    requested_spin_count: Annotated[StrictInt, Field(gt=0)]
    completed_spin_count: Annotated[StrictInt, Field(ge=0)]
    wager_count: Annotated[StrictInt, Field(ge=0)]


class SimulationRecord(ContractModel):
    """Immutable-provenance record shape; validation performs structural checks only."""

    simulation_id: UUID
    created_at: AwareDatetime
    api_version: ApiVersion
    result_format_version: ResultFormatVersion
    engine_version: EngineVersionText
    strategy_schema_version: StrategySchemaVersion
    strategy_ruleset_version: VersionText | None
    strategy_snapshot: str
    strategy_snapshot_sha256: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
    roulette_configuration: RouletteConfiguration
    starting_bankroll: NonNegativeAmountText
    requested_spin_count: Annotated[StrictInt, Field(gt=0)]
    completed_spin_count: Annotated[StrictInt, Field(ge=0)]
    outcome_source: Literal["supplied", "server_generated"]
    outcomes: tuple[RoulettePocket, ...]
    outcome_sequence_sha256: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
    ledger: tuple[SpinLedgerEntry, ...]
    summary: SimulationSummary
    record_sha256: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]

    @field_validator("created_at")
    @classmethod
    def timestamp_must_be_utc(cls, value: AwareDatetime) -> AwareDatetime:
        if value.utcoffset() != timedelta(0):
            raise ValueError("timestamps must use UTC")
        return value

    @field_validator("strategy_snapshot")
    @classmethod
    def strategy_snapshot_must_be_canonical_json(cls, value: str) -> str:
        _parse_canonical_strategy_snapshot(value)
        return value

    @model_validator(mode="after")
    def validate_structural_consistency(self) -> SimulationRecord:
        strategy_snapshot = _parse_canonical_strategy_snapshot(self.strategy_snapshot)
        if self.strategy_schema_version != strategy_snapshot.schema_version:
            raise ValueError("strategy schema version must match the immutable snapshot")
        if self.strategy_ruleset_version != strategy_snapshot.ruleset_version:
            raise ValueError("strategy ruleset version must match the immutable snapshot")
        if self.roulette_configuration != strategy_snapshot.roulette_configuration:
            raise ValueError("roulette configuration must match the strategy snapshot")
        if self.completed_spin_count > self.requested_spin_count:
            raise ValueError("completedSpinCount cannot exceed requestedSpinCount")
        if len(self.outcomes) != self.requested_spin_count:
            raise ValueError("outcome sequence length must match requestedSpinCount")
        if len(self.ledger) != self.completed_spin_count:
            raise ValueError("ledger length must match completedSpinCount")
        if self.summary.starting_bankroll != self.starting_bankroll:
            raise ValueError("summary starting bankroll must match the record")
        if self.summary.requested_spin_count != self.requested_spin_count:
            raise ValueError("summary requested spin count must match the record")
        if self.summary.completed_spin_count != self.completed_spin_count:
            raise ValueError("summary completed spin count must match the record")
        if self.summary.wager_count != sum(len(entry.wagers) for entry in self.ledger):
            raise ValueError("summary wager count must match the ledger")
        for expected_index, entry in enumerate(self.ledger, start=1):
            if entry.spin_index != expected_index:
                raise ValueError("ledger spin indices must be consecutive and one-based")
            if entry.outcome != self.outcomes[expected_index - 1]:
                raise ValueError("ledger outcome must match the recorded outcome sequence")
        return self


ContractErrorCode = Literal[
    "invalid_contract",
    "unsupported_version",
    "invalid_outcome_mode",
    "unknown_rule_type",
    "unsupported_ruleset_version",
    "strategy_not_runnable",
    "integrity_check_failed",
]


class ContractErrorDetail(ContractModel):
    code: ContractErrorCode
    message: str
    path: tuple[str | int, ...]


class ContractErrorResponse(ContractModel):
    error: ContractErrorDetail


class ContractValidationError(ValueError):
    """Domain-level validation failure with a stable, serializable error shape."""

    def __init__(self, response: ContractErrorResponse) -> None:
        super().__init__(response.error.message)
        self.response = response


ModelT = TypeVar("ModelT", bound=ContractModel)


def _contract_validation_error(error: ValidationError) -> ContractValidationError:
    first_issue = error.errors(include_input=False, include_context=False, include_url=False)[0]
    location = list(first_issue["loc"])
    code: ContractErrorCode = "invalid_contract"
    if location and location[-1] in {
        "schemaVersion",
        "schema_version",
        "resultFormatVersion",
        "result_format_version",
        "engineVersion",
        "engine_version",
        "apiVersion",
        "api_version",
    }:
        code = "unsupported_version"
    elif "outcomeSource" in location or "outcome_source" in location:
        code = "invalid_outcome_mode"
    path = [str(part) if not isinstance(part, int) else part for part in location]
    response = ContractErrorResponse(
        error=ContractErrorDetail(
            code=code,
            message="The supplied contract is invalid or uses an unsupported version.",
            path=path,
        )
    )
    return ContractValidationError(response)


def validate_contract(model: type[ModelT], payload: Any) -> ModelT:
    """Parse an untrusted JSON-like object and normalize failures to stable errors."""
    try:
        return model.model_validate(payload)
    except ValidationError as error:
        raise _contract_validation_error(error) from error


def validate_strategy_document(payload: Any) -> StrategyDocument:
    """Validate strategy JSON shape without assigning executable semantics."""
    return validate_contract(StrategyDocument, payload)


def validate_simulation_request(payload: Any) -> SimulationRequest:
    """Validate request structure only; this does not authorize or run a simulation."""
    return validate_contract(SimulationRequest, payload)


def validate_simulation_record(payload: Any) -> IntegrityVerifiedSimulationRecord:
    """Validate a result and all integrity digests before marking it trusted."""
    record = validate_contract(SimulationRecord, payload)
    verify_simulation_record_integrity(record)
    return IntegrityVerifiedSimulationRecord(record, _verification_token=_VERIFICATION_TOKEN)


def assert_strategy_runnable(strategy: StrategyDocument) -> None:
    """Fail closed: Phase 2 defines no approved ruleset or executable rule types."""
    for index, _rule in enumerate(strategy.rules):
        raise ContractValidationError(
            ContractErrorResponse(
                error=ContractErrorDetail(
                    code="unknown_rule_type",
                    message="No strategy rule types are approved for execution.",
                    path=["rules", index],
                )
            )
        )
    for index, _rule in enumerate(strategy.recovery_rules):
        raise ContractValidationError(
            ContractErrorResponse(
                error=ContractErrorDetail(
                    code="unknown_rule_type",
                    message="No strategy rule types are approved for execution.",
                    path=["recoveryRules", index],
                )
            )
        )
    code: ContractErrorCode = "unsupported_ruleset_version"
    if strategy.ruleset_version is None:
        code = "strategy_not_runnable"
    raise ContractValidationError(
        ContractErrorResponse(
            error=ContractErrorDetail(
                code=code,
                message="Strategy execution is unavailable until rule semantics are approved.",
                path=["rulesetVersion"],
            )
        )
    )


def _assert_json_data(value: Any) -> None:
    """Reject non-JSON values and non-finite numeric values without executing data."""
    try:
        json.dumps(value, ensure_ascii=False, allow_nan=False)
    except (TypeError, ValueError) as error:
        raise ValueError("value must contain JSON-compatible data only") from error


def _parse_canonical_strategy_snapshot(value: str) -> StrategyDocument:
    """Parse and verify the exact canonical JSON representation stored in a result."""
    try:
        strategy = StrategyDocument.model_validate_json(value)
    except (ValidationError, ValueError) as error:
        raise ValueError("strategySnapshot must contain a valid strategy document") from error
    if canonical_json_bytes(strategy).decode("utf-8") != value:
        raise ValueError("strategySnapshot must use canonical JSON encoding")
    return strategy


def canonical_json_bytes(model: ContractModel, *, exclude: set[str] | None = None) -> bytes:
    """Serialize a validated model deterministically for snapshots and integrity hashes."""
    payload = model.model_dump(mode="json", by_alias=True, exclude=exclude or set())
    return json.dumps(
        payload,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def strategy_snapshot_sha256(strategy: StrategyDocument) -> str:
    """Return SHA-256 for canonical strategy JSON; this is integrity metadata, not auth."""
    return hashlib.sha256(canonical_json_bytes(strategy)).hexdigest()


def verify_simulation_record_integrity(record: SimulationRecord) -> None:
    """Verify strategy, outcome, and record digests; performs no simulation math."""
    expected_strategy = hashlib.sha256(record.strategy_snapshot.encode("utf-8")).hexdigest()
    expected_outcomes = hashlib.sha256(
        canonical_json_bytes(OutcomeSequenceForDigest(outcomes=record.outcomes))
    ).hexdigest()
    expected_record = hashlib.sha256(
        canonical_json_bytes(record, exclude={"record_sha256"})
    ).hexdigest()
    checks = (
        (record.strategy_snapshot_sha256, expected_strategy, "strategySnapshotSha256"),
        (record.outcome_sequence_sha256, expected_outcomes, "outcomeSequenceSha256"),
        (record.record_sha256, expected_record, "recordSha256"),
    )
    for actual, expected, field_name in checks:
        if actual != expected:
            raise ContractValidationError(
                ContractErrorResponse(
                    error=ContractErrorDetail(
                        code="integrity_check_failed",
                        message="Simulation record integrity verification failed.",
                        path=[field_name],
                    )
                )
            )


_VERIFICATION_TOKEN = object()


@dataclass(frozen=True, slots=True, init=False)
class IntegrityVerifiedSimulationRecord:
    """Explicit trust wrapper; raw structural models are not integrity-verified."""

    record: SimulationRecord

    def __init__(
        self,
        record: SimulationRecord,
        *,
        _verification_token: object | None = None,
    ) -> None:
        if _verification_token is not _VERIFICATION_TOKEN:
            raise TypeError("use validate_simulation_record to verify persisted records")
        object.__setattr__(self, "record", record)


class OutcomeSequenceForDigest(ContractModel):
    """Canonical wrapper used only to digest an outcome sequence."""

    outcomes: tuple[RoulettePocket, ...]
