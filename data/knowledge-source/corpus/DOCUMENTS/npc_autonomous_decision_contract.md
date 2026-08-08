# Контракт автономных решений и действий NPC

**Статус:** `active`, production contract Phase 7 / `spatial-v3-production-v5`\
**Идентификатор:** `npc_autonomous_decision_contract_v1`\
**Владелец решения NPC:** `@rus/npc-runtime`\
**Владелец оркестрации и общего actor-step:** `@rus/turn`\
**Проект:** «Русь XIII век» / `PavelSlaven/Novgorod1230`\
**Дата подготовки:** 2026-08-02\
**База сверки:** `main`, commit `0a21ffd45fcbbf7dfe5706e36098f3f207b7318f`\
**Учтён PR:** №51, слит в `main` 2026-08-02\
**Связанный active-контракт игрока:** `turn_step_llm_contract.md`

## 1. Назначение

Этот документ задаёт полный целевой контракт автономного решения NPC вне отдельного режима разговора.

NPC не опрашивается LLM постоянно. Один вызов LLM происходит только тогда, когда код зафиксировал **новую самостоятельную границу решения NPC**.

LLM получает субъективный контекст конкретного NPC и отвечает на один вопрос:

> Как бы этот человек поступил прямо сейчас?

LLM возвращает одно односоставное действие в структурированном JSON. После этого действие NPC проходит тот же общий порядок интерпретации, проверок, последствий, времени, тела, предметов и сохранения, что и действие персонажа игрока.

Главная формула:

```text
фактическое событие или временная граница
→ code-owned perception и knowledge NPC
→ code-owned reaction_decision boundary
→ один вызов LLM
→ одно решение NPC в npc_step_plan_v1
→ общий actor-step executor
→ проверки, последствия, время и состояние
→ новые события и границы при необходимости
```

## 2. Основные решения контракта

1. Для одного самостоятельного решения NPC используется один вызов LLM.
2. Отдельный LLM-генератор вариантов не используется.
3. Код определяет только момент необходимости решения, но не само решение.
4. LLM возвращает одно ближайшее самостоятельное действие, а не цепочку действий.
5. Решение и его физическая интерпретация проходят тот же фильтр реализма и историчности, что и заявка игрока.
6. Проверки NPC используют тот же RNG/check/consequence pipeline, что и проверки игрока.
7. Разговор и бой являются отдельными domain handoff, а не разрешаются этим агентом.
8. Все режимы NPC используют один общий протокол `npc_decision_signal_v1` → `npc_decision_boundary_v1` и существующий класс `reaction_decision`.
9. Закрытый словарь причин содержит только `self`, `others`, `environment`, `objective`, `communication`; значимость — только `material` или `critical`.
10. Все новые сигналы одного NPC в одном полностью разрешённом same-time batch агрегируются в одну boundary и один LLM-вызов; новая очередь, scheduler или таблица триггеров не создаются.

## 3. Текущее состояние `main` и active-модель

В актуальном `main` уже существуют:

- `@rus/npc-runtime` как владелец schedule, perception и bounded NPC decision;
- `proposeNpcScheduleTransition`;
- `proposeNpcPerception`;
- `proposeNpcReactionOptions`;
- `decideBoundedNpcAction`;
- `temporal_boundary_candidate`;
- resolution class `reaction_decision`;
- порядок `npc_schedule → perception_knowledge → reaction_decision`;
- same-time cascade с evolving state;
- остановка temporal batch через `stop_after_current_batch`;
- детерминированное упорядочивание NPC decision requests.

Historical bounded-модель строит закрытый набор утверждённых вариантов и
разрешает LLM выбрать только `option_id` и `command_token`. Она сохраняется
только для genuinely closed choices и явно pinned historical revisions.

Active Phase 7 заменяет содержание `reaction_decision` для autonomous mode:

```text
active autonomous:
NPC-safe context → semantic LLM decision → structured actor step plan
```

Schedule, perception, temporal ordering, persistence и профильные владельцы механики сохраняются.
Phase 7 «Отдых у огня» длится ровно 30 минут: на +25 возникает общая
autonomous boundary Жданко. Request получает не scenario option set, а
фактически зарегистрированные текущим actor-step операции и доступные refs.
Выбранный plan применяется к working projection на том же timestamp +25;
после этого общий temporal owner продолжает интервал до +30 уже с начатым
действием. Temporal execution, persistence и player-safe visibility остаются
code-owned. Combat resolution не активируется и остаётся `proposed`.

## 4. Архитектурные владельцы

### 4.1. `@rus/npc-runtime`

Владеет:

- построением NPC-safe субъективного контекста из переданных snapshots;
- созданием decision request после формальной `reaction_decision` boundary;
- построением формального запроса для semantic NPC LLM;
- проверкой структуры `npc_step_plan_v1`;
- формированием NPC decision trace;
- replay уже сохранённого решения.

Не владеет:

- глобальной оркестрацией хода;
- точным временем;
- RNG;
- расчётом тела;
- перемещением;
- предметами и контейнерами;
- боем;
- разговором;
- persistence transaction;
- narration.

### 4.2. `@rus/turn`

Владеет:

- общим циклом игрока, времени и NPC-реакций;
- рабочей проекцией состояния до commit;
- асинхронным вызовом LLM через явно переданный service port вне синхронного temporal engine;
- общим actor-step executor для игрока и NPC;
- повторной проверкой актуальности состояния;
- порядком нескольких NPC decisions;
- единым write plan и atomic commit.

### 4.3. Профильные владельцы

Сохраняют существующую ответственность:

- checks/RNG — бросок и выбор ветки;
- movement — маршрут и перемещение;
- temporal runtime — время, activities, boundaries и same-time ordering;
- body-state — точные телесные изменения;
- items/property — масса, руки, вместимость, размещение, владение и нагрузка;
- discovery/knowledge — скрытые факты и доступное знание;
- combat — боевое состояние и исходы;
- conversation — речевое взаимодействие;
- persistence — идемпотентная атомарная запись;
- visible projection — player-safe фактический пакет;
- narrator — художественное изложение сохранённых фактов.

## 5. Общий actor-step для игрока и NPC

После получения semantic plan игрок и NPC используют один порядок:

```text
semantic interpretation
→ availability and current-state recheck
→ generic или domain-owned check
→ RNG и выбор фактической ветки
→ consequences
→ time/activity update
→ body update
→ item/property/movement update
→ hidden and knowledge update
→ perception signals
→ temporal boundaries
→ persistence plan
→ atomic commit
```

Различается только источник намерения:

```text
игрок: свободный текст игрока;
NPC: решение LLM из субъективного состояния NPC.
```

Отдельные `npc-check-engine`, `npc-consequence-engine` и `npc-time-engine` не создаются.

Минимальная реализация — вынести или переиспользовать существующую внутреннюю логику `availability → checks → consequence → time → body` как общий actor-step внутри `@rus/turn`. Это допустимое обобщение, потому что одна и та же ответственность реально требуется игроку и NPC.

## 6. Граница ответственности кода и LLM

### 6.1. Код отвечает за

Код:

- фиксирует фактические события;
- рассчитывает, что NPC воспринял;
- обновляет доступные NPC знания;
- определяет наличие формальной границы решения;
- собирает субъективный контекст;
- вызывает LLM;
- проверяет JSON Schema;
- проверяет существование ссылок;
- проверяет `committed_state_version` и `working_revision`;
- выполняет бросок;
- выбирает фактическую ветку проверки;
- рассчитывает точное время и числовые последствия;
- передаёт domain requests владельцам;
- создаёт новые factual signals и temporal boundaries;
- сохраняет решение и результат;
- не применяет один trigger повторно.

Код не:

- выбирает поступок за NPC;
- оценивает соответствие поступка характеру;
- ранжирует варианты;
- достраивает смысл ответа LLM;
- заменяет неприменимое действие похожим;
- делает NPC более разумным или удобным для сюжета.

### 6.2. LLM отвечает за

LLM:

- принимает одно решение от лица NPC;
- учитывает восприятие, знания и заблуждения NPC;
- учитывает тело, настроение, характер, цели, страхи, роль, отношения и обязательства;
- определяет одно ближайшее самостоятельное действие;
- переводит желание NPC в ближайшую реальную попытку;
- определяет необходимость generic check;
- описывает пять возможных исходов generic check;
- возвращает прямые операции или один основной domain request.

LLM не:

- выполняет бросок;
- выбирает фактический исход проверки;
- вычисляет точные дельты тела;
- рассчитывает маршрут;
- определяет решение другого персонажа;
- разрешает бой;
- пишет реплику разговора;
- пишет художественную прозу;
- пишет в базу данных.

## 7. Единый универсальный протокол триггеров

