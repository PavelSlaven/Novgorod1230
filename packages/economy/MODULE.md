# @rus/economy

## Purpose

Performs exact conversion of an already approved local amount through the
caller-supplied, verified economy projection, then renders a complete local
amount for a player-safe handoff.

## Responsibilities

- exact approved currency rate lookup by region, date, and unit;
- rational two-leg conversion through BUE with one final approved-quantum rounding;
- safe rendering of confirmed local amounts with approved unit labels.

## Does not own

- source CSV, database, runtime catalog pin, projection loading or verification;
- approval or promotion of candidate data;
- price baselines, category prices, trade, debt, or causal price factors;
- item identity, persistence, narration, or product runtime wiring.

## Public API

- `quoteLocalAmount(input)` returns either `{ status: "quoted", fromUnitId,
  toUnitId, unitLabel, exactAmount, roundedAmount, displayQuantum }` or
  `{ status: "unresolved" | "conflict" | "invalid", reason }`.
- `renderLocalAmount({ quote, unitLabel })` returns either
  `{ status: "quoted", text }` or `{ status: "unresolved" | "invalid", reason }`.
  The handoff uses only `.text`; `status`, `reason`, and the internal quote stay
  inside the application boundary.

`quoteLocalAmount` accepts an exact non-negative rational amount, source and
target unit IDs, region ID, ISO date, and `economyView`. The view contains
`rates`, `displayQuantums`, and `unitLabels`. Rate rows carry `unitId`,
`regionId`, inclusive `validFrom`/`validTo`, `approval`, and positive BUE
numerator/denominator when approved. Limited approvals also carry
`approvedScopes` entries with `use: "currency_conversion"`, `regionId`,
`validFrom`, and `validTo`. Rows with gap, rejected, or quarantined decisions
remain visible to lookup so they cannot be silently discarded before conflict
detection. Display quantums and unit labels carry `unitId` and `approval`;
quantums also carry a positive rational and labels carry the exact approved
text.

The caller is responsible for supplying a verified projection. This module
does not treat a candidate row as approved. It detects conflict only when
applicable candidate rates have different exact rational values. Equivalent
overlapping rates can be resolved through an eligible approved row; distinct
values remain a conflict even when one row is later excluded by status or
scope. An ineligible row is never used for calculation. The module performs no
nearest-period or neighbor-region fallback and does not infer a missing
quantum. No player-safe amount is returned without an eligible positive
quantum and target label. All arithmetic uses `BigInt`; JavaScript `Number`
amounts are rejected. Internal rationals are never rendered as fractions.

## Dependencies

No package dependencies. Only Node.js standard language features are used.

## Errors and tests

Malformed request structures return `invalid`. Missing or ineligible coverage
returns `unresolved`; incompatible overlapping rates or duplicate applicable
metadata return `conflict`. Focused contract tests are in `test/domain.test.js`.
