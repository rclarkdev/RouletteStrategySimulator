import json
from hashlib import sha256

import pytest

from app.simulation import outcomes
from app.simulation.outcomes import (
    AMERICAN_RED_POCKETS,
    AMERICAN_WHEEL_ORDER,
    GENERATOR_ID,
    AmericanPocket,
    OutcomeLimitError,
    OutcomeSequence,
    OutcomeSequenceError,
    pocket_color,
)


def test_american_wheel_has_38_distinct_pockets_in_planned_order() -> None:
    assert len(AMERICAN_WHEEL_ORDER) == 38
    assert len(set(AMERICAN_WHEEL_ORDER)) == 38
    assert AMERICAN_WHEEL_ORDER[0] is AmericanPocket.ZERO
    assert AMERICAN_WHEEL_ORDER[18] is AmericanPocket.ONE
    assert AMERICAN_WHEEL_ORDER[19] is AmericanPocket.DOUBLE_ZERO
    assert AMERICAN_WHEEL_ORDER[-1] is AmericanPocket.TWO


def test_pocket_parsing_keeps_zero_tokens_distinct_and_rejects_numeric_coercion() -> None:
    zero = AmericanPocket.parse("0")
    double_zero = AmericanPocket.parse("00")

    assert zero is not double_zero
    assert zero.value == "0"
    assert double_zero.value == "00"
    with pytest.raises(ValueError):
        AmericanPocket.parse(0)  # type: ignore[arg-type]
    with pytest.raises(ValueError):
        AmericanPocket.parse("000")


def test_american_colors_match_the_domain_definition() -> None:
    assert len(AMERICAN_RED_POCKETS) == 18
    assert pocket_color(AmericanPocket.ZERO) == "green"
    assert pocket_color(AmericanPocket.DOUBLE_ZERO) == "green"
    assert pocket_color(AmericanPocket.parse("1")) == "red"
    assert pocket_color(AmericanPocket.parse("2")) == "black"


def test_supplied_sequence_is_immutable_and_round_trips_as_saved_data() -> None:
    input_values = ["0", "00", "17"]
    sequence = OutcomeSequence.from_supplied(input_values, maximum_count=10)
    input_values[0] = "36"

    serialized = sequence.to_json()
    restored = OutcomeSequence.from_json(
        serialized,
        maximum_count=10,
        maximum_bytes=2048,
    )

    assert tuple(pocket.value for pocket in restored.replay()) == ("0", "00", "17")
    assert restored.sequence_sha256 == sequence.sequence_sha256
    assert restored.source == "supplied"
    assert restored.generator is None
    with pytest.raises(AttributeError):
        restored.outcomes.append(AmericanPocket.ONE)  # type: ignore[attr-defined]


def test_sequence_record_rejects_invalid_digest_fields_and_unknown_fields() -> None:
    serialized = OutcomeSequence.from_supplied(["0"], maximum_count=2).to_json()
    payload = json.loads(serialized)
    payload["outcomeSequenceSha256"] = "0" * 64
    with pytest.raises(OutcomeSequenceError, match="digest"):
        OutcomeSequence.from_json(
            json.dumps(payload), maximum_count=2, maximum_bytes=2048
        )

    payload = json.loads(serialized)
    payload["extra"] = "not allowed"
    with pytest.raises(OutcomeSequenceError, match="unknown fields"):
        OutcomeSequence.from_json(
            json.dumps(payload), maximum_count=2, maximum_bytes=2048
        )


def test_sequence_record_rejects_invalid_and_duplicate_json_fields() -> None:
    duplicate_field_json = (
        '{"formatVersion":"1.0","source":"supplied","generator":null,'
        '"outcomes":["0"],"outcomes":["00"],'
        f'"outcomeSequenceSha256":"{sha256(b"unused").hexdigest()}"}}'
    )
    with pytest.raises(OutcomeSequenceError, match="invalid outcome sequence JSON"):
        OutcomeSequence.from_json(
            duplicate_field_json, maximum_count=2, maximum_bytes=2048
        )

    with pytest.raises(OutcomeSequenceError, match="invalid outcome sequence JSON"):
        OutcomeSequence.from_json("not JSON", maximum_count=2, maximum_bytes=2048)

    with pytest.raises(OutcomeLimitError, match="byte limit"):
        OutcomeSequence.from_json(" " * 20, maximum_count=2, maximum_bytes=10)


def test_outcome_limits_are_explicit_and_checked_before_generation_or_consumption(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail_if_random_called(_bound: int) -> int:
        raise AssertionError("over-limit request must not draw randomness")

    monkeypatch.setattr(outcomes.secrets, "randbelow", fail_if_random_called)
    with pytest.raises(OutcomeLimitError):
        OutcomeSequence.generate(3, maximum_count=2)

    with pytest.raises(OutcomeLimitError):
        OutcomeSequence.from_supplied(iter(["0", "00", "1"]), maximum_count=2)

    with pytest.raises(OutcomeLimitError):
        OutcomeSequence(
            source="supplied",
            outcomes=iter(["0", "00", "1"]),  # type: ignore[arg-type]
            maximum_count=2,
        )


def test_generated_sequence_persists_actual_outcomes_and_replay_uses_no_rng(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    draws = iter([0, 19, 37])
    monkeypatch.setattr(outcomes.secrets, "randbelow", lambda bound: next(draws))
    generated = OutcomeSequence.generate(3, maximum_count=3)
    saved = generated.to_json()

    def fail_if_random_called(_bound: int) -> int:
        raise AssertionError("replay must not use a random source")

    monkeypatch.setattr(outcomes.secrets, "randbelow", fail_if_random_called)
    restored = OutcomeSequence.from_json(
        saved,
        maximum_count=3,
        maximum_bytes=2048,
    )

    assert tuple(pocket.value for pocket in restored.replay()) == ("0", "00", "2")
    assert restored.source == "server_generated"
    assert restored.generator == GENERATOR_ID
    assert restored.sequence_sha256 == generated.sequence_sha256


def test_generated_metadata_is_required_only_for_generated_sequences() -> None:
    with pytest.raises(OutcomeSequenceError, match="generator"):
        OutcomeSequence(
            source="server_generated",
            outcomes=(AmericanPocket.ZERO,),
            maximum_count=1,
        )

    with pytest.raises(OutcomeSequenceError, match="must not declare"):
        OutcomeSequence(
            source="supplied",
            outcomes=(AmericanPocket.ZERO,),
            maximum_count=1,
            generator=GENERATOR_ID,
        )