Этот контракт не определяет собственный словарь причин. Он использует общий протокол NPC decision triggers, единый для автономного поведения, разговора и боя.

### 7.1. Закрытый словарь категорий

Допустимы ровно пять категорий:

```text
self
others
environment
objective
communication
```

- `self` — изменилось собственное состояние или непосредственная способность NPC действовать;
- `others` — изменились другие участники ситуации;
- `environment` — изменилась не-actor обстановка, доступ или возможность пространства;
- `objective` — изменилось текущее намерение, activity, задача или обязательство NPC;
- `communication` — NPC воспринял адресованное либо значимое сообщение.

Дверь, пожар, чужак, потеря оружия, завершение работы и приказ являются factual events. Они не становятся отдельными типами триггеров.

### 7.2. Значимость

Допустимы ровно два значения:

```text
material
critical
```

- `material` — после текущего неделимого шага NPC должен пересмотреть намерение до начала следующего самостоятельного шага;
- `critical` — прежнее намерение нельзя автоматически продолжать после уже применённого factual effect.

Если NPC временно не способен принимать решения, LLM не вызывается. Детерминированный terminal outcome применяется кодом; восстановление способности решать может создать новый `self / critical` signal.

### 7.3. Signal contract

Точная machine schema определяется общим trigger-контрактом и здесь не переопределяется. Доменный владелец фактического перехода применяет декларативный descriptor и формирует общий signal:

```json
{
  "schema": "npc_decision_signal_v1",
  "signal_id": "decision-signal:world_event:event-17:npc-ratsha:environment",
  "occurred_at": {},
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
  "scope_refs": [],
  "perception_required": true,
  "source_perception_ref": {
    "entity_kind": "perception_result",
    "entity_id": "perception-event-17-ratsha"
  },
  "causal_parent_refs": [],
  "idempotency_key": "decision-signal:world_event:event-17:npc-ratsha:environment"
}
```

Signal содержит только категорию, значимость и причинную identity. Предметные детали остаются в factual event и субъективной projection NPC.

### 7.4. Edge-trigger rule

Signal создаётся при переходе, а не из постоянного состояния:

```text
не видел участника → увидел участника
путь закрыт → путь открыт
intent исполним → intent invalidated
приказ не получен → приказ получен
порог тела не пересечён → порог пересечён
```

Продолжающееся низкое здоровье, уже открытая дверь, неизменившееся присутствие чужака и повторное восприятие того же event нового signal не создают.

### 7.5. Декларативная генерация

Запрещены event-specific функции наподобие:

```text
onDoorOpened
onStrangerSeen
onWeaponLost
onWorkFinished
onOrderReceived
```

Допустим один общий emitter:

```text
factual transition
+ applicable decision_signal descriptor
→ npc_decision_signal_v1
```

Применимость и значимость задаёт approved профиль или generic transition mapping соответствующего domain owner. Trigger evaluator не анализирует художественный текст и не оценивает психологию NPC.

### 7.6. Агрегация

Все новые unconsumed signals одного NPC в одном полностью разрешённом same-time batch агрегируются:

1. дубликаты удаляются по `signal_id`;
2. категории собираются в порядке `self → others → environment → objective → communication`;
3. итоговая значимость равна `critical`, если хотя бы один signal critical, иначе `material`;
4. создаётся не более одной `npc_decision_boundary_v1`;
5. выполняется не более одного LLM-вызова для этого NPC в этом batch.

Несколько предметных причин не создают несколько последовательных вызовов LLM.

## 8. Применение протокола к автономному поведению

### 8.1. Охрана территории, объекта или человека

Охранное поведение не вводит отдельный trigger type. Типовые отображения:

```text
новый или изменившийся участник в охраняемом scope → others
изменение прохода, границы доступа или охраняемого объекта → environment
активация, нарушение или невозможность охранной задачи → objective
приказ, вопрос, угроза или требование → communication
собственная травма либо утрата capability → self
```

Signal создаётся только после применимого perception/knowledge update, если восприятие требуется. Код не определяет, окликнет ли сторож чужака, нападёт, проследит или позовёт помощь.

### 8.2. Подозрительность

Подозрительность является частью состояния NPC и applicability policy, а не trigger category.

Она может сделать переход decision-relevant, например первое восприятие незнакомца в уединённом месте. Сам переход всё равно отображается в `others`; изменение выхода — в `environment`; возникший конфликт с текущей целью — в `objective`.

Неизменившееся присутствие чужака не вызывает повторный signal.

### 8.3. Activities и расписание

- изменение собственного состояния NPC отображается в `self`;
- завершение, блокировка, invalidation или decision point activity — в `objective`;
- воспринятое внешнее изменение — в `others` или `environment`;
- полученное сообщение — в `communication`.

`automatic_successor` не создаёт signal. `decision_required` означает generic `objective` signal, а не отдельный cause kind.

## 9. Что не вызывает LLM

LLM не вызывается из-за:

- отсутствия новых unconsumed signals;
- каждого тика времени;
- продолжения исполнимого сохранённого intent или activity;
- automatic schedule successor;
- небольшого изменения тела без decision-relevant transition;
- каждого сегмента маршрута;
- повторного perception одного source event;
- неизменившегося присутствия персонажа;
- narration;
- technical retry, reload или replay;
- детерминированного последствия уже выбранного действия;
- промежуточной операции внутри неделимого шага;
- события, которого NPC не воспринял при обязательном восприятии;
- состояния, в котором NPC не способен принимать решение.

## 10. Агрегированная temporal boundary

Новая очередь и отдельная таблица не создаются. Используется существующий `temporal_boundary_candidate` и общий payload `npc_decision_boundary_v1`:

```json
{
  "schema": "npc_decision_boundary_v1",
  "boundary_id": "npc-decision:autonomous:batch-18:npc-ratsha",
  "decision_mode": "autonomous",
  "scheduled_at": {},
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
    "others",
    "environment",
    "objective"
  ],
  "signal_refs": [],
  "state_version": "17",
  "resolution_class": "reaction_decision",
  "idempotency_key": "npc-decision:autonomous:batch-18:npc-ratsha"
}
```

Инварианты:

- `decision_mode = autonomous`;
- `decision_mode` входит в новую boundary identity;
- один NPC имеет не более одной aggregated boundary и одного LLM-вызова
  данного mode на один fully resolved same-time batch;
- persisted historical identity без mode replay-ится без миграции и не
  используется при создании новой boundary;
- domain/scenario owners выдают только generic signal descriptors, а общий
  temporal/turn owner после полного batch выводит batch identity, consumption
  и persisted replay input из factual state, строит signals и вызывает общий
  NPC-runtime aggregator;
- `resolution_class = reaction_decision`;
- boundary содержит все новые signals NPC этого batch;
- boundary не содержит готового действия;
- signal IDs считаются consumed только вместе с committed decision result либо deterministic terminal outcome;
- повторная обработка возвращает persisted result и не вызывает LLM заново.

## 11. Асинхронная граница temporal engine и LLM

Temporal engine остаётся синхронным. Сетевой LLM-вызов не выполняется внутри same-time resolver или SQL transaction.

```text
1. domain owners полностью применяют factual transitions текущего batch;
2. perception и knowledge обновляются;
3. generic signals собираются и агрегируются;
4. temporal owner завершает текущий batch;
5. @rus/turn получает npc_decision_boundary_v1;
6. @rus/npc-runtime строит NPC-safe request;
7. @rus/turn асинхронно вызывает LLM;
8. общий actor-step применяет plan к working projection;
9. новые factual transitions снова проходят общий signal protocol;
10. processing продолжается с того же GameTimestamp до fixed point;
11. формируется один validated write plan и atomic commit.
```

## 12. Несколько NPC в одном same-time batch

### 12.1. Отдельная агрегация

Один factual batch может создать signals для нескольких NPC. Для каждого NPC signals агрегируются отдельно. Один NPC получает не более одной boundary этого mode и batch.

### 12.2. Канонический порядок вне боя

Автономные boundaries упорядочиваются:

1. `scheduled_at`;
2. `npc_ref`;
3. `boundary_id`.

Вызовы LLM выполняются последовательно. Перед каждым вызовом строится свежий субъективный context из evolving working state.

### 12.3. Положительная длительность

Длительные activities нескольких NPC, выбранные в одном timestamp, только стартуют в этом timestamp. Время не продвигается до исчерпания same-time decision boundaries.

### 12.4. Моментальные действия и stale state

Моментальное действие может изменить working state и сделать ещё не обработанную boundary stale. Старый ответ не применяется; request перестраивается только если новые unconsumed signals всё ещё требуют решения.

### 12.5. Handoff

`request_conversation` и `request_combat` регистрируют переход к соответствующему mode owner. Они не создают реплику, удар или исход внутри автономного контракта.

