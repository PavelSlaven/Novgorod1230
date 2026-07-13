# Процедурная карта запуска новой игры: входы и выходы этапов

Статус: процедурная спецификация  
Папка: `DOCUMENTS/documents-kg/corpus/DOCUMENTS/new_game_start`  
Назначение: зафиксировать общий контракт конвейера новой игры: какой блок какие данные получает, что возвращает и чего не имеет права делать.

Этот документ не заменяет отдельные нормативные документы этапов `1.txt`–`26.txt` и профиль `party_character_knowledge_layer.md`. Если есть расхождение, приоритет имеет профильный документ конкретного этапа. Документ нужен как общая карта входов/выходов и как техническая опора для реализации конвейера.

---

## 0. Общие правила конвейера

### 0.1. Изолированный блок

Каждый этап новой игры является изолированным блоком.

```text
этап = строго определённый вход → независимая обработка → строго определённый выход
```

Этап не должен читать глобальное состояние напрямую, не должен знать о внутренней реализации других этапов и не должен обращаться к внешним данным, если эти данные не переданы ему как часть входного пакета.

### 0.2. Разделение ответственности кода и LLM

```text
LLM создаёт, выбирает, проверяет и формулирует смысловые данные.
Код читает, передаёт, валидирует структуру, хранит и фиксирует утверждённые данные.
```

Код не создаёт мир, персонажей, причины, связи, предметы, исторические смыслы и последствия. Любая новая смысловая сущность появляется только как утверждённый результат LLM-процедуры или как выбранный элемент из разрешённого набора кандидатов.

### 0.3. Candidate set вместо свободного сочинения

Если этап должен выбрать регион, место, тип места, NPC, предметный профиль, стартовый узел или маршрут, он выбирает только из заранее переданного candidate set.

```text
код подбирает допустимый набор → LLM выбирает/обосновывает → аудит проверяет → только потом данные идут дальше
```

### 0.4. Нет записи в party state до write plan и commit

До этапов `24–25` pipeline не пишет стартовый мир в party-базу. Ранние этапы могут писать только технический лог, диагностический статус, raw/normalized request и validation issues, если это разрешено runtime.

Запрещено до commit:

```text
party_state
party_current_position
party_player_characters
party_npcs
party_items
party_scene_anchors
party_events
```

### 0.5. Repair и блокировка

Если этап возвращает невалидный результат, pipeline не должен молча подставлять заглушку. Ошибка возвращается на repair с передачей:

```text
stage_input
previous_output
validation_errors
audit_errors
repair_history
forbidden_changes
```

Если repair не проходит лимит попыток, pipeline блокируется со статусом:

```text
stage_failed | needs_manual_review | needs_higher_level_rebuild
```

---

## 1. Сводная таблица этапов

