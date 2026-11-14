from hashlib import sha256

import pytest
from pydantic import ValidationError

from app.schemas.contracts import (
    ContractValidationError,
    IntegrityVerifiedSimulationRecord,
    OutcomeSequenceForDigest,
    SimulationRecord,
    SimulationRequest,
    StrategyDocument,
    WagerLedgerEntry,
    assert_strategy_runnable,
    canonical_json_bytes,
    strategy_snapshot_sha256,
    validate_simulation_request,
    validate_simulation_record,
    validate_strategy_document,
    verify_simulation_record_integrity,
)


STRATEGY_ID = "d0c74ff8-1840-4be6-a4ba-8e5c90126898"
SIMULATION_ID = "b12752bd-21d5-4e8e-94d7-763fecac80c3"


def strategy_payload() -> dict:
    return {
        "schemaVersion": "1.0",
        "rulesetVersion": None,
        "strategyId": STRATEGY_ID,
        "name": "Contract-only example",
        "description": "Non-runnable schema fixture; defines no strategy rules.",
        "createdAt": "2026-01-01T00:00:00Z",
        "modifiedAt": "2026-01-01T00:00:00Z",
        "rouletteConfiguration": {
            "wheel": "american",
            "configurationVersion": "american-1",
        },
        "bettingConfiguration": {},
        "rules": [],
        "recoveryRules": [],
        "metadata": {},
    }


def request_payload(outcome_source: dict) -> dict:
    strategy = strategy_payload()
    return {
        "apiVersion": "v1",
        "strategy": strategy,
        "rouletteConfiguration": strategy["rouletteConfiguration"],
        "startingBankroll": "100.00",
        "requestedSpinCount": 2,
        "outcomeSource": outcome_source,
    }


def test_strategy_contract_is_versioned_and_never_runnable() -> None:
    strategy = validate_strategy_document(strategy_payload())

    assert strategy.schema_version == "1.0"
    assert strategy.ruleset_version is None
    assert strategy.execution_status == "non_runnable"
    with pytest.raises(ContractValidationError) as error:
        assert_strategy_runnable(strategy)
    assert error.value.response.error.code == "strategy_not_runnable"


def test_strategy_rejects_unsupported_schema_and_unknown_fields() -> None:
    unsupported = strategy_payload()
    unsupported["schemaVersion"] = "99.0"

    with pytest.raises(ContractValidationError) as error:
        validate_strategy_document(unsupported)
    assert error.value.response.error.code == "unsupported_version"
    assert error.value.response.error.path == ("schemaVersion",)

    extra_field = strategy_payload()
    extra_field["script"] = "must not be accepted or executed"
    with pytest.raises(ContractValidationError) as error:
        validate_strategy_document(extra_field)
    assert error.value.response.error.code == "invalid_contract"


def test_unknown_rule_types_fail_closed() -> None:
    payload = strategy_payload()
    payload["rules"] = [
        {
            "ruleId": "62bc5e80-6a5a-45ba-a3ac-1bb960ee40cc",
            "typeId": "unapproved.example",
            "ruleVersion": "1",
            "parameters": {},
        }
    ]
    strategy = validate_strategy_document(payload)

    with pytest.raises(ContractValidationError) as error:
        assert_strategy_runnable(strategy)
    assert error.value.response.error.code == "unknown_rule_type"
    assert error.value.response.error.path == ("rules", 0)


def test_generated_and_supplied_outcome_modes_validate_as_discriminated_union() -> None:
    generated = validate_simulation_request(
        request_payload({"mode": "server_generated"})
    )
    supplied = validate_simulation_request(
        request_payload({"mode": "supplied", "outcomes": ["0", "00"]})
    )

    assert generated.outcome_source.mode == "server_generated"
    assert supplied.outcome_source.mode == "supplied"
    assert supplied.outcome_source.outcomes == ["0", "00"]