## 13. Односоставное действие

### 13.1. Норматив

LLM возвращает ровно одно ближайшее самостоятельное действие NPC.

Односоставность определяется одним основным намерением, а не количеством JSON operations.

Допустимо:

- уйти;
- направиться по известному маршруту;
- взять доступный предмет;
- открыть контейнер;
- спрятаться;
- продолжить работу;
- помочь;
- остаться наблюдать;
- отказаться вмешиваться;
- положить оружие и сдаться;
- начать разговор;
- начать боевое взаимодействие;
- подготовиться защищаться.

Недопустимо:

- открыть сундук, взять меч и напасть;
- добежать до реки, найти лодку и уплыть;
- заговорить, убедить собеседника и получить помощь;
- поднять нож, пригрозить и потребовать проход;
- осмотреть дом, найти выход и скрыться.

### 13.2. Несколько технических операций

Несколько operations допустимы только как неразделимые части одного поступка.

Пример одного решения «сдаться»:

- положить нож;
- изменить текущий факт на состояние сдачи;
- принять неагрессивную позу.

Это не три последовательных решения, а единый поступок.

### 13.3. Формальная граница односоставности

Код не анализирует естественный язык `npc_goal` или `grounded_attempt` и не пытается сам определить, содержит ли описание два смысловых решения.

Односоставность обеспечивается:

- инструкцией runtime prompt;
- отсутствием `continuation`;
- требованием одного основного domain request;
- contract fixtures и LLM evals на составные действия.

Код проверяет только формальные признаки и не исправляет смысловой план.

### 13.4. Отсутствие `continuation`

В `npc_step_plan_v1` нет поля `continuation`.

NPC-agent не планирует скрытую цепочку будущих решений.

Если после результата требуется новый самостоятельный выбор, соответствующий владелец создаёт новую `reaction_decision` boundary.

Примеры:

- NPC открыл сундук и увидел contents → новый trigger, если теперь нужно выбирать предмет;
- NPC завершил маршрут → terminal profile решает, нужен ли новый выбор;
- NPC провалил попытку побега → consequence может создать новую decision boundary;
- NPC получил ответ в разговоре → conversation mode определяет следующую речевую границу.

## 14. Историчность и реализм

### 14.1. Тот же фильтр, что у игрока

Решение NPC не становится фактом только потому, что его сформировала LLM.

LLM должна разделять:

- `npc_goal` — чего NPC решил добиться;
- `grounded_attempt` — что он реально делает;
- `adaptation` — как намерение ограничено реальностью;
- `goal_result` — достигнута ли цель действия.

Допустимые `adaptation`:

- `literal`;
- `reality_limited`;
- `make_believe`.

### 14.2. Общие знания

LLM может использовать общеизвестные знания:

- о человеческом теле;
- об обычных человеческих возможностях;
- о материалах и предметах;
- о животных и природе;
- о физических причинно-следственных связях;
- об общих социальных и бытовых реалиях указанной эпохи.

Общие знания используются для оценки правдоподобия, но не для создания конкретных значимых фактов партии.

Переданный контекст всегда имеет приоритет.

### 14.3. Историческая субъективность

NPC не обязан мыслить как современный рациональный человек.

LLM учитывает:

- религиозные представления;
- суеверия;
- социальную иерархию;
- право и обычай;
- зависимость от господина, общины, артели, рода или власти;
- страх бесчестья, наказания и потери покровительства;
- ограниченный круг знаний эпохи.

Но убеждение NPC не создаёт объективный факт мира.

Если NPC считает игрока колдуном, это может повлиять на его поступок, но не доказывает существование магии.

### 14.4. Невозможное намерение

Невозможная цель не блокируется и не получает запредельный check.

LLM возвращает ближайшую реальную попытку.

Пример:

```json
{
  "interpretation": {
    "npc_goal": "взлететь и уйти от опасности",
    "grounded_attempt": "NPC вскакивает и машет руками, пытаясь подняться в воздух",
    "adaptation": "reality_limited"
  },
  "resolution": "direct",
  "goal_result": "not_achieved"
}
```

### 14.5. Заявленное действие не равно успеху

LLM не может объявить:

- успешный побег;
- найденный скрытый предмет;
- согласие другого NPC;
- попадание в бою;
- открытую закрытую дверь;
- знание неизвестного факта;
- невозможное перемещение;
- отмену травмы.

Она возвращает попытку и нужный способ разрешения.

## 15. Контракт входа `npc_action_decision_request_v1`

```json
{
  "schema": "npc_action_decision_request_v1",
  "request_id": "npc-request-42",
  "root_turn_id": "turn-17",
  "boundary_id": "npc-decision:autonomous:event-17:npc-ratsha",
  "committed_state_version": 17,
  "working_revision": 4,
  "decision_index": 2,
  "occurred_at": {
    "whole_minutes": "620",
    "subminute_numerator": "0",
    "subminute_denominator": "1"
  },
  "npc_ref": "npc-ratsha",

  "decision_reasons": {
    "significance": "material",
    "categories": [
      "others",
      "objective"
    ],
    "signal_refs": [
      {
        "entity_kind": "npc_decision_signal",
        "entity_id": "decision-signal:temporal_event:entry-17:npc-ratsha:others"
      },
      {
        "entity_kind": "npc_decision_signal",
        "entity_id": "decision-signal:objective_change:intent-17:npc-ratsha:objective"
      }
    ],
    "perceived_changes": [
      "Ратша впервые заметил Микулу внутри сушильни.",
      "Прежнее ожидание больше нельзя продолжать автоматически."
    ]
  },

  "historical_context": {
    "year": 1230,
    "season": "summer",
    "region": "Lower Dvina",
    "applicable_norms": [],
    "known_local_customs": []
  },

  "npc": {
    "profile_level": "scene",
    "profile_ref": "trace_ld_v1_npc_ratsha",
    "identity": {
      "name_or_label": "Ратша",
      "age_range": "adult",
      "origin": null
    },
    "social_role": {
      "role_ref": "storehouse_helper",
      "status": "dependent helper",
      "authority": [],
      "dependencies": []
    },
    "attributes": [
      {
        "attribute_ref": "strength",
        "label": "Сила",
        "value": 10
      }
    ],
    "skills": [
      {
        "skill_ref": "close_combat",
        "label": "Ближний бой",
        "value": 1
      }
    ],
    "body_state": {
      "summary": "не ранен, устал",
      "conditions": []
    },
    "mood": {
      "state": "испуган и загнан",
      "intensity": "strong"
    },
    "temperament": [],
    "values": [],
    "goals": [],
    "fears": [],
    "obligations": [],
    "relationships": [],
    "current_location": {
      "location_ref": "location-shed",
      "zone_ref": "shed-inside"
    },
    "current_activity": {
      "activity_ref": null,
      "summary": null,
      "status": "none",
      "can_continue_automatically": false
    },
    "available_resources": []
  },

  "perception": {
    "visible_scene": [],
    "perceived_changes": [],
    "heard": [],
    "felt": [],
    "present_actors": [],
    "visible_objects": [],
    "known_routes_and_exits": [],
    "uncertainties": []
  },

  "knowledge": {
    "known_facts": [],
    "beliefs": [],
    "hypotheses": []
  },

  "memory": {
    "recent_events": [],
    "relevant_long_term_events": [],
    "previous_decisions": []
  },

  "decision_scope": {
    "mode": "autonomous_action",
    "allowed_attribute_refs": ["strength", "agility"],
    "allowed_skill_refs": ["close_combat", "evasion"],
    "operation_contract": {}
  }
}
```

### 15.1. Обязательные свойства входа

- Вход содержит только сведения, доступные NPC, кроме технических идентификаторов и контрактов.
- `decision_reasons.categories` содержит только `self`, `others`, `environment`, `objective`, `communication` в каноническом порядке.
- `decision_reasons.significance` содержит только `material` или `critical`.
- `decision_reasons.perceived_changes` кратко описывает агрегированные source events с точки зрения NPC и не вводит новые trigger types.
- Ошибочное убеждение находится в `beliefs`, а не в `known_facts`.
- В `available_resources` входят только известные и доступные NPC сущности.
  Контролируемый NPC ресурс считается известным; чужой ресурс требует и
  физической доступности, и persisted source-backed perception/knowledge,
  ссылающегося на exact resource ref.
- Belief, hypothesis или uncertainty сами по себе не доказывают наличие и
  положение чужого ресурса и не добавляют его в `available_resources`.
- `allowed_attribute_refs` и `allowed_skill_refs` ограничивают generic check.
- `operation_contract` содержит только реально поддерживаемые operations текущего runtime.
- Отсутствующее поле личности не заполняется LLM как постоянная черта.
- `profile_ref`, `social_role.role_ref`, `current_location`, тело, настроение,
  отношения и ресурсы проецируются общим NPC-safe builder только из supplied
  persisted snapshots.
