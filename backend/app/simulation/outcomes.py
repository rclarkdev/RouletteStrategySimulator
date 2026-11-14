"""Outcome-only American roulette sequence primitives.

This module intentionally does not implement strategy evaluation, wager selection,
settlement, bankroll arithmetic, or simulation summaries. It has no FastAPI,
storage, or frontend dependencies. Saved sequences are replayable without invoking
randomness, and generated outcomes always retain the actual pocket sequence.
"""

from __future__ import annotations

import hashlib
import json
import secrets
from dataclasses import dataclass, field
from enum import Enum
from itertools import islice
from typing import Iterable, Iterator


class AmericanPocket(str, Enum):
    """A distinct pocket identity on an American roulette wheel."""

    ZERO = "0"
    DOUBLE_ZERO = "00"
    ONE = "1"
    TWO = "2"
    THREE = "3"
    FOUR = "4"
    FIVE = "5"
    SIX = "6"
    SEVEN = "7"
    EIGHT = "8"
    NINE = "9"
    TEN = "10"
    ELEVEN = "11"
    TWELVE = "12"
    THIRTEEN = "13"
    FOURTEEN = "14"
    FIFTEEN = "15"
    SIXTEEN = "16"
    SEVENTEEN = "17"
    EIGHTEEN = "18"
    NINETEEN = "19"
    TWENTY = "20"
    TWENTY_ONE = "21"
    TWENTY_TWO = "22"
    TWENTY_THREE = "23"
    TWENTY_FOUR = "24"
    TWENTY_FIVE = "25"
    TWENTY_SIX = "26"
    TWENTY_SEVEN = "27"
    TWENTY_EIGHT = "28"
    TWENTY_NINE = "29"
    THIRTY = "30"
    THIRTY_ONE = "31"
    THIRTY_TWO = "32"
    THIRTY_THREE = "33"
    THIRTY_FOUR = "34"
    THIRTY_FIVE = "35"
    THIRTY_SIX = "36"

    @classmethod
    def parse(cls, value: str | AmericanPocket) -> AmericanPocket:
        """Parse an exact pocket token; integer coercion is deliberately unsupported."""
        if isinstance(value, cls):
            return value
        if not isinstance(value, str):
            raise ValueError("American pocket must be a string token")
        try:
            return cls(value)
        except ValueError as error:
            raise ValueError(f"unknown American roulette pocket: {value!r}") from error


AMERICAN_WHEEL_ORDER: tuple[AmericanPocket, ...] = tuple(
    AmericanPocket(value)
    for value in (
        "0",
        "28",
        "9",
        "26",
        "30",
        "11",
        "7",
        "20",
        "32",
        "17",
        "5",
        "22",
        "34",
        "15",
        "3",
        "24",
        "36",
        "13",
        "1",
        "00",
        "27",
        "10",
        "25",
        "29",
        "12",
        "8",
        "19",
        "31",
        "18",
        "6",
        "21",
        "33",
        "16",
        "4",
        "23",
        "35",
        "14",
        "2",
    )
)

AMERICAN_RED_POCKETS = frozenset(
    AmericanPocket(value)
    for value in (
        "1",
        "3",
        "5",
        "7",
        "9",
        "12",
        "14",
        "16",
        "18",
        "19",
        "21",
        "23",
        "25",
        "27",
        "30",
        "32",
        "34",
        "36",
    )
)
OUTCOME_FORMAT_VERSION = "1.0"
GENERATOR_ID = "python-secrets-v1"


class OutcomeSequenceError(ValueError):
    """Invalid, unsupported, or unverifiable outcome sequence data."""


class OutcomeLimitError(OutcomeSequenceError):
    """Outcome count exceeds an explicit caller-provided resource limit."""


def _validate_limit(maximum_count: int) -> None:
    if isinstance(maximum_count, bool) or not isinstance(maximum_count, int):
        raise ValueError("maximum_count must be a positive integer")
    if maximum_count < 1:
        raise ValueError("maximum_count must be a positive integer")


def _validate_count(count: int, maximum_count: int) -> None:
    _validate_limit(maximum_count)
    if isinstance(count, bool) or not isinstance(count, int):
        raise ValueError("count must be a positive integer")
    if count < 1:
        raise ValueError("count must be a positive integer")
    if count > maximum_count:
        raise OutcomeLimitError("outcome count exceeds the configured maximum")


