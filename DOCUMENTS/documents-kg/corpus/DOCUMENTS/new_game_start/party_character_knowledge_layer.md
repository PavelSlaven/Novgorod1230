# Слой знаний персонажа в party-базе

Статус: профильный нормативный документ.

Назначение: устранить неоднозначность между цельным результатом Stage 18, нормализованным runtime-состоянием, неизменяемыми снимками и логическим knowledge-batch Stage 24.

## 1. Главное правило

```text
character_knowledge_map
= утверждённый смысловой результат Stage 18

party_character_knowledge_layer
= логический транзакционный слой party-базы

party_character_knowledge_maps
= корневая таблица версий карты знаний

party_character_known_*
= нормализованное текущее runtime-состояние

party_character_knowledge_snapshots
= неизменяемые снимки результата Stage 18, precheck и audit
```

`character_knowledge_map` не является названием физической таблицы party-базы.

`party_character_knowledge_layer` не является одной физической таблицей. Это атомарная группа связанных записей.

## 2. Источники истины

### 2.1. До initial commit

В конвейере новой игры источником утверждённого знания является:

```text
approved character_knowledge_map
+ character_knowledge_map_code_precheck.pass=true
+ character_knowledge_map_audit.pass=true
```

Stage 19–23 получают этот утверждённый объект напрямую через собственный изолированный input.

### 2.2. После initial commit

Во время базового хода источником текущего игрового состояния являются нормализованные таблицы `party_character_known_*`, связанные с текущей записью `party_character_knowledge_maps`.

### 2.3. Для аудита и воспроизведения

`party_character_knowledge_snapshots` хранит неизменяемый JSON утверждённого Stage 18 и его технические доказательства. Snapshot не используется как mutable runtime-state.

## 3. Корневая таблица версий

Физическая таблица:

```text
party_character_knowledge_maps
```

Обязательные поля:

```text
knowledge_map_id
party_id
player_character_id
map_version
knowledge_status
map_detail_level
route_knowledge_level
social_knowledge_level
danger_knowledge_level
confidence_profile
current_position_ref
status
is_current
created_at
approved_at
source_stage
snapshot_id
```

Обязательные ограничения:

```text
PRIMARY KEY (knowledge_map_id)
FOREIGN KEY (party_id)
FOREIGN KEY (player_character_id)
UNIQUE (player_character_id, map_version)
UNIQUE current map per player_character_id where is_current=true
status in pending | current | superseded | invalid
```

До завершения всей knowledge-проекции корневая запись имеет:

```text
status = pending
is_current = false
```

Она становится текущей только после проверки projection manifest.

## 4. Неизменяемый snapshot

Физическая таблица:

```text
party_character_knowledge_snapshots
```

Обязательные поля:

```text
knowledge_snapshot_id
knowledge_map_id
party_id
player_character_id
schema_name
schema_version
stage_output_json
code_precheck_json
audit_json
write_projection_json
repair_history_json
content_hash
created_at
```

Ограничения:

```text
UNIQUE (knowledge_map_id)
content_hash NOT NULL
snapshot immutable after insert
stage_output_json.schema = character_knowledge_map
```

Snapshot обязан сохранять исходный утверждённый объект, а не реконструкцию из runtime-таблиц.

## 5. Нормализованное runtime-состояние

Физические группы:

```text
party_character_known_routes
party_character_known_places
party_character_known_addresses
party_character_known_landmarks
party_character_known_people
party_character_known_authorities
party_character_known_dangers
party_character_known_social_rules
party_character_known_resources
party_character_rumors
party_character_mistaken_beliefs
party_character_uncertain_knowledge
party_character_forbidden_knowledge
party_character_knowledge_gaps
party_player_character_knowledge_boundary
```

Каждая смысловая запись обязана содержать:

```text
knowledge_record_id
knowledge_map_id
party_id
player_character_id
basis_type
basis_ref nullable
source_trace_ref or inherited_source_trace_ref
confidence
precision_level
is_active
acquired_at
last_confirmed_at nullable
superseded_at nullable
```

Каждая запись должна ссылаться на `party_character_knowledge_maps.knowledge_map_id`.

## 6. Nearby paths

`known_nearby_paths` не получает отдельную таблицу.

Физическая проекция:

```text
character_knowledge_map.known_nearby_paths
→ party_character_known_routes
→ knowledge_kind = nearby_path
```

Допустимые значения:

```text
knowledge_kind = route | nearby_path | immediate_exit
```

Это предотвращает дублирование route/edge, confidence, basis и navigation-полей.

## 7. Projection manifest