- Если persisted snapshot не содержит необязательное субъективное поле,
  request сохраняет контрактный `null` или пустой массив; scenario code не
  подставляет роль, настроение, отношения, ценности или prose facts.

### 15.2. Профили NPC

Для `background` передаётся только сохранённый минимум:

- роль;
- текущее занятие;
- положение;
- базовое настроение;
- отношение к порядку сцены;
- воспринятое событие;
- непосредственно доступные ресурсы.

Для `scene` дополнительно:

- идентичность и статус;
- ближайшая цель;
- страхи;
- отношения;
- знания и заблуждения;
- релевантные характеристики и навыки;
- права на предметы и действия.

Для `key` дополнительно:

- ценности;
- долговременные цели;
- память;
- обязательства;
- обещания и долги;
- устойчивые отношения;
- прежние решения.

## 16. Контракт выхода `npc_step_plan_v1`

```json
{
  "schema": "npc_step_plan_v1",
  "request_id": "npc-request-42",
  "root_turn_id": "turn-17",
  "boundary_id": "npc-decision:autonomous:event-17:npc-ratsha",
  "committed_state_version": 17,
  "working_revision": 4,
  "decision_index": 2,
  "npc_ref": "npc-ratsha",

  "interpretation": {
    "npc_goal": "выйти из сушильни и избежать расправы",
    "grounded_attempt": "отступить к доступному выходу и начать уходить",
    "adaptation": "literal"
  },

  "resolution": "domain_request",
  "goal_result": "pending",

  "activity": {
    "owner": "domain",
    "duration_class": null,
    "effort": null
  },

  "operations": [],
  "check": null,
  "reason_code": "fear_driven_withdrawal",
  "reason": "Ратша боится расправы и видит доступный путь к отступлению"
}
```

Все поля обязательны. Неиспользуемые значения равны `null` или пустому массиву.

Для всех объектов machine JSON Schema использует `additionalProperties: false`.

### 16.1. `resolution`

Допустимы:

- `direct`;
- `generic_check`;
- `domain_request`.

Отдельных значений `conversation_handoff` и `combat_handoff` нет. Разговор и бой передаются как специальные domain requests.

Результата `blocked` нет.

Если желаемый результат невозможен, используется `direct` с реальной попыткой и `goal_result: "not_achieved"` либо физически возможная попытка с проверкой.

### 16.2. `goal_result`

Допустимы:

- `pending`;
- `achieved`;
- `partially_achieved`;
- `not_achieved`.

Для `generic_check` верхнеуровневый `goal_result` равен `pending`, а фактический результат задаётся веткой.

Для `domain_request` верхнеуровневый результат обычно `pending`, пока профильный владелец не разрешил действие.

### 16.3. `activity`

Для `direct` и `generic_check`:

```json
{
  "owner": "semantic",
  "duration_class": "moment | brief | short | extended",
  "effort": "none | light | moderate | heavy | extreme"
}
```

Для domain-owned действия:

```json
{
  "owner": "domain",
  "duration_class": null,
  "effort": null
}
```

LLM не возвращает точные минуты и числовые изменения тела.

## 17. Универсальная проверка NPC

`generic_check` использует тот же контракт, что и действие игрока.

Она разрешена только когда:

- попытка реальна;
- исход действительно неопределён;
- разные исходы имеют разные последствия;
- профильный владелец не имеет собственного check contract.

Проверка не делает физически невозможное возможным.

```json
{
  "resolution": "generic_check",
  "goal_result": "pending",
  "operations": [],
  "check": {
    "purpose": "проскользнуть мимо Микулы к выходу",
    "attribute_ref": "agility",
    "skill_ref": "evasion",
    "difficulty_id": "risky",
    "outcomes": {
      "clean_success": {
        "goal_result": "achieved",
        "additional_activity": null,
        "operations": []
      },
      "success": {
        "goal_result": "achieved",
        "additional_activity": null,
        "operations": []
      },
      "success_with_cost": {
        "goal_result": "achieved",
        "additional_activity": {
          "duration_class": "brief",
          "effort": "moderate"
        },
        "operations": []
      },
      "failure_with_consequence": {
        "goal_result": "not_achieved",
        "additional_activity": null,
        "operations": []
      },
      "severe_failure": {
        "goal_result": "not_achieved",
        "additional_activity": null,
        "operations": []
      }
    }
  }
}
```

Допустимые сложности:

- `trivial`;
- `ordinary`;
- `risky`;
- `dangerous`;
- `limit`;
- `nearly_impossible`.

Обязательные исходы:

- `clean_success`;
- `success`;
- `success_with_cost`;
- `failure_with_consequence`;
- `severe_failure`.

Код:

1. применяет характеристики, навыки, тело, экипировку и обстоятельства;
2. выполняет RNG;
3. выбирает ветку;
4. рассчитывает точные последствия;
5. создаёт новый trigger только если после результата требуется новое решение.

У ветвей NPC check нет `continuation`.

## 18. Разрешённые прямые операции

`direct` и ветви `generic_check` могут содержать только operations, переданные в `decision_scope.operation_contract`.

Для общего actor-step используются те же прямые operations, что и для игрока.

### 18.1. `create_entity`

Создаёт новую самостоятельную физическую сущность как непосредственный результат действия NPC.

```json
{
  "op": "create_entity",
  "temp_ref": "new_entity_1",
  "semantic_type": "material_portion",
  "name": "небольшой камень",
  "origin": {
    "kind": "direct_partition | ambient_ordinary | crafted",
    "source_refs": ["environment_ground"]
  },
  "facts": [
    {
      "temp_ref": "new_fact_1",
      "text": "обычный камень, поднятый с земли"
    }
  ],
  "mechanics": {
    "mass_grams": 180,
    "external_hand_cost": 1,
    "carry_form": "compact",
    "packing_slot_cost": 1,
    "quantity": null,
    "container": null
  },
  "placement": {
    "relation": "held_by",
    "target_ref": "npc-ratsha"
  }
}
```

Допустимые `origin.kind`:

- `direct_partition` — часть отделена от существующей сущности или материала;
- `ambient_ordinary` — обычная незначимая часть окружения конкретизирована прямым взаимодействием;
- `crafted` — предмет изготовлен из доступных перечисленных материалов.

Нельзя создавать:

- NPC;
- место или здание;
- отсутствующую вещь, которую NPC только вообразил;
- фантастическую технологию;
- уникальный, ценный, принадлежащий кому-либо или сюжетно значимый предмет без code-owned основания;
- письмо, монету, оружие, останки, клад или улику как случайную выдумку;
- contents закрытого контейнера.

#### Обычная конкретизация окружения

Допустимы обычные неуникальные физические результаты прямого действия:

- камень;
- корень;
- червь;
- ком глины;
- щепка;
- ракушка;
- кусок коры;
- пучок обычной травы.

Объект не должен создавать сюжетный факт, право собственности, улику или скрытое знание.

#### Механика нового экземпляра

`mass_grams`:

- собственная масса конкретного экземпляра;
- целое неотрицательное число;
- одно правдоподобное округлённое значение;
- учитывает материал, размер, влажность и наполненность;
- оценивается отдельно для каждого нового экземпляра.

`external_hand_cost` принимает только `0`, `1` или `2`.

`carry_form`:

- `compact`;
- `regular`;
- `long`;
- `bulky`.

После сохранения механика не пересчитывается LLM без физического изменения экземпляра.

### 18.2. `move_entity`

```json
{
  "op": "move_entity",
  "entity_ref": "item-knife",
  "placement": {
    "relation": "held_by | worn_by | inside | located_at | attached_to",
    "target_ref": "npc-ratsha"
  }
}
```

Код сам выводит:

- занятие и освобождение рук;
- удаление из прежнего контейнера;
- добавление в новый контейнер;
- общую массу;
- нагрузку;
- доступность предмета;
- изменение contents.

### 18.3. `change_entity_facts`

```json
{
  "op": "change_entity_facts",
  "entity_ref": "npc-ratsha",
  "remove_fact_refs": ["fact-ratsha-threatening"],
  "add_facts": [
    {
      "temp_ref": "new_fact_1",
      "text": "Ратша явно сдался и прекратил сопротивление"
    }
  ]
}
```

Используется только для текущего семантического состояния, не принадлежащего отдельному domain owner.

Нельзя использовать для:

- размещения;
- contents контейнера;
- состояния замка;
- массы;
- количества;
- рук;
- точного времени;
- числовых параметров тела;
- решения другого NPC.

Удаляется только текущий факт, переставший быть истинным. Произошедшее событие не удаляется.

