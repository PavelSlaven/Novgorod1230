# @rus/turn

## Назначение

Оркестратор игрового хода и target Temporal World v4 execution composition. Он связывает explicit ports, собирает proposals и carriers, применяет gates и передаёт approved logical plan дальше; не владеет доменными формулами или физической транзакцией.

## Владеет

- Владеет `PlayerTurnInput`/`TurnResult`, stage plan, command sequence, idempotency/lock orchestration, bounded decision handoff, temporal advance/carrier proposal engines, `mergeTemporalProposals`, combined logical write-plan composition и visible-package security gate.

## Не владеет

Не владеет exact clock/calendar/boundary arithmetic (`@rus/time-events-history`), movement duration/planner, body/NPC/environment/remote formulas, factual DB reads/writes, SQL transaction, prose или presentation delivery. Не подменяет пустые candidate sets/facts fallback-значениями.

## Public API

- `.`: `runTurnWorkflow`, `createTurnWorkflowContext`, `TURN_WORKFLOW_STAGE_PLAN`, contract validators/constants, `createTurnAvailableActionSet` и `resolveTurnSemanticIntent`.
- `createTurnAvailableActionSet({ registry, committedState, actorId, policyPins })` строит полный детерминированный player-safe набор зарегистрированных и доступных действий без raw text. `resolveTurnSemanticIntent({ rawText, actionSet, decisionNow, ... })` применяет однозначный exact fast path либо существующий bounded-decision protocol и возвращает только точный approved `option_id` или typed unknown. После асинхронного resolver code-owned `decisionNow()` проверяет expiry; exact fast path clock не вызывает. Затем workflow повторно читает committed state и отклоняет stale option до RNG.
- `./temporal-advance`: `createTemporalAdvanceEngine`,
  `advanceTemporalBoundaryBatch`, `createTemporalSourceResolver`,
  `createTemporalAdvanceOwner`;
  `./temporal-carriers`:
  `createTemporalCarrierProposalEngine`; `./temporal-proposal-merger`:
  `mergeTemporalProposals`, `TemporalProposalMergeError`.
- `createTemporalAdvanceEngine` повторно собирает candidates после каждого
  deterministic slice из последней явно возвращённой immutable working
  projection; handlers не получают скрытое состояние и не владеют clock
  ordering.
- Handler может запросить `stop_after_current_batch` только как общую границу
  остановки advance: engine сначала полностью разрешает весь ordered same-time
  cascade и его follow-up events, затем возвращает единый change set.
- `createTemporalAdvanceOwner` связывает stable exact source/effect
  registrations один раз в composition root. Сценарный consumer передаёт
  только candidates и declarative effect descriptors; callback execution,
  same-time ordering и finalization остаются у общего owner.
- Spatial/target surfaces: `./spatial-v3-*` (request profile, orchestration, execution, write plan, target shadow composition) и `createCombinedWritePlanBuilder`; `./compat` — explicit legacy adapter.
- `./spatial-v3-target-composition` exports separate reviewed factories for
  historical target/shadow tests and active `production_sole_owner` wiring;
  production game-server imports only the production factory.
- `./spatial-v3-journey-commands`: `createSpatialV3JourneyCommandCoordinator` validates the four Appendix A.7 tagged intents against a sealed server projection, supplies the authoritative exact clock to explicit handlers and enforces immutable plan lineage, zero-time cancel and idempotent replay.
- `./spatial-v3-reaction-handlers`: `resolveSpatialV3NpcReaction` dispatches only the three approved current-target reaction command bindings to deterministic code-owned effect builders, validates the complete request/proposal contract and replays only an identical persisted proposal.
- `./spatial-v3-perception-reaction-write-set`: `buildSpatialV3PerceptionReactionWriteSet` validates already resolved perception/replay/reaction/knowledge contracts and maps them to target rows, expected versions and physical lock keys without reads, decisions or writes.
- `./spatial-v3-perception-boundary-participant`: adapts one sealed perception work item to the pure Temporal boundary callback and returns proposals only.
- `./spatial-v3-temporal-write-integration`: mechanically combines already validated temporal write fragments before the single combined-plan build.

## Формальные входы, выходы и ошибки

`runTurnWorkflow` получает validated intent, immutable state projection, explicit service ports и options; после semantic resolution он обязательно повторно читает committed state, перестраивает action set и лишь затем допускает RNG. Target temporal engines получают exact request, pinned rules/providers, clock-owner and carrier state. Выход — frozen turn result, temporal result/proposal or one merged logical `combined_write_plan`; failures — typed `TURN_*`, `TemporalProposalMergeError` and target typed temporal/contract codes. Merge отклоняет conflicting owners, duplicate targets и inconsistent exact elapsed; orchestration не продолжает pipeline после failed gate.

## Зависимости и side effects

Зависимости: declared public packages and injected ports (`commandRegistry`, state reader, semantic resolver, post-resolver `decisionNow`, persisted-visible reader, projector, narrator, party store, bounded-decision identity, optional RNG). Сам модуль не использует DB/network/LLM implicitly и не пишет PostgreSQL: commit передаётся party-store/server adapter. Порядок общего workflow фиксирован как committed state → полный action set → semantic resolution → check/consequence/time/body → factual commit → persisted safe projection → narration.

## Target / activation

Temporal v4 surfaces use current `temporal-world-v1.1` /
`4.4.0-target.1` and immutable accepted base `temporal-world-v1` /
`4.3.0-target.1`. Accepted historical P28 evidence не активировало runtime;
последующий `versioned production activation cutover` release
`spatial-v3-production-v1` сделал v3 sole production composition. `turn` не
реализует persistence fallback.

## Тесты

`turn-workflow.test.js`, `bounded-decision.test.js`, `autonomous-update.test.js`, `temporal-advance.test.js`, `temporal-carriers.test.js`, `temporal-activity-engine.test.js`, `temporal-presentation-lifecycle.test.js`, `first-entry-materialization.test.js`; target execution/orchestration coverage also lives in `test/spatial-v3/p19-execution.test.js` and `p21-orchestration.test.js`.
