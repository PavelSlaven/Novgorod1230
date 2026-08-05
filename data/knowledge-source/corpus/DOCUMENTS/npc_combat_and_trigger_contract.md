# Контракт боя и универсальных триггеров решений NPC

**Статус:** `proposed`\
**Идентификатор:** `npc_combat_and_decision_triggers_v1`\
**Проект:** «Русь XIII век»\
**Канонический репозиторий:** `PavelSlaven/Novgorod1230`\
**Снимок сверки:** `main` @ `0a21ffd45fcbbf7dfe5706e36098f3f207b7318f`\
**Дата сверки:** 2 августа 2026 года\
**Предполагаемый путь после принятия:** `data/knowledge-source/corpus/DOCUMENTS/npc_combat_and_trigger_contract.md`

Связанные proposed-контракты:

- `turn_step_llm_contract.md` — свободная заявка игрока и общий actor-step;
- `npc_autonomous_decision_contract.md` — самостоятельные решения NPC вне разговора и боя;
- `npc_conversation_mode_contract.md` — разговор с одним или несколькими NPC.

До одновременного изменения runtime, схем и активной документации этот документ не изменяет production-поведение.

---

## 1. Назначение

Контракт определяет:

1. как начинается, продолжается и завершается бой;
2. какие части боя выполняет код автоматически;
3. когда NPC продолжает сохранённое боевое намерение без LLM;
4. когда NPC обязан пересмотреть намерение через LLM;
5. единый короткий словарь триггеров NPC для боя, разговора и автономного поведения;
6. формат входа и выхода боевого LLM-решения NPC;
7. порядок нескольких одновременных решений NPC;
8. общий pipeline проверок, вреда, тела, времени, восприятия и сохранения;
9. минимальное расширение существующих владельцев в текущем `main`;
10. обязательные изменения кода, схем, тестов и документации при cutover.

Главная формула:

```text
LLM выбирает устойчивое боевое намерение NPC;
код исполняет обычные технические шаги этого намерения;
значимое изменение создаёт универсальный decision signal;
одна decision boundary вызывает новое решение NPC.
```

LLM не вызывается на каждый удар, защиту, шаг, промах или небольшое изменение состояния.

---

## 2. Состояние текущего `main`

### 2.1. Что уже существует

В текущем `main` уже есть необходимые нижние владельцы.

`@rus/turn` уже содержит:

- primary mode `combat`;
- subsystem `combat_resolution`;
- check kind `combat_resolution`;
- общий порядок `availability → checks → consequence → time → body → persistence`;
- Temporal World v4 same-time processing;
- `reaction_decision` boundaries;
- остановку после полностью разрешённого batch;
- combined atomic commit и persisted visible package.

`@rus/combat-health` уже владеет:

- combat request/result contracts;
- формулой качества по margin;
- формулой damage score;
- harm package;
- injury package;
- базовой проверкой combat state.

Его текущие публичные функции:

```text
combatQualityFromMargin
combatHealthLossFromDamageScore
combatInjuryProfileFromDamageScore
buildAttackRequest
buildHarmPackage
applyHarmPackage
validateCombatState
```

При этом `@rus/combat-health` пока не подключён как dependency ни к `@rus/turn`, ни к `@rus/game-server`. Существующие Phase 4 hostile-файлы не используют этот общий модуль для разрешения нападения. Cutover должен добавить явный port/dependency, а не копировать формулы в game-server.

`@rus/checks-rng` уже владеет:

- injected `RandomSource`;
- броском;
- difficulty;
- modifiers;
- result bands;
- audit record.

`@rus/body-state` уже владеет:

- `health`, `satiety`, `energy`;
- conditions;
- body modifiers;
- body-time effect proposals;
- предсказанием ближайшего body threshold.

`@rus/npc-runtime` уже владеет:

- schedule;
- perception;
- meaningful NPC decision boundaries;
- deterministic ordering;
- bounded decision traces.

`@rus/visibility-knowledge-memory` уже отделяет:

- factual event;
- perception;
- knowledge;
- hypothesis;
- message;
- player-safe projection.

### 2.2. Что пока отсутствует

В production пока нет общего владельца полного боевого цикла.

Не реализованы как единая общая механика:

- persisted `combat_session`;
- persisted active combat intents;
- automatic execution одного сохранённого NPC intent;
- общий combat exchange;
- общий combat decision signal protocol;
- NPC combat reassessment LLM;
- direct-harm body threshold crossing;
- общий multi-NPC post-exchange decision batch.

Сценарная Phase 4 Нижней Двины при выборе Ратшей нападения только фиксирует:

```text
ratsha_attack_attempt_committed
ratsha_attack_player_response_required
```

и явно сохраняет:

```text
automatic_harm: false
automatic_escape: false
```

То есть текущая ветка останавливается перед общим боевым разрешением.

### 2.3. Целевое изменение

Текущий сценарный путь:

```text
closed NPC option
→ attack attempt fact
→ mandatory player response boundary
```

заменяется общим runtime-путём:

```text
combat session
→ persisted actor intents
→ code-owned combat exchange
→ checks and harm
→ body, position and perception updates
→ generic NPC decision signals
→ optional NPC combat reassessment
→ next player or combat boundary
```

Ни сценарий, ни отдельный NPC не создают собственный combat engine.

---

## 3. Критерии минимальной достаточности

Новая механика оправдана следующими конкретными требованиями.

Без неё обычный игрок получает реальные дефекты:

- нападение NPC нельзя продолжить общим способом;
- NPC приходится выбирать новое действие через LLM на каждом микрошаге либо вести сценарным кодом;
- низкое здоровье, потеря цели и изменение обстановки не могут единообразно изменить поведение NPC;
- разные сценарии создают собственные функции для дверей, огня, союзников и приказов;
- сохранение в середине боя не восстанавливает точное текущее намерение NPC;
- несколько NPC нельзя корректно переоценить на одной общей боевой границе.

Минимальное решение:

1. расширить существующий `@rus/combat-health`, а не создавать второй combat package;
2. расширить существующий `@rus/npc-runtime` единым signal evaluator;
3. использовать существующий `reaction_decision`;
4. использовать существующие checks, body, movement, items, perception, time и persistence;
5. хранить одно текущее combat intent на участника;
6. использовать ровно пять универсальных категорий trigger;
7. не создавать event-specific trigger functions.

---

## 4. Основные инварианты

### 4.1. Один словарь триггеров для всех режимов

Все причины нового решения NPC отображаются только в пять категорий:

```text
self
others
environment
objective
communication
```

Этот словарь используется:

- автономным поведением;
- разговором;
- боем;
- охраной;
- расписанием;
- activities;
- реакциями на сообщения.

Новая предметная ситуация не создаёт новую trigger category.

### 4.2. Предметное событие не является trigger category

Дверь, пожар, падение лидера, потеря оружия и предложение сдачи остаются предметными factual events.

Для decision protocol они отображаются соответственно в:

```text
дверь или пожар       → environment
падение лидера        → others
потеря оружия         → self
предложение сдачи     → communication
недостижимая цель     → objective
```

### 4.3. Trigger является переходом, а не постоянным состоянием

Сигнал создаётся при изменении:

```text
health above threshold → health below threshold
путь закрыт → путь открыт
цель доступна → цель выбыла
приказ не получен → приказ получен
intent executable → intent invalidated
```

Постоянное низкое здоровье, продолжающийся пожар или уже открытая дверь не вызывают LLM повторно.

### 4.4. Одно решение на один same-time batch

Несколько значимых изменений одного NPC в одном полностью разрешённом same-time batch агрегируются в одну decision boundary и один LLM-вызов.

### 4.5. LLM выбирает намерение, а не результат

LLM не:

- выполняет бросок;
- объявляет попадание;
- назначает вред;
- перемещает участника напрямую;
- объявляет смерть;
- определяет ответ другого участника;
- меняет factual state.

### 4.6. Код не решает характер NPC

Код не:

- выбирает, бежать ли NPC;
- решает, достаточно ли NPC храбр;
- заменяет решение LLM «более разумным»;
- ранжирует моральные или сюжетные варианты;
- определяет готовность сдаться по фиксированной эвристике.

### 4.7. Сохранённое намерение переживает restart

После reload NPC продолжает уже выбранный combat intent без повторного LLM-вызова, пока не возник новый unconsumed signal.

### 4.8. Историчность и физический реализм обязательны

NPC действует внутри:

- реальной доступности оружия;
- собственного телесного состояния;
- навыков;
- видимой обстановки;
- социальной роли;
- отношений и обязательств;
- представлений XIII века;
- сохранённых фактов партии.

---

## 5. Владение ответственностями

### 5.1. `@rus/combat-health`

Целевое расширение существующего владельца.

Владеет:

- `combat_session` domain state;
- combat participant state;
- validation of active combat intents;
- построением следующего технического combat step из сохранённого intent;
- attack/defense request contracts;
- combat exchange proposal;
- margin-to-quality and harm formulas;
- combat outcome events;
- определением generic combat state transitions;
- combat-origin decision signal descriptors.

