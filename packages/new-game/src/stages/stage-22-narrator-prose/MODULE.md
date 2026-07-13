# Stage 22 — Narrator prose

Builds the initial player-facing prose exclusively from an approved visible-context package.

## Responsibilities
- validate the Stage 21 approval and visible-context digest;
- build a bounded narrator input and reference index;
- invoke writer/format/senior-writer ports;
- validate prose, action options, used references and self-checks;
- run targeted format or semantic repair without exposing hidden state.

## Non-responsibilities
The module does not query databases, read hidden state, choose an LLM provider, create world facts, audit semantic truth, or commit party state.

## Dependencies
`@rus/contracts` and internal technical utilities only. Role executors enter through explicit ports.
