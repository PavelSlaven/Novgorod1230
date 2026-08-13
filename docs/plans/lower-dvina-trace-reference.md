# Lower Dvina Trace: production reference

- **Статус:** production-active reference
- **Сценарий:** `lower_dvina_trace_v1`
- **Последняя revision:** `18`
- **Текущий release:** `spatial-v3-production-v8`
- **Граница:** состояние после завершения Phase 11

Этот документ отвечает на вопрос «что сейчас существует». Он не является
roadmap, target-контрактом будущей механики или заменой профильных нормативов.

## Статус сценария

Lower Dvina Trace — завершённый первый production vertical slice. Phase 0–10
реализуют authored data, materialization и игровое прохождение; Phase 11
подтверждает весь путь через Chromium, HTTP, production composition и
PostgreSQL. Phase 11 закрыта merged PR
[#61](https://github.com/PavelSlaven/Novgorod1230/pull/61) и не создаёт
scenario revision 19.

Отдельный исторический boatman scenario
`lower_dvina_late_summer_open_water_v1` сохраняет собственные immutable pins,
production path и regression. Lower Dvina Trace его не подменяет.

## Игровая рамка

Игрок — младший приказчик, оказавшийся после крушения в Нижнем Подвинье. Четыре
основные сцены образуют компактный расследовательский маршрут:

1. берег крушения и первые материальные следы;
2. рыбацкий стан, Онисим и Еремей;
3. сушильня, Ратша, обещание, лечение и переноска;
4. клеть Жданко, confrontation/combat и возврат имущества.

Стабильные участники — Онисим, Еремей, Ратша, Жданко и участвующий рыбак.
Прохождение связывает расследование, лечение тела, многостороннюю переноску,
30-минутный отдых, самостоятельное действие NPC, угрозу и бой, контейнеры и
имущество, свидетельства, evidence resolution, временное disposition,
детерминированный completion и эпилог.

Каноническая acceptance-партия воспроизводит полный исход, но production также
сохраняет допустимые альтернативы NPC, combat и evidence. Отсутствие отдельного
доказательства остаётся `unknown`, а не превращается в отрицательный факт.

## Граница кода и LLM

Профильные active-контракты являются нормативными; этот раздел только связывает
их с работающим сценарием.

- Свободный player input проходит
  [`turn_step_request_v1 → turn_step_plan_v1`](../../data/knowledge-source/corpus/DOCUMENTS/turn_step_llm_contract.md).
  LLM предлагает ближайший semantic step, а registry/admission и профильные
  владельцы проверяют и применяют последствия.
- [Conversation](../../data/knowledge-source/corpus/DOCUMENTS/npc_conversation_mode_contract.md)
  даёт каждому meaningful responder отдельный субъективный contribution.
  Сохранённая реплика — факт речи; её claim не становится objective truth.
- [Autonomous NPC](../../data/knowledge-source/corpus/DOCUMENTS/npc_autonomous_decision_contract.md)
  использует одну aggregated decision boundary и не опрашивает LLM постоянно.
- [Combat](../../data/knowledge-source/corpus/DOCUMENTS/npc_combat_and_trigger_contract.md)
  получает от LLM устойчивое intent. Technical steps, порядок, RNG, время,
  движение, предметы, вред и тело разрешает код до следующей meaningful
  boundary.
- Completion Phase 10 полностью code-owned и вычисляется из committed facts.
- Narration запускается только после factual commit и получает player-safe
  persisted projection.

LLM не выбирает RNG, elapsed time, body/item transition, SQL/write target,
objective completion или скрытый факт. Bounded `option_id` используется только
для действительно закрытого выбора и не является fallback свободной semantics.

## Runtime ownership

| Ответственность | Production owner |
|---|---|
| Ход, semantic orchestration, actor-step и atomic prepared workflow | `@rus/turn` |
| NPC request/plan, subjective decision context и signal/boundary contracts | `@rus/npc-runtime` |
| Маршрут, traversal, reachability и movement duration | `@rus/movement-routes` |
| Combat session, intents, technical exchange и harm proposals | `@rus/combat-health` вместе с общей orchestration `@rus/turn` |
| Тело и threshold transitions | `@rus/body-state` |
| Предметы, контейнеры, holder/controller/owner и property transitions | `@rus/items-property` |
| Видимость, знания, evidence и deterministic completion evaluation | `@rus/visibility-knowledge-memory` |
| Обязательства и applicability typed temporary disposition | `@rus/social-law` |
| Проверки и детерминированный injected RNG | `@rus/checks-rng` |
| P16 write plan, optimistic versions и PostgreSQL commit/readback | существующий party persistence path |
| Narration и UI | persisted player-safe projection после commit |

Сценарные bindings задают содержание, refs, profiles и разрешённые последствия.
Они не создают собственные scheduler, combat, movement, inventory, evidence или
completion engines.

## Смысловые production cutovers

| Revision / release | Cutover |
|---|---|
| revision 13 / `spatial-v3-production-v3` | Свободная заявка игрока через общий `turn_step_plan_v1`. |
| revision 14 / `spatial-v3-production-v4` | Semantic conversation для Phase 3–4. |
| revision 15 / `spatial-v3-production-v5` | Autonomous NPC и Phase 7 fire rest. |
| revision 16 / `spatial-v3-production-v6` | Общий combat runtime и Phase 8. |
| revision 17 / `spatial-v3-production-v7` | Phase 9: имущество, evidence и temporary disposition. |
| revision 18 / `spatial-v3-production-v8` | Phase 10: deterministic completion и epilogue. |
| Phase 11 | Full-stack acceptance без новой revision или release. |

Revisions до 13 сохраняют authored/materialization и ранние runtime cutovers;
их фактическая карта приведена в
[implementation map](lower-dvina-trace-implementation-plan.md).

## Persistence и replay

- Свершившийся factual effect, LLM decision и RNG result не пересчитываются.
- Время, тело, предметы, traversal, combat session/intents, NPC decisions,
  obligations, evidence и completion читаются из committed party state.
- Retry с тем же identity не создаёт второй effect и не вызывает LLM повторно.
- Каждый historical party продолжает использовать собственные revision/release
  pins; runtime не подменяет их текущими.
- Автоматической миграции старых незавершённых партий между scenario revisions
  нет.
- Revision 18 остаётся текущей после Phase 11; acceptance не материализует
  revision 19.

## Player-safe boundary

Objective state и знание игрока — разные проекции. `full` completion означает,
что code-owned evaluator удовлетворил authored objective conditions, но не
раскрывает автоматически все выводы персонажу.

Hidden truth, неизвестные положения и contents, NPC prompts/decision inputs,
internal traces и undisclosed evidence не входят в HTTP payload, DOM или
narration. Player-facing conclusion появляется только из committed knowledge и
player-safe causal refs.

## Acceptance

Full-stack доказательство находится в:

- [`test/e2e/lower-dvina-trace-browser-acceptance.test.js`](../../test/e2e/lower-dvina-trace-browser-acceptance.test.js);
- [`test/acceptance/lower-dvina-trace-phase-11-restart-postgres.test.js`](../../test/acceptance/lower-dvina-trace-phase-11-restart-postgres.test.js).

Проверки покрывают:

- canonical прохождение до committed `full` completion;
- альтернативы решений Ратши, Еремея и Жданко;
- restart и exact replay без повторных provider calls/effects;
- отсутствие hidden/causal утечек через HTTP, DOM и narration;
- отдельный historical boatman regression;
- реальный Chromium → `/api/v1` → `spatial-v3-production-v8` → PostgreSQL path.

Исторические причины и исходные gaps сохранены в
[gap audit](lower-dvina-trace-gap-audit.md) и
[completed roadmap](lower-dvina-trace-phased-roadmap.md).
