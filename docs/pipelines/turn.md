# Turn pipeline

Канонический владелец orchestration: `@rus/turn`.

Завершённый `versioned production activation cutover` сделал Spatial v3 sole
production composition. Lower Dvina Trace revision 13 additionally activates one player semantic boundary:
`turn_step_request_v1` → `turn_step_plan_v1`. Exact registered commands remain
ahead of it. V2 is an explicit migration/rollback source only; mixed reads,
dual writes, runtime fallback and a second player planner are forbidden.
Revision 14 / `spatial-v3-production-v4` additionally activates the Phase 3–4
conversation contribution path and removes their bounded NPC selector from
production; historical revisions remain available only by explicit pin.
`spatial-v3-production-v5` additionally activates the Phase 7 autonomous NPC
path through the same common signal/boundary protocol.

## Этапы

1. `normalize_intent` — сохраняет слова игрока как намерение, а не факт мира.
2. `load_context` — читает committed state через `PartyStateReader`.
3. `available_actions` — строит полный player-safe набор зарегистрированных и доступных code handlers без raw text.
4. `resolve_mode` выбирает ровно один путь:
   - exact registered command — выполняется без LLM и decision clock;
   - иначе `turn_step_admission` строит player-safe `turn_step_request_v1`, строго валидирует `turn_step_plan_v1` и исполняет до восьми внутренних шагов через code-owned registry.
   После каждого применённого semantic шага обновляется working projection и заново строится player-safe state. Невалидный plan допускает один structural repair до execution; повторная ошибка не создаёт draft writes.
   Active conversation mode интерпретирует один player contribution, фиксирует statement, отдельно проецирует фактических listeners/witnesses и создаёт semantic NPC request только при meaningful common decision boundary.
   Lower Dvina Trace revision 15 использует этот же loop для канонического составного Хода 10: сначала code-owned Phase 7 rest полностью продвигает время на 30 минут, затем оставшаяся просьба исполняется как conversation domain request на уже обновлённом timestamp. Оба prepared domain result образуют один ordered ledger и один atomic root commit; начальная недоступность второго command не подменяет его повторную availability-проверку на состоянии после отдыха.
5. `revalidate_context` — повторно читает committed state и отклоняет stale exact command, semantic domain binding или base version до RNG и commit.
6. `availability` — зарегистрированный code handler повторно проверяет доступность выбранного действия.
7. `checks` — выполняет только явно запрошенные проверки через `RandomSource`.
8. `consequence` — зарегистрированный code handler вычисляет последствия либо возвращает repair request.
9. `time_update` — применяет утверждённую длительность через владельца времени.
10. `body_update` — применяет утверждённый body-effect к revalidated state.
11. `hidden_update` — код применяет утверждённое consequence к immutable candidate post-change state.
12. `visible_projection` — code-owned projection и security gate строят player-safe candidate.
13. `persistence_plan` — код строит и in-process запечатывает логический write plan из allowlist targets.
14. `commit` — game-server одной PostgreSQL-транзакцией сохраняет facts, visible package и pending metadata.
15. `persisted_visible_projection` — повторно читает уже committed player-safe package.
16. `narration` — получает только persisted package и создаёт prose, но не facts.
17. `screen_projection` — строит versioned `TurnScreen` из persisted package и narration.

## Результат

`runTurnWorkflow` возвращает `turn_result` version 1: статус, режим, публичный экран, commit metadata, техническую summary и checkpoint. Semantic execution сохраняет только code-owned ordered step trace и `party_turn_step_operation_batch_v1`; hidden state, provider payload, scratchpad и write plan не входят в screen.

## Ports

State reader, code-owned command registry, `turnStepModel`, player-safe working projector, step execution registry, check-context resolver, random source, code-owned visible projector, narrator, party store и screen projector передаются явно. Closed bounded choices отдельно используют identity/secret/expiry ports; свободный player input их не использует. State reader вызывается перед каждым semantic step и повторно до финального commit.

Reload/turn получает item/container catalog только из persisted
`party_catalog_pins` и exact historical import через `@rus/runtime-catalog`.
Для first-entry materialization persisted domain `catalog_digest` и canonical
`catalog_bundle_digest` проверяются отдельно; run pin записывается атомарно с
materialization run.
Текущий active event не читается. Отсутствующий pin возвращает
`PARTY_CATALOG_PIN_MISSING` без backfill и rematerialization.

## Границы

Код не придумывает authored categories и отсутствующие significant candidates. Exact path выбирает зарегистрированный handler; player planner возвращает только строгий следующий step, а code registry/admission рассчитывает последствия и формирует write fragments. LLM не возвращает SQL, physical write targets, state patch, derived mechanics, hidden facts, NPC/combat result или narration. Ordinary direct action result допускается только через code-owned origin/admission/inventory gates и persisted exact runtime mechanics snapshot. Stale state, invalid plan/repair, ambiguous domain binding, поддельный bounded token или невалидный change set останавливают pipeline без частичного commit.

Revision-14 conversation использует общий `npc_decision_signal_v1` →
`npc_decision_boundary_v1`: ровно категории `self`, `others`, `environment`,
`objective`, `communication`, только significance `material|critical`, не более
одной boundary и одного LLM-вызова для одного NPC/same-time batch. Отдельной
conversation trigger subsystem нет. Listener/witness может получить
perception/received knowledge без обязательного ответа; private knowledge
между NPC не переносится. Social check меняет только delivery/credibility, а
не решение NPC. Autonomous NPC action active: Phase 7 «Отдых у огня» advances
30 minutes and produces Жданко's boundary at +25 minutes. The request exposes
only operations backed by the current actor-step registry; the chosen step is
applied at +25, then the common temporal owner resumes to +30 from that updated
working projection. The canonical compound Turn 10 conversation starts only
after that completed interval, at the resulting +30 timestamp, and contributes
no second clock or body write. Persistence and visibility remain code-owned. Combat
resolution остаётся `proposed`; conversation
допускает только combat handoff.

## Temporal World v4 active sequence

The complete active flow is specified in
[`temporal-advance.md`](temporal-advance.md).

`runTemporalAdvance` processes the exact `(from,to]` interval: it selects the
earliest eligible boundary, applies the continuous slice, and resolves the
fixed-order same-time cascade to a bounded deterministic fixed point.
`@rus/time-events-history` owns exact time and ordering; body, access,
environment, history, NPC, carriers and world-processes return only pinned,
pure proposals. `@rus/turn` merges those proposals deterministically and owns
the logical combined plan; `@rus/party-store` owns party persistence validation;
`apps/game-server` owns the physical PostgreSQL transaction.

The transaction atomically persists factual changes, the exact clock result,
effects, idempotency result and `VisiblePackagePersistenceEnvelope`. Only then
does the presentation path read that committed player-safe package and invoke
narration. Missing pins/candidates/rules, merge conflicts, cycles and explicit
limits fail closed with typed errors. A second place/access package is not
created: ADR-004 keeps that responsibility in turn orchestration and
party-store validation.
