# Modular new-game orchestrator

The orchestrator owns only pipeline control flow:

- ordered execution of Stages 2-26;
- stage input handoff through explicit input builders;
- deterministic Stage 8/13 projections from one verified
  `rus.runtime_catalog_context.v2`, with exact pin checks at Stages
  8/13/14/16/24/25;
- approved artifact registration and immutable checkpoints;
- repair routing to a declared upstream stage;
- bounded repair cycles and resumable execution.

It does not create world facts, semantically infer missing candidates, call
legacy code, or bypass stage-local validators/auditors. Runtime catalog
projections are pure transformations of the verified import selected by the
domain pin. Production composition must provide stage services and exact
inputs for other external snapshots such as weather, world-base references and
party database schema.