| № | Этап | Исполнитель | Вход | Выход | Главный запрет |
|---:|---|---|---|---|---|
| 1 | Заявка игрока | UI / code | свободный ввод и UI-поля | `new_game_raw_request` | не трактовать желание игрока как факт мира |
| 2 | Нормализация заявки | LLM | `new_game_raw_request` | `new_game_normalized_request` | не выбирать мир, место, персонажа, NPC, предметы |
| 3 | Выбор исторической рамки | LLM + gate | `normalized_request`, frame candidates | `historical_frame` | не создавать сцену и NPC |
| 4 | Загрузка регионального контекста | code-only | `historical_frame` | `regional_context_package` | не сочинять отсутствующие записи базы |
| 5 | Подбор стартовых G1–G4 кандидатов | code-only | `historical_frame`, `regional_context_package`, `normalized_request` | `start_node_candidates` | не выбирать один стартовый узел |
| 6 | Подбор place templates | code-only | `start_node_candidates`, regional place rules | `allowed_place_template_set` | не создавать место вне правил региона |
| 7 | Подбор NPC-кандидатов | code-only | regional roles, occupations, NPC pools, start candidates | `npc_candidate_set` | не создавать конкретных NPC |
| 8 | Подбор предметных профилей | code-only | place templates, item/container/property rules | `item_profile_package` | не создавать конкретные предметы |
| 9 | Выбор стартового узла | LLM | candidate set stages 3–8 | `start_node_selection` | не выбирать вне candidate set |
| 10 | Аудит стартового места | code + optional LLM | `start_node_selection`, candidates, frame | `start_node_audit` | не исправлять выбор молча |
| 11 | Генерация персонажа | LLM | frame, selected node, regional roles, request | `player_character_dossier` | не создавать персонажа вне рамки и статуса |
| 12 | Аудит персонажа | LLM semantic auditor + code gate | character dossier, frame, rules | `player_character_audit` | не пропускать исторически невозможное |
| 13 | Материализация G5-сцены | LLM | selected G4/G3, templates, character, frame | `g5_scene_package` | не создавать anchors вне допустимых G5-шаблонов |
| 14 | Аудит G5-сцены | LLM semantic auditor + code gate | `g5_scene_package`, rules | `g5_scene_audit` | не пропускать невозможные проходы/anchors |
| 15 | Размещение стартовых NPC | LLM | scene, NPC candidates, frame, character | `initial_npc_package` | не брать NPC вне кандидатов и ролей |
| 16 | Размещение стартовых предметов | LLM | scene, item profiles, containers, property rules | `initial_item_package` | не создавать предмет из желания игрока |
| 17 | Проверка времени и света | code gate + optional LLM audit | frame, weather, scene, prose-intent data | `time_light_gate_result` | не допускать конфликт времени/света/видимости |
| 18 | Карта знаний персонажа | изолированный LLM-блок: Builder/Auditor/Repair | `character_knowledge_map_input` | `character_knowledge_map_stage_result` | не давать скрытое знание и не писать live party-state |
| 19 | Hidden state | LLM | full approved start data + approved knowledge map | `hidden_state_package` | не выводить hidden в player-facing слой |
| 20 | Visible context package | LLM visibility agent | hidden state, character knowledge, current position | `visible_context_package` | не пропускать hidden leaks |
| 21 | Аудит visible context | LLM/code gate | visible context + hidden reference for audit | `visible_context_audit` | не раскрывать скрытые мотивы, предметы, даты |
| 22 | Narrator prose | LLM prose agent | visible context only | `narrator_prose_package` | не получать hidden state |
| 23 | Аудит narrator prose | LLM/code gate | prose, visible context, forbidden leaks | `narrator_prose_audit` | не пропускать hidden leak и новые факты |
| 24 | DB write plan + independent audit | code + LLM structuring/audit | all approved stage outputs + schema snapshot | `party_db_write_plan` + audit | не писать напрямую, только план записи |
| 25 | Commit gate + atomic commit | code-only | approved write plan, audit, schemas, references | `party_start_committed` | не менять смысл, не допускать partial commit |
| 26 | Первый игровой экран | code/UI | committed public/read models + approved prose | `first_game_screen` | не показывать hidden/snapshot/raw diagnostics |

---

# 2. Подробные контракты этапов

## Этап 1. Заявка игрока

### Назначение

Получить свободный ввод игрока и UI-поля старта новой партии. На этом этапе игрок выражает желание, а не создаёт факт мира.

### Вход

```json
{
  "player_text": "string",
  "ui_fields": {
    "era": "string | null",
    "region": "string | null",
    "character_type": "string | null",
    "start_place": "string | null",
    "tone": "string | null",
    "difficulty": "string | null",
    "additional_constraints": "string | null"
  },
  "client_defaults": {
    "language": "string",
    "allow_random_if_missing": true,
    "default_unknown_policy": "random"
  }
}
```

### Выход

```json
{
  "version": 1,
  "schema": "new_game_raw_request",
  "request_id": "string",
  "player_text": "string",
  "ui_fields": {},
  "client_defaults": {}
}
```

### Запрещено

```text
создавать персонажа;
выбирать регион;
выбирать стартовое место;
создавать цель, конфликт, NPC, предмет или сцену;
записывать party_state.
```

---

## Этап 2. Нормализация заявки

### Назначение

Преобразовать свободный текст и UI-поля в структурированный запрос `new_game_normalized_request`.

### Вход

```json
{
  "version": 1,
  "schema": "new_game_raw_request",
  "request_id": "string",
  "player_text": "string",
  "ui_fields": {
    "era": "string | null",
    "region": "string | null",
    "character_type": "string | null",
    "start_place": "string | null",
    "tone": "string | null",
    "difficulty": "string | null",
    "additional_constraints": "string | null"
  },
  "client_defaults": {
    "language": "string",
    "allow_random_if_missing": true,
    "default_unknown_policy": "random"
  }
}
```

### Выход

```json
{
  "version": 1,
  "schema": "new_game_normalized_request",
  "request_id": "string",
  "language": "ru",
  "start_mode": "new_party",
  "player_intent_summary": "string",
  "era_request": {},
  "year_request": {},
  "season_request": {},
  "time_of_day_request": {},
  "region_request": {},
  "start_place_request": {},
  "character_request": {
    "type": "string | null",
    "status": "string | null",
    "occupation": "string | null",
    "wealth": "string | null",
    "gender": "string | null",
    "age_band": "string | null",
    "selection_mode": "explicit | random | constrained_random | inferred | unresolved",
    "source": "ui_field | player_text | explicit_player_random | missing | inferred_from_text",
    "confidence": "low | medium | high",
    "notes": "string | null"
  },
  "tone_request": {},
  "difficulty_request": {},
  "hard_constraints": [],
  "soft_preferences": [],
  "forbidden_content": [],
  "unknowns_to_resolve": [],
  "requires_clarification": false,
  "clarification_questions": [],
  "audit": {
    "pass": true,
    "concerns": [],
    "evidence": []
  }
}
```