Не владеет:

- LLM;
- выбором NPC intent;
- RNG;
- exact clock ordering;
- movement route calculation;
- item transfer;
- body state commit;
- perception;
- persistence;
- narration.

### 5.2. `@rus/npc-runtime`

Владеет:

- `npc_decision_signal_v1` validation;
- `evaluateNpcDecisionSignals`;
- aggregation signals per NPC and same-time batch;
- построением `npc_decision_boundary_v1`;
- NPC-safe combat request;
- validation of `npc_combat_intent_plan_v1`;
- NPC semantic decision trace;
- replay already persisted decision.

Не владеет combat formulas и не исполняет intent.

### 5.3. `@rus/turn`

Владеет:

- combat mode orchestration;
- player combat step integration;
- async LLM port;
- post-exchange NPC decision batch;
- current immutable working projection;
- stale-state recheck;
- вызовом checks, combat, body, movement, items and perception owners;
- остановкой на player-response boundary;
- combined write plan;
- atomic commit orchestration.

### 5.4. `@rus/checks-rng`

Владеет бросками и result bands.

Не выбирает:

- необходимость атаки;
- combat intent;
- semantic target;
- смысл последствия.

### 5.5. `@rus/body-state`

Владеет:

- authoritative body state;
- применением body event;
- conditions;
- body modifiers;
- threshold crossing;
- body-origin `self` decision signal descriptor.

`@rus/combat-health` создаёт harm package, но authoritative body transition применяет `@rus/body-state` через orchestrator.

### 5.6. `@rus/movement-routes`

Владеет:

- пространственной достижимостью;
- route/traversal;
- movement duration;
- blocked or completed movement result;
- movement-origin `self`, `environment` или `objective` signal descriptor.

### 5.7. `@rus/items-property`

Владеет:

- held/equipped state;
- доступностью рук;
- оружием и защитой;
- item transitions;
- item-origin `self` signal descriptor.

### 5.8. `@rus/environment-state`

Владеет:

- light;
- weather;
- access;
- environmental state transitions;
- environment-origin `environment` signal descriptor.

### 5.9. `@rus/visibility-knowledge-memory`

Владеет:

- perception каждого участника;
- subjective knowledge;
- received message;
- hidden-information boundary;
- player-safe combat projection.

### 5.10. Conversation и social owners

Conversation mode владеет полноценным разговором.

Combat owner может создать только короткий combat statement event:

- приказ;
- крик;
- предупреждение;
- предложение сдачи;
- сообщение о прекращении сопротивления.

`@rus/social-law` обрабатывает правовые и социальные последствия после factual events.

### 5.11. Persistence и narration

Persistence сохраняет factual state атомарно.

Narration получает только persisted player-safe visible package и не определяет исход боя.

---

## 6. Термины

### `combat_session`

Сохранённое текущее боевое взаимодействие с участниками, состоянием и active intents.

### `combat_intent`

Устойчивое намерение участника, которое код может исполнять несколькими обычными техническими шагами до следующей decision boundary.

### `combat_technical_step`

Один code-owned непосредственный шаг исполнения intent:

- сближение;
- атака;
- защита;
- попытка разрыва контакта;
- удержание;
- попытка обезоружить;
- сдача.

### `combat_exchange`

Один ограниченный набор due technical steps, разрешённых по exact temporal ordering из одного рабочего состояния до следующей безопасной границы.

### `decision signal`

Формальная информация о том, какая часть решения NPC значимо изменилась.

### `decision boundary`

Агрегированная граница, после которой код не продолжает прежний NPC intent без нового решения.

### `player-response boundary`

Граница, на которой игра возвращает управление игроку.

---

## 7. Универсальные категории триггеров

Список является закрытым для версии `v1`.

### 7.1. `self`

Значимо изменилось собственное состояние или возможность NPC действовать.

Включает:

- body threshold crossing;
- новую рану или condition;
- восстановление способности решать; потеря сознания сама по себе разрешается детерминированно без LLM;
- потерю подвижности;
- изменение зрения, слуха или речи;
- потерю оружия;
- освобождение или занятие руки;
- изменение собственной позиции;
- изменение доступной защиты;
- изменение непосредственной физической возможности выполнить intent.

Не включает небольшое числовое изменение, не пересекающее approved threshold и не меняющее capability.

### 7.2. `others`

Значимо изменились другие участники ситуации.

Включает:

- появление или исчезновение участника;
- вступление в бой;
- выход из боя;
- incapacitation;
- surrender;
- смену видимого отношения или стороны;
- угрозу значимому союзнику;
- падение лидера;
- освобождение пленника;
- выбытие защищаемого человека;
- изменение доступности текущей цели.

Сигнал создаётся для NPC только после допустимого восприятия изменения.

### 7.3. `environment`

Значимо изменилась не-actor обстановка или доступные возможности пространства.

Включает:

- открытие или закрытие пути;
- изменение access state;
- появление или исчезновение укрытия;
- изменение света или видимости;
- начало или окончание hazard;
- изменение устойчивости места;
- перемещение значимого объекта;
- изменение доступного выхода;
- изменение пространства боя.

Дверь, пожар, дым, обвал, лодка и освещение не становятся отдельными trigger types.

### 7.4. `objective`

Изменилось состояние текущего намерения, задачи, activity или обязательства NPC.

Включает:

- отсутствие intent при необходимости действовать;
- достижение цели;
- потерю цели;
- завершение intent;
- invalidation intent;
- невозможность продолжить intent;
- `no_progress`;
- наступление approved decision point;
- потерю смысла текущей задачи;
- конфликт текущего intent с новым обязательством.

### 7.5. `communication`

NPC воспринял адресованное или значимое сообщение.

Включает:

- приказ;
- просьбу;
- вопрос;
- угрозу;
- предупреждение;
- предложение;
- требование сдачи;
- зов о помощи;
- согласованный сигнал;
- сообщение о новой цели;
- сообщение о прекращении боя.

Получение сообщения не означает согласие, веру или подчинение.

### 7.6. Категориальная полнота

Любое решение-релевантное изменение обязано отображаться в одну или несколько из пяти категорий.

Нельзя добавлять:

```text
fire_trigger
door_trigger
leader_down_trigger
weapon_lost_trigger
surrender_offer_trigger
```

Допустимо добавлять новые factual event kinds внутри домена, но не новые decision categories.

Новая шестая категория требует новой версии общего контракта и доказательства, что изменение нельзя выразить существующими пятью.

---

## 8. Значимость сигнала

Поддерживаются два значения:

```text
material
critical
```

### 8.1. `material`

Изменение достаточно важно, чтобы NPC пересмотрел intent на ближайшей безопасной decision point.

В бою:

- текущий atomic technical step можно завершить;
- новый offensive/goal-directed step не начинается до решения.

В разговоре:

- текущая уже начатая короткая реплика может завершиться;
- следующий contribution требует решения.

В autonomous activity:

- текущий неделимый шаг завершается;
- следующая activity не начинается.

### 8.2. `critical`

Прежний intent нельзя автоматически продолжать после текущего factual effect.

Включает:

- intent invalidated при сохранённой способности NPC принимать решение;
- невозможность выполнить прежний goal;
- непосредственную новую угрозу, для которой approved profile требует немедленного reassessment;
- отсутствие intent при начале боя.

Потеря сознательного контроля не вызывает LLM: код применяет deterministic terminal state. Восстановление способности решать может создать новый `self / critical` signal.

`critical` не отменяет уже произошедший factual effect и не откатывает текущую транзакцию.

### 8.3. Значимость задаётся декларативно

Значимость не вычисляется по тексту и не кодируется функцией для каждого объекта.

Применимый approved profile или generic transition mapping содержит:

```json
{
  "decision_signal": {
    "category": "environment",
    "significance": "material",
    "perception_required": true
  }
}
```

---

## 9. Контракт `npc_decision_signal_v1`

Этот раздел является единственным normative owner точной trigger schema. Mode-specific контракты могут повторять только краткий пример и не вводят собственные поля либо vocabularies.

```json
{
  "schema": "npc_decision_signal_v1",
  "signal_id": "decision-signal:world_event:event-17:npc-ratsha:environment",
  "occurred_at": {
    "whole_minutes": "620",
    "subminute_numerator": "0",
    "subminute_denominator": "1"
  },
  "category": "environment",
  "significance": "material",
  "source_event_ref": {
    "entity_kind": "world_event",
    "entity_id": "event-17"
  },
  "subject_ref": {
    "entity_kind": "npc",
    "entity_id": "npc-ratsha"
  },
  "scope_refs": [
    {
      "entity_kind": "location",
      "entity_id": "old-drying-shed"
    }
  ],
  "perception_required": true,
  "source_perception_ref": {
    "entity_kind": "perception_result",
    "entity_id": "perception-event-17-ratsha"
  },
  "causal_parent_refs": [
    {
      "entity_kind": "combat_exchange",
      "entity_id": "combat-exchange-4"
    }
  ],
  "idempotency_key": "decision-signal:world_event:event-17:npc-ratsha:environment"
}
```