### 18.4. `set_entity_mechanics`

Используется только после фактического физического изменения сущности.

```json
{
  "op": "set_entity_mechanics",
  "entity_ref": "item-pole",
  "mechanics": {
    "mass_grams": 900,
    "external_hand_cost": 1,
    "carry_form": "long",
    "packing_slot_cost": 3,
    "quantity": null,
    "container": null
  },
  "reason": "древко было укорочено"
}
```

Возвращается полный новый mechanics profile, а не дельта.

### 18.5. `retire_entity`

```json
{
  "op": "retire_entity",
  "entity_ref": "item-rope-piece",
  "reason": "материал полностью израсходован при изготовлении"
}
```

### 18.6. `apply_body_event`

Используется только для отдельного телесного происшествия сверх обычной нагрузки действия.

```json
{
  "op": "apply_body_event",
  "actor_ref": "npc-ratsha",
  "mechanism": "impact | cut | puncture | burn | strain | crush | fall | cold | heat | suffocation | poison | other",
  "severity": "minor | moderate | severe | critical",
  "body_part_ref": null,
  "description": "Ратша ударился плечом о косяк"
}
```

Точные изменения тела рассчитывает body owner.

## 19. Разрешённые domain requests

`domain_request` содержит ровно один основной запрос профильному владельцу.

Прямые подготовительные operations допустимы только когда они являются неразделимой частью одного действия и не зависят от результата domain request.

### 19.1. `request_discovery`

```json
{
  "op": "request_discovery",
  "actor_ref": "npc-ratsha",
  "discovery_kind": "look | inspect | search | listen | remember | dig",
  "target_refs": ["location-shed"],
  "query": "найти доступный выход из сушильни"
}
```

LLM не придумывает значимый скрытый результат.

Если discovery раскрывает новое существенное состояние и NPC должен выбрать следующее действие, discovery owner создаёт новую decision boundary.

### 19.2. `request_container_access`

```json
{
  "op": "request_container_access",
  "actor_ref": "npc-ratsha",
  "container_ref": "chest-1",
  "access_kind": "open | close | unlock | force | open_and_view"
}
```

Container owner:

- проверяет состояние и доступ;
- выполняет собственную проверку при необходимости;
- раскрывает уже сохранённое contents;
- либо впервые материализует contents по code-owned профилю;
- сохраняет конкретное содержимое.

LLM не перечисляет contents закрытого контейнера.

### 19.3. `request_movement`

```json
{
  "op": "request_movement",
  "actor_ref": "npc-ratsha",
  "target_ref": "shed-exit",
  "movement_kind": "local | route | long_course"
}
```

Movement/temporal owner определяет:

- маршрут;
- доступ;
- точное время;
- нагрузку;
- boundaries;
- итоговую позицию;
- interruption.

### 19.4. `request_item_use`

```json
{
  "op": "request_item_use",
  "actor_ref": "npc-ratsha",
  "item_ref": "item-knife",
  "use_kind": "consume | apply | operate | equip | unequip | other",
  "target_refs": []
}
```

Item owner рассчитывает количество, transitions и effects.

### 19.5. `request_activity`

```json
{
  "op": "request_activity",
  "actor_ref": "npc-eremey",
  "activity_kind": "wait | sleep | work | recover | carry | guard | observe | other",
  "target_refs": [],
  "description": "продолжить чинить сеть"
}
```

Точная длительность, progress, interruption и terminal mode принадлежат temporal owner.

### 19.6. `emit_interaction`

Используется только для простого неречевого взаимодействия, которое не открывает полноценный разговор и не является боевой атакой.

```json
{
  "op": "emit_interaction",
  "actor_ref": "npc-eremey",
  "target_actor_refs": ["actor-mikula"],
  "interaction_kind": "gesture | offer | request | threat_display | aid | other",
  "content": "Еремей жестом показывает остановиться",
  "instrument_refs": []
}
```

LLM не определяет реакцию адресата.

### 19.7. `request_conversation`

```json
{
  "op": "request_conversation",
  "actor_ref": "npc-ratsha",
  "target_actor_refs": ["actor-mikula"],
  "conversation_goal": "добиться разрешения уйти"
}
```

NPC decision LLM:

- не пишет реплику;
- не выбирает речевую стратегию;
- не определяет ответ;
- не выполняет social check.

Это принадлежит отдельному conversation mode.

### 19.8. `request_combat`

```json
{
  "op": "request_combat",
  "actor_ref": "npc-ratsha",
  "target_actor_refs": ["actor-mikula"],
  "combat_intent": "прорваться к выходу, угрожая ножом"
}
```

NPC decision LLM:

- не определяет попадание;
- не выполняет атаку;
- не рассчитывает защиту;
- не наносит вред;
- не определяет исход боя.

Это принадлежит combat owner.

## 20. Запрет производных эффектов

LLM не возвращает отдельно:

- занятые или свободные руки;
- изменение contents после перемещения предмета;
- общую массу;
- категорию нагрузки;
- точное время;
- числовой расход энергии;
- числовое изменение здоровья или сытости;
- результат RNG;
- выбранную фактическую ветку проверки;
- решение другого NPC;
- маршрут;
- combat outcome;
- conversation outcome;
- художественную прозу.

## 21. Скрытые сведения и субъективный контекст

### 21.1. Не передавать LLM

В NPC request не передаются:

- скрытые мотивы других персонажей;
- невоспринятые предметы;
- contents закрытых контейнеров;
- объективная истинность слухов;
- будущие события;
- неизвестные маршруты;
- технические промты;
- player-facing подсказки;
- желаемое автором развитие сюжета.

### 21.2. Ошибочные представления

NPC может действовать на основании ложного убеждения.

Например:

```json
{
  "beliefs": [
    "Ратша считает, что Еремей выдаст его Жданко"
  ]
}
```

Это влияет на решение, но не становится объективным фактом мира.

### 21.3. Внутренняя причина решения

Поле `reason` является внутренней диагностикой.

Оно:

- не попадает в narration;
- не раскрывается игроку;
- не становится знанием других NPC;
- не считается объективным мотивом сверх сохранённого контекста;
- может сохраняться в internal decision trace для тестирования.

## 22. Валидация ответа LLM

Код выполняет только формальную и механическую валидацию.

Проверяется:

1. JSON Schema;
2. точное совпадение `request_id`;
3. точное совпадение `root_turn_id`;
4. точное совпадение `boundary_id`;
5. точное совпадение `committed_state_version`;
6. точное совпадение `working_revision`;
7. точное совпадение `decision_index`;
8. точное совпадение `npc_ref`;
9. существование всех постоянных refs;
10. уникальность и порядок temp refs;
11. допустимость operations по `operation_contract`;
12. допустимость attributes/skills;
13. полный набор пяти outcomes при `generic_check`;
14. отсутствие `continuation`;
15. отсутствие неизвестных полей.

Код не оценивает:

- правдоподобие характера;
- моральность решения;
- оптимальность;
- сюжетную полезность;
- наличие более разумного варианта.

### 22.1. Stale response

Перед применением plan код повторно читает актуальную working projection.

Если идентичность или preconditions изменились:

- ответ не применяется;
- код не исправляет его;
- request перестраивается из актуального состояния;
- LLM вызывается заново только если boundary всё ещё требует решения.

### 22.2. Repair попытка

При структурной ошибке допускается одна повторная LLM-попытка с отдельным repair prompt.

После второй структурной ошибки:

- состояние мира не изменяется;
- trigger остаётся необработанным;
- возвращается техническая ошибка LLM contract;
- смысловой fallback кодом запрещён.

## 23. Persistence, replay и идемпотентность

### 23.1. Новая таблица не требуется

Используются существующие:

- temporal boundary identity;
- NPC decision trace persistence target;
- root turn write plan;
- idempotency record;
- atomic commit.

Если текущий decision trace хранит только `option_id`/`command_token`, его schema заменяется или расширяется для semantic plan. Отдельное параллельное хранилище не создаётся.

### 23.2. Decision trace

```json
{
  "schema": "npc_semantic_decision_trace_v1",
  "request_id": "npc-request-42",
  "root_turn_id": "turn-17",
  "boundary_id": "npc-decision:autonomous:event-17:npc-ratsha",
  "npc_ref": "npc-ratsha",
  "committed_state_version": 17,
  "working_revision": 4,
  "plan": {},
  "applied_change_set_id": "change-set-17",
  "status": "committed"
}
```

### 23.3. Повтор

Повтор с тем же committed `boundary_id` (trigger_aligned):

- не вызывает LLM;
- не выполняет действие повторно;
- возвращает сохранённый decision trace и результат.