### Запрещено

```text
выбирать конкретный регион без candidate set;
выбирать конкретное место;
создавать персонажа;
создавать NPC;
создавать предметы;
создавать стартовую сцену;
превращать random в конкретное значение.
```

---

## Этап 3. Выбор исторической рамки

### Назначение

Зафиксировать год, сезон, время суток, регион и историко-социальную рамку партии. Этап не создаёт сцену.

### Вход

```json
{
  "normalized_request": "new_game_normalized_request",
  "available_era_policy": {
    "min_year": 1230,
    "max_year": 1250,
    "allowed_regions_source": "world_regions.txt"
  },
  "historical_frame_candidates": [
    {
      "year": "number",
      "season": "spring | summer | autumn | winter",
      "time_of_day": "morning | day | evening | night | deep_night",
      "region_id": "string",
      "reason": "string"
    }
  ]
}
```

### Выход

```json
{
  "schema": "new_game_historical_frame",
  "request_id": "string",
  "year": "number",
  "season": "spring | summer | autumn | winter",
  "time_of_day": "morning | day | evening | night | deep_night",
  "region_id": "string",
  "political_context": {},
  "social_context": {},
  "historical_pressure": [],
  "material_culture_limits": [],
  "audit": {
    "pass": true,
    "concerns": [],
    "evidence": []
  }
}
```

### Запрещено

```text
создавать место;
создавать NPC;
создавать предметы;
создавать стартовую прозу;
выбирать регион вне разрешённого списка.
```

---

## Этап 4. Загрузка регионального контекста из world_base

### Назначение

Код загружает из read-only базы региональные данные, нужные для последующих этапов. Это code-only этап.

### Вход

```json
{
  "historical_frame": "new_game_historical_frame",
  "normalized_request": "new_game_normalized_request",
  "world_base_sources": [
    "regions",
    "timeline",
    "region_social_roles",
    "region_occupations",
    "region_place_templates",
    "route_templates",
    "weather_rules",
    "item_profiles",
    "npc_pools",
    "graph_nodes",
    "graph_edges"
  ]
}
```

### Выход

```json
{
  "schema": "regional_context_package",
  "region_profile": {},
  "timeline_context": [],
  "social_roles": [],
  "occupations": [],
  "place_rules": [],
  "route_rules": [],
  "weather_rules": [],
  "item_profiles": [],
  "npc_pools": [],
  "graph_context_summary": {},
  "retrieval_audit": {
    "missing_required_sources": [],
    "usable_with_caution": [],
    "pass": true
  }
}
```

### Запрещено

```text
достраивать отсутствующие записи базы;
выбирать стартовое место;
создавать персонажа или сцену;
подменять пустую базу процедурной догадкой.
```

---

## Этап 5. Подбор допустимых стартовых G1–G4 кандидатов

### Назначение

Код подбирает набор допустимых стартовых узлов из карты и региональных ограничений. Он не выбирает один узел.

### Вход

```json
{
  "historical_frame": {},
  "normalized_request": {},
  "regional_context_package": {},
  "graph_nodes": [],
  "graph_edges": [],
  "start_policy": {
    "allowed_scales": ["G1", "G2", "G3", "G4"],
    "must_match_region": true,
    "respect_player_constraints": true
  }
}
```

### Выход

```json
{
  "schema": "start_node_candidates",
  "candidates": [
    {
      "candidate_id": "string",
      "graph_node_id": "string",
      "scale_level": "G1 | G2 | G3 | G4",
      "region_id": "string",
      "place_id": "string | null",
      "location_id": "string | null",
      "allowed_reason": "string",
      "constraint_matches": [],
      "known_risks": []
    }
  ],
  "rejected_candidates_summary": [],
  "audit": {
    "pass": true,
    "concerns": []
  }
}
```

### Запрещено

```text
создавать новый graph_node;
выбирать один кандидат;
создавать G5-сцену;
создавать NPC или предметы.
```

---

## Этап 6. Подбор допустимых place templates

### Назначение

Подтянуть только те типы мест, которые разрешены для региона и подходят к кандидатам старта.

### Вход

