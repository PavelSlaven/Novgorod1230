# Архитектура кодовой материализации мира

**Статус:** canonical normative; active; высший норматив по материализации и разделению ответственности кода/LLM
**Версия:** 1.1.0
**Область:** граница ответственности редакторских данных, кода, LLM, `world_base` и party state

## Production/target routing

The completed `versioned production activation cutover` made the spatial-v3 semantics in `spatial_v3_target_code_driven_world_materialization_architecture.md` and `spatial_architecture_standard_g0_g6.md` the production specialization of this highest code/LLM boundary. Materialization v2 is retained only as an explicit migration/rollback source.

The approved P12 authoring projection is rooted at `data/world-catalogs/novgorod/spatial-v3/manifest.json`: it has 37 SHA-256-pinned datasets and `data_gaps: []`, compiling only previously approved source records. Historical P28 exact-head evidence did not itself authorize production activation; the later cutover release `spatial-v3-production-v1` did. Spatial v3 is now the sole production owner.

## 0. Назначение и приоритет

Документ задаёт архитектуру материализации конкретных сущностей мира и является высшим нормативом для вопросов:

- кто создаёт конкретные G5, NPC, предметы, контейнеры и имущественные связи;
- что код вправе выбирать из утверждённых данных;
- в каких случаях допустим LLM;
- как обеспечиваются детерминизм, сохранение экземпляров и трассировка;
- где проходит граница между `world_base` и состоянием партии.

Документ повышен в `active` после реализации перехода, полного набора автоматических проверок и отдельного PASS критика. Подчинённые нормативы применяются только в части, не противоречащей этому документу.

## 1. Главный принцип

```text
код не придумывает категории, исторические факты и отсутствующие варианты,
но материализует конкретные экземпляры из утверждённых категорий,
региональных шаблонов, профилей и правил;
LLM принимает ограниченные смысловые решения через формальный протокол команд.
```

Следствия:

1. Конкретный NPC, G5-узел, предмет или контейнер не обязан быть заранее записан в `world_base`.
2. Код может создать конкретный party instance, если каждый его компонент выводится из активных утверждённых данных.
3. Пустой candidate set является блокировкой, а не разрешением придумать fallback.
4. Игровой запрос, художественная правдоподобность и свободный текст LLM не расширяют candidate set.
5. Созданный экземпляр сохраняется и становится источником истины конкретной партии.

## 2. Уровни данных

Уровни нельзя смешивать:

```text
category → template → profile → rule → instance
```

- **Category** — универсальный допустимый тип: роль, вид предмета, тип якоря, отношение, действие.
- **Template** — универсальная или региональная форма категории с историческими и функциональными параметрами.
- **Profile** — совместимый набор templates, choice sets, limits и component policies.
- **Rule** — условие применения профиля в регионе, G4, времени, сезоне или ситуации.
- **Instance** — конкретный сохранённый объект партии.

`world_base` хранит первые четыре уровня и канонические G0–G4. Party database хранит instances и их изменяемое состояние.

## 3. Архитектурные решения

### D-001. Код не является автором категорий и истории

Код не создаёт неизвестные category/template/profile/rule IDs, исторические события, фигуры, топонимы, социальные институты и региональные факты. Такие данные входят только через редакторский процесс с источниками, статусом и ревизией.

### D-002. Код является материализатором экземпляров

Код создаёт конкретные G5 nodes/edges/anchors, NPC, предметы, контейнеры, отношения, расписания, знания и имущественные связи только из допустимого candidate set.

### D-003. Универсальный и региональный слои обязательны

Универсальная категория не подтверждает историческую применимость. Для материализации требуется активное региональное разрешение, применимое к периоду и контексту.

### D-004. G0–G4 каноничны, G5 принадлежит партии

`world_base.graph_nodes` и `world_base.graph_edges` хранят канонические G0–G4. Конкретный G5 создаётся для стартового G4, при первом фактическом входе в другой G4 либо при явной repair/migration-процедуре.

### D-005. Базовые NPC создаются кодом

Background, scene и key NPC имеют один источник создания: региональные profile sets и G4 rules. Уровень профиля определяет полноту экземпляра, но не меняет источник.

### D-006. Психология разделена на машинную основу и разрешённую конкретизацию

Код выбирает темперамент, цели, страхи, мотивы и decision policy из утверждённых профилей. Для key NPC допускается отдельная override-процедура, ограниченная разрешёнными полями и change-set gate.

### D-007. Случайность детерминирована