def _canonical_outcome_bytes(outcomes: tuple[AmericanPocket, ...]) -> bytes:
    payload = {"outcomes": [pocket.value for pocket in outcomes]}
    return json.dumps(
        payload,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def _reject_duplicate_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise OutcomeSequenceError(f"duplicate JSON field: {key}")
        result[key] = value
    return result


@dataclass(frozen=True, slots=True)
class OutcomeSequence:
    """Immutable, auditable outcome sequence; this is not a financial simulation."""

    source: str
    outcomes: tuple[AmericanPocket, ...]
    maximum_count: int = field(repr=False, compare=False, kw_only=True)
    generator: str | None = None
    format_version: str = OUTCOME_FORMAT_VERSION
    sequence_sha256: str = field(default="")

    def __post_init__(self) -> None:
        if not isinstance(self.format_version, str):
            raise OutcomeSequenceError("format version must be a string")
        if self.format_version != OUTCOME_FORMAT_VERSION:
            raise OutcomeSequenceError("unsupported outcome sequence format version")
        if not isinstance(self.source, str):
            raise OutcomeSequenceError("source must be a string")
        if self.source not in {"supplied", "server_generated"}:
            raise OutcomeSequenceError("source must be supplied or server_generated")
        _validate_limit(self.maximum_count)
        try:
            raw_pockets = tuple(islice(iter(self.outcomes), self.maximum_count + 1))
            _validate_count(len(raw_pockets), self.maximum_count)
            pockets = tuple(AmericanPocket.parse(item) for item in raw_pockets)
        except (TypeError, ValueError) as error:
            raise OutcomeSequenceError(str(error)) from error
        if not pockets:
            raise OutcomeSequenceError("outcome sequence must not be empty")
        _validate_count(len(pockets), self.maximum_count)
        if self.source == "supplied" and self.generator is not None:
            raise OutcomeSequenceError("supplied outcomes must not declare a generator")
        if self.generator is not None and not isinstance(self.generator, str):
            raise OutcomeSequenceError("generator must be a string or null")
        if self.source == "server_generated" and self.generator != GENERATOR_ID:
            raise OutcomeSequenceError(
                "generated outcomes require the supported generator identifier"
            )
        object.__setattr__(self, "outcomes", pockets)
        expected_digest = hashlib.sha256(_canonical_outcome_bytes(pockets)).hexdigest()
        if self.sequence_sha256 and self.sequence_sha256 != expected_digest:
            raise OutcomeSequenceError("outcome sequence digest does not match the saved sequence")
        object.__setattr__(self, "sequence_sha256", expected_digest)

    @classmethod
    def from_supplied(
        cls,
        outcomes: Iterable[str | AmericanPocket],
        *,
        maximum_count: int,
    ) -> OutcomeSequence:
        """Validate and snapshot caller-supplied pockets without coercing numbers."""
        _validate_limit(maximum_count)
        values = tuple(islice(iter(outcomes), maximum_count + 1))
        _validate_count(len(values), maximum_count)
        return cls(source="supplied", outcomes=values, maximum_count=maximum_count)

    @classmethod
    def generate(
        cls,
        count: int,
        *,
        maximum_count: int,
    ) -> OutcomeSequence:
        """Generate bounded outcomes using unbiased OS-backed selection.

        The actual selected pockets are retained. The generator is never invoked
        during replay, and no seed-only reproducibility claim is made.
        """
        _validate_count(count, maximum_count)
        outcomes = tuple(
            AMERICAN_WHEEL_ORDER[secrets.randbelow(len(AMERICAN_WHEEL_ORDER))]
            for _ in range(count)
        )
        return cls(
            source="server_generated",
            outcomes=outcomes,
            maximum_count=maximum_count,
            generator=GENERATOR_ID,
        )

    def replay(self) -> Iterator[AmericanPocket]:
        """Yield the verified saved sequence in order; no random source is consulted."""
        return iter(self.outcomes)

    def to_json(self) -> str:
        """Serialize the exact sequence and provenance as canonical UTF-8-compatible JSON."""
        payload = {
            "formatVersion": self.format_version,
            "source": self.source,
            "generator": self.generator,
            "outcomes": [pocket.value for pocket in self.outcomes],
            "outcomeSequenceSha256": self.sequence_sha256,
        }
        return json.dumps(
            payload,
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
            sort_keys=True,
        )

    @classmethod
    def from_json(
        cls,
        serialized: str,
        *,
        maximum_count: int,
        maximum_bytes: int,
    ) -> OutcomeSequence:
        """Load a saved record, validate limits and pocket tokens, and verify its digest."""
        _validate_limit(maximum_count)
        _validate_limit(maximum_bytes)
        if not isinstance(serialized, str):
            raise OutcomeSequenceError("serialized sequence must be JSON text")
        if len(serialized.encode("utf-8")) > maximum_bytes:
            raise OutcomeLimitError("serialized outcome record exceeds the configured byte limit")
        try:
            payload = json.loads(serialized, object_pairs_hook=_reject_duplicate_keys)
        except (json.JSONDecodeError, OutcomeSequenceError) as error:
            raise OutcomeSequenceError("invalid outcome sequence JSON") from error
        if not isinstance(payload, dict):
            raise OutcomeSequenceError("outcome sequence record must be a JSON object")
        expected_fields = {
            "formatVersion",
            "source",
            "generator",
            "outcomes",
            "outcomeSequenceSha256",
        }
        if set(payload) != expected_fields:
            raise OutcomeSequenceError("outcome sequence record has missing or unknown fields")
        values = payload["outcomes"]
        if not isinstance(values, list):
            raise OutcomeSequenceError("outcomes must be a JSON array")
        _validate_count(len(values), maximum_count)
        if not isinstance(payload["outcomeSequenceSha256"], str):
            raise OutcomeSequenceError("outcome digest must be a string")
        if not isinstance(payload["source"], str):
            raise OutcomeSequenceError("outcome source must be a string")
        if payload["generator"] is not None and not isinstance(payload["generator"], str):
            raise OutcomeSequenceError("generator must be a string or null")
        if not isinstance(payload["formatVersion"], str):
            raise OutcomeSequenceError("format version must be a string")
        return cls(
            source=payload["source"],
            outcomes=tuple(values),
            maximum_count=maximum_count,
            generator=payload["generator"],
            format_version=payload["formatVersion"],
            sequence_sha256=payload["outcomeSequenceSha256"],
        )


def pocket_color(pocket: AmericanPocket) -> str:
    """Return the standard American pocket color for presentation/domain metadata."""
    pocket = AmericanPocket.parse(pocket)
    if pocket in {AmericanPocket.ZERO, AmericanPocket.DOUBLE_ZERO}:
        return "green"
    return "red" if pocket in AMERICAN_RED_POCKETS else "black"