```json
{
  "start_node_candidates": {},
  "regional_context_package": {},
  "region_place_templates": [],
  "normalized_request": {}
}
```

### Выход

```json
{
  "schema": "allowed_place_template_set",
  "candidate_place_templates": [
    {
      "candidate_id": "string",
      "place_template_id": "string",
      "title": "string",
      "allowed_scale_levels": [],
      "allowed_node_types": [],
      "limits": "string",
      "reason": "string"
    }
  ],
  "audit": {
    "pass": true,
    "concerns": []
  }
}
```

### Запрещено

```text
создавать новый place_template;
создавать конкретное место;
выбирать стартовый узел;
создавать G5 anchors.
```

---

## Этап 7. Подбор допустимых NPC-кандидатов

### Назначение

Сформировать ограниченный набор возможных NPC-ролей, архетипов, занятий и именных пулов для будущего размещения.

### Вход

```json
{
  "historical_frame": {},
  "regional_context_package": {},
  "start_node_candidates": {},
  "allowed_place_template_set": {},
  "social_roles": [],
  "occupations": [],
  "npc_pools": []
}
```

### Выход

```json
{
  "schema": "npc_candidate_set",
  "npc_candidates": [
    {
      "npc_candidate_id": "string",
      "role_id": "string | null",
      "occupation_id": "string | null",
      "npc_archetype_id": "string | null",
      "allowed_place_template_ids": [],
      "allowed_scene_functions": [],
      "limits": "string"
    }
  ],
  "audit": {
    "pass": true,
    "concerns": []
  }
}
```

### Запрещено

```text
создавать конкретного NPC;
назначать имя, биографию, скрытый мотив;
размещать NPC на сцене.
```

---

## Этап 8. Подбор допустимых предметных профилей

### Назначение

Подтянуть item/container/property rules для выбранных типов мест. Предметы ещё не создаются.

### Вход

```json
{
  "historical_frame": {},
  "regional_context_package": {},
  "allowed_place_template_set": {},
  "item_profiles": [],
  "container_profiles": [],
  "property_rules": []
}
```

### Выход

```json
{
  "schema": "item_profile_package",
  "allowed_item_profiles": [],
  "allowed_container_profiles": [],
  "property_rules": [],
  "place_template_bindings": [],
  "audit": {
    "pass": true,
    "concerns": []
  }
}
```

### Запрещено

```text
создавать конкретный item;
создавать контейнер с содержимым;
создавать имущество персонажа;
добавлять предмет из заявки игрока.
```

---

## Этап 9. LLM выбирает стартовый узел из candidate set

### Назначение

LLM выбирает один стартовый узел только из подготовленного набора кандидатов и объясняет выбор.

### Вход

```json
{
  "normalized_request": {},
  "historical_frame": {},
  "regional_context_package_summary": {},
  "start_node_candidates": {},
  "allowed_place_template_set": {},
  "npc_candidate_set_summary": {},
  "item_profile_package_summary": {}
}
```

### Выход

```json
{
  "schema": "start_node_selection",
  "selected_candidate_id": "string",
  "selected_graph_node_id": "string",
  "selected_scale_level": "G1 | G2 | G3 | G4",
  "selected_place_template_id": "string | null",
  "selection_reason": "string",
  "fit_to_player_request": "string",
  "known_limitations": [],
  "audit_self_check": {
    "chosen_from_candidate_set": true,
    "created_new_place": false,
    "created_npc": false,
    "created_item": false
  }
}
```

### Запрещено

```text
выбирать узел вне candidate set;
создавать место, NPC, предмет или сцену;
менять historical_frame.
```

---

## Этап 10. Аудит выбора стартового места

### Назначение

Проверить, что выбранный стартовый узел существует в кандидатах, соответствует региону, сезону, времени, заявке игрока и правилам места.

### Вход

```json
{
  "start_node_selection": {},
  "start_node_candidates": {},
  "allowed_place_template_set": {},
  "historical_frame": {},
  "normalized_request": {}
}
```

### Выход

```json
{
  "schema": "start_node_audit",
  "pass": true,
  "selected_candidate_id": "string",
  "validated_graph_node_id": "string",
  "validated_place_template_id": "string | null",
  "concerns": [],
  "evidence": [],
  "repair_required": false
}
```

### Запрещено

```text
исправлять выбор незаметно;
заменять candidate_id без нового выбора LLM;
пропускать отсутствующий или неподходящий узел.
```

---

## Этап 11. Генерация персонажа игрока

### Назначение

LLM создаёт персонажа внутри выбранной рамки: происхождение, статус, тело, навыки, вещи, знания, цель, ограничения и причины нахождения в стартовой сцене.

