# Архитектура кодовой материализации мира

**Статус:** canonical normative; active; высший норматив по материализации и разделению ответственности кода/LLM
**Версия:** 1.0.0
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

### D-010. LLM выбирает только из закрытого набора

Если правила не определяют сложное решение однозначно, код формирует bounded decision request. LLM возвращает ровно один переданный `option_id` и соответствующий `command_token`.

### D-011. Выбор LLM не является последствием

После выбора код заново проверяет preconditions и state version, выполняет проверки, рассчитывает consequence и формирует change set. LLM не объявляет исход и не возвращает конечное состояние мира.

### D-012. LLM не пишет в базы

LLM не формирует SQL, имена таблиц, произвольный write plan или patch состояния. Запись выполняется repository/commit-слоем после code gates.

### D-013. Все изменения трассируются

Materialization, bounded decisions, autonomous updates и applied change sets имеют version pins, input/catalog digests, idempotency key, validation report и ссылки на созданные или изменённые записи.

### D-014. Пустой набор блокирует

Отсутствие допустимого варианта создаёт диагностируемый gap и hard block. Запрещены ослабление фильтра, выбор запрещённого варианта и создание временного удобного объекта.

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

Допустим для bounded decisions, разрешённой конкретизации key entity, аудита, персонажа игрока и прозы из visible context. Он не создаёт runtime G5/NPC/items и не изменяет party state.

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

Повышение профиля использует отдельный deterministic expansion seed, заполняет только отсутствующие поля и не меняет ранее выбранные значения.

## 9. Предметы, контейнеры и имущество

Предмет создаётся только при наличии категории, template/profile, materialization rule, causal basis, допустимого slot, количества и ownership/holder policy. Location, holder, owner, controller, access, visibility, condition, quantity, legal status и container relation хранятся раздельно.

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

## 11. Автономные обновления и базовый ход

Каждое code-only обновление имеет правило, входное состояние, change set, trace, idempotency key и commit gate. Если требуется неоднозначное решение NPC, создаётся bounded request; после ответа последствия рассчитывает код.

Первый успешный вход в нематериализованный G4 включает G5 materialization в ту же атомарную транзакцию, что и перемещение. Ошибка либо пустой candidate set отменяют весь переход.

Проверка отсутствующего baseline сериализуется transaction-scoped advisory lock по `(party_id,g4_id)`: блокировка берётся до чтения baseline и защищает также случай, когда строки baseline ещё нет.

## 12. New-game pipeline

- Stage 9 выбирает стартовый узел через bounded protocol.
- Stage 13 кодом создаёт G5 structure и общий run context.
- Stage 14 кодом проверяет G5.
- Stage 15 кодом создаёт NPC.
- Stage 16 кодом создаёт items/containers/property.
- Stage 19 кодом собирает hidden state из уже утверждённых экземпляров.
- Stage 24 кодом строит фиксированный party write plan.
- Stage 25 атомарно фиксирует результат.

Stage 24 не подставляет run/seed/profile/quantity/condition/legal status. Он принимает эти значения только из approved outputs/trace, формирует `insert_only` batches для полного нормализованного набора relations и переводит party в `active` внутри того же плана. Stage 25 квалифицирует физические targets схемой `party_runtime` и исполняет их production SQL adapter.

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