### 9.1. Инварианты

- `category` — только одна из пяти категорий;
- `significance` — только `material` или `critical`;
- один signal относится к одному NPC;
- identity включает kind/id factual event, NPC и category, поэтому одно
  событие может породить несколько категорий для одного NPC без collision;
- `source_event_ref` указывает на factual event;
- при `perception_required: true` обязателен matching perceived result;
- `not_perceived` не создаёт resolved signal;
- signal не содержит готовое действие;
- signal не содержит скрытую objective truth для LLM;
- `signal_id` и `idempotency_key` детерминированы причиной и NPC;
- повторное построение возвращает ту же identity.

### 9.2. Signal не обязан хранить предметные детали

Предметные детали остаются в source event и соответствующей subjective projection.

Trigger engine получает только:

- category;
- significance;
- actor;
- time;
- causal identity;
- perception binding.

LLM получает безопасное описание изменения отдельно в `perceived_changes`.

---

## 10. Декларативная генерация сигналов

### 10.1. Запрещённый подход

Запрещено создавать набор функций:

```text
onDoorOpened
onFireStarted
onLeaderFell
onWeaponLost
onSurrenderOffered
onHealthBelowTwenty
```

### 10.2. Допустимый подход

Доменный владелец применяет один общий emitter к factual transition и approved metadata:

```text
factual transition
+ applicable decision_signal descriptor
→ generic signal candidate
```

Условная форма API:

```text
buildNpcDecisionSignalCandidates({
  factual_event,
  applicable_signal_descriptors,
  candidate_subject_refs,
  occurred_at
})
```

### 10.3. Body profiles

Body threshold record содержит:

```json
{
  "threshold_id": "combat_body_serious",
  "metric": "health",
  "direction": "decrease",
  "value": "...",
  "decision_signal": {
    "category": "self",
    "significance": "material",
    "perception_required": false
  }
}
```

Числовое значение остаётся в approved body profile и не входит в trigger vocabulary.

### 10.4. Environment profiles

Access, light, weather и hazard transitions могут содержать:

```json
{
  "decision_signal": {
    "category": "environment",
    "significance": "material",
    "perception_required": true
  }
}
```

Один generic environment transition handler применяет descriptor независимо от того, что изменилось предметно.

### 10.5. Combat participant transitions

Generic combat transitions:

```text
joined
left
incapacitated
surrendered
recovered
became_unavailable
```

могут иметь descriptor `others` или `self` в зависимости от subject.

Это domain event vocabulary, а не trigger vocabulary.

### 10.6. Objective transitions

Common intent/activity statuses:

```text
missing
active
completed
blocked
invalidated
no_progress
```

порождают `objective` signal по одной generic mapping table.

### 10.7. Communication transitions

Conversation или combat statement создаёт received-message event.

Generic speech-act profile сопоставляет его с `communication` signal без отдельной функции на каждую фразу.

---

## 11. Perception и subjective applicability

### 11.1. Сигналы без внешнего восприятия

`self` и часть `objective` могут не требовать external perception record.

Примеры:

- собственная боль;
- потеря оружия из руки;
- отсутствие executable step для собственного intent.

Однако NPC всё равно должен быть способен принять сознательное решение.

### 11.2. Сигналы с восприятием

`others`, `environment` и `communication` обычно требуют perception или received-message binding.

```text
factual event
→ propagation
→ perception result
→ subjective knowledge update
→ resolved decision signal
```

### 11.3. Ошибочное восприятие

`misinterpreted` может создать signal.

LLM получает ошибочное субъективное содержание, а не objective truth.

Например, NPC может решить, что прибыло подкрепление, хотя увидел не тех людей.

Фактический event при этом не меняется.

### 11.4. Неспособность принимать решение

LLM не вызывается, если NPC:

- без сознания;
- мёртв;
- находится в состоянии без intentional control;
- имеет deterministic terminal outcome, не требующий выбора.

Восстановление способности решать может создать `self / critical` signal.

---

## 12. Общий trigger evaluator

Целевой pure API `@rus/npc-runtime`:

```text
evaluateNpcDecisionSignals({
  npc_ref,
  active_mode,
  current_intent,
  decision_capability,
  resolved_signals,
  consumed_signal_ids,
  same_time_batch_ref,
  state_version
})
```

### 12.1. Алгоритм

1. Проверить формальные contracts.
2. Оставить signals данного NPC.
3. Отклонить signals без обязательного perception binding.
4. Удалить уже consumed signal IDs.
5. Удалить дубликаты по `signal_id`.
6. Если NPC не decision-capable, boundary не создавать.
7. Сгруппировать оставшиеся signals одного same-time batch.
8. Определить итоговую significance: `critical`, если есть хотя бы один `critical`, иначе `material`.
9. Собрать уникальные categories в каноническом порядке.
10. Создать не более одной boundary.

Канонический порядок categories:

```text
self
others
environment
objective
communication
```

### 12.2. Код не оценивает психологическую значимость

Signal уже означает, что approved domain profile признал переход decision-relevant.

Evaluator не решает:

- испугается ли NPC;
- станет ли он храбрее;
- сдастся ли;
- сменит ли сторону;
- проигнорирует ли приказ.

### 12.3. Нулевой результат

Если новых signals нет, evaluator возвращает:

```json
{
  "boundary": null,
  "consumed_signal_ids": []
}
```

LLM не вызывается.

---

## 13. Контракт `npc_decision_boundary_v1`

```json
{
  "schema": "npc_decision_boundary_v1",
  "boundary_id": "npc-decision:batch-18:npc-ratsha",
  "decision_mode": "combat",
  "scheduled_at": {
    "whole_minutes": "620",
    "subminute_numerator": "0",
    "subminute_denominator": "1"
  },
  "npc_ref": {
    "entity_kind": "npc",
    "entity_id": "npc-ratsha"
  },
  "same_time_batch_ref": {
    "entity_kind": "temporal_batch",
    "entity_id": "batch-18"
  },
  "significance": "critical",
  "categories": [
    "self",
    "environment",
    "communication"
  ],
  "signal_refs": [
    {
      "entity_kind": "npc_decision_signal",
      "entity_id": "signal-1"
    },
    {
      "entity_kind": "npc_decision_signal",
      "entity_id": "signal-2"
    }
  ],
  "state_version": "17",
  "resolution_class": "reaction_decision",
  "idempotency_key": "npc-decision:batch-18:npc-ratsha"
}
```

### 13.1. Инварианты

- `resolution_class` остаётся `reaction_decision`;
- `decision_mode` определяет профиль LLM: autonomous, conversation или combat;
- `decision_mode` является свойством boundary и не входит в `boundary_id`,
  `idempotency_key` или другую identity;
- один NPC имеет не более одной aggregated boundary и одного LLM-вызова
  на один fully resolved same-time batch суммарно по всем режимам;
- одна boundary содержит все новые signals NPC этого batch;
- boundary не содержит готовое решение;
- повторная обработка возвращает persisted trace;
- signal IDs становятся consumed только вместе с committed decision result либо terminal deterministic outcome.

---

## 14. Что не создаёт trigger

LLM не вызывается из-за:

- каждого combat exchange;
- каждого удара;
- каждого промаха;
- каждой защиты;
- обычного сближения;
- небольшого harm без threshold crossing;
- продолжающегося низкого health;
- обычного расхода energy;
- уже открытой двери;
- продолжающегося пожара без нового перехода;
- повторного восприятия того же event;
- narration;
- technical retry;
- reload;
- replay;
- продолжения executable intent;
- обычного defensive reaction;
- exact clock tick;
- неизменившегося числа участников;
- same factual event, уже consumed этим NPC.

---

## 15. Универсальный trigger protocol вне боя

Этот документ делает trigger vocabulary общим.

### Autonomous action

```text
охранник впервые заметил чужака → others
охраняемый проход изменился     → environment
activity завершилась            → objective
NPC получил приказ              → communication
NPC больше не может идти        → self + objective
```

### Conversation

```text
собеседник ушёл                 → others + objective
NPC получил вопрос              → communication
начался внешний hazard          → environment
NPC потерял способность говорить→ self
цель разговора достигнута       → objective
```

Conversation contract должен использовать этот signal protocol вместо собственного независимого словаря trigger.

---

## 16. Состояние `combat_session_v1`

```json
{
  "schema": "combat_session_v1",
  "combat_id": "combat:party-1:7",
  "state_version": "4",
  "status": "active",
  "started_at": {
    "whole_minutes": "620",
    "subminute_numerator": "0",
    "subminute_denominator": "1"
  },
  "scope_ref": {
    "entity_kind": "location",
    "entity_id": "old-drying-shed"
  },
  "participant_refs": [
    {
      "entity_kind": "player_character",
      "entity_id": "mikula"
    },
    {
      "entity_kind": "npc",
      "entity_id": "ratsha"
    }
  ],
  "participant_states": [
    {
      "actor_ref": {
        "entity_kind": "npc",
        "entity_id": "ratsha"
      },
      "combat_status": "active",
      "current_intent": null,
      "next_action_boundary_ref": null
    }
  ],
  "exchange_ordinal": 0,
  "last_exchange_ref": null,
  "player_response_required": true,
  "last_change_set_ref": null
}
```