Материализация использует versioned `RandomSource`. Seed выводится из canonical input; кандидаты сортируются по стабильному ID; каждый выбор фиксируется в trace. `Math.random` запрещён.

### D-008. Экземпляр не вычисляется заново

Повторный вход, загрузка партии, осмотр или повторный запрос возвращают сохранённое состояние. Изменение `world_base` не рематериализует старую партию автоматически.

### D-009. Обычные изменения выполняет код

Время, состояние тела, износ, расписания, перемещение, доступ, содержимое уже предусмотренного slot, автономные обновления и применение утверждённых последствий рассчитываются кодом.

### D-010. LLM работает только через активный формальный контракт роли

Для closed domain choice код формирует bounded decision request, а LLM возвращает ровно один переданный `option_id` и соответствующий `command_token`.

Для свободной заявки персонажа игрока единственный активный semantic contract — `turn_step_request_v1` → `turn_step_plan_v1` владельца `@rus/turn`. План описывает только следующий исполнимый шаг, direct operations, generic check или domain request из закрытой схемы. Exact registered command имеет приоритет и LLM не вызывает.

Lower Dvina Trace revision 14 дополнительно активирует conversation semantic
path: `player_conversation_contribution_plan_v1` для реплики игрока и
`conversation_contribution_plan_v1` для одного NPC на общей
`npc_decision_boundary_v1`. Revision 15 активирует autonomous NPC semantic
path `npc_action_decision_request_v1` → `npc_step_plan_v1`: один субъективный
план проходит общий actor-step, а activity, movement, items, time и persistence
остаются code-owned. Revision 16 / `spatial-v3-production-v6` активирует
`npc_combat_decision_request_v1` → `npc_combat_intent_plan_v1`, persisted
`combat_session_v1` и player `request_combat`; checks, harm/body, items, time,
perception и atomic persistence остаются code-owned.
Revision 17 / `spatial-v3-production-v7` добавляет Phase 9 без нового semantic
контракта: player step и testimony используют уже активные turn/conversation
contracts, property/container transitions исполняет `@rus/items-property`,
authored evidence graph — `@rus/visibility-knowledge-memory`, а временное
disposition — `@rus/social-law`. Содержимое запечатанного документа и scenario
completion в эту фазу не материализуются.
Revision 18 / `spatial-v3-production-v8` добавляет deterministic Phase 10 без
нового semantic контракта: после отдельного commit Phase 9 pure evaluator
`@rus/visibility-knowledge-memory` читает только committed producers и
возвращает `full|partial|case_open` с точной provenance. Результат и отдельный
player-safe epilogue package сохраняются вторым zero-time P16 commit; narration
идёт после него и не может откатить factual state. LLM, RNG, check, clock/body
write, содержимое запечатанного документа и hidden truth запрещены.

### D-011. Выбор или semantic plan LLM не является последствием

После bounded choice или semantic plan соответствующего player/NPC-режима код заново проверяет schema, operation contract, preconditions, refs и committed state version, выполняет проверки, делегирует domain requests, рассчитывает производные механики и формирует code-owned write plan. Social check определяет только качество подачи/достоверность сообщения и не выбирает решение слушателя. LLM не объявляет исход, не возвращает конечное состояние мира и не применяет собственный patch.

`create_entity` является узким исключением только для ordinary direct action result (`direct_partition`, `ambient_ordinary`, `crafted`) в валидированном semantic plan соответствующего player/NPC-режима. LLM предлагает непосредственную семантику и primitive mechanics конкретного результата, а код проверяет admissibility, origin, refs, placement и inventory invariants и сохраняет отдельный exact runtime mechanics snapshot. Этот путь не разрешает authored, significant, hidden или informational materialization.

### D-012. LLM не пишет в базы

LLM не формирует SQL, имена таблиц, произвольный write plan или patch состояния. Запись выполняется repository/commit-слоем после code gates.

### D-013. Все изменения трассируются

Materialization, bounded decisions, player semantic steps, NPC decision signals/boundaries, conversation contributions, autonomous updates и applied change sets имеют version pins, input/catalog digests, idempotency identity, validation report и ссылки на созданные или изменённые записи. Player semantic trace дополнительно связывает root turn, committed base version, ordered step traces, один optional repair, operation batch и итоговый commit envelope; NPC trace связывает одну boundary одного NPC/same-time batch с не более чем одним LLM-вызовом. Scratchpad, private knowledge другого NPC и скрытые provider payloads не сохраняются как общие факты мира.

