# Turn pipeline

Канонический владелец orchestration: `@rus/turn`.

Завершённый `versioned production activation cutover` сделал Spatial v3 sole
production composition. На ветке PR #98 production composition — Spatial v3 bindings **v16 или v17**
(`builtin:spatial-v3-production-v16` по умолчанию; v17 через
`RUS_SPATIAL_V3_BINDINGS_MODULE` / пару БД v17 в `play:local` — [DB_SCHEMA](../context/DB_SCHEMA.md) §1.1,
LW-033). Фактический HTTP→commit путь и WK grounding —
[ARCHITECTURE](../context/ARCHITECTURE.md) §1.1–1.3. Модули `lower-dvina-trace-*` — общий runtime
(LW-026), не «только сценарий».

Semantic boundary игрока: `turn_step_request_v1` → `turn_step_plan_v1`. Exact registered commands
остаются впереди. V2 — только migration/rollback source; mixed reads, dual writes, runtime fallback
и второй player planner запрещены.

Исторические активации revisions (conversation Phase 3–4, autonomous NPC Phase 7, combat Phase 8,
post-combat Phase 9, P16 completion follow-up) наследуются текущими bindings; детали профилей —
в `MODULE.md` `@rus/turn` / `@rus/npc-runtime` и release bindings, не дублируются здесь.
Продвижение времени — [temporal-advance.md](temporal-advance.md).

## Этапы

1. `normalize_intent` — сохраняет слова игрока как намерение, а не факт мира.
2. `load_context` — читает committed state через `PartyStateReader`.
3. `available_actions` — строит полный player-safe набор зарегистрированных и доступных code handlers без raw text.
4. `resolve_mode` выбирает ровно один путь:
   - exact registered command — выполняется без LLM и decision clock;
   - иначе `turn_step_admission` строит player-safe `turn_step_request_v1`, строго валидирует `turn_step_plan_v1` и исполняет до восьми внутренних шагов через code-owned registry (`runTurnStepLoop`).
   После каждого применённого semantic шага обновляется working projection и заново строится player-safe state. Невалидный plan допускает один structural repair до execution; повторная ошибка не создаёт draft writes.
   Active conversation mode интерпретирует один player contribution, фиксирует statement, отдельно проецирует фактических listeners/witnesses и создаёт semantic NPC request только при meaningful common decision boundary.
5. `revalidate_context` — повторно читает committed state и отклоняет stale exact command, semantic domain binding или base version до RNG и commit.
6. `availability` — зарегистрированный code handler повторно проверяет доступность выбранного действия.
7. `checks` — выполняет только явно запрошенные проверки через `RandomSource`.
8. `consequence` — зарегистрированный code handler вычисляет последствия либо возвращает repair request.
9. `time_update` — применяет утверждённую длительность через владельца времени.
10. `body_update` — применяет утверждённый body-effect к revalidated state.
11. `hidden_update` — код применяет утверждённое consequence к immutable candidate post-change state.
12. `visible_projection` — code-owned projection и security gate строят player-safe candidate.
13. `persistence_plan` — код строит и in-process запечатывает логический write plan из allowlist targets.
14. `commit` — game-server одной PostgreSQL-транзакцией (P16 combined atomic committer) сохраняет facts, visible package и pending metadata.
15. `persisted_visible_projection` — повторно читает уже committed player-safe package.
16. `narration` — получает только persisted package и создаёт prose, но не facts.
17. `screen_projection` — строит versioned `TurnScreen` из persisted package и narration.

WK grounding и auditor выполняются на границе planner/NPC models до commit (см. ARCHITECTURE §1.3).

## Результат

`runTurnWorkflow` / public runtime facade возвращает `turn_result` version 1: статус, режим, публичный экран, commit metadata, техническую summary и checkpoint. Semantic execution сохраняет только code-owned ordered step trace и `party_turn_step_operation_batch_v1`; hidden state, provider payload, scratchpad и write plan не входят в screen.

## Ports

State reader, code-owned command registry, `turnStepModel`, player-safe working projector, step execution registry, check-context resolver, random source, code-owned visible projector, narrator, party store, screen projector и (на production path) world-knowledge grounder передаются явно. Closed bounded choices отдельно используют identity/secret/expiry ports; свободный player input их не использует. State reader вызывается перед каждым semantic step и повторно до финального commit.

Reload/turn получает item/container catalog только из persisted `party_catalog_pins` и exact historical import через `@rus/runtime-catalog`. Отсутствующий pin — `PARTY_CATALOG_PIN_MISSING` без backfill.

## Границы

Код не придумывает authored categories и отсутствующие significant candidates. Exact path выбирает зарегистрированный handler; player planner возвращает только строгий следующий step. LLM не возвращает SQL, physical write targets, state patch, derived mechanics, hidden facts, NPC/combat result или narration. Ordinary direct action result допускается только через code-owned origin/admission/inventory gates (ordinary materialization на v17: ambient O2a/O2b/F1/S1 profiles сейчас `null` — LW-029; обобщение в M2c). Stale state, invalid plan/repair, ambiguous domain binding, поддельный bounded token или невалидный change set останавливают pipeline без частичного commit.

NPC conversation / autonomous / combat идут через общий `npc_decision_signal_v1` → `npc_decision_boundary_v1`; persistence и visibility — code-owned.

## Ссылки

- [ARCHITECTURE](../context/ARCHITECTURE.md) §1.1–1.3
- [temporal-advance.md](temporal-advance.md)
- [packages/turn/MODULE.md](../../packages/turn/MODULE.md)
- [EDGE_CASES](../context/EDGE_CASES.md) §10.1 (примеры действий для проверок)
- [LEGACY_WARNINGS](../work/LEGACY_WARNINGS.md) LW-026…LW-033