### 16.1. `status`

```text
active
paused_for_player
paused_for_decisions
ended
```

### 16.2. `combat_status` участника

```text
active
disengaging
surrendered
incapacitated
left
```

### 16.3. Current projection

`combat_session` является current projection, а не полным event log.

Factual combat events сохраняются отдельно в существующем event storage.

---

## 17. NPC combat intent

### 17.1. Назначение

Intent отвечает на вопрос:

> Чего этот NPC продолжает добиваться в бою, пока значимая ситуация не изменилась?

Он не описывает всю будущую последовательность и не гарантирует успех.

### 17.2. Закрытый универсальный словарь intent kinds

```text
engage
control
protect
hold
reach
break_contact
surrender
cease_hostility
```

Этот словарь относится к механическому operation contract, а не к заранее написанным сценарным вариантам.

LLM свободно выбирает intent на основании субъективного контекста и заполняет допустимые refs.

### 17.3. `engage`

Цель — продолжать боевое воздействие на конкретного противника.

Код:

- сближается, если это необходимо и допустимо;
- использует доступное обычное оружие или безоружное действие;
- выполняет attack check;
- применяет harm через владельцев;
- не меняет target без новой boundary.

### 17.4. `control`

Цель — обезоружить, связать, удержать, прижать или захватить конкретного противника без default намерения убить.

Точный технический способ выбирается из доступного operation contract, а не из художественного текста.

### 17.5. `protect`

Цель — защищать actor, объект или scope.

Код может:

- занимать допустимое защитное положение;
- перехватывать непосредственную угрозу;
- использовать defensive reactions;
- атаковать только в рамках защиты.

### 17.6. `hold`

Цель — удерживать текущую позицию или scope.

Код не начинает преследование за пределами scope без новой boundary.

### 17.7. `reach`

Цель — добраться до известного actor или scope в условиях боя.

Код использует movement owner, защищается при непосредственном воздействии и не превращает движение в самостоятельное преследование другой цели.

### 17.8. `break_contact`

Цель — разорвать непосредственный контакт и покинуть бой либо создать дистанцию.

Код выполняет необходимые checks и movement.

### 17.9. `surrender`

Цель — прекратить сопротивление и явно обозначить сдачу.

Код:

- прекращает offensive steps;
- выполняет физически возможное освобождение рук или опускание оружия;
- создаёт factual surrender statement/event;
- не определяет реакцию противника.

### 17.10. `cease_hostility`

Цель — прекратить нападение без принятия статуса сдавшегося.

NPC может защищаться при новом нападении, если combat profile это допускает.

### 17.11. Force limit

Intent содержит одно значение:

```text
avoid_harm
nonlethal_if_possible
ordinary
lethal
```

Это ограничение технического исполнения, а не гарантированный результат.

### 17.12. Risk posture

```text
cautious
ordinary
desperate
```

Risk posture влияет только через approved combat execution profile.

Код не выводит posture из характера самостоятельно.

---

## 18. Контракт active intent

```json
{
  "schema": "combat_intent_v1",
  "intent_id": "combat-intent:combat-7:ratsha:3",
  "combat_id": "combat:party-1:7",
  "actor_ref": {
    "entity_kind": "npc",
    "entity_id": "ratsha"
  },
  "intent_kind": "break_contact",
  "target_refs": [],
  "protected_refs": [],
  "scope_ref": null,
  "destination_ref": {
    "entity_kind": "location_anchor",
    "entity_id": "shed-exit"
  },
  "force_limit": "avoid_harm",
  "risk_posture": "desperate",
  "persistence": "until_decision_boundary",
  "created_from_boundary_ref": {
    "entity_kind": "npc_decision_boundary",
    "entity_id": "npc-decision:batch-18:ratsha"
  },
  "state_version": "1",
  "status": "active"
}
```

### 18.1. Field rules

- `engage` требует один `target_ref`;
- `control` требует один `target_ref`;
- `protect` требует `protected_refs` либо `scope_ref`;
- `hold` требует `scope_ref`;
- `reach` требует `destination_ref`;
- `break_contact` может иметь известный `destination_ref` либо использовать approved nearest-safe-exit policy;
- `surrender` и `cease_hostility` не требуют target;
- все refs обязаны присутствовать в input operation contract;
- persistence всегда code-owned `until_decision_boundary`.

### 18.2. Свободный текст не исполняется

`intent_summary` служит диагностике и не является программой.

Код исполняет только структурированные поля intent.

---

## 19. Operation contract для LLM

LLM не получает произвольный доступ ко всем refs мира.

```json
{
  "allowed_intent_kinds": [
    "engage",
    "control",
    "protect",
    "hold",
    "reach",
    "break_contact",
    "surrender",
    "cease_hostility"
  ],
  "engageable_actor_refs": [],
  "controllable_actor_refs": [],
  "protectable_refs": [],
  "holdable_scope_refs": [],
  "reachable_destination_refs": [],
  "break_contact_destination_refs": [],
  "allowed_force_limits": [
    "avoid_harm",
    "nonlethal_if_possible",
    "ordinary",
    "lethal"
  ],
  "allowed_risk_postures": [
    "cautious",
    "ordinary",
    "desperate"
  ],
  "surrender_available": true,
  "cease_hostility_available": true,
  "combat_statement_available": true
}
```

Код строит contract из factual state и approved domain rules.

Он не предлагает готовые характерологические варианты.

---

## 20. Automatic combat execution

### 20.1. Базовое правило

После сохранения intent код исполняет обычные технические steps без нового LLM до одной из границ:

- player response required;
- NPC decision boundary;
- intent completed;
- combat ended;
- data gap;
- stale precondition;
- technical failure before commit.

### 20.2. Один technical step

Combat owner строит один ближайший executable step:

```text
intent
+ combat state
+ body capabilities
+ items/equipment
+ spatial state
+ approved combat profile
→ combat_technical_step_proposal
```

### 20.3. Код не выбирает новое намерение

Если intent нельзя исполнить, combat owner возвращает status:

```text
blocked
invalidated
no_progress
completed
```

и generic `objective` signal.

Он не заменяет intent другим.

### 20.4. Defensive reactions

Обычная защита может быть автоматической частью combat mechanics:

- block;
- evade;
- maintain guard;
- resist control;
- protect held position.

Она не является новым самостоятельным решением NPC, если не меняет intent.

### 20.5. Code profiles

Automatic execution использует approved generic combat execution profiles.

Сценарий не пишет отдельный handler для конкретного NPC.

---

## 21. Combat exchange

### 21.1. Порядок

```text
1. взять persisted combat session;
2. применить новое player combat step, если оно есть;
3. собрать due technical steps активных NPC intents;
4. определить exact temporal order;
5. перед каждым step повторно проверить preconditions;
6. выполнить checks;
7. построить combat result и harm packages;
8. применить body/item/movement consequences;
9. создать factual combat events;
10. разрешить perception and knowledge;
11. собрать decision signals;
12. создать player/NPC boundaries;
13. обновить combat session projection;
14. atomic commit.
```

### 21.2. Exact time

Каждый time-bearing technical step получает approved exact duration.

Combat owner не владеет global clock.

`@rus/time-events-history` определяет ordering и elapsed arithmetic.

### 21.3. Same-time precondition recheck

Если более ранний event текущего ordered batch сделал поздний step невозможным, поздний step отменяется как stale/blocked и может создать `objective` signal.

### 21.4. Никакой скрытой «боевой секунды»

Не вводится отдельная временная шкала раундов, не связанная с party `GameTimestamp`.

`exchange_ordinal` является порядковым номером, а не временем.

---

## 22. Игрок в бою

Игрок продолжает использовать свободный player turn contract.

Player LLM interpreter:

- заземляет заявку;
- возвращает одно ближайшее действие;
- передаёт combat-specific запрос владельцу боя;
- не разрешает удар сам.

NPC intent может сохраняться через несколько player actions.

По умолчанию действие игрока не повторяется автоматически после завершения одного player step, если player contract прямо не поддерживает persistent intent.

После каждого полностью разрешённого exchange управление возвращается игроку, если:

- требуется новое решение игрока;
- изменился видимый боевой контекст;
- player action завершён;
- combat не может продолжаться без новой заявки игрока.

---

## 23. Check, harm и body pipeline

### 23.1. Общая последовательность

```text
combat technical step
→ @rus/combat-health build request
→ @rus/checks-rng execute check
→ @rus/combat-health build combat result/harm package
→ @rus/body-state apply body event
→ threshold crossing
→ factual events and signals
```