Persisted `boundary_snapshot` / `signal_records` / `request_snapshot` /
`canonical_input_digest` могут храниться как proof, но сами по себе не
создают новый mandatory mismatch fail: достаточно совпадения committed
`boundary_id` и сохранённого decision/idempotency. Конфликт объявляется
только при реальном расхождении identity (другой `boundary_id` или
противоречивый persisted trace). Trace-only replay с тем же
`boundary_id` допускается.

Если сбой произошёл до commit, решение ещё не стало фактом мира и может быть рассчитано заново.

### 23.4. Атомарность

В одном root turn атомарно сохраняются:

- действие игрока;
- фактические проверки;
- NPC decisions;
- selected check outcomes;
- time/body/item/movement changes;
- perception and knowledge updates;
- обработанные boundaries;
- player-safe projection.

LLM не вызывается внутри SQL transaction.

## 24. Примеры

### 24.1. Сторож впервые заметил чужака

Контекст:

- NPC охраняет складской двор;
- место малолюдное;
- незнакомец вошёл в guarded scope;
- perception result — `recognized` как неизвестный человек;
- applicable profile создаёт `others / material` signal;
- общий evaluator агрегирует signals и создаёт одну autonomous boundary.

Возможный ответ LLM:

```json
{
  "schema": "npc_step_plan_v1",
  "request_id": "npc-request-guard-1",
  "root_turn_id": "turn-18",
  "boundary_id": "npc-decision:autonomous:entry-1:guard-1",
  "committed_state_version": 18,
  "working_revision": 2,
  "decision_index": 1,
  "npc_ref": "npc-guard-1",
  "interpretation": {
    "npc_goal": "остановить неизвестного и выяснить, зачем он вошёл",
    "grounded_attempt": "выйти ему навстречу и начать разговор",
    "adaptation": "literal"
  },
  "resolution": "domain_request",
  "goal_result": "pending",
  "activity": {
    "owner": "domain",
    "duration_class": null,
    "effort": null
  },
  "operations": [
    {
      "op": "request_conversation",
      "actor_ref": "npc-guard-1",
      "target_actor_refs": ["actor-mikula"],
      "conversation_goal": "потребовать объяснить причину входа на охраняемую территорию"
    }
  ],
  "check": null,
  "reason_code": "guarded_scope_intrusion",
  "reason": "Сторож обязан следить за двором и впервые заметил неизвестного внутри охраняемой территории"
}
```

### 24.2. Подозрительный человек в пустой сушильне

NPC не охранник, но:

- находится в уединённом месте;
- боится разоблачения;
- впервые увидел незнакомца;
- applicability policy делает этот переход decision-relevant.

Создаётся `others / material`, а не отдельный suspicious-stranger trigger. NPC может решить наблюдать, уйти, спрятаться или начать разговор. Код не задаёт конкретную реакцию.

### 24.3. Обычный человек в людном стане

Новое лицо среди множества рыбаков само по себе не создаёт boundary, если:

- NPC не охраняет scope;
- незнакомец не приближается лично к нему;
- не взаимодействует с важным объектом;
- applicability policy не создаёт decision signal.

LLM не вызывается.

### 24.4. Generic check

NPC решил быстро проскользнуть между человеком и дверью.

LLM возвращает один generic check. Код выполняет RNG и выбирает outcome. После неудачи новая реакция создаётся только если NPC должен снова решить, что делать.

### 24.5. Невозможное действие

Бредящий NPC решил взлететь.

LLM возвращает реальную попытку без невозможного check:

```json
{
  "interpretation": {
    "npc_goal": "взлететь и скрыться",
    "grounded_attempt": "подпрыгнуть и замахать руками, пытаясь подняться в воздух",
    "adaptation": "reality_limited"
  },
  "resolution": "direct",
  "goal_result": "not_achieved",
  "activity": {
    "owner": "semantic",
    "duration_class": "brief",
    "effort": "moderate"
  },
  "operations": [],
  "check": null
}
```

### 24.6. Несколько NPC увидели нож

```text
1. player action фактически разрешено;
2. создаётся visual factual signal;
3. Еремей recognized угрозу;
4. рыбак-2 perceived_partial;
5. рыбак-3 not_perceived;
6. applicable policy Еремея создаёт `others` и/или `objective` decision signals;
7. policy рыбака-2 создаёт generic signals только при применимой настороженности;
8. рыбак-3 не получает resolved decision signal;
9. signals каждого NPC агрегируются в одну boundary;
10. boundaries обрабатываются в каноническом порядке;
11. положительные activities стартуют в одном GameTimestamp;
12. после fixed point время движется к ближайшей temporal boundary.
```

## 25. Канонический runtime prompt NPC

Ниже расположен статический prompt. В конец каждого вызова подставляется только текущий `NPC_ACTION_DECISION_REQUEST_JSON`.

---

Ты принимаешь одно самостоятельное решение за конкретного NPC исторической ролевой игры.

Каждый вызов является независимой сессией. У тебя нет памяти о предыдущих вызовах. Единственный источник конкретных фактов текущей партии — переданный `NPC_ACTION_DECISION_REQUEST`.

Верни только один корректный JSON-объект `npc_step_plan_v1`. Не добавляй Markdown, комментарии, пояснения до JSON или текст после него.

### Твоя задача

1. Рассмотри ситуацию только с точки зрения NPC.
2. Определи, как бы именно этот человек поступил прямо сейчас.
3. Выбери одно ближайшее самостоятельное действие.
4. Переведи его намерение в ближайшую реальную и исторически допустимую попытку.
5. Выбери один способ разрешения: `direct`, `generic_check` или `domain_request`.
6. Верни только непосредственный план этого действия.

Не перечисляй варианты.

Не объясняй, что NPC мог бы сделать.

Прими одно окончательное решение.

### Почему тебя вызвали

Код агрегировал новые decision-relevant signals одного или нескольких типов:

- `self` — собственное состояние и возможности NPC;
- `others` — другие участники;
- `environment` — обстановка, доступ и пространство;
- `objective` — текущее намерение, activity, задача или обязательство;
- `communication` — воспринятое сообщение.

`material` требует пересмотра до следующего самостоятельного шага. `critical` запрещает автоматически продолжать прежнее намерение.

Используй конкретные `perceived_changes`. Не придумывай новые категории и не анализируй, почему код присвоил signal.

### Субъективная точка зрения

Используй только:

- что NPC видит;
- что NPC слышит;
- что NPC ощущает;
- что NPC знает;
- во что NPC ошибочно верит;
- что NPC помнит;
- его характеристики и навыки;
- состояние тела;
- настроение и эмоции;
- темперамент;
- ценности;
- цели;
- страхи;
- обязанности;
- социальную роль;
- отношения;
- доверие;
- враждебность;
- зависимость;
- доступные предметы;
- известные пути;
- текущую деятельность;
- агрегированные `perceived_changes`, вызвавшие решение;
- переданный исторический и локальный контекст.

Не используй объективные факты, которых NPC не знает.

NPC может принять плохое или ошибочное решение из-за неполных сведений.

Ошибочное убеждение влияет на решение, но не становится объективной истиной мира.

### Как принимать решение

Ответь на вопрос:

«Как бы этот человек поступил прямо сейчас?»

Не выбирай действие ради:

- пользы игроку;
- наказания игрока;
- удобства сюжета;
- драматичности;
- обязательного конфликта;
- обязательного спасения NPC;
- исторически желательного результата.

Ни одна отдельная черта не является абсолютной командой.

Трусливый человек не всегда убегает.

Верный человек не всегда жертвует собой.

Жадный человек не всегда выбирает деньги.

Испуганный человек может замереть, подчиниться, спрятаться, бежать или ударить первым — в зависимости от всей ситуации.

### Общие знания и историчность

Используй общеизвестные знания о человеческом теле, обычных человеческих возможностях, материалах, предметах, животных, природе, физических причинно-следственных связях и общих реалиях указанной эпохи.

Считай мир обычным немагическим историческим миром, если переданное состояние прямо не устанавливает иное.

Считай NPC обычным человеком, если его сохранённое состояние прямо не содержит необычной способности или действующего эффекта.

Учитывай исторические представления NPC, его религию, суеверия, обычай, социальную иерархию и зависимость. Не превращай NPC в современного человека.

Общие знания нельзя использовать для создания конкретных значимых фактов текущей партии.

Переданное состояние всегда имеет приоритет.

### Решение не является совершившимся фактом

Намерение NPC само по себе не создаёт:

- предмет;
- способность;
- успешный бросок;
- согласие другого персонажа;
- скрытое знание;
- невозможное перемещение;
- отмену травмы;
- результат боя;
- изменение прошлого.

Не принимай желаемый результат как уже совершившийся.

### Адаптация к реальности

Разделяй:

- `npc_goal` — чего NPC хочет добиться;
- `grounded_attempt` — что NPC реально предпринимает;
- `adaptation` — как намерение ограничено реальностью;
- `goal_result` — достигнута ли цель действия.

Используй:

- `literal` — действие исполняется буквально;
- `reality_limited` — возможная часть выполняется, невозможная часть не происходит;
- `make_believe` — NPC изображает или воображает действие с отсутствующей либо фантастической предпосылкой.

Не заменяй выбранное намерение другим полезным действием.

Проверка не делает физически невозможное возможным.

### Односоставность

Верни ровно одно ближайшее самостоятельное действие.

Не объединяй последовательные решения.

Если следующий шаг зависит от:

- результата проверки;
- нового места;
- раскрытого contents;
- ответа другого персонажа;
- начала боя;
- нового существенного события;
- завершения или прерывания activity,

остановись на первом действии.

В ответе нет `continuation`.

Следующее самостоятельное решение будет вызвано кодом новой decision boundary.

Одно действие может содержать несколько technical operations только тогда, когда они являются неразделимыми частями одного намерения.

Длительная movement или activity может быть одним действием. Не дроби её на микрошаги.

### Бездействие

NPC не обязан предпринимать активное действие.

Он может:

- продолжить текущую деятельность;
- остаться на месте;
- наблюдать;
- ждать;
- не вмешиваться.

Не заставляй NPC действовать активно только потому, что был вызван агент решения.

### Способы разрешения

`direct` — непосредственный результат действия известен без броска и профильного владельца.

`generic_check` — возможная попытка имеет неопределённый исход, а точного domain-owned check contract нет.

`domain_request` — действие принадлежит movement, activity, discovery, container, item, conversation или combat owner.

Результата `blocked` нет.

### Generic check

Используй только переданные `allowed_attribute_refs` и `allowed_skill_refs`.

Допустимые difficulty:

- `trivial`;
- `ordinary`;
- `risky`;
- `dangerous`;
- `limit`;
- `nearly_impossible`.

Верни все пять outcomes:

- `clean_success`;
- `success`;
- `success_with_cost`;
- `failure_with_consequence`;
- `severe_failure`.

Не выполняй бросок и не выбирай фактическую ветку.

У outcomes нет `continuation`.

### Прямые operations

Разрешены только operations, перечисленные в переданном `operation_contract`.

Типовой набор:

- `create_entity`;
- `move_entity`;
- `change_entity_facts`;
- `set_entity_mechanics`;
- `retire_entity`;
- `apply_body_event`.

### Domain requests

Типовой набор:

- `request_discovery`;
- `request_container_access`;
- `request_movement`;
- `request_item_use`;
- `request_activity`;
- `emit_interaction`;
- `request_conversation`;
- `request_combat`.

Не придумывай другие operations.

`domain_request` содержит ровно один основной domain request.

### Материализация обычных физических результатов

`create_entity` разрешён только для физической сущности, непосредственно отделённой, собранной, изготовленной или выявленной действием из существующего доступного предмета, материала или окружения.

Можно создавать обычные незначимые части окружения: камень, корень, червя, ком глины, щепку, ракушку, кору или обычную траву, если они естественно следуют из окружения и не несут самостоятельного скрытого смысла.

Нельзя создавать уникальные, ценные, изготовленные, принадлежащие кому-либо, информационные или сюжетно значимые предметы без code-owned основания.

Нельзя придумывать contents закрытого контейнера.

Для значимого скрытого результата используй `request_discovery`.

Для каждого нового физического экземпляра укажи полный mechanics profile с отдельной правдоподобной массой.

Не пересчитывай сохранённую механику существующего экземпляра без физического изменения.

### Разговор

Не создавай реплики и не веди диалог.

Если NPC решает начать речевое взаимодействие, верни `domain_request` с одной основной operation `request_conversation` и укажи только `conversation_goal`.

Не определяй ответ и social check.

### Бой

Не разрешай боевое действие.

Если NPC решает начать бой, верни `domain_request` с одной основной operation `request_combat`.

Не определяй попадание, защиту, вред или исход.

### Профильные владельцы

Не определяй:

- route;
- exact time;
- numeric body deltas;
- load category;
- hands;
- container contents;
- решение другого NPC;
- combat result;
- conversation result;
- domain-owned check outcome.

Верни соответствующий domain request.

### Запрет производных эффектов

Не возвращай отдельно:

- освобождение или занятие рук;
- изменение contents после перемещения;
- общую массу;
- категорию нагрузки;
- точное время;
- числовой расход энергии;
- числовое изменение здоровья или сытости;
- результат броска;
- решение другого NPC;
- художественный текст.

### Скрытые сведения

Не придумывай и не раскрывай скрытые факты, contents, мотивы других персонажей, предметы или будущие события.

Используй только субъективный context NPC.

### Формат

Верни все обязательные поля `npc_step_plan_v1`.

Точно повтори:

- `request_id`;
- `root_turn_id`;
- `boundary_id`;
- `committed_state_version`;
- `working_revision`;
- `decision_index`;
- `npc_ref`.

Не добавляй неизвестные поля.

Перед отправкой проверь:

1. решение принято от лица конкретного NPC;
2. использованы только доступные NPC сведения;
3. учтены исторический контекст и физическая реальность;
4. возвращено одно самостоятельное действие;
5. нет скрытого продолжения или цепочки решений;
6. невозможный результат не объявлен фактом;
7. постоянные refs существуют во входе;
8. temp refs уникальны;
9. hidden/significant item не придуман;
10. container contents не придуман;
11. domain-owned действие делегировано владельцу;
12. direct plan не содержит domain request;
13. domain request plan содержит ровно один основной domain request;
14. generic check содержит все пять outcomes;
15. разговор не содержит реплику;
16. бой не содержит результата;
17. ответ является только корректным JSON.

NPC_ACTION_DECISION_REQUEST:

{{NPC_ACTION_DECISION_REQUEST_JSON}}

---

## 26. Repair prompt

Repair prompt используется только после невалидного JSON или нарушения machine schema.

Он получает:

- исходный `NPC_ACTION_DECISION_REQUEST`;
- невалидный ответ;
- список формальных schema errors.

Он не получает новых фактов и не должен менять принятое смысловое решение без необходимости исправить нарушение контракта.

---

Твой предыдущий ответ не соответствует JSON-контракту `npc_step_plan_v1`.

Исправь только перечисленные структурные нарушения.

Не добавляй новые факты.

Не меняй `request_id`, `root_turn_id`, `boundary_id`, `committed_state_version`, `working_revision`, `decision_index` или `npc_ref`.

Не возвращай Markdown, пояснения или текст вне JSON.

SCHEMA_ERRORS:

{{SCHEMA_ERRORS_JSON}}

INVALID_RESPONSE:

{{INVALID_RESPONSE_JSON}}

NPC_ACTION_DECISION_REQUEST:

{{NPC_ACTION_DECISION_REQUEST_JSON}}

---

## 27. Порядок внедрения

### 27.1. Контракты

Переиспользовать общие:

- `npc_decision_signal_v1`;
- `npc_decision_boundary_v1`.

Добавить только mode-specific:

- `npc_action_decision_request_v1`;
- `npc_step_plan_v1`;
- `npc_semantic_decision_trace_v1`.

### 27.2. `@rus/npc-runtime`

Сохранить:

- schedule transition;
- perception;
- policy snapshots;
- deterministic decision ordering;
- replay/idempotency.

Добавить:

- построитель NPC-safe decision context;
- pure request builder для semantic decision;
- plan validator;
- decision trace builder.

Текущий `proposeNpcReactionOptions` и `decideBoundedNpcAction` не остаются параллельным production path после cutover.

Для миграционного PR они могут существовать в коде до завершения замены, но active production composition использует только один путь.

### 27.3. `@rus/turn`

Добавить явно внедряемый `npcDecisionModel` service port и минимальный async loop:

```text
resolve code-owned temporal batch
→ collect reaction_decision
→ build current NPC-safe request
→ await LLM
→ validate plan
→ resolve common actor step
→ update working projection
→ resume same timestamp
```

Переиспользовать существующие:

- `stop_after_current_batch`;
- same-time resolution order;
- temporal safety limits;
- working write plan;
- atomic commit.

### 27.4. Общий actor-step

Не создавать новый пакет.

Минимально переиспользовать внутри `@rus/turn` существующие стадии:

- availability;
- checks;
- consequence;
- time update;
- body update;
- hidden update;
- visible/perception signals;
- persistence planning.

Player step plan и NPC step plan должны приводиться к одному внутреннему actor-step input.

### 27.5. Trigger sources

Каждый существующий domain owner сохраняет собственный factual event vocabulary, но использует общий декларативный `decision_signal` descriptor.

