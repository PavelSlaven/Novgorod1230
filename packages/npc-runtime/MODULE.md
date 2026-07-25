# @rus/npc-runtime

## Назначение

`@rus/npc-runtime` — active-norm owner Temporal World v4 для чистых
предложений переходов расписания NPC, восприятия и ограниченного выбора
действия. Historical P28 evidence не активировало runtime; последующий
`versioned production activation cutover` release
`spatial-v3-production-v1` включил пакет в sole production v3 composition.

## Владеет

- проверкой и построением детерминированных proposal из переданных sealed snapshots;
- применением supplied approved profiles и versioned dependency pins;
- schedule, perception и bounded-decision traces в границах формальных контрактов.

## Не владеет

Не создаёт исходные NPC (это materialization/New Game Stage 15), не владеет knowledge/hidden-information validation, turn orchestration, exact clock arithmetic, persistence или narration.

## Public API

- `NPC_RUNTIME_OWNER`, `NPC_RUNTIME_RESOURCE_LIMITS`, `NPC_RUNTIME_TYPED_ERRORS`
- `proposeNpcScheduleTransition(input)` — возвращает frozen schedule proposal, evidence и exact temporal boundary.
- `proposeNpcPerception({ perception_input })` — возвращает frozen formal perception result и replay evidence.
- `proposeNpcReactionOptions({ context_snapshot, policy_snapshot, persisted_proposal? })` — чисто фильтрует approved rules, возвращает формальный конечный request и проверяет replay по полной causal identity.
- `buildNpcReactionPolicySnapshotFromAuthoringRow(row)` — чисто проецирует одну exact approved authoring-запись в закрытый policy/command snapshot и fail-closed проверяет handler/consequence bindings.
- `decideBoundedNpcAction(...)` — валидирует один `option_id` и `command_token` из конечного option set и возвращает decision trace.
- `orderNpcDecisionRequests(requests)` — детерминированно упорядочивает formal requests по exact timestamp, NPC и request id.

## Формальные контракты

Входы schedule содержат sealed normalized NPC state, applicable approved schedule profile, exact `scheduled_at`, dependency pins и recheck snapshot; выход — frozen proposal/evidence либо hard block. Perception принимает sealed signal, propagation, environment, attention, recognition и policy snapshots с pins; результат не изменяет knowledge state. Bounded decision принимает formal request, current state version, precondition digest, exact validation timestamp и, если нужно, selection только из supplied options. Повтор с persisted evidence/trace допускается исключительно при совпадении immutable input digest и idempotency identity.

## Typed errors и gaps

Пакет fail-closed возвращает typed hard block: `npc_schedule_gap`, `npc_decision_policy_gap`, `perception_policy_gap`, `temporal_candidate_stale`, `activity_precondition_stale`, `temporal_execution_unbounded`, `time_timestamp_invalid`, `idempotency_conflict`, `temporal_change_set_conflict`; внутренне также защищает contract output через `generated_schema_mismatch`. Пустой или неоднозначный candidate set, несовместимые pins, stale state и неподтверждённые preconditions не получают fallback.

## Зависимости, IO и persistence

Разрешены `@rus/kernel`, versioned `@rus/contracts` и `@rus/time-events-history` для формальных контрактов, digest и exact timestamp comparison/normalization. Нет скрытых IO: пакет не читает DB, network, LLM, narrator, UI, global clock или скрытое process state; он не пишет SQL и не создаёт write plan. Persisted inputs служат только для pure replay verification. `@rus/turn` валидирует и передаёт одобренные изменения в target `CombinedAtomicCommitter`.

## Activation и тесты

В active `spatial-v3-production-v1` contract применяется только через единый
v3 orchestration/write path. Production v2 является explicit
migration/rollback source, но не runtime path; partial activation, dual write
и in-turn fallback запрещены. Tests:
`test/npc-runtime.test.js` покрывает exact schedule boundary,
pins/recheck/replay, perception topology/light/attention, bounded decision,
отказ при пустом/недопустимом option set и deterministic same-time ordering.
