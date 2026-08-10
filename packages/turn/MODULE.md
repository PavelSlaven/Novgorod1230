# @rus/turn

## Назначение

Оркестратор игрового хода, active player semantic step boundary, revision-14 conversation exchange и Temporal World v4 execution composition. Он сохраняет exact command fast path, связывает explicit ports, исполняет валидированные semantic plans через code-owned handlers, собирает proposals и передаёт approved logical plan дальше; не владеет доменными формулами или физической транзакцией.

## Владеет

- Владеет `PlayerTurnInput`/`TurnResult`, одной active player boundary `turn_step_request_v1` → `turn_step_plan_v1`, revision-14 player/NPC conversation contributions, NPC semantic boundary replay, internal step loop/working projection, одним structural repair, direct/domain execution registry, exact fast path precedence, stage plan, idempotency/lock orchestration, bounded handoff только для closed choices, temporal advance/carrier proposal engines, combined logical write-plan composition и visible-package security gate.

## Не владеет

Не владеет exact clock/calendar/boundary arithmetic (`@rus/time-events-history`), movement duration/planner, body/NPC/environment/remote formulas, factual DB reads/writes, SQL transaction, prose или presentation delivery. Не подменяет пустые candidate sets/facts fallback-значениями. Autonomous NPC action active в Phase 7 через общий temporal/persistence/visibility pipeline; revision 16 combat orchestration принимает только формальные intents/proposals и делегирует checks, harm/body, items, position, time и persistence профильным owners.

## Public API

- `.`: `runTurnWorkflow`, `createTurnWorkflowContext`, `TURN_WORKFLOW_STAGE_PLAN`, contract validators/constants, `createTurnAvailableActionSet`, `resolveTurnSemanticIntent`, exact/closed-choice resolver, `TURN_STEP_REQUEST_V1_SCHEMA`, `TURN_STEP_PLAN_V1_SCHEMA`, `validateTurnStepRequest`, `validateTurnStepPlan`, `requestTurnStepPlan`, `createTurnStepExecutionRegistry`, `runTurnStepLoop`, turn-step commit envelope и operation-batch validators.
- `createTurnAvailableActionSet(...)` строит полный детерминированный player-safe набор зарегистрированных действий. Однозначное exact совпадение исполняется без model/decision clock. Если exact path отсутствует, revision 13 вызывает injected `turnStepModel` с player-safe `turn_step_request_v1`; strict plan validator допускает только direct operations, generic check, один domain request или clarification.
- `runTurnStepLoop(...)` применяет до восьми шагов к code-owned working projection, заново проецирует player-safe state, сохраняет ordered step traces и допускает один structural repair до execution невалидного шага. Direct handlers и domain bindings передаются registry; semantic loop не вычисляет профильные формулы.
- `continuation` переносит только `remaining_intent` и `depends_on_refs`.
  Следующий semantic step всегда заново выбирается моделью из обновлённой
  player-safe working projection и только затем проходит exact binding и
  applicability admission. Prepared draft не резервирует будущую operation.
- `createTurnStepExecutionRegistry(...)` публикует через
  `operationContract()` только те semantic operations, для которых в этом же
  registry зарегистрирован фактический handler; request не получает
  сценарный exhaustive option set.
- Перед каждым semantic step и финальным commit проверяется исходная committed state version. Step fragments преобразуются в один `party_turn_step_operation_batch_v1`/`turn_step_commit_envelope_v1` и входят в общий atomic workflow; частичный commit внутренних шагов запрещён.
- Legacy bounded resolver остаётся public только для genuinely closed option sets и не является fallback свободного player input.
- `requestPlayerConversationContribution`, `requestNpcSemanticDecision` и `runConversationExchange` исполняют ровно один active semantic contract на mode-specific boundary, запрещают combat resolution и повторный LLM-вызов для persisted trace. Один NPC получает не более одной boundary/decision данного mode и same-time batch; listeners и witnesses без meaningful response boundary не становятся responders.
- Общий NPC actor-step хранит `active_npc_actor_steps` как коллекцию:
  положительные действия нескольких NPC одного timestamp сначала все
  стартуют, а completion effect меняет только соответствующий decision trace.
- NPC contribution может запросить common social check только через refs,
  явно разрешённые request scope и исполненные code-owned check owner. В
  Lower Dvina revision 14 такой scope активен для лжи и торга Ратши; результат
  определяет только качество подачи и не выбирает ответ NPC.
