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
- Spatial/target surfaces: `./spatial-v3-*` (request profile, orchestration, execution, write plan, target shadow composition) и `createCombinedWritePlanBuilder`; `./compat` — explicit legacy adapter.

## Формальные входы, выходы и ошибки

`runTurnWorkflow` получает validated intent, immutable state projection, explicit service ports и options; target temporal engines получают exact request, pinned rules/providers, clock-owner and carrier state. Выход — frozen turn result, temporal result/proposal or one merged logical `combined_write_plan`; failures — typed `TURN_*`, `TemporalProposalMergeError` and target typed temporal/contract codes. Merge отклоняет conflicting owners, duplicate targets и inconsistent exact elapsed; orchestration не продолжает pipeline после failed gate.

## Зависимости и side effects

Зависимости: declared public packages and injected ports (`commandRegistry`, state reader, projector, narrator, party store, optional decision executor/RNG). Сам модуль не использует DB/network/LLM implicitly и не пишет PostgreSQL: commit передаётся party-store/server adapter. Narrator получает только validated safe package после factual commit boundary.

## Target / P28

Temporal v4 surfaces — target/shadow only (`temporal-world-v1`, `4.3.0-target.1`); production v2 остаётся active до atomic P28. `turn` не активирует target и не реализует persistence fallback.

## Тесты

`turn-workflow.test.js`, `bounded-decision.test.js`, `autonomous-update.test.js`, `temporal-advance.test.js`, `temporal-carriers.test.js`, `temporal-activity-engine.test.js`, `temporal-presentation-lifecycle.test.js`, `first-entry-materialization.test.js`; target execution/orchestration coverage also lives in `test/spatial-v3/p19-execution.test.js` and `p21-orchestration.test.js`.