def test_outcome_modes_are_exclusive_and_supplied_length_must_match() -> None:
    both_modes = request_payload(
        {"mode": "server_generated", "outcomes": ["0", "00"]}
    )
    with pytest.raises(ContractValidationError) as error:
        validate_simulation_request(both_modes)
    assert error.value.response.error.code == "invalid_outcome_mode"

    wrong_length = request_payload({"mode": "supplied", "outcomes": ["0"]})
    with pytest.raises(ContractValidationError):
        validate_simulation_request(wrong_length)


def test_request_rejects_a_roulette_configuration_different_from_strategy() -> None:
    payload = request_payload({"mode": "server_generated"})
    payload["rouletteConfiguration"] = {
        "wheel": "american",
        "configurationVersion": "different-table-version",
    }

    with pytest.raises(ContractValidationError):
        validate_simulation_request(payload)


def test_roulette_pocket_identity_keeps_zero_and_double_zero_distinct() -> None:
    payload = request_payload({"mode": "supplied", "outcomes": ["0", "00"]})

    request = validate_simulation_request(payload)

    assert request.outcome_source.outcomes[0] == "0"
    assert request.outcome_source.outcomes[1] == "00"
    assert request.outcome_source.outcomes[0] != request.outcome_source.outcomes[1]
    with pytest.raises(AttributeError):
        request.outcome_source.outcomes.append("1")  # type: ignore[attr-defined]

    invalid_integer = request_payload({"mode": "supplied", "outcomes": [0, "00"]})
    with pytest.raises(ContractValidationError):
        validate_simulation_request(invalid_integer)


def test_money_wire_values_are_decimal_strings_not_binary_numbers() -> None:
    valid = validate_simulation_request(
        request_payload({"mode": "server_generated"})
    )
    assert valid.starting_bankroll == "100.00"

    invalid = request_payload({"mode": "server_generated"})
    invalid["startingBankroll"] = 100.0
    with pytest.raises(ContractValidationError):
        validate_simulation_request(invalid)

    invalid["startingBankroll"] = "1e2"
    with pytest.raises(ContractValidationError):
        validate_simulation_request(invalid)

    invalid["startingBankroll"] = "-1.00"
    with pytest.raises(ContractValidationError):
        validate_simulation_request(invalid)


def test_validated_nested_contract_data_cannot_be_mutated() -> None:
    payload = strategy_payload()
    payload["metadata"] = {"labels": ["original"]}
    payload["rules"] = [
        {
            "ruleId": "62bc5e80-6a5a-45ba-a3ac-1bb960ee40cc",
            "typeId": "unapproved.example",
            "ruleVersion": "1",
            "parameters": {"options": ["a", {"enabled": True}]},
        }
    ]
    strategy = validate_strategy_document(payload)

    with pytest.raises(TypeError):
        strategy.metadata["new"] = "value"
    with pytest.raises(TypeError):
        strategy.metadata["labels"][0] = "changed"
    with pytest.raises(AttributeError):
        strategy.rules.append(strategy.rules[0])
    with pytest.raises(TypeError):
        strategy.rules[0].parameters["new"] = "value"
    with pytest.raises(TypeError):
        strategy.rules[0].parameters["options"][1]["enabled"] = False


def test_wager_contract_uses_nonnegative_stakes() -> None:
    valid_signed_change = {
        "wagerId": "62bc5e80-6a5a-45ba-a3ac-1bb960ee40cc",
        "ruleId": "d0c74ff8-1840-4be6-a4ba-8e5c90126898",
        "wagerType": "unspecified",
        "selection": {},
        "stake": "1.00",
        "grossReturn": "0.00",
        "netChange": "-1.00",
        "bankrollBefore": "10.00",
        "bankrollAfter": "9.00",
        "settlementCode": "unspecified",
    }
    wager = WagerLedgerEntry.model_validate(valid_signed_change)
    assert wager.net_change == "-1.00"

    invalid = {**valid_signed_change, "stake": "-1.00"}
    with pytest.raises(ValidationError):
        WagerLedgerEntry.model_validate(invalid)

    invalid_bankroll = request_payload({"mode": "server_generated"})
    invalid_bankroll["startingBankroll"] = "-1.00"
    with pytest.raises(ContractValidationError):
        validate_simulation_request(invalid_bankroll)