### 23.2. Один RNG owner

Player и NPC используют один `@rus/checks-rng`.

Отдельный NPC RNG запрещён.

### 23.3. Harm package не равен body commit

`@rus/combat-health` определяет combat harm semantics.

`@rus/body-state` применяет authoritative transition тела.

Текущий `applyHarmPackage` может остаться compatibility helper, но production orchestration не должно иметь двух независимых body writers.

### 23.4. Результат проверки

LLM не получает право выбирать result band.

Фактический result сохраняется в существующем check resolution storage.

---

## 24. Direct-harm body threshold crossing

### 24.1. Необходимое расширение

Текущий `predictNearestBodyThreshold` работает с time window.

Для боя нужен pure API вида:

```text
detectBodyThresholdCrossings({
  body_state_before,
  body_state_after,
  applicable_threshold_profile,
  source_event_ref,
  occurred_at
})
```

### 24.2. Результат

```json
{
  "crossed_thresholds": [
    {
      "threshold_id": "combat_body_serious",
      "direction": "decrease",
      "decision_signal": {
        "category": "self",
        "significance": "material",
        "perception_required": false
      }
    }
  ]
}
```

### 24.3. Edge-trigger rule

```text
24 → 19 crossing threshold 20  → one signal
19 → 17                       → no repeat
21 → 19 after recovery        → new crossing, new signal
```

Точные значения не входят в prompt.

---

## 25. Триггеры боя через пять категорий

Отдельного combat trigger vocabulary нет.

### Вход в бой без intent

```text
objective / critical
```

### Значимое ухудшение собственного состояния

```text
self / material or critical
```

### Потеря оружия или capability

```text
self / material or critical
```

### Появление, выбытие или surrender другого участника

```text
others / material
```

### Изменение пути, света, hazard или укрытия

```text
environment / material or critical
```

### Достижение, блокировка или invalidation текущего goal

```text
objective / critical
```

### Приказ, угроза, просьба или предложение сдачи

```text
communication / material or critical
```

### Несколько изменений

```text
self + others + environment + communication
→ одна boundary
```

---

## 26. Начало боя

### 26.1. NPC сам инициировал бой

Если autonomous или conversation LLM уже вернула combat handoff с grounded combat intent, этот intent становится начальным combat intent.

Повторный LLM-вызов только из-за создания session не нужен.

### 26.2. NPC втянут в бой

Если NPC оказался участником без сохранённого intent:

```text
objective / critical
```

создаёт initial combat decision boundary.

### 26.3. Deterministic non-participant

Свидетель боя не становится участником автоматически.

Его perception может создать autonomous decision boundary, после которого он сам решит:

- вмешаться;
- уйти;
- позвать помощь;
- наблюдать.

---

## 27. Несколько NPC на одной боевой границе

### 27.1. Общий snapshot

После exchange:

1. полностью применяются factual results;
2. рассчитываются bodies, positions, items and environment;
3. рассчитывается perception каждого NPC;
4. собираются signals;
5. создаются boundaries.

Все NPC boundaries этого post-exchange batch строятся из одного factual snapshot.

### 27.2. Отдельная субъективность

Для каждого NPC формируется отдельный request.

Нельзя передавать одной LLM скрытые состояния всей группы и просить разыграть всех.

### 27.3. Decision batch

LLM-вызовы могут выполняться технически последовательно или параллельно, но:

- каждый получает один и тот же base combat state version;
- каждый получает только собственный subjective projection;
- ответы собираются до начала следующего exchange;
- решение одного NPC не становится фактом до общего apply phase.

### 27.4. Apply order

После сбора решения применяются в каноническом порядке:

```text
scheduled_at
→ npc_ref
→ boundary_id
```

Применение intent не означает выполнение атаки.

Следующий exchange разрешает действия по combat/time rules, а не по порядку LLM-вызовов.

### 27.5. Новые факты между решениями

Если во время подготовки batch factual state не менялся, решения остаются совместимы.

Если external event изменил state до commit, весь affected decision batch считается stale и строится заново.

---

## 28. Combat statements

### 28.1. Короткая речь в бою

Intent plan может содержать один supporting combat statement:

- приказ;
- предупреждение;
- зов о помощи;
- требование сдачи;
- сообщение о собственной сдаче;
- короткий отказ.

### 28.2. Statement не заменяет intent

Combat statement не является вторым полноценным самостоятельным действием, если он сопровождает текущее боевое намерение и не требует отдельной длительной activity.

### 28.3. Получатели

После factual utterance:

- создаётся acoustic/message signal;
- отдельно определяется perception каждого участника;
- получатели могут получить `communication` decision signal.

### 28.4. Полный разговор

Если требуется торг, допрос или продолжительное согласование:

```text
combat paused or ended
→ conversation mode
```

---

## 29. Завершение боя

Combat owner завершает session code-owned, если:

- осталось менее двух противостоящих active participants;
- все стороны прекратили hostility;
- все противники вышли из scope;
- дальнейшее combat interaction физически невозможно и нет pursuit intent;
- approved terminal condition выполнено.

LLM не объявляет бой завершённым напрямую.

Она может выбрать `surrender`, `cease_hostility` или `break_contact`; factual completion определяет код.

---

## 30. Вход LLM: `npc_combat_decision_request_v1`

```json
{
  "schema": "npc_combat_decision_request_v1",
  "request_id": "npc-combat-decision-42",
  "boundary_id": "npc-decision:batch-18:ratsha",
  "state_version": "17",
  "combat_id": "combat:party-1:7",
  "exchange_ordinal": 4,
  "decided_at": {
    "whole_minutes": "620",
    "subminute_numerator": "0",
    "subminute_denominator": "1"
  },
  "npc_ref": {
    "entity_kind": "npc",
    "entity_id": "ratsha"
  },
  "decision_reasons": {
    "significance": "critical",
    "categories": [
      "self",
      "environment"
    ],
    "signal_refs": [],
    "perceived_changes": [
      "Рана резко ограничила движение.",
      "NPC заметил открывшийся путь к выходу."
    ]
  },
  "current_intent": {
    "intent_kind": "engage",
    "target_refs": [
      {
        "entity_kind": "player_character",
        "entity_id": "mikula"
      }
    ],
    "status": "invalidated"
  },
  "npc_subjective_state": {
    "identity": {
      "name_or_label": "Ратша"
    },
    "social_role": {},
    "combat_experience": "limited",
    "attributes": [],
    "skills": [],
    "body": {
      "condition_summary": "тяжело ранен",
      "pain": "strong",
      "mobility": "reduced",
      "usable_hands": 1,
      "active_conditions": []
    },
    "mood": {},
    "temperament": [],
    "goals": [],
    "fears": [],
    "obligations": [],
    "relationships": [],
    "available_equipment": []
  },
  "perceived_combat_state": {
    "scope": {},
    "visible_opponents": [],
    "visible_allies": [],
    "visible_neutral_actors": [],
    "recognized_weapons": [],
    "known_positions": [],
    "known_exits": [],
    "visible_cover": [],
    "perceived_hazards": [],
    "recent_perceived_events": [],
    "uncertainties": []
  },
  "relevant_memory": [],
  "operation_contract": {}
}
```

### 30.1. Субъективность

Не передаются:

- точные hidden HP противника;
- скрытое оружие;
- невидимые участники;
- истинные намерения других;
- будущий порядок действий;
- результат следующего броска;
- objective truth, недоступная NPC.

### 30.2. Собственное тело

NPC получает пригодное для решения qualitative состояние тела и capabilities.

Технические точные значения могут оставаться у code owners.

### 30.3. Perceived changes

`perceived_changes` кратко описывают source events только с точки зрения NPC.

Они не расширяют пять categories.

---

## 31. Выход LLM: `npc_combat_intent_plan_v1`

```json
{
  "schema": "npc_combat_intent_plan_v1",
  "request_id": "npc-combat-decision-42",
  "boundary_id": "npc-decision:batch-18:ratsha",
  "state_version": "17",
  "combat_id": "combat:party-1:7",
  "npc_ref": {
    "entity_kind": "npc",
    "entity_id": "ratsha"
  },
  "decision": {
    "intent_summary": "прекратить давление и попытаться выйти из боя",
    "grounded_goal": "разорвать контакт и двигаться к видимому выходу",
    "adaptation": "literal"
  },
  "operation": {
    "op": "set_combat_intent",
    "intent_kind": "break_contact",
    "target_refs": [],
    "protected_refs": [],
    "scope_ref": null,
    "destination_ref": {
      "entity_kind": "location_anchor",
      "entity_id": "shed-exit"
    },
    "force_limit": "avoid_harm",
    "risk_posture": "desperate"
  },
  "combat_statement": null,
  "reason": "NPC тяжело ранен, боится захвата и видит путь к отступлению"
}
```

### 31.1. `adaptation`

```text
literal
reality_limited
```

`reality_limited` используется, если желаемая цель возможна только как ограниченная реальная попытка.

### 31.2. Ровно один intent

