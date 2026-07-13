# Modular new-game orchestrator

The orchestrator owns only pipeline control flow:

- ordered execution of Stages 2-26;
- stage input handoff through explicit input builders;
- approved artifact registration and immutable checkpoints;
- repair routing to a declared upstream stage;
- bounded repair cycles and resumable execution.

It does not create world facts, infer missing stage inputs, call legacy code, or bypass stage-local validators/auditors. Production composition must provide stage services and exact input builders for external snapshots such as weather, world-base references and party database schema.