def test_contract_models_do_not_depend_on_fastapi() -> None:
    assert StrategyDocument.__module__ == "app.schemas.contracts"
    assert SimulationRequest.__module__ == "app.schemas.contracts"


def _build_record() -> SimulationRecord:
    strategy = validate_strategy_document(strategy_payload())
    outcomes = ["0", "00"]
    summary = {
        "startingBankroll": "100.00",
        "endingBankroll": "100.00",
        "netChange": "0.00",
        "requestedSpinCount": 2,
        "completedSpinCount": 0,
        "wagerCount": 0,
    }
    record_data = {
        "simulationId": SIMULATION_ID,
        "createdAt": "2026-01-01T00:01:00Z",
        "apiVersion": "v1",
        "resultFormatVersion": "1.0",
        "engineVersion": "0.1.0",
        "strategySchemaVersion": "1.0",
        "strategyRulesetVersion": None,
        "strategySnapshot": canonical_json_bytes(strategy).decode("utf-8"),
        "strategySnapshotSha256": strategy_snapshot_sha256(strategy),
        "rouletteConfiguration": strategy_payload()["rouletteConfiguration"],
        "startingBankroll": "100.00",
        "requestedSpinCount": 2,
        "completedSpinCount": 0,
        "outcomeSource": "supplied",
        "outcomes": outcomes,
        "outcomeSequenceSha256": sha256(
            canonical_json_bytes(OutcomeSequenceForDigest(outcomes=outcomes))
        ).hexdigest(),
        "ledger": [],
        "summary": summary,
        "recordSha256": "0" * 64,
    }
    initial_record = SimulationRecord.model_validate(record_data)
    record_data["recordSha256"] = sha256(
        canonical_json_bytes(initial_record, exclude={"record_sha256"})
    ).hexdigest()
    return SimulationRecord.model_validate(record_data)


def test_simulation_record_versions_provenance_and_integrity() -> None:
    record = _build_record()

    assert record.result_format_version == "1.0"
    assert record.strategy_schema_version == "1.0"
    assert record.strategy_ruleset_version is None
    assert record.engine_version == "0.1.0"
    assert record.strategy_snapshot.startswith('{"bettingConfiguration":')
    verify_simulation_record_integrity(record)

    verified = validate_simulation_record(record.model_dump(mode="json", by_alias=True))
    assert isinstance(verified, IntegrityVerifiedSimulationRecord)
    assert verified.record == record
    with pytest.raises(TypeError):
        IntegrityVerifiedSimulationRecord(record)

    modified = record.model_copy(update={"outcome_sequence_sha256": "f" * 64})
    with pytest.raises(ContractValidationError) as error:
        verify_simulation_record_integrity(modified)
    assert error.value.response.error.code == "integrity_check_failed"


def test_simulation_record_rejects_mismatched_version_or_ledger_shape() -> None:
    record = _build_record()
    payload = record.model_dump(mode="json", by_alias=True)
    payload["strategySchemaVersion"] = "9.0"

    with pytest.raises(ValidationError):
        SimulationRecord.model_validate(payload)

    payload = record.model_dump(mode="json", by_alias=True)
    payload["resultFormatVersion"] = "99.0"
    with pytest.raises(ContractValidationError) as error:
        validate_simulation_record(payload)
    assert error.value.response.error.code == "unsupported_version"

    payload = record.model_dump(mode="json", by_alias=True)
    payload["completedSpinCount"] = 1
    payload["summary"]["completedSpinCount"] = 1
    with pytest.raises(ValidationError):
        SimulationRecord.model_validate(payload)


def test_simulation_record_rejects_noncanonical_strategy_snapshot() -> None:
    payload = _build_record().model_dump(mode="json", by_alias=True)
    payload["strategySnapshot"] = " " + payload["strategySnapshot"]

    with pytest.raises(ContractValidationError):
        validate_simulation_record(payload)
