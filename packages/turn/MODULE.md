# @rus/turn

## Назначение

Оркестратор игрового хода, active player semantic step boundary, revision-14 conversation exchange и Temporal World v4 execution composition. Он сохраняет exact command fast path, связывает explicit ports, исполняет валидированные semantic plans через code-owned handlers, собирает proposals и передаёт approved logical plan дальше; не владеет доменными формулами или физической транзакцией.

## Владеет

- Владеет `PlayerTurnInput`/`TurnResult`, одной active player boundary `turn_step_request_v1` → `turn_step_plan_v1`, revision-14 player/NPC conversation contributions, NPC semantic boundary replay, internal step loop/working projection, одним structural repair, direct/domain execution registry, exact fast path precedence, stage plan, idempotency/lock orchestration, bounded handoff только для closed choices, temporal advance/carrier proposal engines, revision-16 persisted combat session/intent lifecycle и automatic same-time exchange orchestration, combined logical write-plan composition и visible-package security gate.

## Не владеет

Не владеет exact clock/calendar/boundary arithmetic (`@rus/time-events-history`), movement duration/planner, body/NPC/environment/remote formulas, factual DB reads/writes, SQL transaction, prose или presentation delivery. Не подменяет пустые candidate sets/facts fallback-значениями. Autonomous NPC action active в Phase 7 через общий temporal/persistence/visibility pipeline; revision 16 combat orchestration принимает только формальные intents/proposals и делегирует checks, harm/body, items, position, time и persistence профильным owners.

## Public API

`selectTemporaryDispositionOptions` проверяет выбранные из raw intent ровно
по одному option id на измерение из закрытого набора, построенного domain
owner. Applicability и typed temporary-disposition proposal принадлежат
`@rus/social-law`; `@rus/turn` только оркестрирует semantic selection.

- `.`: `runTurnWorkflow`, `createTurnWorkflowContext`, `TURN_WORKFLOW_STAGE_PLAN`, contract validators/constants, `createTurnAvailableActionSet`, `resolveTurnSemanticIntent`, exact/closed-choice resolver, `TURN_STEP_REQUEST_V1_SCHEMA`, `TURN_STEP_PLAN_V1_SCHEMA`, `validateTurnStepRequest`, `validateTurnStepPlan`, `requestTurnStepPlan`, `createTurnStepExecutionRegistry`, `runTurnStepLoop`, turn-step commit envelope и operation-batch validators.
- `createTurnAvailableActionSet(...)` строит полный детерминированный player-safe набор зарегистрированных действий. Однозначное exact совпадение исполняется без model/decision clock. Если exact path отсутствует, revision 13 вызывает injected `turnStepModel` с player-safe `turn_step_request_v1`; strict plan validator допускает только direct operations, generic check, один domain request или clarification.
- `runTurnStepLoop(...)` применяет до восьми шагов к code-owned working projection, заново проецирует player-safe state, сохраняет ordered step traces и допускает один structural repair до execution невалидного шага. Direct handlers и domain bindings передаются registry; semantic loop не вычисляет профильные формулы.
- Internal ordinary hook применяет уже вычисленный pure aggregate result к общей working projection без собственного schema/type; raw ordinary transition остаётся ответственностью `@rus/materialization` reducer. Hook не экспортируется как второй projection owner и не активирует O1.
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
- Combat API `createCombatSession` / `initializeCombatSession`, intent
  installation, `prepareCombatExchange`, technical-step temporal ordering,
  same-time precondition recheck и `buildCombatDecisionSignals` связывает
  профильных checks/harm/body/items/movement/NPC owners. `@rus/turn` не
  вычисляет их формулы и не сохраняет SQL самостоятельно. Для неодинаковой
  длительности steps общий temporal ordering выбирает ближайшую exact boundary,
  сохраняет intent-bound progress остальных steps и повторно проверяет их на
  следующем срезе. Completion каждого due step является обычным `activity`
  candidate общего temporal batch: hazards/access и другие более ранние
  resolution classes сначала меняют working projection, затем combat step
  повторно проверяет preconditions и применяет domain effects в своей
  канонической позиции. Только due steps получают terminal domain effects.
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
- combat same-time recheck сохраняет неисполняемый intent как `invalidated`,
  создаёт factual `combat_step_blocked`/`combat_intent_invalidated` через
  существующий event storage и только затем выпускает generic `objective`
  signal со ссылкой на этот factual event;
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
  candidates и declarative effect descriptors. Registration с явным
  `runtime_resolution` может делегировать code-owned domain callback в точной
  позиции уже отсортированного batch; fixed registration сначала валидирует
  effect identity, а same-time ordering и finalization остаются у общего owner.
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
`4.4.0-target.1` and immutable accepted base `temporal-world-v1` /
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
Revision 17 / `spatial-v3-production-v7` активирует Phase 9 как ordered
prepared-domain checkpoints в том же semantic loop. Turn владеет admission,
causal working-state recheck и atomic root commit, но делегирует property,
evidence и temporary disposition их существующим domain owners и не создаёт
completion либо отдельный legal/evidence executor.
Revision 18 / `spatial-v3-production-v8` добавляет deterministic post-commit
Phase 10: после успешного Phase 9 commit orchestration перечитывает committed
state, вызывает pure completion/projection owner, сохраняет отдельный zero-time
P16 change set и лишь затем запускает обычную narration stage. Retry/restart
использует stable identity `party + source Phase 9 state version`; turn не
вызывает semantic LLM, RNG/check и не владеет completion formula.
Revision 19 / `spatial-v3-production-v9` наследует этот orchestration без
нового semantic mode; actor appearance materialization остаётся code-owned, а
портрет строится только как read-time player-safe projection.