Ответ содержит ровно одну операцию `set_combat_intent`.

Не допускаются:

- последовательность intents;
- результат атаки;
- direct body patch;
- решение за другого actor;
- будущая ветка после неизвестного результата.

### 31.3. `combat_statement`

Опциональный формат:

```json
{
  "speech_act": "surrender_demand",
  "addressed_refs": [],
  "utterance_text": "Брось нож!"
}
```

Statement должен быть коротким и совместимым с выбранным intent.

---

## 32. Основной runtime prompt NPC combat decision

```md
Ты принимаешь одно боевое решение за конкретного NPC исторической ролевой игры «Русь XIII век».

Каждый вызов является независимой сессией. У тебя нет памяти о предыдущих вызовах, кроме данных во входе.

Верни только один корректный JSON-объект `npc_combat_intent_plan_v1`. Не добавляй Markdown, комментарии или текст вне JSON.

# Задача

Определи, чего этот человек теперь пытается добиться в бою.

Выбери одно устойчивое боевое намерение, которое код сможет исполнять автоматически до следующего значимого изменения.

Не описывай отдельные удары, броски, вред или весь будущий бой.

# Почему тебя вызвали

Код зафиксировал значимое изменение одной или нескольких универсальных категорий:

- `self` — собственное состояние и возможности NPC;
- `others` — другие участники;
- `environment` — обстановка, доступ, пути и hazards;
- `objective` — текущее намерение, задача или обязательство;
- `communication` — воспринятое сообщение или сигнал.

Используй конкретные `perceived_changes` и текущее субъективное состояние. Не придумывай дополнительные trigger categories.

# Субъективная точка зрения

Используй только то, что NPC видит, слышит, ощущает, знает, помнит или считает истинным.

Учитывай:

- состояние тела;
- навыки и боевой опыт;
- страх и настроение;
- темперамент;
- цели;
- обязательства;
- социальную роль;
- отношения;
- доступное оружие и защиту;
- известных союзников и противников;
- видимые пути, укрытия и hazards;
- текущее боевое намерение;
- воспринятые изменения.

Не используй скрытые характеристики противников, неизвестное оружие, невидимых участников и объективные факты, которых NPC не знает.

# Реализм и историчность

Решение должно соответствовать физическим возможностям NPC, доступным предметам, навыкам, социальному положению и представлениям XIII века.

Не превращай неопытного человека в профессионального бойца.

Не создавай отсутствующее оружие, сверхъестественную способность или невозможное перемещение.

Не выбирай действие ради пользы игроку, наказания игрока, драматичности или заранее желаемого сюжета.

# Одно намерение

Верни ровно один `intent_kind` из `operation_contract`:

- `engage`;
- `control`;
- `protect`;
- `hold`;
- `reach`;
- `break_contact`;
- `surrender`;
- `cease_hostility`.

Используй только refs и значения, разрешённые `operation_contract`.

Не объединяй несколько последовательных решений.

# Граница кода

Ты не:

- выполняешь бросок;
- объявляешь попадание;
- рассчитываешь вред;
- определяешь смерть или потерю сознания;
- рассчитываешь маршрут;
- меняешь factual state;
- определяешь реакцию другого персонажа;
- продолжаешь решение после следующей неизвестной границы.

# Короткая речь

Допустим один короткий `combat_statement`, совместимый с intent: приказ, предупреждение, зов, требование сдачи или сообщение о сдаче.

Не начинай полноценный разговор.

# Формат

Верни поля:

- `schema`;
- `request_id`;
- `boundary_id`;
- `state_version`;
- `combat_id`;
- `npc_ref`;
- `decision`;
- `operation`;
- `combat_statement`;
- `reason`.

`request_id`, `boundary_id`, `state_version`, `combat_id` и `npc_ref` скопируй точно из входа.

Перед ответом проверь:

1. решение принято от лица данного NPC;
2. использованы только субъективные сведения;
3. выбран ровно один intent;
4. все refs разрешены operation contract;
5. нет результата броска или вреда;
6. ответ содержит только JSON.

NPC_COMBAT_DECISION_REQUEST:

{{NPC_COMBAT_DECISION_REQUEST_JSON}}
```

Промт намеренно не перечисляет двери, огонь, ранения, лидеров и другие предметные случаи. Они передаются в `perceived_changes`, а причины сводятся к пяти categories.

---

## 33. Format repair prompt

Допускается одна repair попытка только для исправления формального ответа.

```md
Исправь предыдущий ответ так, чтобы он строго соответствовал `npc_combat_intent_plan_v1`.

Не меняй принятое боевое намерение, если это не требуется указанной ошибкой допустимости.

Используй только значения и refs из исходного `operation_contract`.

Не добавляй новые факты, участников, предметы, результаты бросков или последствия.

Верни только корректный JSON без Markdown и комментариев.

VALIDATION_ERRORS:
{{VALIDATION_ERRORS_JSON}}

ORIGINAL_REQUEST:
{{NPC_COMBAT_DECISION_REQUEST_JSON}}

ORIGINAL_RESPONSE:
{{ORIGINAL_RESPONSE_JSON}}
```

После второй структурной ошибки factual state не меняется и возвращается typed LLM contract error.

---

## 34. Validation ответа LLM

Код проверяет только формальные и механические свойства.

Проверяются:

- JSON Schema;
- exact identity fields;
- state version;
- combat session status;
- boundary not already consumed;
- один `set_combat_intent`;
- allowed `intent_kind`;
- required refs for intent kind;
- refs входят в operation contract;
- force limit и risk posture разрешены;
- optional statement structurally valid;
- no unknown fields;
- no direct outcome or state patch.

Код не оценивает:

- характерологическую правдоподобность;
- разумность;
- храбрость;
- мораль;
- оптимальность;
- сюжетную полезность.

### 34.1. Stale response

Если state изменился после построения request:

- старый ответ не применяется;
- signals не считаются consumed;
- request перестраивается из актуального state;
- LLM может быть вызвана заново с новой boundary identity.

### 34.2. Immediate mechanical gap

Operation contract должен содержать только механически допустимые refs.

Если structural-valid intent всё равно не может начать ни одного technical step из того же state, combat owner возвращает typed `combat_intent_unexecutable`.

Код не подменяет intent.

Повторный LLM loop на неизменившемся state запрещён.

---

## 35. Persistence, replay и идемпотентность

### 35.1. Current combat projection

Минимально требуется одна current projection:

```text
party_combat_sessions
```

Она хранит:

- session status;
- state version;
- participant states;
- current intents;
- exchange ordinal;
- next boundaries;
- last committed change set.

Не требуется отдельная таблица на каждый intent, если current projection и append-only source events обеспечивают точное восстановление.

### 35.2. Events

Использовать существующий event storage для:

- combat started;
- technical step attempted;
- attack result;
- harm applied;
- condition changed;
- participant joined/left;
- surrender statement;
- combat ended.

### 35.3. NPC decision traces

Существующий `party_npc_decision_traces` должен быть обобщён для semantic plans.

Trace хранит:

```json
{
  "request_id": "npc-combat-decision-42",
  "boundary_id": "...",
  "decision_mode": "combat",
  "npc_id": "ratsha",
  "state_version": "17",
  "semantic_plan": {},
  "status": "committed",
  "change_set_id": "change-set-42"
}
```

Bounded-only `option_id`, `command_token` и `options_digest` не могут оставаться обязательными для semantic combat trace.

### 35.4. Signal persistence

Отдельная таблица signals по умолчанию не создаётся.

Достаточно:

- persisted source event;
- persisted perception/message;
- persisted decision boundary/transition trace;
- consumed signal refs в decision trace;
- current combat projection.

Отдельная таблица допустима только если существующий transition/event storage не может обеспечить replay и deduplication.

### 35.5. Replay

Повтор того же `boundary_id`:

- не вызывает LLM;
- не создаёт новый intent;
- не применяет intent повторно;
- возвращает persisted result.

---

## 36. Atomicity

Один combat exchange commit включает согласованно:

- checks;
- combat results;
- harm packages;
- body transitions;
- item transitions;
- positions;
- factual events;
- perception and knowledge;
- decision signals/boundaries;
- updated combat session;
- player-safe visible package;
- idempotency record.

Нельзя сохранить harm без body result либо новый intent без consumed boundary linkage.

LLM не вызывается внутри открытой SQL transaction.

Правильная граница:

```text
read committed state
→ build immutable request
→ LLM outside transaction
→ re-read/revalidate
→ build combined plan
→ atomic commit
```

---

## 37. Миграция Phase 4 Нижней Двины

Существующая ветка Ратши используется как первый conformance scenario.

### 37.1. Сохраняется

- factual promise offer;
- social check;
- субъективное состояние Ратши;
- участники и свидетели;
- возможное начало hostility;
- player-visible boundary;
- scenario content.

### 37.2. Удаляется из production ownership