### D-014. Пустой authored candidate set блокирует; ordinary action result отделён

Для authored, significant, hidden и informational materialization отсутствие допустимого варианта создаёт диагностируемый gap и hard block. Запрещены ослабление фильтра, выбор запрещённого варианта и создание временного удобного объекта.

Ordinary direct action result не выбирается из authored candidate set и поэтому не превращает его пустоту в fallback. Он допустим только когда действие непосредственно отделяет, изготавливает или конкретизирует обычный доступный материал, проходит code-owned allowlist/admission и получает persisted exact runtime mechanics snapshot. NPC, места, оружие, деньги, письма, улики, container contents, уникальные, ценные, чужие и скрытые объекты этим путём не создаются.

### D-015. Персонаж игрока — явное исключение

LLM-генерация персонажа игрока сохраняется как отдельный утверждённый workflow. Предметы, роли, статусы и знания персонажа всё равно должны ссылаться на допустимые данные и пройти аудит.

### D-016. Старые партии фиксируют версии

Party state хранит world revision, schema, materializer, RNG, command catalog и profile digests. Изменение алгоритма создаёт новую версию, а не меняет существующие экземпляры.

### D-017. Повторная материализация требует отдельной процедуры

Repair/migration обязана указать причину, прежний и новый digest, сохранить историю и пройти тот же commit gate. Обычный runtime не имеет права запустить её неявно.

## 4. Граница ответственности

### 4.1. Редакторский процесс

Создаёт категории, templates, profiles, rules и исторические утверждения; задаёт источники, период, регион, confidence, status и запреты. Неполноту фиксирует как gap.

### 4.2. `world_base`

Хранит активные утверждённые G0–G4, универсальные справочники, региональные разрешения, materialization profiles/rules и decision policies. Runtime имеет только read-only доступ.

### 4.3. Код

Загружает активный bundle, проверяет ссылки и применимость, фильтрует и сортирует candidates, выполняет deterministic choices, создаёт instances, проверяет инварианты, формирует trace/change set/write plan и выполняет commit.

### 4.4. LLM

Допустим для closed bounded decisions, активного player `turn_step_plan_v1`, разрешённой конкретизации key entity, аудита, персонажа игрока и прозы из persisted visible context.

Player step planner получает только player-safe working projection и возвращает следующий шаг по строгой schema. Один structural repair получает исходный request и перечень schema violations, но не новое состояние мира. Код владеет admission, exact fast path, checks, domain routing, working projection, derived mechanics, commit-time revalidation и записью.

LLM не создаёт runtime G5/NPC, authored/significant/hidden items, container contents или party-state patch. Узкий ordinary result из D-011/D-014 становится экземпляром только после code-owned validation и сохранения exact runtime mechanics snapshot. O2b semantic model может конкретизировать только ordinary remainder уже committed container внутри отдельного candidate-free code-owned request; это не player plan и не источник authority. Visible factual projection формирует код; narrator читает её только после commit.

O1 активирует только common ordinary discovery через существующий `request_discovery`: meaningful gate и code-first short circuit предшествуют model call. Candidate-free Stage A строится из committed objective context, запрещает concrete entities и предлагает только density band; versioned code-owned policy переводит `sparse|ordinary|dense` в persisted numeric identity budget. Targeted Stage B имеет `evidence_weight = 0`, а code-owned builder создаёт normalized identity/classification/coverage/policy fields. Normalized discovery query (NFKC, trim, collapse whitespace, ru-RU lowercase) вместе с exact target выводит code-owned candidate identity и передаётся model только как `candidate_hint`; это не noun/recipe gate и не authority. Exact normalized retry использует persisted resolution без reroll, другой normalized query получает другую identity. Один discovery имеет общий лимит двух semantic calls: structural repair расходует оставшийся call; Stage A repair, исчерпавший лимит, приводит к seed-only commit без Stage B. SHA-pinned cutover profile содержит обязательный adversarial Stage B classification eval для weapon, currency, document, evidence, significant/hidden, anachronism и misleading common-looking probes; probes выполняются до profile activation и выпускают versioned approval receipt, связанный с profile digest и exact production provider/model/config identity. Игровой ход только локально проверяет receipt и не повторяет eval calls. Положительный common mundane non-container `man_made` item допускается лишь с independently committed/prepared supporting basis, exact property basis, narrow existing placement и immutable mechanics snapshot в пределах bounded mechanics policy. Preflight `no_change` при исчерпанном budget/cap не создаёт granular resolution; новый Stage A при этом сохраняется отдельным seed-only P16 plan. Model call выполняется вне physical transaction, после чего один P16 commit атомарно фиксирует seed/basis, positive либо negative resolution, item/mechanics/property/placement (при positive), versions и idempotency. Player-safe `ordinary_resolution` capability проецирует только `@rus/visibility-knowledge-memory`; player и narrator видят лишь committed safe projection. O1 не включает O2, A1, F1, S1, N1, template-less runtime containers, context-bound weapons/value/currency или natural finite sources.