### Вход

```json
{
  "normalized_request": {},
  "historical_frame": {},
  "start_node_selection": {},
  "start_node_audit": {},
  "regional_context_package": {},
  "social_roles": [],
  "occupations": [],
  "item_profile_package": {},
  "character_generation_rules": {}
}
```

### Выход

```json
{
  "schema": "player_character_dossier",
  "character_core": {
    "name_or_label": "string",
    "age_band": "string",
    "gender": "string | null",
    "origin": "string",
    "social_status": "string",
    "occupation_or_habitual_life": "string",
    "reason_here_now": "string"
  },
  "body_state": {},
  "attributes": {},
  "skills": [],
  "knowledge_seed": [],
  "inventory_seed": [],
  "property_links_seed": [],
  "relationships_seed": [],
  "goals_and_constraints": [],
  "audit_self_check": {}
}
```

### Запрещено

```text
создавать персонажа вне historical_frame;
давать невозможный статус или предметы;
выдавать знание, которого персонаж не мог иметь;
создавать готовую стартовую сцену вместо досье.
```

---

## Этап 12. Аудит персонажа

### Назначение

Проверить историчность, социальную допустимость, связь имущества со статусом, баланс характеристик и причинность биографии.

### Вход

```json
{
  "player_character_dossier": {},
  "historical_frame": {},
  "regional_context_package": {},
  "start_node_selection": {},
  "character_rules": {},
  "item_profile_package": {}
}
```

### Выход

```json
{
  "schema": "player_character_audit",
  "pass": true,
  "concerns": [],
  "evidence": [],
  "repair_required": false,
  "approved_character_dossier": {}
}
```

### Запрещено

```text
пропускать социально невозможные статусы;
молча исправлять биографию;
превращать аудит в новую генерацию персонажа без repair-loop.
```

---

## Этап 13. Материализация стартовой G5-сцены

### Назначение

LLM разворачивает выбранную G4/G3-локацию в минилокации и G5-якоря только по допустимым шаблонам.

### Вход

```json
{
  "historical_frame": {},
  "start_node_selection": {},
  "approved_character_dossier": {},
  "regional_context_package": {},
  "allowed_g5_scene_templates": [],
  "place_template_rules": [],
  "movement_rules": {}
}
```

### Выход

```json
{
  "schema": "g5_scene_package",
  "current_position_seed": {
    "region_id": "string",
    "place_id": "string | null",
    "location_id": "string | null",
    "minilocation_id": "string",
    "anchor_id": "string"
  },
  "minilocations": [],
  "scene_anchors": [],
  "scene_edges": [],
  "visible_environment_seed": [],
  "closed_or_hidden_zones_seed": [],
  "risk_seed": [],
  "audit_self_check": {}
}
```

### Запрещено

```text
создавать G5-якоря вне допустимых шаблонов;
телепортировать персонажа;
создавать NPC и предметы, кроме фоновых категорий среды;
скрывать отсутствие физического прохода.
```

---

## Этап 14. Аудит G5-сцены

### Назначение

Проверить допустимость anchors, проходов, закрытых зон, видимых объектов, рисков и позиции персонажа.

### Вход

```json
{
  "g5_scene_package": {},
  "start_node_selection": {},
  "historical_frame": {},
  "allowed_g5_scene_templates": [],
  "movement_rules": {},
  "place_template_rules": []
}
```

### Выход

```json
{
  "schema": "g5_scene_audit",
  "pass": true,
  "concerns": [],
  "evidence": [],
  "repair_required": false,
  "approved_g5_scene_package": {}
}
```

### Запрещено

```text
пропускать несуществующие связи;
пропускать невозможную видимость;
молча заменять сцену без repair.
```

---

## Этап 15. Размещение стартовых NPC

### Назначение

LLM выбирает и размещает стартовых NPC только из допустимых региональных ролей, архетипов и NPC-кандидатов.

### Вход

```json
{
  "approved_g5_scene_package": {},
  "approved_character_dossier": {},
  "historical_frame": {},
  "npc_candidate_set": {},
  "regional_context_package": {},
  "scene_social_needs": []
}
```

### Выход

```json
{
  "schema": "initial_npc_package",
  "npcs": [
    {
      "npc_id_seed": "string",
      "source_candidate_id": "string",
      "profile_level": "background | scene | key",
      "visible_label": "string",
      "role": "string",
      "current_anchor_id": "string",
      "visible_state": "string",
      "known_to_character": "string | null",
      "hidden_profile": "object | null",
      "interaction_limits": []
    }
  ],
  "audit_self_check": {}
}
```

### Запрещено