- сценарный closed attack execution как самостоятельный combat resolver;
- `attack_attempt_then_mandatory_player_boundary` как конечная механика боя;
- `automatic_harm: false` как постоянная остановка вместо combat owner;
- scenario-local combat ordering.

### 37.3. Новый поток

```text
Ратша выбирает hostile combat handoff
→ создаётся combat session
→ начальный intent импортируется как `engage` или `break_contact`
→ combat owner строит первый technical step
→ player response и дальнейший бой используют общий runtime
```

Старый путь не остаётся fallback внутри одной партии.

---

## 38. Изменения кода и контрактов по владельцам

### 38.1. `@rus/contracts`

Добавить schemas:

```text
npc_decision_signal_v1
npc_decision_boundary_v1
combat_session_v1
combat_intent_v1
combat_technical_step_proposal_v1
combat_exchange_proposal_v1
npc_combat_decision_request_v1
npc_combat_intent_plan_v1
npc_semantic_decision_trace_v1
```

Добавить controlled vocabularies:

```text
NPC_DECISION_CATEGORIES
NPC_DECISION_SIGNIFICANCE
COMBAT_INTENT_KINDS
COMBAT_FORCE_LIMITS
COMBAT_RISK_POSTURES
```

### 38.2. `@rus/combat-health`

Подключить пакет через явный port/dependency к `@rus/turn` или production composition. Не импортировать его формулы в scenario-local код.

Добавить pure APIs:

```text
validateCombatSession
validateCombatIntent
buildCombatTechnicalStepProposal
buildCombatExchangeProposal
buildCombatOutcomeEvents
buildCombatDecisionSignalDescriptors
```

Не добавлять network, DB, LLM or clock ownership.

### 38.3. `@rus/body-state`

Добавить:

```text
detectBodyThresholdCrossings
applyBodyEventProposal
```

Authoritative body write должен быть один.

### 38.4. `@rus/npc-runtime`

Добавить:

```text
validateNpcDecisionSignal
evaluateNpcDecisionSignals
buildNpcDecisionBoundary
buildNpcCombatDecisionRequest
validateNpcCombatIntentPlan
buildNpcSemanticDecisionTrace
orderNpcDecisionBoundaries
```

### 38.5. `@rus/turn`

Добавить:

```text
combat session orchestration
combat owner port
NPC combat decision LLM port
post-exchange decision batch
player-response boundary integration
semantic trace persistence handoff
```

### 38.6. `@rus/visibility-knowledge-memory`

Переиспользовать perception pipeline.

При необходимости добавить projection helpers для:

- perceived combat changes;
- qualitative body presentation;
- safe participant status;
- combat statements.

### 38.7. `@rus/llm-runtime`

Добавить named role:

```text
npc_combat_decision
```

Repair может использовать тот же role с repair mode либо отдельный config, но не отдельную смысловую модель боя.

### 38.8. Game server/persistence

Добавить:

- current combat session read/write;
- semantic NPC decision trace fields;
- combined write mapping;
- replay lookup by boundary ID;
- Phase 4 migration adapter.

---

## 39. Authoring data

### 39.1. Generic signal descriptors

Approved profiles могут содержать только generic descriptor:

```json
{
  "category": "self | others | environment | objective | communication",
  "significance": "material | critical",
  "perception_required": true
}
```

### 39.2. Что не хранить

Не хранить universal code handler IDs вида:

```text
handle_specific_shed_door_open
handle_specific_fire_at_camp
handle_specific_ratsha_low_health
```

### 39.3. Combat execution profiles

Authoring определяет generic:

- action durations;
- allowed technical actions;
- attack/defense parameters;
- body thresholds;
- item applicability;
- force/risk mappings;
- historical/regional applicability.

Сценарий связывает actors, items, locations and facts, но не оркестрирует бой.

---

## 40. Обязательные изменения документации при cutover

Все изменения выполняются в одном согласованном release. До этого документ остаётся `proposed`.

### 40.1. `AGENTS.md`

Изменить разделы 2 и 6.

Добавить правило:

```text
Все NPC decision triggers используют единый пятичастный словарь
self / others / environment / objective / communication.
Сценарный код и доменные owners не создают event-specific trigger functions.
```

Уточнить universal mechanics:

- combat является общей runtime-механикой;
- сценарий не создаёт combat resolver или ordering;
- domain owner может emit только generic signal descriptor;
- semantic NPC LLM plan разрешён в autonomous/conversation/combat modes;
- materialization candidate selection остаётся closed and code-owned.

Сузить утверждение:

```text
LLM выбирает только из переданного закрытого набора
```

до materialization/bounded catalog-selection context.

### 40.2. `data/knowledge-source/corpus/DOCUMENTS/code_driven_world_materialization_architecture.md`

Обновить:

- главный принцип раздела 1;
- D-009;
- D-010;
- D-011;
- D-013;
- раздел 4.4 `LLM`;
- раздел party state.

Зафиксировать различие:

```text
materialization and authored candidate selection
  остаются closed and code-owned;

runtime semantic actor planning
  допускает structured player/NPC plan внутри operation contract;

checks, consequences, facts and persistence
  остаются code-owned.
```

Добавить persistent combat session/intent как party state, а не world-base materialization.

### 40.3. `data/knowledge-source/corpus/DOCUMENTS/temporal_world_and_interruptible_activities.md`

Обновить:

- section 1 scope: `bounded NPC decisions` заменить semantic NPC decision boundaries;
- ownership table: назначить `@rus/combat-health` combat domain owner;
- section 3.4 decision boundary;
- section 15 NPC runtime;
- same-time cascade and stop-after-batch rules;
- persistence and replay sections.

Добавить:

- universal five-category decision signal protocol;
- edge-trigger semantics;
- material/critical timing;
- one aggregated boundary per NPC/batch;
- combat session and technical step boundaries;
- post-exchange multi-NPC decision batch;
- direct-harm body threshold crossing;
- no LLM inside temporal engine or DB transaction.

Удалить bounded-only правило `0/1/many options` как единственный production NPC decision model после full cutover.

### 40.4. `packages/combat-health/MODULE.md`

Расширить назначение и ownership:

- combat session;
- active intent;
- technical step proposal;
- exchange proposal;
- combat events;
- generic combat signal descriptors.

Обновить public API и tests.

Явно сохранить запреты:

- no intent selection;
- no RNG;
- no DB;
- no LLM;
- no global clock.

### 40.5. `packages/npc-runtime/MODULE.md`

Заменить bounded-only описание.

Добавить:

- universal decision signals;
- five categories;
- aggregation;
- semantic autonomous/conversation/combat requests;
- semantic decision traces;
- no event-specific trigger functions;
- replay by boundary identity.

### 40.6. `packages/turn/MODULE.md`

Добавить:

- `combat` orchestration;
- combat owner port;
- player combat step integration;
- async NPC combat decision batch;
- same-snapshot multiple NPC decisions;
- common checks/body/time/persistence;
- player-response boundary;
- stale/replay behavior.

Уточнить, что `@rus/turn` не владеет combat formulas и trigger meaning.

### 40.7. `packages/body-state/MODULE.md`

Добавить:

- direct-event body transition;
- threshold crossing between before/after states;
- generic `self` decision signal descriptor;
- один authoritative body writer.

### 40.8. `packages/checks-rng/MODULE.md`

Формулы менять не требуется.

Добавить cross-reference, что player и NPC combat используют тот же injected RNG/check pipeline и module не решает intent.

### 40.9. `packages/visibility-knowledge-memory/MODULE.md`

Добавить:

- perceived combat event projection;
- participant-specific combat snapshot;
- combat statement as received message;
- prohibition on exact hidden opponent body values;
- misinterpretation can create subjective signal without changing fact.

### 40.10. `packages/llm-runtime/MODULE.md`

Зарегистрировать role `npc_combat_decision` и JSON mode contract.

### 40.11. `data/knowledge-source/corpus/DOCUMENTS/information_sources_llm_prompts.md`

Обновить список runtime LLM roles.

Добавить:

- autonomous NPC semantic decision;
- NPC conversation response;
- NPC combat intent decision;
- operation contract;
- five trigger categories;
- subjective combat context;
- no attack result, damage or hidden opponent state.

Удалить утверждение, что runtime LLM всегда возвращает только `option_id`/`command_token`.

### 40.12. `data/knowledge-source/corpus/DOCUMENTS/llm_agent_prompt_templates.md`

Обновить вступительное bounded-only ограничение.

Добавить основной prompt и repair prompt из разделов 32–33.

Обновить runtime pipeline:

```text
combat factual exchange
→ perception and signals
→ optional NPC intent decision
→ common execution owners
→ atomic factual commit
→ persisted visible package
→ narration
```

### 40.13. `data/knowledge-source/corpus/DOCUMENTS/llm_documentation_navigation.md`

Добавить данный контракт в разделы:

- NPC;
- combat;
- code/LLM boundary;
- temporal decisions;
- prompts.

Связать его с autonomous NPC и conversation contracts.

### 40.14. `data/knowledge-source/corpus/DOCUMENTS/world_base_materialization_table_requirements.md`