O1 активирует internal ordinary branch только внутри существующего
`request_discovery`; нового public op и scenario-local resolver нет. После
authored/committed discovery, exact persisted ordinary resolution и остальных
code-first short circuits `@rus/turn` допускает ordinary model call лишь при
meaningful engagement. Candidate-free Stage A использует только committed
objective context, запрещает concrete entities и принимает от model только
density band; numeric budget выводится versioned code policy. Stage B имеет
`evidence_weight = 0`, а code-owned builder создаёт normalized
classification/coverage/policy fields. Normalized discovery query (NFKC,
trim, collapse whitespace, ru-RU lowercase) вместе с exact target выводит
code-owned candidate identity и передаётся model только как `candidate_hint`;
это не noun/recipe allowlist и не authority. Exact retry сохраняет identity,
другой normalized query получает другую identity. Один discovery имеет общий
лимит двух semantic calls; structural repair расходует оставшийся call, а
Stage A repair при исчерпанном лимите завершается seed-only без Stage B. Turn принимает positive только после independent
supporting-basis/property/placement admission `@rus/items-property`, собирает
один ordinary P16 plan после revalidation и передаёт его persistence owner;
model call никогда не находится внутри physical transaction. Player-safe
working projection получает только capability marker и approved concrete
result, narration начинается лишь после commit. Exact positive/negative
resolution/idempotency сохраняется, поэтому retry/reload не reroll-ит её для
code-owned identity. Active cutover локально проверяет versioned approval
receipt ранее выполненного adversarial Stage B classification eval, связанный
с profile digest и exact production provider/model/config identity; gameplay
не запускает probes. Любой sensitive `materialize` блокирует активацию.
O1 не активирует O2, A1, F1, S1, N1, template-less runtime containers,
context-bound weapons/value/currency или natural finite sources.

Active O2a добавляет authored wreck-shore ambient capability и first-entry
context-bound finite stock подготовленной глины. Player-safe state показывает
committed stock как обычный source только при отдельном approved disclosure
state; concealed capabilities остаются server-only. Unresolved remainder
проецируется только через boolean `discovery_available`, без expected result,
permission и capacity.
Stage B может выбрать unlisted ordinary semantic type/name внутри approved class;
source/property/permission/mechanics и пустой facts остаются code-owned gates. Сам `ambient_ordinary`
не является O2a marker: legacy direct actions без
этого capability сохраняют прежний path. Drifted binding не публикует capability,
а forged ref не проходит current-ref validation. Generic finite effect связан с
current row выбранного admitted `finite_source`; несколько sources не делят
mutable quantity. Constrained policy добавляет только resource
permissions. Не provisioned precious material и damaged remnant в этой revision не
объявлены active. O2b/A1/F1/S1/N1, containers, authentic currency и
significant/hidden facts остаются disabled.

## Тесты

Player semantic coverage: `turn-step-contracts.test.js`, `turn-step-loop.test.js`, `turn-step-security.test.js`, `turn-workflow-semantic-step-1.test.js`, `turn-workflow-semantic-step-2.test.js`, `turn-step-operation-batch.test.js` and game-server `lower-dvina-trace-turn-step-*.test.js`. Exact/closed path and temporal coverage remain in `turn-workflow.test.js`, `bounded-decision.test.js`, `temporal-advance.test.js`, `temporal-carriers.test.js`, `temporal-activity-engine.test.js`, `temporal-presentation-lifecycle.test.js` and `first-entry-materialization.test.js`.
