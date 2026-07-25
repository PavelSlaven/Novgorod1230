# Архитектура кодовой материализации мира

**Статус:** target normative; принятое историческое P28 evidence не активировало
runtime, поэтому materialization v2 остаётся sole production owner до
отдельного `versioned production activation cutover`.
**Версия target:** spatial v3 / G0–G6 v4.2.0.
**Приоритет:** высший норматив границы authoring data, кода, LLM, `world_base` и `party_runtime`.

**Temporal amendment:** active target normative
`temporal_world_and_interruptible_activities.md`,
current `temporal-world-v1.1` / Spatial DTO `4.4.0-target.1`, сохраняя
immutable `temporal-world-v1` / `4.3.0-target.1`. Он не активирует
production до `versioned production activation cutover`.

## 1. Active/target boundary

Этот документ фиксирует целевую семантику v3, но не активирует её. До
`versioned production activation cutover` production request обслуживается
только v2 composition. V3 разрешён исключительно для документации, contracts,
fixtures, migration tooling и shadow composition.

Физическое сосуществование v2/v3 допустимо, но dual write, authoritative mixed read, fallback внутри хода и частичная активация запрещены. После activation v3 становится единственным production owner; v2 остаётся только read-only источником rollback/migration в пределах утверждённой операции.

## 2. Пространственная модель v3

```text
canonical G0–G5 in world_base: G0 → G1 → G2 → G3 → G4 → G5
party_runtime: finite party-generated G5, G6, scene_position_node,
               планы, исполнения, carriers, perception и history
```

- G0–G5 — заранее утверждённые канонические уровни; G5 — конкретная локальная локация или комплекс внутри G4.
- Generated G5 создаётся только как конечное party-scoped дополнение утверждённого G4 expansion profile.
- G6 — materialized scene space; `scene_position_node` — техническая позиция внутри G6. Они не являются новыми G-уровнями; G7/G8 запрещены.
- Containment не создаёт movement. Физическое перемещение использует explicit directed relation; visibility и acoustics — отдельные topology.
- Visual layout только отображает существующую topology и не выводит её из координат.

## 3. Authoring, materialization и data gaps

Код материализует экземпляры только по цепочке `category → regional template → profile → rule → candidate set → persisted instance`. Он не придумывает category, исторический факт, маршрут, owner или отсутствующий option.

Пустой required candidate set — `spatial_candidate_gap`: hard block с диагностическими pins. Запрещены fallback, ослабление filter, заглушка, semantic continuation и LLM repair. Repair исправляет только формат/contract отклонённого ответа при неизменных input и candidate set.

Generated G5 ограничен утверждённым profile, frontier, template/slot capacity и terminal-resolution rule. Runtime не создаёт G0–G4 и не выполняет бесконечную procedural generation.

## 4. Ownership и commit

Материализаторы, route/scene resolvers и validators возвращают immutable proposals/reports. Единственный production commit component применяет уже approved write set атомарно, сохраняет version pins, digests, seed, trace, idempotency key и append-only history. Он не выбирает альтернативу во время commit.

Preparation обязана завершить required target/transfer G5 and G6 bindings до activation executable plan. `party_route_plan` immutable; изменение endpoint, carrier, method, static dependency или recovery target создаёт новый plan/execution. Время, progress и results не переписываются.

LLM допускается только для bounded decision, разрешённой конкретизации, аудита, player character и prose from approved visible context. LLM не пишет SQL, DB state или произвольный patch/write plan.

## 5. Bounded decision

Код сначала фильтрует невозможные options и передаёт конечный set с `option_id`, `command_token`, actor/target, preconditions, cost/risk, policy/state versions и options digest. LLM выбирает ровно один известный option и точный token. Неизвестный token, свободный текст, SQL, patch, несколько вариантов или stale state — typed rejection.

## 6. Party state и visible boundary

`party_runtime` хранит mutable party state: party-generated G5, G6/positions,
actors, NPC/items, carriers, blockers, plans/executions, exact temporal state,
perception, knowledge и history. Factual state, character knowledge и visible
projection различны. Code-owned projector формирует factual player-safe
package и сохраняет его в том же atomic commit, что и state change. Narrator
получает только этот persisted package после commit.

## 7. Условия активации

Status flip запрещён до одновременного выполнения target §0.4:
DDL/SCHEMA_REFERENCE/contracts/import/save-load синхронизированы, migration and
rollback validated, tests включая PostgreSQL проходят,
generated/repository-intelligence artifacts актуальны, independent critic
вернул PASS или допустимый PASS WITH NOTES. Единственную атомарную activation
выполняет отдельный `versioned production activation cutover`; историческое
P28 evidence не является этой операцией.

## 8. Migration history: materialization v2

До `versioned production activation cutover` active v2 использует canonical
G0–G4 в `world_base` и party-scoped G5. Эта историческая модель сохранена
только как описание migration source и не является target production
semantics. Ни один v3 request не может читать или записывать её как fallback.