Текущая O2a activation поверх O1 discovery включает authored abundant ambient source берега и authored first-entry context-bound finite stock подготовленной глины. Context-bound marker сообщает только `discovery_available`; committed stock виден как обычный source только при отдельном approved disclosure state, а concealed capability остаётся server-only. Expected result, permission и capacity не раскрываются. Stage B свободно конкретизирует unlisted ordinary semantic type/name внутри approved class, но не может менять source/property/permission/mechanics или добавлять facts. Обычный `ambient_ordinary` без capability продолжает legacy direct-action contract. First-entry атомарно provision-ит finite basis, permission/property/placement pins и resource row. Conservation является generic owner-native правилом любого admitted `finite_source`, независимо от `common_mundane` или constrained admission; mutable state загружается по выбранному source ref, поэтому несколько stocks не делят quantity. Constrained policy только добавляет региональные/resource permissions. Restricted weapon/currency/document/other запрос без authored authority сохраняется как code-owned `absent`. Не provisioned precious/remnant profiles остаются fail-closed.

Active A1 revision 21 использует sole player boundary `turn_step_request_v1 → turn_step_plan_v1`: qualitative physical result вложен в `request_item_use`, после чего code-owned owner не вызывает LLM. Один видимый actor-held non-container source и ноль или несколько видимых actor-held/controller-controlled tools могут иметь другого legal owner. Profile не содержит template/recipe whitelist и допускает preserve, finite independent output, no-result, partial/nonworking/waste, writing, non-authoritative token-like и closed weapon-capable outcomes. Code перечитывает committed mechanics/property/placement/ownership, владеет finite conservation и сохраняет всё в combined P16. Model не задаёт numbers, canonical identity, currency/official status, truth или combat mechanics; weapon class получает формальные числа только в `@rus/combat-health`.

### 4.5. Party database

Хранит G5, NPC, предметы, контейнеры, ownership, relations, schedules, knowledge, decisions, change sets, autonomous updates, traces, visible read models и изменяемое состояние партии.

## 5. Контракт materializer v2

Обязательный вход:

```text
party_id
world_revision_id
historical_frame
g1_id
g4_id
catalog_bundle (immutable catalog snapshot)
catalog_digest (exact domain catalog pin)
catalog_bundle_digest (canonical digest применимой immutable projection)
materializer_version
rng_algorithm_id
seed_context
existing_party_state
trigger
```

`catalog_digest` и `catalog_bundle_digest` являются разными идентичностями.
Первый связывает materialization run с approved domain revision/import и
persisted party pin. Второй доказывает неизменность уже проверенной применимой
projection. Подмена одного digest другим запрещена. Legacy input без
`catalog_bundle_digest` допускается только внутри прежнего compatibility
контракта и проверяет `catalog_digest` непосредственно против bundle.

Обязательный результат:

```text
materialization_status
g5_nodes
g5_edges
g5_anchors
npc_instances
item_instances
container_instances
ownership_relations
knowledge_records
schedule_records
materialization_trace
validation_report
proposed_write_set
```

Materializer является чистым относительно persistence. Он не выполняет запись и не читает скрытое глобальное состояние.

Каталог ссылается на будущие экземпляры только через утверждённые `slot_key`: `g5_node_slot_key`, `anchor_slot_key`, `from_anchor_slot_key`, `to_anchor_slot_key` и аналогичные domain-specific ссылки. Instance ID не хранится в authoring catalog: materializer разрешает однозначные slot-ссылки после deterministic selection, блокирует отсутствующие и неоднозначные ссылки и только затем формирует `player_start_position` и schema-qualified `proposed_write_set`.

## 6. Детерминизм и identity

Seed material включает party ID, world revision, G4, trigger, materializer/RNG versions и occurrence. Итоговый seed — SHA-256 canonical JSON. Алгоритм v2 использует `mulberry32_v1` через явный `RandomSource`.

Для каждого выбора сохраняются:

```text
choice_key
candidate_digest
selected_id
rng_counter
selected_weight
rejection_summary
```

