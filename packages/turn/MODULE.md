# @rus/turn

## Назначение

Оркестратор игрового хода и target Temporal World v4 execution composition. Он связывает explicit ports, собирает proposals и carriers, применяет gates и передаёт approved logical plan дальше; не владеет доменными формулами или физической транзакцией.

## Владеет

- Владеет `PlayerTurnInput`/`TurnResult`, stage plan, command sequence, idempotency/lock orchestration, bounded decision handoff, temporal advance/carrier proposal engines, `mergeTemporalProposals`, combined logical write-plan composition и visible-package security gate.

## Не владеет

Не владеет exact clock/calendar/boundary arithmetic (`@rus/time-events-history`), movement duration/planner, body/NPC/environment/remote formulas, factual DB reads/writes, SQL transaction, prose или presentation delivery. Не подменяет пустые candidate sets/facts fallback-значениями.

## Public API

- `.`: `runTurnWorkflow`, `createTurnWorkflowContext`, `TURN_WORKFLOW_STAGE_PLAN`, contract validators/constants.
- `./temporal-advance`: `createTemporalAdvanceEngine`; `./temporal-carriers`: `createTemporalCarrierProposalEngine`; `./temporal-proposal-merger`: `mergeTemporalProposals`, `TemporalProposalMergeError`.
- `createTemporalAdvanceEngine` повторно собирает candidates после каждого
  deterministic slice из последней явно возвращённой immutable working
  projection; handlers не получают скрытое состояние и не владеют clock
  ordering.
- Spatial/target surfaces: `./spatial-v3-*` (request profile, orchestration, execution, write plan, target shadow composition) и `createCombinedWritePlanBuilder`; `./compat` — explicit legacy adapter.
- `./spatial-v3-journey-commands`: `createSpatialV3JourneyCommandCoordinator` validates the four Appendix A.7 tagged intents against a sealed server projection, supplies the authoritative exact clock to explicit handlers and enforces immutable plan lineage, zero-time cancel and idempotent replay.
- `./spatial-v3-reaction-handlers`: `resolveSpatialV3NpcReaction` dispatches only the three approved current-target reaction command bindings to deterministic code-owned effect builders, validates the complete request/proposal contract and replays only an identical persisted proposal.
- `./spatial-v3-perception-reaction-write-set`: `buildSpatialV3PerceptionReactionWriteSet` validates already resolved perception/replay/reaction/knowledge contracts and maps them to target rows, expected versions and physical lock keys without reads, decisions or writes.
- `./spatial-v3-perception-boundary-participant`: adapts one sealed perception work item to the pure Temporal boundary callback and returns proposals only.
- `./spatial-v3-temporal-write-integration`: mechanically combines already validated temporal write fragments before the single combined-plan build.

## Формальные входы, выходы и ошибки

`runTurnWorkflow` получает validated intent, immutable state projection, explicit service ports и options; target temporal engines получают exact request, pinned rules/providers, clock-owner and carrier state. Выход — frozen turn result, temporal result/proposal or one merged logical `combined_write_plan`; failures — typed `TURN_*`, `TemporalProposalMergeError` and target typed temporal/contract codes. Merge отклоняет conflicting owners, duplicate targets и inconsistent exact elapsed; orchestration не продолжает pipeline после failed gate.

## Зависимости и side effects

Зависимости: declared public packages and injected ports (`commandRegistry`, state reader, projector, narrator, party store, optional decision executor/RNG). Сам модуль не использует DB/network/LLM implicitly и не пишет PostgreSQL: commit передаётся party-store/server adapter. Narrator получает только validated safe package после factual commit boundary.

## Target / activation

Temporal v4 surfaces — target/shadow only (current `temporal-world-v1.1` /
`4.4.0-target.1`, immutable accepted base `temporal-world-v1` /
`4.3.0-target.1`); accepted historical P28 evidence не активировало runtime,
и production v2 остаётся active до отдельного
`versioned production activation cutover`. `turn` не активирует target и не
реализует persistence fallback.

## Тесты

`turn-workflow.test.js`, `bounded-decision.test.js`, `autonomous-update.test.js`, `temporal-advance.test.js`, `temporal-carriers.test.js`, `temporal-activity-engine.test.js`, `temporal-presentation-lifecycle.test.js`, `first-entry-materialization.test.js`; target execution/orchestration coverage also lives in `test/spatial-v3/p19-execution.test.js` and `p21-orchestration.test.js`.