- `./temporal-advance`: `createTemporalAdvanceEngine`,
  `advanceTemporalBoundaryBatch`, `advanceTemporalNpcDecisionBoundary`,
  `createTemporalSourceResolver`, `createTemporalAdvanceOwner`, а также
  registration общего NPC schedule-terminal effect из `@rus/npc-runtime`;
  `startNpcActorStep` и `createNpcActorStepCompletionEffect` владеют общим
  lifecycle `started → completion candidate → completed` для автономного
  actor-step. Сценарный adapter передаёт только точную длительность, approved
  profile refs и уже рассчитанные domain proposals;
- `advanceTemporalNpcDecisionBoundary` после полного paused same-time batch
  выводит batch identity (включая ordinal successive resolved batches на том же
  GameTimestamp), consumption и persisted replay input из factual state,
  агрегирует signals отдельно по каждому NPC subject, упорядочивает
  boundaries по `scheduled_at → npc_ref → boundary_id`, последовательно
  вызывает semantic resolver и actor-step на evolving working state; после
  actor-step снова factual→signal protocol на том же timestamp до fixed point
  либо typed temporal safety error, затем `continueAdvance`; `domain_rejected`
  не consume-ит signals своей boundary: остальные same-time siblings получают
  текущий working state, но `unresolved_domain_rejection` сохраняет rejected
  result и unconsumed signal IDs, удерживая clock на timestamp;
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
- Один temporal slice может передать ordered `continuous_effects`: общий owner
  применяет их последовательно к evolving projection и объединяет proposals.
  Это позволяет положительному conversation segment завершать активную
  parent activity без второго clock owner или двойного учёта elapsed time.
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

`runTurnWorkflow` получает validated player input, immutable committed projection, explicit service ports и options. Resolve-mode выбирает exact command либо единственный active player semantic loop; после выбора workflow повторно читает committed state до RNG/domain execution и ещё раз revalidates base перед commit. Target temporal engines получают exact request, pinned rules/providers, clock-owner and carrier state. Выход — frozen turn result, temporal result/proposal or one merged logical write plan; failures — typed `TURN_*`, `TemporalProposalMergeError` and target typed temporal/contract codes. Orchestration не продолжает pipeline после failed gate и не фиксирует частичный semantic draft.

## Зависимости и side effects

Зависимости: declared public packages and injected ports (`commandRegistry`, state reader, `turnStepModel`, player-safe working projector, step execution registry, check-context resolver, optional RNG, persisted-visible reader, code-owned visible projector, narrator и party-store/server adapters). Closed bounded choices дополнительно используют прежние identity/expiry ports. Сам модуль не использует DB/network/LLM implicitly и не пишет PostgreSQL. Порядок общего workflow фиксирован как committed state → exact command или player step loop → revalidation → domain/check/time/body owners → code-owned write plan → factual commit → persisted safe projection → narration.

## Target / activation

Temporal v4 surfaces use current `temporal-world-v1.1` /
`4.5.0-target.1` and immutable accepted base `temporal-world-v1` /
`4.3.0-target.1`. Accepted historical P28 evidence не активировало runtime;
последующий `versioned production activation cutover` release
`spatial-v3-production-v1` сделал v3 sole production composition. `turn` не
реализует persistence fallback. Lower Dvina Trace revision 13 активировал
`turn_step_plan_v1` как sole semantic path свободной заявки игрока и сохранил
exact registered path перед ним. Revision 14 / `spatial-v3-production-v4`
активировал conversation contribution path для фаз 3–4 без bounded fallback.
`spatial-v3-production-v5` активировал Phase 7 autonomous NPC path: fire rest
30 minutes, boundary at +25, actor-step at that same timestamp and continuation
of the common temporal owner to +30 from the updated working projection. В
составном Ходе 10 разговор занимает последние пять минут этого активного
отдыха: root elapsed остаётся 30 минут, а parent completion и conversation
фиксируются на одном T+30 batch. Revision 16 / `spatial-v3-production-v6`
активирует persisted combat session, NPC combat intent boundary и общий
exchange для Phase 4 hostile handoff и Phase 8 storehouse confrontation;
historical bounded Phase 3/4 доступен только по явному revision pin.

## Тесты

Player semantic coverage: `turn-step-contracts.test.js`, `turn-step-loop.test.js`, `turn-step-security.test.js`, `turn-workflow-semantic-step-1.test.js`, `turn-workflow-semantic-step-2.test.js`, `turn-step-operation-batch.test.js` and game-server `lower-dvina-trace-turn-step-*.test.js`. Exact/closed path and temporal coverage remain in `turn-workflow.test.js`, `bounded-decision.test.js`, `temporal-advance.test.js`, `temporal-carriers.test.js`, `temporal-activity-engine.test.js`, `temporal-presentation-lifecycle.test.js` and `first-entry-materialization.test.js`.