Instance ID детерминированно выводится из party, run, domain, slot key и ordinal. Изменение candidate set меняет digest и требует нового осознанного запуска, а не молчаливой замены.

## 7. Материализация G5

Порядок:

1. Проверить отсутствие сохранённого baseline G5.
2. Загрузить применимый G4 profile и binding.
3. Загрузить layout, G5 templates и slot rules.
4. Проверить период, сезон, время, погоду, доступ и состояние G4.
5. Создать обязательные nodes и допустимые optional nodes.
6. Создать edges и проверить связность, входы и выходы.
7. Создать anchors и slots.
8. Материализовать NPC и предметный слой.
9. Проверить capacity, access, visibility, ownership и causal basis.
10. Сформировать trace и единый write set.

Runtime-вход Stage 13 обязан содержать отдельные approved profile, layout, node/anchor/edge templates и slot rules с нормализованными ссылками. Capacity, access, visibility, parent slot и start anchor не выводятся из «типового» значения и не имеют fallback.

Инварианты: принадлежность одному G4, отсутствие G6, существование обязательных входов/выходов, физическая связность, отсутствие anchor без slot, совместимость NPC/items со slot и отсутствие доступа в закрытую зону без разрешённого прохода.

## 8. Материализация NPC

Источники NPC образуют обязательную цепочку:

```text
G4 rule → regional archetype/profile set
→ social role/occupation/legal status
→ demographic/name/appearance
→ clothing/equipment
→ knowledge/behavior
→ activity/schedule/relationship
```

Экземпляр хранит машинные параметры, profile/source refs, причину присутствия, права доступа, route/resource basis и уровень `background|scene|key`. Художественное описание не заменяет данные.

Новый actor независимо от уровня получает полный `actor_base_appearance_v1` в
существующем identity state. Explicit authored values сохраняются без draw;
их applicability заранее ограничивает deterministic prerequisite choices
(например, authored hair style/facial hair ограничивает hair length/sex/age),
а противоречие отклоняется до RNG. Только
отсутствующие facets выбираются из approved/applicable normalized
profile entries, отсортированных по stable ID. Appearance draws выполняются
после прежних materialization choices, а NPC обрабатываются в стабильном
порядке slot/instance keys. Пустой required facet — typed data gap. Runtime LLM
не выбирает внешность NPC. Historical actors не дополняются автоматически.

Повышение профиля использует отдельный deterministic expansion seed, заполняет только отсутствующие поля и не меняет ранее выбранные значения.

## 9. Предметы, контейнеры и имущество

Предмет создаётся только при наличии категории, template/profile, materialization rule, causal basis, допустимого slot, количества и ownership/holder policy. Location, holder, owner, controller, access, visibility, condition, quantity, legal status и container relation хранятся раздельно.

Одежда материализуется тем же item owner, а не отдельным outfit materializer.
Каждый garment имеет реальный item ID, owner/holder/controller, placement и
equipment slot. Exact pinned garment semantics сохраняется в item-owned
immutable visual snapshot; clothing state на actor запрещён.

`portrait_spec_v1` строится только на чтении из committed canonical identity и
server-sanitized visible equipped items. Это player-safe presentation
projection: она не входит в party rows, snapshots, write plans или mutable
cache, не вызывает LLM/RNG и возвращает `null` для incomplete historical или
ambiguous equipment state. Renderer использует поля spec напрямую и не
выбирает внешность hash/RNG.

Содержимое контейнера материализуется один раз при создании контейнера либо при первом причинном раскрытии заранее предусмотренного slot. Заявка игрока не создаёт новый slot.

## 10. Bounded decision protocol

Код сначала исключает невозможные варианты. Каждый option содержит:

```text
option_id
command_token
command_id
actor_id
target_id
preconditions
expected_cost
known_risks
reason_visible_to_actor
state_version
```

Допустимый ответ содержит только `request_id`, один известный `option_id` и точный token. Token связан с request, actor, option, command, policy version, state version и options digest.

Недопустимы неизвестный token, несколько вариантов, свободный текст, SQL, patch, новый план, утверждение результата и ответ на устаревшую версию состояния.

## 11. Автономные обновления, NPC boundaries и базовый ход

Каждое code-only обновление имеет правило, входное состояние, change set, trace, idempotency key и commit gate. Active revision-15 conversation и autonomous paths сводят фактические причины к ровно пяти категориям `self`, `others`, `environment`, `objective`, `communication` и двум уровням `material`, `critical`. Все новые сигналы одного NPC в одном fully resolved same-time batch образуют не более одной boundary и одного LLM-вызова; продолжение намерения и простое восприятие без meaningful response boundary модель не вызывают. Закрытый bounded request остаётся допустим только для genuinely closed domain choice и historical revision, явно выбранной pin.