Минимальные источники:

- perception/knowledge transition;
- activity или intent transition;
- schedule decision point;
- body/capability transition;
- movement/access/environment transition;
- received message.

Запрещены event-specific trigger functions и отдельный автономный evaluator. Все источники передают `npc_decision_signal_v1` единому `evaluateNpcDecisionSignals`.

### 27.6. Persistence

Переиспользовать существующий NPC decision trace persistence target.

Новая таблица запрещена без доказанного ограничения текущего storage contract.

## 28. Обязательное обновление документации

Одновременно с code cutover обновляются:

- `AGENTS.md`;
- `packages/npc-runtime/MODULE.md`;
- `packages/turn/MODULE.md`;
- `temporal_world_and_interruptible_activities.md`;
- `code_driven_world_materialization_architecture.md`;
- `npc_generation_profiles.txt`;
- `llm_agent_prompt_templates.md`;
- `information_sources_llm_prompts.md`;
- documentation navigation;
- formal contracts/schema references;
- architecture tests.

Нужно заменить утверждение:

```text
LLM выбирает только option_id/command_token из закрытого списка.
```

на:

```text
На formal reaction_decision boundary LLM принимает одно самостоятельное решение NPC и возвращает структурированный semantic actor-step plan. Код выполняет только формальную проверку, RNG, механику, temporal ordering и persistence.
```

Также документация должна явно закрепить:

- игрок и NPC используют одинаковый check/consequence pipeline;
- NPC проходит тот же фильтр историчности и реализма;
- trigger создаётся только на meaningful transition;
- охрана и подозрительность влияют на условия trigger, но не задают готовое действие;
- conversation mode является отдельной системой;
- multiple NPC decisions обрабатываются через existing same-time temporal owner.

## 29. Обязательные тесты

### 29.1. Trigger tests

1. Все причины отображаются только в `self`, `others`, `environment`, `objective`, `communication`.
2. Signal принимает только `material` или `critical`.
3. Предметные события не создают новых trigger categories.
4. Невоспринятое событие не создаёт resolved signal при `perception_required: true`.
5. Повторное восприятие того же source event не создаёт второй signal.
6. Постоянное состояние без нового перехода не создаёт signal.
7. Охранник получает `others` при первом воспринятом входе неизвестного в guarded scope.
8. Изменение охраняемого прохода создаёт `environment`, а не door-specific trigger.
9. Подозрительность меняет applicability, но не category.
10. Activity interruption или invalidation создаёт `objective`.
11. Automatic schedule successor не создаёт signal.
12. Полученный приказ создаёт `communication` без автоматического подчинения.
13. Несколько signals одного NPC и batch агрегируются в одну boundary.
14. Наличие хотя бы одного critical signal делает boundary critical.
15. Один NPC получает не более одного LLM-вызова на batch.
16. NPC без decision capability не вызывает LLM; deterministic terminal outcome потребляет применимые signals по commit rules.

### 29.2. Decision tests

17. LLM возвращает одно действие.
18. Цепочка действий отклоняется schema/semantic contract test.
19. NPC может выбрать бездействие.
20. NPC может выбрать domain movement.
21. NPC может начать conversation без реплики.
22. NPC может начать combat без attack outcome.
23. Невозможное намерение адаптируется к реальной попытке.
24. Суеверие влияет на решение, но не создаёт магию.
25. LLM не использует неизвестный NPC hidden fact.

### 29.3. Check tests

26. NPC generic check использует общий RNG owner.
27. Проверка имеет пять outcomes.
28. Код применяет modifiers NPC так же, как modifiers игрока.
29. Domain-owned check не дублируется generic check.
30. После результата новая LLM вызывается только при новой decision boundary.

### 29.4. Multiple NPC tests

31. Один factual event создаёт отдельные perception results.
32. Trigger получают только NPC с применимой policy.
33. Requests сортируются по timestamp, npc_ref, boundary_id.
34. Вызовы LLM последовательны.
35. Следующий NPC получает обновлённый subjective context только после perception предыдущего действия.
36. Положительные activities нескольких NPC стартуют в одном timestamp.
37. Время не движется до исчерпания same-time reactions.
38. Моментальное действие может сделать следующий request stale.
39. Stale plan не применяется.
40. Same-time follow-up reaction достигает fixed point или existing temporal safety error.

### 29.5. Persistence tests

41. Один boundary вызывает не более одного committed decision.
42. Restart возвращает сохранённый decision без нового LLM-вызова.
43. Сбой до commit не оставляет частично применённого NPC action.
44. Player action, NPC decisions и consequences фиксируются атомарно.
45. Internal `reason` не попадает в player-safe projection.
46. Hidden NPC context не попадает narrator.

### 29.6. Documentation and architecture tests

47. Active docs больше не утверждают bounded option-only model после cutover.
48. Production composition содержит один NPC decision path.
49. Scenario code не создаёт собственный NPC scheduler/resolver.
50. Temporal resolution order сохраняет `perception_knowledge` перед `reaction_decision`.
51. Conversation и combat остаются отдельными owners.
## 30. Критерии готовности cutover

Контракт считается внедрённым, когда одновременно выполнено:

1. Все режимы используют один signal/boundary protocol и закрытый словарь из пяти категорий.
2. Все сигналы одного NPC и same-time batch агрегируются в одну boundary и один LLM-вызов.
3. Обычные фоновые состояния без нового перехода не вызывают LLM.
4. Охрана и подозрительность работают через applicability и generic categories, а не через отдельные trigger types.
5. NPC возвращает одно односоставное действие.
6. NPC проходит тот же actor-step pipeline, что и игрок.
7. NPC checks используют общий RNG и пять outcomes.
8. Реализм и историчность применяются одинаково к игроку и NPC.
9. Разговор и бой передаются отдельным owners.
10. Multiple NPC reactions разрешаются через existing temporal same-time owner.
11. Положительные actions стартуют до продвижения времени.
12. Stale response не применяется.
13. Один boundary не исполняется дважды.
14. Решение и последствия переживают restart.
15. Hidden context не попадает в player-facing output.
16. Новая таблица, scheduler или параллельный decision engine не добавлены без необходимости.
17. Базовая документация обновлена одновременно с production cutover.

# Приложение A. Machine contract specifications

```yaml
contract_name: npc_action_decision_request_v1
storage: immutable_request
identity:
  - request_id
fields:
  schema: required enum[npc_action_decision_request_v1]
  request_id: required stable_id
  root_turn_id: required stable_id
  boundary_id: required stable_id
  committed_state_version: required state_version
  working_revision: required non_negative_integer
  decision_index: required positive_integer
  occurred_at: required game_timestamp
  npc_ref: required stable_id
  decision_reasons: required json_object
  historical_context: required json_object
  npc: required json_object
  perception: required json_object
  knowledge: required json_object
  memory: required json_object
  decision_scope: required json_object
invariants:
  - The request exposes only NPC-available subjective information plus technical identities and contracts.
  - Decision categories use only the common five-category vocabulary in canonical order.
  - Allowed refs and the operation contract are closed to the capabilities supplied by code.
```

```yaml
contract_name: npc_step_plan_v1
storage: immutable_response
identity:
  - request_id
  - decision_index
fields:
  schema: required enum[npc_step_plan_v1]
  request_id: required stable_id
  root_turn_id: required stable_id
  boundary_id: required stable_id
  committed_state_version: required state_version
  working_revision: required non_negative_integer
  decision_index: required positive_integer
  npc_ref: required stable_id
  interpretation: required json_object
  resolution: required enum[direct, generic_check, domain_request]
  goal_result: required enum[pending, achieved, partially_achieved, not_achieved]
  activity: required json_object
  operations: required relation_set[json_object]
  check: optional json_object
  reason_code: required stable_id
  reason: required string
invariants:
  - The plan contains exactly one self-contained NPC action and no implicit continuation.
  - Unused nullable values remain null and operations stay within the request operation contract.
  - Generic checks expose all five outcomes; domain-owned actions are delegated without claiming their result.
```

```yaml
contract_name: npc_semantic_decision_trace_v1
storage: party_runtime_append_only
identity:
  - boundary_id
fields:
  schema: required enum[npc_semantic_decision_trace_v1]
  request_id: required stable_id
  root_turn_id: required stable_id
  boundary_id: required stable_id
  npc_ref: required stable_id
  committed_state_version: required state_version
  working_revision: required non_negative_integer
  plan: required json_object
  applied_change_set_id: required stable_id
  status: required enum[committed]
invariants:
  - One committed boundary has at most one persisted semantic decision trace.
  - Replay returns the persisted plan and never invokes the model or applies the change set again.
  - Internal decision reasons remain hidden from player-safe projections and other NPCs.
```