```text
создавать NPC вне candidate set;
размещать NPC вне существующих anchors;
раскрывать hidden_profile в visible layer;
создавать NPC без социальной причины быть в сцене.
```

---

## Этап 16. Размещение стартовых предметов

### Назначение

LLM материализует причинно обоснованные предметы, контейнеры и имущественные связи из допустимых профилей места.

### Вход

```json
{
  "approved_g5_scene_package": {},
  "approved_character_dossier": {},
  "initial_npc_package": {},
  "item_profile_package": {},
  "historical_frame": {},
  "property_rules": []
}
```

### Выход

```json
{
  "schema": "initial_item_package",
  "visible_items": [],
  "hidden_items": [],
  "containers": [],
  "character_inventory": [],
  "property_links": [],
  "ownership_and_access_rules": [],
  "audit_self_check": {}
}
```

### Запрещено

```text
создавать предмет из заявки игрока;
создавать предмет вне item/container/property profiles;
создавать невозможное имущество;
раскрывать скрытые предметы в visible layer.
```

---

## Этап 17. Проверка времени и света

### Назначение

Проверить согласованность `clock`, `season`, `weather`, `light`, видимости и сцены.

### Вход

```json
{
  "historical_frame": {},
  "approved_g5_scene_package": {},
  "initial_npc_package": {},
  "initial_item_package": {},
  "weather_rules": [],
  "time_rules": []
}
```

### Выход

```json
{
  "schema": "time_light_gate_result",
  "pass": true,
  "clock": {},
  "season": "string",
  "weather": {},
  "light": {},
  "visibility_limits": [],
  "required_scene_adjustments": [],
  "concerns": [],
  "evidence": []
}
```

### Запрещено

```text
допускать ночную сцену как дневную;
показывать невидимые объекты без источника света;
менять historical_frame без возврата на repair.
```

---

## Этап 18. Формирование карты знаний персонажа

### Назначение

Изолированный блок формирует только знания конкретного персонажа и возвращает утверждённый смысловой объект плюс декларативную проекцию для Stage 24.

### Вход

```json
{
  "version": 1,
  "schema": "character_knowledge_map_input",
  "request_id": "string",
  "historical_frame": {},
  "weather_state": {},
  "selected_start_node": {},
  "start_place_audit": {"pass": true},
  "player_character": {},
  "player_character_audit": {"pass": true},
  "current_position": {},
  "g5_scene_graph": {},
  "g5_scene_audit": {"pass": true},
  "initial_npc_placement": {},
  "npc_placement_audit": {"pass": true},
  "initial_item_placement": {},
  "item_placement_audit": {"pass": true},
  "time_light_consistency_audit": {"pass": true},
  "regional_context_package": {},
  "world_base_route_snapshot": {},
  "knowledge_policy": {}
}
```

### Внутренний подконвейер

```text
Builder
→ structural validation
→ code precheck
→ independent Auditor
→ format/semantic repair при необходимости
→ повторная validation/precheck/audit
→ Stage 18 commit gate
```

### Выход

```json
{
  "version": 1,
  "schema": "character_knowledge_map_stage_result",
  "status": "passed | blocked | needs_manual_review",
  "character_knowledge_map": {
    "schema": "character_knowledge_map",
    "known_routes": [],
    "known_nearby_paths": [],
    "known_places": [],
    "known_people": [],
    "known_resources": [],
    "rumors": [],
    "mistaken_beliefs": [],
    "uncertain_knowledge": [],
    "forbidden_knowledge": [],
    "knowledge_gaps": []
  },
  "code_precheck": {},
  "character_knowledge_map_audit": {"pass": true},
  "repair_history": [],
  "write_projection": {
    "schema": "character_knowledge_write_projection",
    "projection_manifest": {}
  },
  "commit_permission": true
}
```

### Запрещено

```text
получать global context вместо contract input;
писать live party-state;
создавать route/place/NPC/item;
давать hidden или future knowledge;
приравнивать rumor или mistaken belief к факту;
самоутверждать Builder output без independent Auditor.
```

Физическое хранение определено в `party_character_knowledge_layer.md`.

---

## Этап 19. Формирование полного hidden state

### Назначение

Собрать полную стартовую сцену: скрытые мотивы, закрытые двери, чужие вещи, скрытые риски, события, NPC-планы и отложенные процессы.

### Вход

```json
{
  "historical_frame": {},
  "approved_character_dossier": {},
  "approved_g5_scene_package": {},
  "initial_npc_package": {},
  "initial_item_package": {},
  "character_knowledge_map": {},
  "regional_context_package": {},
  "event_rules": []
}
```

### Выход