Первый успешный вход в нематериализованный G4 включает G5 materialization в ту же атомарную транзакцию, что и перемещение. Ошибка либо пустой candidate set отменяют весь переход.

Проверка отсутствующего baseline сериализуется transaction-scoped advisory lock по `(party_id,g4_id)`: блокировка берётся до чтения baseline и защищает также случай, когда строки baseline ещё нет.

## 12. New-game pipeline

- Stage 9 выбирает стартовый узел через bounded protocol.
- Stage 13 кодом создаёт G5 structure и общий run context.
- Stage 14 кодом проверяет G5.
- Stage 15 кодом создаёт NPC, canonical appearance и candidate→instance mapping.
- Stage 16 кодом создаёт items/containers/property, включая реальные initial garments.
- Stage 19 кодом собирает hidden state из уже утверждённых экземпляров.
- Stage 24 кодом строит фиксированный party write plan.
- Stage 25 атомарно фиксирует результат.

Stage 24 не подставляет run/seed/profile/quantity/condition/legal status. Он принимает эти значения только из approved outputs/trace, повторно требует полный appearance contract для новых actors, рекурсивно отклоняет `portrait_spec_v1`, формирует `insert_only` batches для полного нормализованного набора relations и переводит party в `active` внутри того же плана. Stage 25 квалифицирует физические targets схемой `party_runtime` и исполняет их production SQL adapter.

Production-роли `G5SceneMaterializer`, `InitialNpcPlacer`, `InitialItemPlacer` и LLM write-plan builder запрещены.

## 13. Проверки и условие повышения

Обязательны unit/property/integration tests детерминизма, filters, graph connectivity, capacity, ownership, repeat-entry, no-rematerialization, decision tokens, invalid LLM responses, autonomous updates, rollback, full new-game и first-entry turn.

Документ может стать `active` только когда:

```text
все противоречащие active-нормативы исправлены;
DDL, contracts и JSON Schema обновлены;
production Stage 13–16, 19 и 24 переведены на код;
party write path сохраняет trace и version pins;
legacy party v1 не попадает в runtime v2;
generated artifacts актуальны;
полный test suite и PostgreSQL integration проходят;
отдельный агент-критик вернул PASS.
```

## 14. Domain-scoped runtime catalog activation

Полный world pin партии и pin предметно-контейнерного каталога являются
разными identities.

```text
full world pin
= parties.world_revision_id + parties.world_catalog_digest

domain pin
= item_container_materialization_v2 catalog revision
+ catalog digest
+ exact successful import
+ runtime contract
+ compatible world tuple
```

Domain revision не является полной world revision и не может выбираться общим
world-pin selector. Parent tuple фиксирует точный operator snapshot, относительно
которого собран overlay. Compatible world tuple фиксирует полный world pin, с
которым overlay разрешён runtime; равенство этих tuple не предполагается.

Active domain pin читается ровно один раз при создании новой партии, до
композиции Stage 8. Один immutable pin проходит через Stage 8, 13, 14, 16, 24 и
25. Stage 24 включает party pin и run pin в тот же logical write plan, что и
materialization rows, а Stage 25 записывает и проверяет их в одной party
transaction.

Reload, turn и повторный вход читают только persisted party pin и exact
historical import snapshots. Active pointer повторно не читается. Смена active
catalog не меняет существующие партии и не запускает автоматическую
рематериализацию или backfill. Отсутствующий party domain pin является typed
hard block.

Runtime восстанавливает каталог только по exact import membership. Membership
различает:

- `insert` — строка принадлежит overlay и была создана import;
- `assert_existing` — точная каноническая строка уже существовала в parent
  snapshot и была проверена без записи.

Scoped dependency assertion является утверждённым входом только одного
materialization scope. Она хранит точный canonical base-row snapshot и не
создаёт G4, не меняет его canonical status, историческую или пространственную
семантику. Изменение base row после утверждения блокирует использование
assertion.

До materialization runtime обязан fail-closed проверить compatible world tuple,
exact import и runtime contract. Domain pin, import provenance, activation event
и их digests сохраняются в party state и run trace. Неполный pin, несовместимый
tuple, отсутствующее membership или несовпавший digest запрещают запуск
materialization.
