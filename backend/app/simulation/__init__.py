"""Pure simulation-domain primitives, independent of API and persistence.

Only American outcome identity, bounded outcome sequences, and exact saved-sequence
replay exist at this stage. Strategy evaluation and financial simulation remain
blocked until the user supplies and approves their specifications.
"""

from app.simulation.outcomes import (
	AMERICAN_WHEEL_ORDER,
	AmericanPocket,
	OutcomeLimitError,
	OutcomeSequence,
	OutcomeSequenceError,
)

__all__ = [
	"AMERICAN_WHEEL_ORDER",
	"AmericanPocket",
	"OutcomeLimitError",
	"OutcomeSequence",
	"OutcomeSequenceError",
]