Stage 18 формирует декларативный `character_knowledge_write_projection`. Stage 24 преобразует его в физические write batches по переданному `party_database_schema_snapshot`.

Обязательный manifest:

```json
{
  "schema": "character_knowledge_projection_manifest",
  "source_content_hash": "string",
  "expected_counts": {},
  "expected_record_keys": [],
  "group_hashes": {},
  "requires_snapshot": true,
  "requires_root_record": true,
  "requires_current_switch_after_validation": true
}
```

После раскладки Stage 24 обязан сформировать:

```json
{
  "knowledge_projection_validation": {
    "source_hash": "string",
    "normalized_hash": "string",
    "expected_counts": {},
    "actual_counts": {},
    "missing_records": [],
    "extra_records": [],
    "broken_source_traces": [],
    "pass": true
  }
}
```

Нельзя считать проекцию успешной только потому, что все insert-операции технически выполнились.

## 8. Порядок атомарной записи knowledge layer

```text
1. insert party_character_knowledge_maps as pending/non-current
2. insert party_character_knowledge_snapshots
3. insert party_character_known_routes
4. insert party_character_known_places
5. insert party_character_known_addresses
6. insert party_character_known_landmarks
7. insert party_character_known_people
8. insert party_character_known_authorities
9. insert party_character_known_dangers
10. insert party_character_known_social_rules
11. insert party_character_known_resources
12. insert party_character_rumors
13. insert party_character_mistaken_beliefs
14. insert party_character_uncertain_knowledge
15. insert party_character_forbidden_knowledge
16. insert party_character_knowledge_gaps
17. insert party_player_character_knowledge_boundary
18. validate counts, hashes, refs and source traces
19. supersede previous current version if one exists
20. mark new root status=current and is_current=true
```

Весь порядок выполняется внутри общей атомарной транзакции запуска партии.

## 9. Lifecycle знаний после старта

Допустимые операции:

```text
insert
confirm
supersede
invalidate
reclassify
reveal
expire
```

Физическое удаление утверждённого знания запрещено, кроме административной очистки незафиксированного failed draft.

Изменение знания создаёт новую запись или новую версию состояния. Предыдущая запись становится `is_active=false` и получает `superseded_at` или статус invalidated.

## 10. Runtime read model

Код может собирать ограниченный read model:

```text
buildCurrentCharacterKnowledgeView(party_id, player_character_id)
```

Функция:

```text
читает только current knowledge_map_id;
читает только active normalised records;
не создаёт новых знаний;
не повышает confidence;
не превращает rumor в fact;
не раскрывает forbidden knowledge;
не использует immutable snapshot как mutable state.
```

Результат может передаваться изолированным блокам базового хода как строго определённый input.

## 11. Commit gate invariants

Commit запрещён, если:

```text
нет root record;
нет immutable snapshot;
snapshot hash не совпадает с approved Stage 18 output;
projection incomplete;
есть extra normalized record;
knowledge_map_id расходится;
есть более одной current map;
source trace не разрешается;
rumor записан как fact;
mistaken belief записан как fact;
forbidden knowledge попало в player-visible слой;
known_nearby_paths отображены не как knowledge_kind=nearby_path.
```

Канонические error codes:

```text
COMMIT_GATE_KNOWLEDGE_ROOT_MISSING
COMMIT_GATE_KNOWLEDGE_SNAPSHOT_MISSING
COMMIT_GATE_KNOWLEDGE_SNAPSHOT_HASH_MISMATCH
COMMIT_GATE_KNOWLEDGE_PROJECTION_INCOMPLETE
COMMIT_GATE_KNOWLEDGE_PROJECTION_EXTRA_RECORD
COMMIT_GATE_KNOWLEDGE_MAP_ID_MISMATCH
COMMIT_GATE_MULTIPLE_CURRENT_KNOWLEDGE_MAPS
COMMIT_GATE_KNOWLEDGE_SOURCE_TRACE_BROKEN
COMMIT_GATE_NEARBY_PATH_MAPPING_INVALID
```

## 12. Граница ответственности этапов

```text
Stage 18:
создаёт и аудирует смысловую карту;
возвращает write_projection;
не пишет live party state.

Stage 20–23 до commit:
используют approved character_knowledge_map.

Stage 24:
формирует физический party_db_write_plan;
создаёт knowledge projection validation;
не исполняет транзакцию.

Stage 25:
валидирует план;
выполняет dry-run;
выполняет атомарный commit;
проверяет postcommit invariants.

Stage 26:
читает только committed public/read models;
показывает первый игровой экран.
```
