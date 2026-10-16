# Stage 23 — Narrator prose audit

Audits the Stage 22 player-facing prose against the approved visible-context package and chooses an explicit repair route on failure.

## Responsibilities
- validate the Stage 22 output and immutable digests;
- run deterministic structural prechecks;
- invoke semantic auditor, format-repair, senior-auditor and router ports;
- record semantic literary-composition assessment separately from factual delivery approval: dossier/report/checklist prose remains a literary finding but does not block the first screen when factual, hidden, coverage and technical checks pass;
- validate audit findings, permissions and repair routes;
- produce the approved handoff or an upstream repair request.

## Non-responsibilities
The module does not write prose, read hidden state, query databases, choose providers, repair upstream world facts, or commit party state.

## Dependencies
`@rus/contracts`, the neutral narrator reference-index helper, and explicit role ports.