Добавить authoring requirements для:

- generic decision signal descriptors;
- body threshold signal metadata;
- combat execution profiles;
- communication signal profiles;
- environment transition signal metadata.

Явно запретить scenario-specific trigger handlers в authoring data.

### 40.15. `data/knowledge-source/corpus/DOCUMENTS/read_only_database_and_graph_architecture.md`

Добавить party-runtime current combat session projection и её границу с read-only world base.

### 40.16. `infra/world-base/SCHEMA_REFERENCE.md`

Если authoring DDL расширяется signal descriptors/combat profiles, обновить generated reference через штатный workflow.

### 40.17. `docs/pipelines/turn.md`

Добавить pipeline:

```text
player combat input
→ combat technical exchange
→ checks/harm/body
→ perception/signals
→ NPC decision batch
→ player boundary
→ atomic commit
```

### 40.18. `docs/migration/contracts/TURN_WORKFLOW_CONTRACT_MAP.md`

Зарегистрировать новые schemas, owners, ports и migration path от Phase 4 hostile boundary.

### 40.19. Lower Dvina scenario data/docs

Обновить Phase 4 так, чтобы:

- Ратша оставался content/conformance NPC;
- promise and social check оставались scenario content;
- hostile handoff создавал общий combat session;
- scenario-local attack continuation не был production owner;
- old closed option path удалялся после cutover.

### 40.20. Generated outputs

После изменения schemas и module docs регенерировать:

```text
generated/schema-reference.json
generated/schema-reference.md
generated/module-index.json
generated/generated-manifest.json
```

Generated files не редактировать вручную.

---

## 41. Обязательные тесты

### 41.1. Universal signal tests

1. Каждая category проходит schema validation.
2. Неизвестная шестая category отклоняется.
3. Door event и fire event используют одну category `environment`.
4. Weapon loss использует `self`.
5. Leader incapacitation использует `others`.
6. Intent invalidation использует `objective`.
7. Surrender offer использует `communication`.
8. Повторный level state не создаёт новый signal.
9. Новый edge transition создаёт новый signal.
10. Один source event + NPC создаёт одну signal identity.

### 41.2. Perception tests

11. Невоспринятый external event не создаёт resolved signal.
12. Partial perception создаёт только допустимое subjective change.
13. Misinterpretation может создать signal без изменения fact.
14. Self signal не требует external perception.
15. Unconscious NPC не получает LLM boundary.
16. Recovery of decision capability может создать `self / critical`.

### 41.3. Aggregation tests

17. Несколько signals одного NPC/batch создают одну boundary.
18. Categories canonical-order stable.
19. Critical dominates material.
20. Consumed signal не создаёт boundary повторно.
21. Replay boundary не вызывает LLM.
22. Два NPC получают отдельные boundaries.

### 41.4. Combat intent tests

23. Каждый intent kind валидируется.
24. `engage` без target отклоняется.
25. `reach` без destination отклоняется.
26. Ref вне operation contract отклоняется.
27. Ровно один intent обязателен.
28. LLM не может вернуть direct harm.
29. LLM не может объявить hit/death.
30. `surrender` не определяет реакцию противника.
31. Persisted intent переживает reload.

### 41.5. Automatic execution tests

32. Executable intent создаёт technical step без LLM.
33. Обычный miss не вызывает LLM.
34. Обычная defense не вызывает LLM.
35. Intent continues across exchanges without signals.
36. Blocked intent создаёт `objective` signal.
37. Combat owner не выбирает replacement intent.
38. Movement uses movement owner.
39. Item availability uses items owner.

### 41.6. Checks, harm and body tests

40. Player and NPC use same RandomSource port.
41. Harm package построен `@rus/combat-health`.
42. Body transition применён одним body owner.
43. Threshold crossing emits one `self` signal.
44. Remaining below threshold does not repeat signal.
45. Recovery and second crossing can emit new signal.
46. Incapacitation terminal result does not invoke LLM.

### 41.7. Multi-NPC combat tests

47. Post-exchange boundaries use same factual state version.
48. Each NPC request has separate subjective projection.
49. One NPC does not receive hidden state of another.
50. Intents are collected before next exchange.
51. LLM call order does not determine combat action order.
52. Stale external change invalidates affected batch.

### 41.8. Persistence tests

53. Combat session restart reproduces participants and intents.
54. Exchange retry does not duplicate harm.
55. Boundary replay does not duplicate intent.
56. Signal refs are consumed atomically with decision trace.
57. Partial body/combat commit is impossible.
58. Visible package is derived from candidate committed facts.

### 41.9. Phase 4 migration tests

59. Ratsha hostile outcome creates common combat session.
60. Old `automatic_harm: false` stop is absent from production path.
61. Promise/social facts remain preserved.
62. Player response boundary remains visible and idempotent.
63. Old scenario-local resolver is not reachable after activation.

### 41.10. Documentation tests

64. Active docs no longer claim all runtime LLM decisions are bounded option IDs.
65. All trigger docs use the same five categories.
66. No scenario-specific trigger handler is presented as normative.
67. Generated schema and module indexes match source docs.

---

## 42. Критерии готовности

Контракт готов к production cutover, когда одновременно выполнено:

1. существует один active combat owner — расширенный `@rus/combat-health`;
2. существует один common trigger evaluator — `@rus/npc-runtime`;
3. five-category vocabulary зарегистрирован в contracts;
4. event-specific trigger functions отсутствуют;
5. combat session и intents сохраняются;
6. automatic technical steps работают без LLM;
7. LLM вызывается только на aggregated boundary;
8. body threshold crossings edge-triggered;
9. несколько NPC используют один post-exchange snapshot;
10. player and NPC share checks/harm/body owners;
11. Phase 4 работает через общий combat runtime;
12. replay and restart точны;
13. active documentation обновлена атомарно;
14. old bounded/scenario combat path не остаётся production fallback;
15. профильные, интеграционные и architecture tests проходят.

---

## 43. Явные non-goals первой версии

Первая версия не обязана вводить:

- сложную формационную тактику отрядов;
- массовые сражения;
- отдельный AI planner для каждой конечности;
- пошаговую сетку;
- реалистичную баллистику;
- десятки combat stances;
- morale meter, если его ещё нет в body/NPC profile;
- отдельный event sourcing engine;
- индивидуальную trigger function для каждого event kind;
- историческое исполнение старых внутренних combat алгоритмов;
- защиту от намеренной ручной подмены владельцем базы.

Расширение допустимо только после появления конкретного игрового сценария, который текущий общий contract не может выразить.

---

## 44. Итоговая архитектурная формула

```text
Доменные владельцы определяют, что фактически изменилось.

Пять universal categories определяют,
какая часть решения NPC затронута:
self / others / environment / objective / communication.

@rus/npc-runtime агрегирует signals
и создаёт одну reaction_decision boundary.

NPC LLM выбирает одно устойчивое combat intent.

@rus/combat-health и остальные code owners
исполняют проверки, движение, вред, тело и время.

Новый LLM-вызов возможен только после следующего
edge-triggered significant transition.
```

# Приложение A. Machine contract specifications

```yaml
contract_name: npc_decision_signal_v1
storage: party_runtime_append_only
identity:
  - signal_id
fields:
  schema: required enum[npc_decision_signal_v1]
  signal_id: required stable_id
  occurred_at: required game_timestamp
  category: required enum[self, others, environment, objective, communication]
  significance: required enum[material, critical]
  source_event_ref: required entity_ref
  subject_ref: required entity_ref
  scope_refs: required relation_set[entity_ref]
  perception_required: required boolean
  source_perception_ref: optional entity_ref
  causal_parent_refs: required relation_set[entity_ref]
  idempotency_key: required stable_id
invariants:
  - The signal belongs to exactly one NPC and contains no ready action or hidden objective truth.
  - A perception-required signal has one matching perceived result; a non-perception signal carries null source_perception_ref.
  - signal_id and idempotency_key are the same deterministic identity derived from the factual cause and NPC.
```

```yaml
contract_name: npc_decision_boundary_v1
storage: party_runtime_append_only
identity:
  - boundary_id
fields:
  schema: required enum[npc_decision_boundary_v1]
  boundary_id: required stable_id
  decision_mode: required enum[autonomous, conversation, combat]
  scheduled_at: required game_timestamp
  npc_ref: required entity_ref
  same_time_batch_ref: required entity_ref
  significance: required enum[material, critical]
  categories: required nonempty_relation_set[enum[self, others, environment, objective, communication]]
  signal_refs: required nonempty_relation_set[entity_ref]
  state_version: required positive_decimal_string
  resolution_class: required enum[reaction_decision]
  idempotency_key: required stable_id
invariants:
  - One boundary aggregates all new signals for one NPC in one same-time batch in canonical category order.
  - The boundary contains no ready decision and always uses the shared reaction_decision resolution class.
  - Signal consumption is committed only with the decision result or a terminal deterministic outcome.
```
