# Stage 23 — Narrator prose audit

Audits the Stage 22 player-facing prose against the approved visible-context package and chooses an explicit repair route on failure.

## Responsibilities
- validate the Stage 22 output and immutable digests;
- run deterministic structural prechecks;
- invoke semantic auditor, format-repair, senior-auditor and router ports;
- validate audit findings, permissions and repair routes;
- produce the approved handoff or an upstream repair request.

## Non-responsibilities
The module does not write prose, read hidden state, query databases, choose providers, repair upstream world facts, or commit party state.

## Dependencies
`@rus/contracts`, the neutral narrator reference-index helper, and explicit role ports.
