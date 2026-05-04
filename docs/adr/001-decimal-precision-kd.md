# ADR 001: Decimal Precision for KWD

- Status: Accepted
- Date: 2026-03-06

## Context

The application stores and aggregates Kuwaiti dinar amounts across transactions,
items, debt balances, savings goals, and user profile income. Kuwait uses
three-decimal minor units, so the system must preserve exact values at
`0.001` precision. The codebase already relies on `Decimal` in Python and
`NUMERIC(..., 3)` in PostgreSQL, with transaction and item amounts stored as
`Numeric(10, 3)` and larger balance-style fields stored as `Numeric(12, 3)`.

The alternatives considered were:

- `float` in Python or the database
- scaled integers (fils) for all persisted money values

## Decision

We standardize on exact decimal money handling:

- Python money math uses `Decimal`
- database columns use `NUMERIC(..., 3)` for KWD precision
- transaction and item amounts use `Numeric(10, 3)`
- higher-range profile, balance, and target fields use `Numeric(12, 3)`
- API formatting normalizes outward-facing KWD values to three decimals

We do not use `float` for financial computation or storage.

We also do not use scaled integer fils as the primary persistence model. While
scaled integers are exact, they add conversion overhead at every ORM boundary,
make ad-hoc SQL harder to read, and provide little benefit over PostgreSQL
`NUMERIC` for a system that already needs decimal formatting and aggregation.

## Consequences

Positive:

- KWD values remain exact through inserts, sums, comparisons, and exports
- backend logic matches the documented money contract in
  `docs/money-math-contract.md`
- SQL aggregates remain readable and do not require manual divide-by-1000 logic
- duplicate detection and unique constraints can compare exact stored amounts

Tradeoffs:

- developers must keep using `Decimal` and avoid introducing `float` in new
  money paths
- numeric precision must be chosen per field range, so not every monetary
  column uses the same total width
- chart endpoints that emit numbers instead of strings still need explicit
  rounding at the API boundary