```json
{
  "schema": "hidden_state_package",
  "hidden_npc_state": [],
  "hidden_items_and_containers": [],
  "hidden_routes_or_access": [],
  "hidden_risks": [],
  "deferred_events": [],
  "historical_event_phases": [],
  "private_world_facts": [],
  "do_not_show_to_player": []
}
```

### Запрещено

```text
помещать hidden state в player-facing прозу;
создавать скрытые факты без причинной связи;
создавать дубль уже существующего события.
```

---

## Этап 20. Формирование visible context package

### Назначение

Отделить видимое/слышимое/известное персонажу от полного hidden state. Это единственный пакет, который может получить агент прозы.

### Вход

```json
{
  "hidden_state_package": {},
  "character_knowledge_map": {},
  "approved_character_dossier_visible_parts": {},
  "approved_g5_scene_package": {},
  "time_light_gate_result": {},
  "visibility_rules": []
}
```

### Выход

```json
{
  "schema": "visible_context_package",
  "visible_scene": "string",
  "visible_changes": [],
  "sensory_details": [],
  "visible_npc": [],
  "visible_objects": [],
  "known_context": [],
  "uncertainties": [],
  "allowed_tensions": [],
  "do_not_imply": []
}
```

### Запрещено

```text
передавать скрытые мотивы NPC;
передавать скрытые предметы без признаков;
передавать будущие события и точные даты;
передавать raw JSON состояния агенту прозы.
```

---

## Этап 21. Аудит visible context

### Назначение

Проверить, что visible context не содержит hidden leaks и не выдаёт персонажу недоступное знание.

### Вход

```json
{
  "visible_context_package": {},
  "hidden_state_reference_for_audit": {},
  "character_knowledge_map": {},
  "visibility_rules": []
}
```

### Выход

```json
{
  "schema": "visible_context_audit",
  "pass": true,
  "hidden_leaks": [],
  "unsupported_visible_claims": [],
  "required_redactions": [],
  "repair_required": false,
  "approved_visible_context_package": {}
}
```

### Запрещено

```text
разрешать прозе доступ к hidden state;
пропускать точные скрытые причины;
пропускать точную истинность слухов.
```

---

## Этап 22. Художественная проза narrator

### Назначение

Создать первую player-facing прозу только из утверждённого visible context.

### Вход

```json
{
  "approved_visible_context_package": {},
  "prose_style_rules": {},
  "ui_length_policy": {},
  "forbidden_content": []
}
```

### Выход

```json
{
  "schema": "narrator_prose_package",
  "main_prose": "string",
  "short_position_line": "string",
  "immediate_affordances_text": "string | null",
  "tone_tags": [],
  "self_check": {
    "used_hidden_state": false,
    "created_new_fact": false,
    "mentions_raw_json": false
  }
}
```

### Запрещено

```text
получать hidden_state;
создавать новый факт мира;
выдавать скрытые мотивы;
упоминать технические ID, JSON, prompts, audit.
```

---

## Этап 23. Аудит narrator prose

### Назначение

Проверить прозу на соответствие visible context, отсутствие hidden leaks и отсутствие новых фактов.

### Вход

```json
{
  "narrator_prose_package": {},
  "approved_visible_context_package": {},
  "do_not_imply": [],
  "prose_rules": []
}
```

### Выход

```json
{
  "schema": "narrator_prose_audit",
  "pass": true,
  "hidden_leaks": [],
  "new_unsupported_facts": [],
  "style_or_tone_issues": [],
  "repair_required": false,
  "approved_narrator_prose_package": {}
}
```

### Запрещено

```text
пропускать новые NPC, предметы, маршруты, мотивы или события, которых нет в approved visible context;
пропускать скрытую информацию;
исправлять прозу без repair-loop, если меняется смысл.
```

---

## Этап 24. DB write plan и независимый аудит

### Назначение

Сформировать и независимо проверить атомарный план записи всех утверждённых данных. Этап не исполняет транзакцию.

### Knowledge layer

Stage 24 обязан сформировать:

```text
party_character_knowledge_maps root pending
party_character_knowledge_snapshots immutable snapshot
party_character_known_* normalized records
projection manifest validation
mark-current batch after validation
```

`known_nearby_paths` отображается в `party_character_known_routes` с `knowledge_kind=nearby_path`.

### Выход

```json
{
  "schema": "party_db_write_plan",
  "transaction": {"is_atomic": true, "write_order": []},
  "write_batches": [],
  "knowledge_projection_validation": {},
  "rollback_plan": {},
  "self_audit": {}
}
```

### Запрещено

```text
писать в базу напрямую;
добавлять новый смысл при упаковке;
пропускать root/snapshot/projection validation;
менять утверждённые данные;
скрывать конфликт ссылок.
```

