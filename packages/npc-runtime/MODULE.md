# @rus/npc-runtime

## Назначение

`@rus/npc-runtime` — active-norm owner Temporal World v4 для чистых
предложений переходов расписания NPC, восприятия, общих decision
signals/boundaries и versioned semantic decision contracts. Historical P28 evidence не активировало runtime; последующий
`versioned production activation cutover` release
`spatial-v3-production-v1` включил пакет в sole production v3 composition.

## Владеет

- проверкой и построением детерминированных proposal из переданных sealed snapshots;
- применением supplied approved profiles и versioned dependency pins;
- schedule, perception, signal aggregation и semantic-decision traces в границах формальных контрактов.

## Не владеет

Не создаёт исходные NPC (это materialization/New Game Stage 15), не владеет knowledge/hidden-information validation, turn orchestration, exact clock arithmetic, persistence или narration.

## Public API

- `NPC_RUNTIME_OWNER`, `NPC_RUNTIME_RESOURCE_LIMITS`, `NPC_RUNTIME_TYPED_ERRORS`
- `proposeNpcScheduleTransition(input)` — возвращает frozen schedule proposal, evidence и exact temporal boundary.
- `proposeNpcPerception({ perception_input })` — возвращает frozen formal perception result и replay evidence.
- `buildNpcDecisionSignal`, `buildNpcDecisionBoundary`, `evaluateNpcDecisionSignals` — валидируют ровно пять категорий `self|others|environment|objective|communication`, значимость `material|critical` и агрегируют для одного NPC/same-time batch не более одной boundary суммарно по всем режимам.
- Conversation builders/validators — формальные session, player contribution, statement, audience-facing request, NPC contribution и social delivery contracts.
- Semantic decision builders/validators — `buildNpcActionDecisionRequestFromSnapshots` проецирует NPC-safe request только из supplied factual snapshots, а общий resource projector допускает persisted controlled либо factually accessible resources без scenario allowlist; `decision_reasons.perceived_changes` берёт authored/factual summary из perception snapshot по source event, иначе technical ref; `npc_action_decision_request_v1`, `npc_step_plan_v1` и replay-safe trace; production v5 uses conversation mode and Phase-7 autonomous mode.
- `selectApplicableNpcActivityExecution(input)` — выбирает ровно один
  applicable approved activity execution по semantic activity kind и реальным
  item/location refs; отсутствующая цель или неоднозначность дают typed reject.
- `proposeNpcReactionOptions({ context_snapshot, policy_snapshot, persisted_proposal? })` — чисто фильтрует approved rules, возвращает формальный конечный request и проверяет replay по полной causal identity.
- `buildNpcReactionPolicySnapshotFromAuthoringRow(row)` — чисто проецирует одну exact approved authoring-запись в закрытый policy/command snapshot и fail-closed проверяет handler/consequence bindings.
- `decideBoundedNpcAction(...)` — валидирует один `option_id` и `command_token` из конечного option set и возвращает decision trace.
- `orderNpcDecisionRequests(requests)` — детерминированно упорядочивает formal requests по exact timestamp, NPC и request id.

## Формальные контракты

Входы schedule содержат sealed normalized NPC state, applicable approved schedule profile, exact `scheduled_at`, dependency pins и recheck snapshot; выход — frozen proposal/evidence либо hard block. Perception принимает sealed signal, propagation, environment, attention, recognition и policy snapshots с pins; результат не изменяет knowledge state. Semantic request содержит только subjective state одного NPC, exact boundary identity и зарегистрированный operation contract. Повтор с persisted evidence/trace допускается исключительно при совпадении immutable input digest и idempotency identity; private knowledge одного NPC не проецируется другому.

Conversation contribution schema поддерживает `automatic` и
`check_required`; во втором случае refs обязаны входить в
`decision_scope.allowed_attribute_refs`/`allowed_skill_refs` и
`allowed_check_profile_refs`, а бросок остаётся у code-owned check owner.
Lower Dvina Trace revision 14 публикует такой scope для лжи и торга Ратши;
прочие NPC без профильного scope остаются automatic-only.

## Поток выбора действия NPC

`@rus/npc-runtime` участвует только при meaningful decision boundary. Domain
owners сохраняют factual transitions и выдают только generic signal
descriptors. Perception-required signal допускается после фактического
восприятия; все новые signals одного NPC за fully resolved same-time batch
агрегируются в одну NPC/batch boundary и не более одного LLM-вызова. Conversation не
создаёт отдельную trigger subsystem.

`@rus/turn` повторно проверяет causal identity, state version и operation
contract, а зарегистрированный handler исполняет plan. Продолжение ранее
сохранённого намерения, обычный listener/witness и автоматические последствия
не создают новую decision boundary. Bounded option APIs сохраняются для
genuinely closed choices и historical revisions, выбранных явным pin; они не
являются fallback revision-14 conversation path.
Полный норматив находится в разделе 15
`temporal_world_and_interruptible_activities.md`.

## Typed errors и gaps

Пакет fail-closed возвращает typed hard block: `npc_schedule_gap`, `npc_decision_policy_gap`, `perception_policy_gap`, `temporal_candidate_stale`, `activity_precondition_stale`, `temporal_execution_unbounded`, `time_timestamp_invalid`, `idempotency_conflict`, `temporal_change_set_conflict`; внутренне также защищает contract output через `generated_schema_mismatch`. Пустой или неоднозначный candidate set, несовместимые pins, stale state и неподтверждённые preconditions не получают fallback.

## Зависимости, IO и persistence

Разрешены `@rus/kernel`, versioned `@rus/contracts` и `@rus/time-events-history` для формальных контрактов, digest и exact timestamp comparison/normalization. Нет скрытых IO: пакет не читает DB, network, LLM, narrator, UI, global clock или скрытое process state; он не пишет SQL и не создаёт write plan. Persisted inputs служат только для pure replay verification. `@rus/turn` валидирует и передаёт одобренные изменения в target `CombinedAtomicCommitter`.

## Activation и тесты

В active `spatial-v3-production-v5` revision-14 conversation и Phase-7 autonomous
contracts применяются через единый orchestration/write path. Phase 7 фиксирует
fire rest на 30 минут и boundary Жданко на +25; semantic plan получает
точные actor-step operations из зарегистрированных domain handlers
(`operation_contract.allowed` перечисляет только исполняемые kind/target
комбинации), применяется на том же timestamp, после чего общий temporal owner
продолжает интервал до +30; temporal/persistence/visibility остаются
code-owned. Production v4 является explicit migration/rollback source, но не
runtime path; partial activation, dual write и in-turn fallback запрещены.
Tests покрывают exact schedule/perception, five-category signals, one
NPC/batch aggregation, semantic contracts, conversation contracts, replay и
historical bounded choices.