---

## Этап 25. Commit gate и атомарный commit

### Назначение

Код валидирует утверждённый `party_db_write_plan`, выполняет dry-run, затем атомарно применяет его к party-базе. Это code-only этап.

### Вход

```json
{
  "party_db_write_plan": {},
  "party_db_write_plan_audit": {"pass": true},
  "approved_pipeline_outputs": {},
  "party_database_schema": {},
  "world_base_reference_snapshot": {},
  "party_db_connection": "runtime-provided",
  "transaction_policy": {
    "atomic": true,
    "rollback_on_failure": true
  }
}
```

### Выход

```json
{
  "schema": "party_start_committed",
  "party_id": "string",
  "commit_id": "string",
  "current_position": {},
  "player_character_id": "string",
  "created_records_summary": {},
  "visible_context_id": "string | null",
  "journal_entry_ids": [],
  "commit_audit": {
    "pass": true,
    "errors": []
  }
}
```

### Запрещено

```text
менять смысловые данные при записи;
частично коммитить без rollback;
создавать дополнительные NPC, предметы, события или маршруты;
писать player-facing hidden data.
```

---

## Этап 26. Первый игровой экран

### Назначение

Собрать первый UI payload после успешного commit: проза, положение, состояние персонажа, доступный ввод, краткие видимые сведения и ссылки на журнал/карту знаний.

### Вход

```json
{
  "committed_party_snapshot": {},
  "approved_visible_context_package": {},
  "approved_narrator_prose_package": {},
  "ui_policy": {},
  "diagnostic_mode": "off | developer"
}
```

### Выход

```json
{
  "schema": "first_game_screen_payload",
  "party_id": "string",
  "main_prose": "string",
  "position_display": "string",
  "time_display": "string",
  "body_state_summary": {},
  "visible_people_summary": [],
  "visible_objects_summary": [],
  "known_actions_hint": "string | null",
  "input_enabled": true,
  "journal_available": true,
  "map_knowledge_available": true,
  "diagnostic_panel": "object | null"
}
```

### Запрещено

```text
показывать hidden_state;
показывать raw prompts или raw JSON в игровом UI;
показывать фактическую карту вместо карты знаний персонажа;
создавать новые факты ради красивого первого экрана.
```

---

# 3. Передача данных между этапами

## 3.1. Линейный contract chain

```text
1 raw_request
→ 2 normalized_request
→ 3 historical_frame
→ 4 regional_context_package
→ 5 start_node_candidates
→ 6 allowed_place_template_set
→ 7 npc_candidate_set
→ 8 item_profile_package
→ 9 start_node_selection
→ 10 start_node_audit
→ 11 player_character_dossier
→ 12 player_character_audit
→ 13 g5_scene_package
→ 14 g5_scene_audit
→ 15 initial_npc_package
→ 16 initial_item_package
→ 17 time_light_gate_result
→ 18 character_knowledge_map
→ 19 hidden_state_package
→ 20 visible_context_package
→ 21 visible_context_audit
→ 22 narrator_prose_package
→ 23 narrator_prose_audit
→ 24 db_write_plan
→ 25 committed_party_snapshot
→ 26 first_game_screen_payload
```

## 3.2. Что считается ошибкой pipeline

```text
этап получил данные не из своего входного контракта;
этап читает глобальное состояние напрямую;
этап создаёт смысловую сущность, которую не должен создавать;
этап возвращает невалидный schema/version;
этап пропускает hidden в visible/prose;
этап пишет в party DB до write plan/commit;
этап молча подменяет ошибочный результат заглушкой;
этап выбирает не из candidate set.
```

## 3.3. Минимальный диагностический лог этапа

Каждый этап должен возвращать или позволять runtime сохранить:

```json
{
  "stage_id": "number",
  "stage_name": "string",
  "input_schema": "string",
  "output_schema": "string",
  "executor_type": "code | llm | llm_audit | code_gate",
  "status": "pending | running | passed | failed | repair_required | blocked",
  "validation_errors": [],
  "repair_attempts": 0,
  "started_at": "timestamp",
  "finished_at": "timestamp"
}
```

Диагностический лог не является игровым фактом и не должен попадать в player-facing UI, кроме developer diagnostics.

---

# 4. Правило изменения документа

Этот документ можно расширять, когда появляются новые нормативные файлы этапов или меняются их контракты. При изменении нужно:

1. сначала обновить профильный документ этапа;
2. затем обновить эту процедурную карту;
3. затем обновить валидаторы и тесты;
4. затем прогнать golden fixtures;
5. затем проверить, что stage output предыдущего этапа является stage input следующего.
