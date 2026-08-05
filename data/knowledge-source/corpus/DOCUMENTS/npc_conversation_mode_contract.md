# Контракт режима разговора с NPC

**Статус:** `active` для Lower Dvina Trace revision 14\
**Идентификатор контракта:** `npc_conversation_mode_v1`\
**Проект:** «Русь XIII век»\
**Канонический репозиторий:** `PavelSlaven/Novgorod1230`\
**Сверено с веткой:** `main`\
**Снимок `main` при подготовке:** `0a21ffd45fcbbf7dfe5706e36098f3f207b7318f`\
**Основной владелец оркестрации:** `@rus/turn`\
**Владелец субъективного состояния NPC:** `@rus/npc-runtime`\
**Владелец знаний, восприятия и памяти:** `@rus/visibility-knowledge-memory`\
**Владелец социальных прав, риска и обязательств:** `@rus/social-law`\
**Не входит в этот контракт:** художественная narration, разрешение боя, создание объективных скрытых фактов, произвольная материализация NPC и предметов.

**Production cutover:** revision 14 активирует этот контракт для разговоров
фаз 3–4 через `spatial-v3-production-v4`. Описания состояния старого `main` и
bounded Phase 3/4 ниже сохраняются только как историческая база миграции;
production не обращается к ним без явного historical revision pin. Combat в
этом cutover заканчивается только типизированным handoff и не разрешается.

Профиль Lower Dvina Trace revision 14 активирует common social check для
contribution игрока и для попыток Ратши солгать либо выторговать уступку.
NPC request передаёт только явно зарегистрированные attribute, skill и check
profile refs; бросок выполняет code-owned check owner после выбора semantic
contribution и до его фактического применения. NPC без такого профильного
scope может использовать только `resolution = automatic`.

---

## 1. Назначение

Контракт определяет общий режим разговора персонажа игрока с одним или несколькими NPC, включая:

- начало, продолжение и завершение разговора;
- свободную реплику игрока;
- отдельный ответ каждого NPC из его субъективной точки зрения;
- прямых адресатов, слушателей, свидетелей и вмешивающихся участников;
- вопросы, ответы, просьбы, приказы, угрозы, обвинения, ложь, признания, предложения и обещания;
- социальные проверки;
- передачу разговора обычному действию или бою;
- положительное игровое время разговора;
- сохранение точных произнесённых слов, восприятия, знаний и значимых последствий;
- одновременное присутствие нескольких NPC без общего всеведущего LLM-сеанса.

Главный принцип:

```text
игрок или NPC создаёт одно речевое намерение
→ LLM превращает его в один структурированный вклад разговора
→ код выполняет проверку и фиксирует фактическую реплику
→ каждый потенциальный слушатель отдельно воспринимает сообщение
→ только NPC с настоящей границей ответа получают отдельный LLM-вызов
→ факты, знания, время и последствия сохраняются общим runtime
```

Режим разговора не является отдельной симуляцией мира. Он использует существующие владельцы времени, проверок, восприятия, знаний, памяти, социальных обязательств и сохранения.

---

## 2. Состояние проекта на момент сверки

### 2.1. Что уже существует

В текущем `main` уже имеются необходимые нижние механизмы:

1. `@rus/turn` поддерживает первичный режим `social_npc` и общий порядок:

```text
availability
→ checks
→ consequence
→ time/body
→ hidden and visible projections
→ atomic persistence
→ narration
```

2. Phase 3 сценария «След на Нижней Двине» содержит сценарную беседу с Еремеем:

- обычный вопрос без проверки;
- предъявление улики с социальной проверкой;
- заранее связанный ответ `evade_and_withhold` либо `bounded_disclosure`;
- сохранение statement, NPC memory, player journal и check result.

Связанные файлы:

```text
apps/game-server/src/runtime/lower-dvina-trace-phase-3-conversation-command.js
apps/game-server/src/runtime/lower-dvina-trace-phase-3-npc-decision.js
apps/game-server/src/runtime/lower-dvina-trace-phase-3-effects.js
apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-3-conversation-writes.js
```

3. Каталог сценария уже содержит:

- `statement_templates`;
- `testimony_contract`;
- `required_audience_refs`;
- candidate slots свидетелей;
- `source_knowledge_refs`;
- `message_completeness`;
- `truth_classification`;
- запрет превращать услышанное утверждение в objective truth.

Связанный файл:

```text
data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-3-content/knowledge-lie-memory-rules.json
```

4. `@rus/visibility-knowledge-memory` уже:

- валидирует и объединяет knowledge/memory;
- допускает `received_message_ref` как источник знания;
- не превращает message в objective fact;
- отделяет player-safe package от hidden state.

5. `@rus/social-law` уже:

- оценивает права и ограничения;
- создаёт social risk и legal consequence packages;
- поддерживает жизненный цикл утверждённых обещаний;
- учитывает стороны и witness slots.

6. Temporal runtime уже поддерживает:

- perception before reaction;
- meaningful decision boundaries;
- ordered same-time cascades;
- evolving working state;
- остановку после полного текущего batch для внешнего асинхронного LLM-вызова.

### 2.2. Historical gaps до revision-14 cutover

На зафиксированном при подготовке документа снимке `main` отсутствовал общий
stateful conversation runtime.

Сценарная беседа:

- не принимает произвольную реплику;
- не поддерживает свободный ответ NPC;
- не поддерживает общий разговор нескольких NPC;
- не рассчитывает фактическую аудиторию каждой новой реплики;
- не создаёт универсальную очередь ответов;
- использует закрытые сценарные варианты вместо semantic contribution plan.

На том снимке active-нормативы также разрешали NPC runtime LLM только bounded
`option_id`. Согласованный revision-14 code/documentation cutover устранил эти
gaps для Phase 3/4 conversation; описание выше сохраняется как migration
context, а не current production behavior.

---

## 3. Критерии минимальной достаточности

Новый режим добавляется только для поведения, которое реально требуется свободному разговору.

Обязательны:

- произвольная реплика игрока;
- один структурированный ответ каждого реально отвечающего NPC;
- индивидуальные знания каждого NPC;
- свидетели без обязательного LLM-вызова;
- общие социальные проверки;
- сохранение statements и received messages;
- положительное игровое время;
- поддержка нескольких NPC;
- передача в обычное действие или бой;
- точное воспроизведение после сохранения.

Не добавляются без отдельной потребности:

- отдельный универсальный dialogue tree engine;
- отдельный scheduler разговоров;
- эмоциональная state machine с десятками состояний;
- LLM-симуляция всех свидетелей после каждой фразы;
- общий всеведущий LLM, одновременно играющий несколько NPC;
- отдельная база «истины разговора»;
- полный юридический движок для любой фразы;
- скрытая оценка каждой реплики несколькими моделями;
- второй генератор вариантов перед ответом NPC.

---

## 4. Основные инварианты

### 4.1. Один NPC — одна субъективная LLM-сессия

Каждый NPC отвечает отдельным вызовом LLM.

LLM конкретного NPC получает только:

- что этот NPC воспринял;
- что этот NPC знает, предполагает и ошибочно считает истинным;
- его состояние, роль, цели, страхи, отношения и обязательства;
- доступную ему публичную историю разговора.

Запрещено передавать одной модели скрытые контексты нескольких NPC и просить её разыграть всех сразу.

### 4.2. Реплика является фактом; её содержание не является objective truth

После commit фактом мира является:

```text
конкретный персонаж произнёс конкретные слова
в конкретном месте и времени;
конкретные слушатели восприняли их полностью, частично либо не восприняли.
```

Само утверждение внутри реплики остаётся statement/claim.

Пример:

```text
Факт: Ратша сказал, что Жданко приказал напасть.
Не установленный этим фактом вывод: Жданко действительно приказал напасть.
```

### 4.3. Проверка не заставляет NPC принять решение

Социальная проверка определяет качество воздействия:

- убедительность;
- правдоподобие;
- давление;
- заметность лжи или волнения;
- социальную цену попытки.

Проверка не определяет ответ NPC.

После результата проверки NPC всё равно принимает решение отдельным LLM-вызовом.

### 4.4. Разговор использует общий actor-step pipeline

Игрок и NPC проходят один порядок:

```text
semantic interpretation
→ availability and grounding
→ check if required
→ factual contribution
→ time and body effects
→ perception and knowledge
→ temporal reactions
→ persistence
```

Отдельные `conversation_check_engine`, `npc_social_rng` и `conversation_clock` запрещены.

### 4.5. Один вклад — один речевой поступок

Один LLM-вызов возвращает один ближайший conversation contribution.

Допустимо:

- задать один связный вопрос;
- кратко ответить;
- сообщить один связный блок сведений;
- попросить;
- приказать;
- предложить условие;
- согласиться;
- отказаться;
- пригрозить;
- обвинить;
- признаться;
- солгать;
- промолчать;
- уйти из разговора;
- перейти к обычному действию;
- начать боевое действие.

Недопустимо:

- провести весь допрос за один вызов;
- автоматически получить ответ другого персонажа;
- спросить, выслушать ответ и немедленно возразить;
- пообещать, получить согласие и исполнить обещание;
- уговорить, получить помощь и вместе уйти;
- начать и завершить драку.

### 4.6. Игровой мир остаётся историческим и физически реалистичным

Игрок и NPC проходят один фильтр историчности и реализма.

LLM не может:

- создавать современные учреждения и предметы как факты мира;
- приписывать NPC современное знание;
- создавать отсутствующий документ, титул, закон или полномочие;
- считать высокий социальный бросок магическим контролем разума;
- давать персонажу телепатию;
- раскрывать скрытую истину по тону голоса без механического основания;
- автоматически считать признание доказанной истиной.

---

## 5. Владение ответственностями

### 5.1. `@rus/turn`

Владеет:

- первичным режимом `social_npc`;
- созданием, возобновлением и завершением conversation session;
- conversation exchange loop;
- очередью response boundaries;
- асинхронными вызовами player interpreter и NPC responder;
- общим actor-step pipeline;
- остановкой на player-response boundary;
- combined change set;
- atomic commit.

Не владеет:

- знаниями NPC;
- формулами восприятия;
- social-law последствиями;
- точным clock arithmetic;
- narration.

### 5.2. `@rus/npc-runtime`

Владеет чистыми функциями:

- построения субъективного NPC conversation context;
- формирования `npc_conversation_response_request_v1`;
- проверки формальной структуры `conversation_contribution_plan_v1`;
- проверки ссылок на переданный NPC-safe context;
- validation общего `npc_decision_signal_v1`;
- aggregation signals одного NPC и same-time batch;
- построения общего `npc_decision_boundary_v1` с `decision_mode = conversation`;
- формирования decision trace;
- deterministic ordering conversation decision requests.

Не вызывает LLM и не выполняет I/O.

### 5.3. `@rus/visibility-knowledge-memory`

Владеет:

- фактической аудиторией реплики;
- perception results каждого потенциального слушателя;
- source-backed received-message knowledge;
- отделением услышанного сообщения от objective truth;
- долговременной памятью и hypotheses;
- player-safe conversation projection.

### 5.4. `@rus/social-law`

Владеет:

- authority and rights evaluation;
- social risk;
- юридически или социально значимыми последствиями;
- обещаниями и обязательствами;
- требованиями к сторонам, принятию и свидетелям.

### 5.5. `@rus/time-events-history`

Владеет:

- exact GameTimestamp;
- elapsed time;
- ordering temporal boundaries;
- same-time cascade ordering.

### 5.6. LLM player conversation interpreter

Владеет:

- пониманием речевого намерения игрока;
- определением прямых адресатов из доступных refs;
- формированием фактически произнесённой реплики;
- структурированием речевого акта и claims;
- историческим заземлением пересказанного намерения;
- определением необходимости социальной проверки.

Не определяет ответ NPC.

### 5.7. LLM NPC conversation responder

Владеет:

- решением, ответил бы NPC или нет;
- точной репликой либо иным одним contribution;
- выбором правды, лжи, уклонения, молчания или handoff;
- структурированием claims;
- определением необходимости проверки собственной социальной попытки.

Не определяет реакцию других персонажей.

---

## 6. Основные термины

### `conversation_session`

Сохраняемое состояние продолжающегося разговора между player boundaries.

### `conversation_exchange`

Один цикл, начатый contribution игрока либо NPC-инициатора и заканчивающийся ближайшей player-response boundary, завершением разговора или handoff.

### `conversation_contribution`

Один речевой или неречевой поступок одного участника.

### `intended_addressee`

Тот, к кому говорящий намеренно обращается.

### `actual_listener`

Тот, кто фактически воспринял реплику.

### `statement_witness_candidate`

Слушатель, который достаточно воспринял сообщение и говорящего, чтобы позднее помнить факт высказывания.

Это ещё не юридический свидетель. Юридическую применимость определяет `@rus/social-law`.

### `active_participant`

Участник conversation session, который может получить response boundary.

### `bystander`

Присутствующий потенциальный слушатель, не являющийся активным собеседником.

### `response_boundary`

Разговорное имя общей `npc_decision_boundary_v1` с `decision_mode = conversation`. Отдельного conversation trigger type или отдельной boundary schema нет.

---

## 7. Состояние conversation session

Минимальный контракт:

```json
{
  "schema": "conversation_session_v1",
  "conversation_id": "conversation:party-1:42",
  "state_version": 3,
  "status": "active",
  "started_at": {
    "whole_minutes": "120",
    "subminute_numerator": "0",
    "subminute_denominator": "1"
  },
  "location_ref": {
    "entity_kind": "location",
    "entity_id": "trace_ld_v1_loc_fishing_camp"
  },
  "initiator_ref": {
    "entity_kind": "player_character",
    "entity_id": "mikula"
  },
  "active_participant_refs": [
    {
      "entity_kind": "player_character",
      "entity_id": "mikula"
    },
    {
      "entity_kind": "npc",
      "entity_id": "eremey"
    }
  ],
  "last_contribution_ref": null,
  "topic_refs": [],
  "status_reason": null
}
```

Допустимые статусы:

```text
active
suspended
ended
```

`active` — conversation mode принимает contributions.

`suspended` — участник начал обычное действие, после которого разговор может быть возобновлён при сохранении условий.

`ended` — разговор завершён окончательно.

Не требуется отдельная постоянная audience list. Фактическая аудитория определяется заново для каждой реплики.

---

## 8. Начало разговора

Conversation session создаётся из одного из трёх источников.

### 8.1. Реплика игрока

Игрок обращается к одному или нескольким воспринимаемым NPC.

Код проверяет только формальные условия:

- участники существуют;
- находятся в совместимом пространстве;
- говорящий способен говорить;
- потенциальный адресат может получить речевой сигнал;
- нет активного режима, который полностью запрещает разговор.

Код не решает, захочет ли NPC отвечать.

### 8.2. Autonomous NPC handoff

Автономный NPC contract возвращает:

```json
{
  "op": "request_conversation",
  "actor_ref": {
    "entity_kind": "npc",
    "entity_id": "guard-1"
  },
  "target_actor_refs": [
    {
      "entity_kind": "player_character",
      "entity_id": "mikula"
    }
  ],
  "conversation_goal": "остановить чужака и выяснить, зачем он пришёл"
}
```

Autonomous NPC LLM не пишет саму реплику. Conversation responder создаёт первый contribution.

### 8.3. Речевой signal без активной session

Если персонаж произносит слова в присутствии NPC без явного предварительного handoff, код может открыть session после фактического perception signal.

NPC, который не воспринял слова, не становится собеседником автоматически.

---

## 9. Завершение и приостановка разговора

Session завершается, когда:

- игрок явно заканчивает разговор;
- все NPC покинули доступную область общения;
- говорящий или все адресаты потеряли способность общаться;
- начался combat mode;
- conversation contract возвращает `leave_conversation` и активных участников не осталось;
- внешний factual event сделал разговор невозможным;
- session была superseded новой несовместимой conversation session.

Session приостанавливается, когда:

- contribution передан в обычный actor step;
- участник временно отходит, показывает объект или выполняет действие, после которого разговор может продолжиться;
- temporal interruption требует сначала разрешить внешнее событие.

После action handoff код не предполагает автоматического продолжения. Он повторно проверяет присутствие, доступность и состояние участников.

---

## 10. Вход игрока в conversation mode

```json
{
  "schema": "player_conversation_input_v1",
  "request_id": "turn-42",
  "conversation_id": "conversation:party-1:42",
  "state_version": 3,
  "speaker_ref": {
    "entity_kind": "player_character",
    "entity_id": "mikula"
  },
  "raw_text": "Еремей, скажи прямо: кого ты видел у лодки?",
  "received_at": "technical timestamp only",
  "player_safe_context": {
    "verbatim_utterance_text": "Еремей, скажи прямо: кого ты видел у лодки?",
    "allowed_duration_classes": ["moment", "brief", "short", "domain_owned"],
    "allowed_references": {
      "actor_refs": [
        { "entity_kind": "npc", "entity_id": "eremey" },
        { "entity_kind": "player_character", "entity_id": "mikula" }
      ],
      "entity_refs": [],
      "knowledge_refs": [],
      "combat_target_refs": []
    }
  },
  "operation_contract": {}
}
```

`raw_text` не является совершившейся репликой до semantic interpretation и commit.

---

## 11. Verbatim и пересказанное намерение игрока

Player interpreter обязан различать два режима.

### 11.1. `verbatim`

Игрок явно задаёт слова персонажа кавычками либо формулировкой «говорю: ...».

Код выделяет из явной оболочки точный произносимый текст и передаёт его как
`player_safe_context.verbatim_utterance_text`. LLM сохраняет именно этот текст,
не включая в factual statement служебную оболочку `Говорю: «...»`.

Она не заменяет анахроничное слово историческим аналогом без явной необходимости.

Пример:

```text
Говорю: «Покажи паспорт».
```

Персонаж действительно произносит слово «паспорт». NPC может его не понять.

### 11.2. `intent_paraphrase`

Игрок описывает намерение:

```text
требую подтвердить, кто он такой
```

LLM может сформулировать исторически доступный эквивалент:

```text
«Чей ты человек? Кто за тебя поручится?»
```

При этом LLM не создаёт отсутствующую грамоту, печать, право или институт.

---

## 12. План contribution игрока

```json
{
  "schema": "player_conversation_contribution_plan_v1",
  "request_id": "turn-42",
  "conversation_id": "conversation:party-1:42",
  "state_version": 3,
  "speaker_ref": {
    "entity_kind": "player_character",
    "entity_id": "mikula"
  },
  "input_mode": "intent_paraphrase",
  "contribution_kind": "speech",
  "primary_addressee_ref": {
    "entity_kind": "npc",
    "entity_id": "eremey"
  },
  "intended_addressee_refs": [
    {
      "entity_kind": "npc",
      "entity_id": "eremey"
    }
  ],
  "affected_actor_refs": [],
  "speech": {
    "utterance_text": "Еремей, скажи прямо: кого ты видел у лодки?",
    "dominant_act": "question",
    "interaction_tags": [
      "requests_information",
      "demands_direct_answer"
    ],
    "topic_refs": [
      "wreck_incident"
    ],
    "claims": [],
    "response_expectation": {
      "kind": "answer",
      "target_refs": [
        {
          "entity_kind": "npc",
          "entity_id": "eremey"
        }
      ]
    }
  },
  "interpretation": {
    "intent": "получить прямой ответ о виденном у лодки",
    "grounded_contribution": "задать Еремею прямой вопрос",
    "adaptation": "literal"
  },
  "resolution": "automatic",
  "activity": {
    "duration_class": "brief",
    "effort": "none"
  },
  "supporting_operations": [],
  "check": null,
  "handoff": null
}
```

---

## 13. Виды contribution

```text
speech
silence
leave_conversation
action_handoff
combat_handoff
```

### `speech`

Фактически произнесённая реплика.

### `silence`

Сознательное молчание либо отказ отвечать без слов.

### `leave_conversation`

Участник прекращает разговор. Физическое перемещение, если оно требуется, исполняется отдельным actor step.

### `action_handoff`

Разговор передаёт одно обычное действие общему actor-step executor.

### `combat_handoff`

Участник принимает решение начать полноценное боевое действие. Удар и исход не разрешаются conversation mode.

---

## 14. Supporting operations

Речевой вклад может включать только непосредственно сопровождающее действие, если оно:

- не требует нового самостоятельного решения;
- полностью определяется текущим состоянием;
- не зависит от неизвестного результата;
- поддерживается общим operation contract.

Примеры:

- показать уже находящийся в руке предмет;
- указать на видимый объект;
- передать открытую записку адресату;
- положить известный предмет на стол перед предложением.

Пример:

```json
{
  "supporting_operations": [
    {
      "op": "emit_interaction",
      "interaction_kind": "present_item_as_evidence",
      "actor_ref": "player:mikula",
      "target_ref": "npc:eremey",
      "entity_ref": "item:blue_wool"
    }
  ]
}
```

Если действие раскрывает новое состояние, требует перемещения, проверки или реакции, conversation step останавливается и использует `action_handoff`.

---

## 15. Speech и claims

### 15.1. `utterance_text`

Это точные слова, ставшие фактом после commit.

Narrator не имеет права переписать смысл, добавить признание, смягчить угрозу или заменить ответ.

### 15.2. `dominant_act`

Допустимые базовые значения:

```text
greet
farewell
question
answer
inform
request
command
offer
accept
refuse
negotiate
promise
threaten
accuse
confess
evade
warn
challenge
apologize
```

### 15.3. Claims

```json
{
  "claim_id": "claim:turn-42:1",
  "content_summary": "говорящий утверждает, что видел Ратшу у лодки",
  "form": "assertion",
  "speaker_posture": "believed_true",
  "source_knowledge_refs": [
    {
      "entity_kind": "knowledge_record",
      "entity_id": "eremey-observed-ratsha"
    }
  ],
  "mentioned_entity_refs": [
    {
      "entity_kind": "npc",
      "entity_id": "ratsha"
    }
  ]
}
```

Допустимые `speaker_posture`:

```text
believed_true
knowingly_false
mixed
uncertain
withheld
```

`speaker_posture` описывает отношение говорящего к собственным словам, а не objective truth.

### 15.4. Ложь

NPC вправе намеренно произнести ложное утверждение.

LLM может создать содержание ложной реплики, но:

- оно сохраняется только как false assertion;
- оно не создаёт objective fact;
- оно не создаёт новый реальный NPC, предмет, маршрут или событие;
- новые имена без entity ref остаются только текстом заявления;
- слушатели узнают только, что было сказано.

---

## 16. Реализм и историческая адаптация

Поле:

```text
adaptation = literal | historical_equivalent | reality_limited | make_believe
```

### `literal`

Реплика и понятия доступны миру и персонажу.

### `historical_equivalent`

Пересказанное намерение игрока выражено средствами эпохи без создания отсутствующих фактов.

### `reality_limited`

Часть намерения невозможна, но персонаж произносит или делает ближайшую реальную попытку.

### `make_believe`

Персонаж сознательно играет роль, шутит, бредит, фантазирует или говорит о невозможном как о вымысле.

Нельзя использовать `historical_equivalent` для изменения явной verbatim-цитаты игрока.

---

## 17. Социальные проверки

### 17.1. Когда проверка не нужна

Проверка не требуется для самого факта:

- приветствия;
- обычного вопроса;
- сообщения;
- прямого честного ответа;
- отказа;
- выражения мнения;
- обычной просьбы без попытки преодолеть сопротивление.

### 17.2. Когда проверка нужна

Проверка требуется, когда говорящий пытается добиться неопределённого эффекта:

- убедить;
- обмануть;
- запугать;
- скрыть волнение;
- заставить признать власть;
- выторговать уступку;
- представить ложь правдоподобной;
- удержать внимание в тяжёлой обстановке;
- изменить отношение вопреки сопротивлению.

### 17.3. Контракт проверки

```json
{
  "resolution": "check_required",
  "check": {
    "purpose": "убедительно представить угрозу как реальную",
    "attribute_ref": "influence",
    "skill_ref": "communication",
    "difficulty_band": "risky",
    "outcomes": {
      "clean_success": {
        "delivery_quality": "compelling",
        "observable_effects": []
      },
      "success": {
        "delivery_quality": "credible",
        "observable_effects": []
      },
      "success_with_cost": {
        "delivery_quality": "credible_with_visible_cost",
        "observable_effects": [
          "speaker_exposes_urgency"
        ]
      },
      "failure_with_consequence": {
        "delivery_quality": "unconvincing",
        "observable_effects": [
          "listener_notices_inconsistency"
        ]
      },
      "severe_failure": {
        "delivery_quality": "transparently_manipulative",
        "observable_effects": [
          "social_risk_increases"
        ]
      }
    }
  }
}
```

LLM не выполняет бросок.

Код:

1. применяет общие модификаторы;
2. выполняет RNG;
3. выбирает исход;
4. формирует фактическое `social_delivery_result`;
5. передаёт слушателям только доступные им признаки результата.

### 17.4. Проверка не решает ответ

```text
успешное убеждение
≠ обязательное согласие NPC
```

NPC может:

- согласиться;
- отказаться по другой причине;
- потребовать условие;
- притвориться согласным;
- уйти;
- позвать помощь;
- напасть;
- промолчать.

### 17.5. Activation profile Lower Dvina revision 14

Для player contribution применяются правила разделов 17.1–17.4. Для Ратши
revision 14 регистрирует непустые `allowed_attribute_refs`,
`allowed_skill_refs` и `allowed_check_profile_refs`: ложь и торг требуют
`check_required`, а common check owner возвращает code-owned outcome до
применения contribution. Для остальных NPC пустой scope сохраняет
`resolution = automatic`; сценарный classifier не вправе вводить свой бросок.

---

## 18. Фактическая речевая запись

После интерпретации и проверки код создаёт:

```json
{
  "schema": "conversation_statement_event_v1",
  "statement_id": "statement:conversation-42:3",
  "conversation_id": "conversation:party-1:42",
  "exchange_id": "exchange:conversation-42:7",
  "speaker_ref": {
    "entity_kind": "player_character",
    "entity_id": "mikula"
  },
  "intended_addressee_refs": [],
  "utterance_text": "...",
  "dominant_act": "question",
  "interaction_tags": [],
  "topic_refs": [],
  "claims": [],
  "message_completeness": "complete",
  "spoken_at": {},
  "duration": {},
  "social_delivery_result": null,
  "source_plan_ref": {
    "entity_kind": "semantic_plan",
    "entity_id": "turn-42"
  }
}
```

Этот event становится источником:

- acoustic/speech signals;
- perception records;
- received-message knowledge;
- response boundaries;
- witness candidates;
- promise/obligation proposals;
- player-safe visible package.

---

## 19. Аудитория, слушатели и свидетели

LLM не определяет фактическую аудиторию.

Она указывает только intended addressees.

После statement event код создаёт речевой сигнал. Существующий perception owner отдельно рассчитывает для каждого потенциального слушателя:

```text
not_perceived
perceived_unidentified
perceived_partial
recognized
misinterpreted
```

Для речи дополнительно передаётся comprehension:

```text
full
partial
none
```

Comprehension зависит от:

- слышимости;
- языка;
- знакомых слов и понятий;
- состояния слушателя;
- шума и расстояния;
- recognition speaker;
- утверждённых perception/language profiles.

### 19.1. Actual listener

NPC становится actual listener только при фактическом perception result, допускающем восприятие хотя бы части речи.

### 19.2. Witness candidate

NPC может стать statement witness candidate, если:

- воспринял достаточную часть сообщения;
- способен распознать говорящего либо надёжно связать голос с участником;
- сохраняет source-backed memory о высказывании.

Это не означает, что он знает истинность claims.

### 19.3. Ordinary bystander

Обычный свидетель:

- получает perception/message record;
- может получить память;
- не получает LLM-вызов только потому, что слышал реплику.

---

## 20. Единый trigger protocol разговора

Разговор не вводит собственный словарь причин ответа. После factual contribution используется общий протокол:

```text
statement or contribution event
→ perception and knowledge
→ declarative npc_decision_signal_v1
→ aggregation per NPC and same-time batch
→ at most one npc_decision_boundary_v1
→ one NPC LLM call
```

### 20.1. Категории

Допустимы только общие категории:

```text
self
others
environment
objective
communication
```

Типовые разговорные отображения:

- воспринятый вопрос, приказ, просьба, угроза, предложение или обращение → `communication`;
- активировавшаяся обязанность ответить либо вмешаться → `objective`;
- уход, появление или incapacitation участника → `others`;
- изменение слышимости, дистанции, прохода или опасности места → `environment`;
- изменение собственной способности говорить, слышать или продолжать разговор → `self`.

`primary_addressee`, `direct_accusation`, `authority_intervention` и другие speech/role metadata не являются trigger categories. Они только определяют applicability descriptor и порядок обработки.

### 20.2. Значимость

Используются только:

```text
material
critical
```

- обычная необходимость решить, отвечать ли на воспринятую реплику, обычно создаёт `communication / material`;
- невозможность продолжать conversation intent, потеря способности общаться либо обязательный немедленный handoff может создать `critical` signal соответствующей категории.

### 20.3. Кто получает signal

Signal создаётся не для каждого listener, а только если approved applicability rule считает переход decision-relevant для этого NPC.

Минимальные основания:

- NPC является прямым адресатом воспринятой реплики;
- statement явно ожидает ответ этого NPC;
- statement непосредственно затронул NPC;
- активная роль или обязанность NPC требует решить, вмешиваться ли;
- изменилось собственное состояние, другой участник, обстановка либо текущая conversation objective.

Эти основания не расширяют trigger vocabulary. Код не анализирует художественный текст: semantic statement fields и role policies выбирают декларативный signal descriptor.

### 20.4. Агрегация

Несколько новых signals одного NPC в одном fully resolved same-time batch создают одну boundary и один LLM-вызов.

Пример:

```text
NPC получил угрозу                    → communication / material
одновременно закрылся выход           → environment / material
обязанность охранять порядок активна  → objective / material

результат:
communication + environment + objective
→ одна conversation boundary
→ один ответ NPC
```

## 21. Что не вызывает response LLM

LLM не вызывается для NPC только потому, что он:

- присутствует рядом;
- услышал реплику, к которой не применима response/intervention policy;
- продолжает слушать без нового перехода;
- повторно воспринял тот же committed statement;
- не понял сообщение;
- не распознал адресованность;
- уже имеет consumed signals текущего batch;
- не способен принимать осознанное решение.

Обычный свидетель получает perception, received-message knowledge и при необходимости memory, но не LLM-вызов.

## 22. Общая decision boundary

Отдельная schema `conversation_response_boundary_v1` не создаётся. Точная machine schema определяется общим trigger-контрактом; ниже приведён только conversation-mode пример `npc_decision_boundary_v1`:

```json
{
  "schema": "npc_decision_boundary_v1",
  "boundary_id": "npc-decision:batch-42:eremey",
  "decision_mode": "conversation",
  "scheduled_at": {},
  "npc_ref": {
    "entity_kind": "npc",
    "entity_id": "eremey"
  },
  "same_time_batch_ref": {
    "entity_kind": "temporal_batch",
    "entity_id": "batch-42"
  },
  "significance": "material",
  "categories": [
    "communication"
  ],
  "signal_refs": [
    {
      "entity_kind": "npc_decision_signal",
      "entity_id": "signal:statement-42:eremey"
    }
  ],
  "state_version": "17",
  "resolution_class": "reaction_decision",
  "idempotency_key": "npc-decision:batch-42:eremey"
}
```

`conversation_id`, `exchange_id`, source statements и perceived messages загружаются при построении mode-specific request из active session и referenced signals. Boundary не дублирует эти данные.

`decision_mode` является свойством выбранной boundary, но не частью её
identity. Один NPC в одном fully resolved same-time batch имеет не более одной
aggregated boundary и одного LLM-вызова суммарно по всем режимам решения.

## 23. Несколько NPC и порядок ответов

### 23.1. Один batch — одна boundary на NPC

После полного perception/knowledge batch сигналы агрегируются отдельно для каждого NPC. Несколько причин ответа одного NPC не создают несколько requests.

### 23.2. Простой порядок разговора

Ordering не является trigger vocabulary.

В одном conversation batch:

1. прямые адресаты последнего contribution;
2. остальные NPC с aggregated boundary;
3. внутри группы — `npc_ref`, затем `boundary_id`.

Не вводятся шесть классов response priorities. Конкретная speech/role metadata используется только для выбора одной из двух групп.

### 23.3. Последовательное factual применение

Вызовы LLM выполняются по одному. После каждого committed-to-working-state contribution:

- создаётся factual statement/action;
- остальные NPC отдельно воспринимают его;
- working state обновляется;
- следующий request строится заново.

Следующий NPC видит предыдущий contribution только если воспринял его.

### 23.4. NPC-to-NPC response

Новый signal другого NPC возникает только из нового factual contribution и применимой policy. `response_expectation` помогает выбрать descriptor, но не создаёт отдельный trigger type.
Для ожидаемого ответа code-owned projection пересекает
`response_expectation.target_refs`, фактических intended addressees и реально
получивших сообщение NPC. Только это пересечение получает обычный
`communication / material` signal. Обычный свидетель signal не получает;
`perceived_partial` сохраняет signal, но не раскрывает точный текст и claims.
После commit/restart consumed signal и decision trace не создаются повторно.
Если safety limit или исчерпанный budget завершил exchange до исполнения этого
signal, следующий exchange восстанавливает его только по точной persisted
lineage `NPC statement -> received message -> perception -> listener`; старые
signals других категорий не становятся conversation response автоматически.

### 23.5. Safety limit

Conversation exchange сохраняет конечный `max_contributions_per_exchange`. Это техническая защита от бесконечного цикла, не trigger category и не основание для дополнительного LLM-вызова.
Уже созданный непогашенный NPC-to-NPC communication signal при этом остаётся
воспроизводимым pending input, а не теряется вместе с локальной очередью.

## 24. NPC conversation response request

```json
{
  "schema": "npc_conversation_response_request_v1",
  "request_id": "conversation-response-request-42",
  "boundary_id": "npc-decision:batch-42:eremey",
  "conversation_id": "conversation:party-1:42",
  "exchange_id": "exchange:conversation-42:7",
  "state_version": 17,
  "requested_at": {},
  "npc_ref": {
    "entity_kind": "npc",
    "entity_id": "eremey"
  },
  "decision_reasons": {
    "significance": "material",
    "categories": [
      "communication"
    ],
    "signal_refs": [
      {
        "entity_kind": "npc_decision_signal",
        "entity_id": "signal:statement-42:eremey"
      }
    ],
    "perceived_changes": [
      "Микула обратился к Еремею с прямым вопросом о людях у лодки."
    ]
  },
  "npc": {},
  "perceived_message": {
    "source_statement_ref": {
      "entity_kind": "conversation_statement",
      "entity_id": "statement:conversation-42:3"
    },
    "perception_result_ref": {
      "entity_kind": "perception_result",
      "entity_id": "perception:statement-42:eremey"
    }
  },
  "public_conversation_history": [],
  "knowledge": {},
  "memory": {},
  "social_context": {},
  "available_resources": [],
  "allowed_references": {
    "actor_refs": [
      {
        "entity_kind": "npc",
        "entity_id": "eremey"
      },
      {
        "entity_kind": "player_character",
        "entity_id": "mikula"
      }
    ],
    "entity_refs": [],
    "knowledge_refs": [],
    "combat_target_refs": []
  },
  "decision_scope": {
    "conversation_mode": true,
    "action_handoff_available": true,
    "combat_handoff_available": true,
    "allowed_attribute_refs": [],
    "allowed_skill_refs": [],
    "allowed_check_profile_refs": [],
    "allowed_duration_classes": ["moment", "brief", "short", "domain_owned"],
    "operation_contract": {}
  }
}
```

`decision_reasons` использует только общий закрытый словарь. Предметное содержание
передаётся кратко в `perceived_changes`. `perceived_message` содержит только
фактически воспринятое текущее сообщение и обязателен для boundary с категорией
`communication`. Если boundary создан исключительно неречевыми signals, включая
фактически воспринятый `environment`, `perceived_message` равен `null`, а request
опирается на referenced perception signal и не раскрывает неуслышанную реплику.
`allowed_references` — code-owned закрытый набор ссылок, уже допустимых в
NPC-safe context. `primary_addressee_ref`, `intended_addressee_refs`,
`affected_actor_refs` и `response_expectation.target_refs` обязаны входить в
`actor_refs`; `source_knowledge_refs` — в `knowledge_refs`;
`mentioned_entity_refs` — в `entity_refs` или `actor_refs`; цель combat handoff
— в `combat_target_refs`. Синтаксически корректная, но отсутствующая в этих
наборах ссылка отклоняется до factual commit.

## 25. Контекст NPC

NPC responder получает:

### Восприятие

- услышанный текст полностью либо частично;
- распознанного говорящего;
- заметные жесты и показанные предметы;
- perceived social delivery quality;
- присутствующих видимых участников;
- доступные выходы и ресурсы.

### Знания

- known facts;
- beliefs;
- hypotheses;
- received messages;
- собственные прежние statements;
- известные обещания и обязательства.

### Личность

- profile level;
- social role;
- authority;
- attributes and skills;
- body state;
- mood;
- temperament;
- goals;
- fears;
- values;
- relationships;
- current activity.

### История разговора

Передаётся только публичная история, фактически воспринятая NPC.

Не передаются:

- невоспринятые реплики;
- внутренние reasons других NPC;
- скрытая truth classification;
- объективные факты, которых NPC не знает;
- raw prompts других моделей;
- технические roll values.

---

## 26. План ответа NPC

```json
{
  "schema": "conversation_contribution_plan_v1",
  "request_id": "conversation-response-request-42",
  "boundary_id": "conversation-response:statement-42:eremey",
  "conversation_id": "conversation:party-1:42",
  "exchange_id": "exchange:conversation-42:7",
  "state_version": 17,
  "speaker_ref": {
    "entity_kind": "npc",
    "entity_id": "eremey"
  },
  "contribution_kind": "speech",
  "primary_addressee_ref": {
    "entity_kind": "player_character",
    "entity_id": "mikula"
  },
  "intended_addressee_refs": [
    {
      "entity_kind": "player_character",
      "entity_id": "mikula"
    }
  ],
  "affected_actor_refs": [],
  "speech": {
    "utterance_text": "Плеск слышал. А кто там был — не разглядел.",
    "dominant_act": "answer",
    "interaction_tags": [
      "partial_disclosure",
      "withholding"
    ],
    "topic_refs": [
      "wreck_incident"
    ],
    "claims": [
      {
        "claim_id": "claim:response-42:1",
        "content_summary": "Еремей утверждает, что слышал плеск",
        "form": "assertion",
        "speaker_posture": "believed_true",
        "source_knowledge_refs": [
          {
            "entity_kind": "knowledge_record",
            "entity_id": "eremey-heard-impact"
          }
        ],
        "mentioned_entity_refs": []
      }
    ],
    "response_expectation": {
      "kind": "none",
      "target_refs": []
    }
  },
  "interpretation": {
    "intent": "ответить частично и не называть Ратшу",
    "grounded_contribution": "сообщить безопасную часть известных сведений",
    "adaptation": "literal"
  },
  "resolution": "automatic",
  "activity": {
    "duration_class": "brief",
    "effort": "none"
  },
  "supporting_operations": [],
  "check": null,
  "handoff": null,
  "reason": "Еремей боится последствий полного рассказа"
}
```

`reason`:

- сохраняется только в internal decision trace;
- не является фактом мира;
- не показывается игроку;
- не передаётся другим NPC;
- не становится memory record.

---

## 27. NPC может не отвечать

`silence`:

```json
{
  "contribution_kind": "silence",
  "speech": null,
  "interpretation": {
    "intent": "не отвечать",
    "grounded_contribution": "молча отвести взгляд",
    "adaptation": "literal"
  },
  "resolution": "automatic",
  "check": null,
  "handoff": null
}
```

Молчание не является отсутствием результата. Оно становится фактическим contribution и может быть воспринято окружающими.

---

## 28. Action и combat handoff

### 28.1. Обычное действие

```json
{
  "contribution_kind": "action_handoff",
  "speech": null,
  "handoff": {
    "kind": "actor_step",
    "intent": "отойти к двери и прекратить разговор"
  }
}
```

Conversation mode не рассчитывает маршрут и не применяет item/body consequences.

### 28.2. Бой

```json
{
  "contribution_kind": "combat_handoff",
  "speech": null,
  "handoff": {
    "kind": "combat",
    "intent": "ударить Микулу и прорваться к выходу",
    "target_actor_refs": [
      {
        "entity_kind": "player_character",
        "entity_id": "mikula"
      }
    ]
  }
}
```

Conversation mode не определяет попадание, защиту, ранение или исход боя.

---

## 29. Время разговора

LLM возвращает только semantic duration class:

```text
moment
brief
short
domain_owned
```

Один contribution не должен быть длинным монологом.

`extended` разговор реализуется несколькими contributions либо отдельной domain-owned activity.

Код сопоставляет duration class с утверждённым conversation time profile и вычисляет exact elapsed.

LLM-вызов и ожидание сети игровое время не двигают.

### 29.1. Порядок

Для каждого contribution:

```text
semantic plan
→ check
→ statement/action event
→ exact elapsed
→ temporal boundaries inside elapsed
→ perception/knowledge
→ next response request
```

Если внешний temporal boundary прерывает возможность разговора, conversation session приостанавливается или завершается по factual state.

---

## 30. Множественный разговор: полная процедура

### 30.1. Player contribution

1. Игрок вводит текст.
2. Player interpreter возвращает один contribution plan.
3. Код revalidate состояние и refs.
4. Выполняется social check, если требуется.
5. Supporting operations применяются общими владельцами.
6. Создаётся factual statement/contribution event.
7. Продвигается exact time.

### 30.2. Audience resolution

8. Создаются speech signals.
9. Для каждого потенциального слушателя выполняется perception.
10. Для каждого фактического listener создаётся received-message source.
11. Knowledge owner обновляет субъективное состояние.
12. Social-law получает только релевантные statement/witness inputs.

### 30.3. Response requests

13. Applicable policies создают generic decision signals только для eligible NPC.
14. Все signals одного NPC и batch агрегируются в одну conversation boundary.
15. Boundaries упорядочиваются по простому conversation order.
16. Завершается текущий code-owned batch.

### 30.4. NPC contributions

17. `@rus/turn` берёт первый boundary.
18. `@rus/npc-runtime` строит NPC-safe request с aggregated `decision_reasons`.
19. `@rus/turn` вызывает отдельную LLM-сессию.
20. План проходит revalidation.
21. Проверка и contribution исполняются общим actor-step pipeline.
22. Все остальные NPC отдельно воспринимают новый contribution.
23. Рабочее состояние обновляется.
24. Следующий NPC получает свежий контекст.

### 30.5. Завершение exchange

25. Цикл продолжается до:

- исчерпания pending response boundaries;
- player-response boundary;
- action/combat handoff;
- завершения conversation session;
- temporal interruption;
- safety limit;
- data gap или technical failure до commit.

26. Все factual изменения до boundary входят в один combined change set.
27. Выполняется atomic commit.
28. Narration получает только persisted player-safe package.

---

## 31. Player-response boundary

Управление возвращается игроку, когда:

- прямые ответы обработаны;
- NPC задал вопрос;
- NPC сделал предложение;
- NPC выдвинул условие;
- NPC отказал;
- NPC произнёс угрозу или обвинение;
- NPC раскрыл существенное новое знание;
- NPC промолчал, и других pending responders нет;
- NPC начал уходить;
- возник action/combat handoff;
- conversation exchange достиг configured limit.

По умолчанию после завершения response queue управление возвращается игроку. NPC не продолжают беседу бесконечно без новой явной response expectation.

---

## 32. Обещания и обязательства

### 32.1. Statement раньше obligation

Произнесённое обещание сначала сохраняется как statement event.

Оно не становится активным обязательством только потому, что LLM назвала dominant act `promise`.

### 32.2. Минимальный lifecycle

```text
proposed in speech
→ perceived by required parties
→ accepted or otherwise activated
→ active obligation
```

### 32.3. Structured commitment candidate

```json
{
  "commitment_candidate": {
    "kind": "promise_offer",
    "promisor_ref": {
      "entity_kind": "player_character",
      "entity_id": "mikula"
    },
    "beneficiary_refs": [],
    "obligation_summary": "доставить Онисима в безопасное место",
    "conditions": [],
    "deadline": null,
    "required_acceptance": true,
    "requested_witness_policy_ref": null
  }
}
```

### 32.4. `@rus/social-law`

Для свободного разговора существующий exact approved promise path недостаточен.

Минимальное расширение:

```text
planPartyLocalCommitment(...)
```

Функция принимает только:

- committed statement refs;
- exact structured terms;
- parties;
- фактическое восприятие сторон;
- acceptance statement refs;
- отдельные policy refs сторон, обязанных воспринять offer и acceptance;
- applicable social/jurisdiction policy;
- фактических witness candidates.

Она не придумывает условия и не исправляет речь LLM.

### 32.5. Свидетели обещания

Свидетель учитывается только если:

- фактически присутствовал;
- воспринял существенные условия;
- распознал необходимые стороны;
- применимая social policy допускает его как witness.

---

## 33. Знания, слухи и память

### 33.1. Received message

Каждый listener может получить запись:

```text
NPC X сказал claim Y
```

Она имеет source statement ref.

### 33.2. Belief не создаётся автоматически

Получение сообщения не означает доверие к нему.

В initial implementation достаточно сохранить:

- факт получения сообщения;
- speaker identity, если распознана;
- полноту и comprehension;
- claims как чужие утверждения;
- delivery cues.

Вера, сомнение или дальнейшая гипотеза формируются в последующем решении NPC либо утверждённым knowledge policy.

### 33.3. Long-term memory

Полный transcript сохраняется append-only.

Отдельная долговременная summary создаётся только для зарегистрированных значимых acts:

```text
promise
threaten
accuse
confess
command
important_disclosure
accepted_offer
serious_refusal
```

Summary обязана ссылаться на committed statement event.

Декоративная реплика не обязана получать отдельную long-term memory row.

---

## 34. Persistence

Следует переиспользовать существующие таблицы и write path:

```text
party_actor_npc_interactions
party_actor_npc_interaction_summaries
party_events
party_perception_records
party_npc_knowledge
party_npc_decision_traces
party_check_resolutions
promise/obligation records
combined change sets
```

Минимально новая current projection нужна только для active conversation session, если существующая `party_actor_npc_interactions` не может хранить незавершённое состояние.

Не требуется отдельная таблица для:

- каждого response trigger;
- каждого witness role;
- каждого topic;
- каждого LLM prompt.

Contribution/statement events должны быть append-only.

Session current projection может обновляться атомарно.

---

## 35. Idempotency и replay

### 35.1. Один contribution не применяется дважды

Каждый plan связан с:

```text
request_id
conversation_id
exchange_id
boundary_id, если speaker NPC
state_version
canonical input digest
idempotency key
```

### 35.2. Повтор после commit

Повтор с той же identity:

- не вызывает LLM заново;
- не повторяет реплику;
- не повторяет проверку;
- не создаёт вторую память;
- возвращает сохранённый результат.

### 35.3. Сбой до commit

Незакоммиченный exchange может быть рассчитан заново.

Он ещё не является фактом партии.

### 35.4. Stale response

Если working state изменился после формирования request:

- старый plan не применяется;
- код не исправляет его смысл;
- строится новый request из актуального состояния.

---

## 36. Player-safe projection и narration

Conversation mode формирует persisted player-safe package, включающий только:

- услышанные игроком utterances;
- видимые gestures/actions;
- заметные delivery cues;
- видимые реакции;
- известные игроку участники;
- player knowledge updates;
- uncertainties.

Narrator:

- не получает hidden reasons NPC;
- не получает speaker_posture, если он не проявился;
- не получает невоспринятые реплики;
- не получает objective truth claims;
- не меняет точный `utterance_text`;
- может добавить только внешнее описание вокруг committed речи.

Прямая речь должна воспроизводиться дословно либо выводиться отдельным структурированным UI-элементом.

---

## 37. Ошибки и repair

### 37.1. Допустима одна format repair попытка

Если LLM вернула JSON, не соответствующий schema:

1. исходный factual state не меняется;
2. вызывается repair prompt;
3. repair получает исходный request, исходный output и validation errors;
4. repair может исправить только форму, refs и enum values;
5. repair не может заменить смысл решения другим.

После второй ошибки возвращается typed LLM contract failure.

### 37.2. Semantic inconsistency

Если plan:

- использует отсутствующую ссылку;
- раскрывает неизвестный NPC факт;
- содержит несколько самостоятельных contributions;
- создаёт чужое решение;
- выходит за operation contract;

ответ считается неприменимым.

Код не выбирает «похожую» реплику и не исправляет характер NPC.

### 37.3. Data gap

Data gap возникает, если для необходимого действия отсутствует утверждённый:

- social rule;
- language/comprehension profile;
- check profile;
- operation handler;
- commitment policy;
- actor state field, без которого решение невозможно.

Обычный разговор без специального правила не должен hard-block из-за отсутствия декоративных исторических деталей.

---

# 38. Runtime prompt: интерпретатор вклада игрока

```text
Ты — семантический интерпретатор одного вклада персонажа игрока в разговоре исторической ролевой игры «Русь XIII век».

Каждый вызов является независимой сессией. У тебя нет памяти, кроме переданного PLAYER_CONVERSATION_REQUEST.

Верни только один корректный JSON-объект по schema `player_conversation_contribution_plan_v1`. Не добавляй Markdown, пояснения или текст вне JSON.

## Задача

На основании raw text игрока и player-safe context определи один ближайший conversation contribution персонажа:

- что он фактически произносит либо делает в рамках разговора;
- к кому он обращается;
- какой это речевой акт;
- какие claims содержатся в речи;
- ожидает ли он ответа;
- требуется ли социальная проверка;
- есть ли одно непосредственно сопровождающее действие.

Не определяй ответ NPC.

## Verbatim и намерение

Если игрок явно задал прямую цитату, `говорю: ...` или точные слова в кавычках, используй `input_mode = verbatim` и сохрани формулировку максимально точно.

Не заменяй анахроничное слово в verbatim-реплике историческим аналогом. Персонаж может сказать непонятное или неуместное слово, а NPC затем отреагирует на фактически услышанное.

Если игрок описал намерение без точной цитаты, используй `input_mode = intent_paraphrase`. Сформулируй естественную реплику, соответствующую характеру персонажа, его знаниям, социальной роли, эпохе и ситуации.

## Историчность

Содержание должно соответствовать миру XIII века.

Не создавай отсутствующие:

- документы;
- должности;
- законы;
- титулы;
- предметы;
- доказательства;
- полномочия;
- знания персонажа.

При пересказанном намерении можно использовать `historical_equivalent`, но только из понятий, доступных переданному персонажу и контексту.

## Односоставность

Верни один ближайший речевой поступок.

Не включай в один plan:

- вопрос и будущий ответ NPC;
- несколько последовательных переговорных ходов;
- обещание и его принятие;
- угрозу и подчинение адресата;
- убеждение и последующее совместное действие.

Один contribution может содержать одну связную короткую реплику из нескольких предложений, если они выражают один речевой акт и не требуют промежуточной реакции.

## Адресаты

Используй только actor refs из переданного player-safe context.

`intended_addressee_refs` — намеренные адресаты, а не все присутствующие.

Не назначай фактических слушателей и свидетелей. Их определяет perception owner после commit.

## Claims

Разметь только явно выраженные утверждения.

Claim является содержанием речи, а не objective fact.

Не создавай новый persistent entity ref. Новое имя без ref может существовать только внутри utterance text как заявление говорящего.

Для персонажа игрока используй `speaker_posture` только если raw text или context ясно показывают: believed_true, knowingly_false, mixed, uncertain или withheld. Не угадывай скрытое намерение игрока без основания.

## Социальная проверка

Не назначай проверку для обычного приветствия, вопроса, сообщения, честного ответа или отказа.

Назначь `check_required`, если персонаж пытается преодолеть сопротивление через убеждение, обман, запугивание, торг, демонстрацию власти или сокрытие заметного состояния.

Не выполняй бросок и не определяй ответ NPC.

## Supporting operations

Добавляй только действие, неразделимое с репликой и полностью разрешимое из текущего состояния: показать уже доступный предмет, указать, положить известный предмет перед адресатом.

Если требуется неизвестный результат, перемещение, открытие, поиск или отдельная проверка физического действия, верни `action_handoff` либо остановись на первом исполнимом шаге согласно operation contract.

## Запреты

Не:

- создавай ответ NPC;
- изменяй objective truth;
- создавай предмет или скрытый факт;
- определяй фактических свидетелей;
- выполняй RNG;
- рассчитывай exact time;
- записывай в базу;
- возвращай художественное описание всей сцены;
- используй operation вне переданного contract.

## Самопроверка

Перед ответом проверь:

1. Возвращён ровно один contribution.
2. Verbatim-слова не переписаны историческим аналогом.
3. Все actor/entity refs присутствуют во входе.
4. Claims не выданы за факты мира.
5. Ответ NPC не определён.
6. Проверка только запрошена, но не выполнена.
7. JSON соответствует schema.

PLAYER_CONVERSATION_REQUEST:

{{PLAYER_CONVERSATION_REQUEST_JSON}}
```

---

# 39. Runtime prompt: ответ одного NPC

```text
Ты принимаешь одно решение за конкретного NPC в текущем разговоре исторической ролевой игры «Русь XIII век».

Каждый вызов является независимой сессией. У тебя нет памяти, кроме переданного NPC_CONVERSATION_RESPONSE_REQUEST.

Верни только один корректный JSON-объект по schema `conversation_contribution_plan_v1`. Не добавляй Markdown, пояснения или текст вне JSON.

## Главный вопрос

Как этот человек ответил бы прямо сейчас — либо почему он не ответил бы?

## Почему тебя вызвали

Код агрегировал новые decision-relevant signals одного или нескольких типов:

- `self` — собственное состояние и возможности;
- `others` — другие участники;
- `environment` — обстановка и доступ;
- `objective` — текущее намерение, роль, задача или обязательство;
- `communication` — воспринятое сообщение.

`material` требует нового contribution до продолжения разговора. `critical` означает, что прежнее conversation intent нельзя автоматически продолжать.

Используй `perceived_changes`; не придумывай новые категории и не определяй заново, нужен ли был вызов.

## Субъективная граница

Используй только:

- фактически воспринятую NPC часть сообщения;
- его recognition и comprehension;
- его знания, убеждения, заблуждения и received messages;
- его память;
- собственные прежние слова и решения;
- состояние тела;
- настроение и эмоции;
- темперамент;
- ценности;
- цели;
- страхи;
- социальную роль;
- власть и обязанности;
- отношения к присутствующим;
- доступные ресурсы;
- perceived social delivery quality;
- публичную историю разговора, которую этот NPC действительно воспринял.

Не используй объективные факты, которых NPC не знает.

Не используй внутренние reasons и знания других NPC.

## Решение

Прими одно окончательное решение.

NPC может:

- ответить правдиво;
- ответить ошибочно;
- солгать;
- скрыть часть сведений;
- уклониться;
- задать вопрос;
- попросить;
- приказать;
- предложить;
- согласиться;
- отказаться;
- пригрозить;
- обвинить;
- признаться;
- промолчать;
- прекратить разговор;
- передать действие общему actor-step mode;
- начать combat handoff.

NPC не обязан отвечать только потому, что получил response boundary.

## Как выбирать

Ответь не как автор сюжета, а как переданный человек.

Не выбирай реплику ради:

- пользы игроку;
- наказания игрока;
- драматичности;
- обязательного раскрытия квеста;
- обязательного конфликта;
- обязательного продолжения разговора.

Учитывай конфликт между страхом, выгодой, обязанностью, ролью, отношениями, телом, настроением и текущей опасностью.

Ни одна черта не является абсолютной командой.

## Историчность и реализм

Используй понятия, доступные эпохе, региону, роли и знаниям NPC.

Можно писать естественным современным русским для читаемости, но нельзя вводить современные учреждения, психологическую терминологию как знание NPC, современные документы, технологии и права.

Не создавай отсутствующий предмет, маршрут, лицо, должность или objective event.

NPC может произнести ложь или выдуманное имя, но это остаётся только statement content и не создаёт сущность мира.

## Односоставность

Верни один ближайший contribution.

Не:

- разыгрывай весь разговор;
- определяй будущую реплику игрока;
- определяй ответ другого NPC;
- одновременно говори, получай согласие и действуй;
- начинай и разрешай бой;
- продолжай после новой самостоятельной границы.

## Speech

Если contribution kind = speech:

- верни точный `utterance_text`;
- укажи intended addressees;
- укажи dominant act и interaction tags;
- разметь claims;
- укажи response expectation только если NPC действительно ожидает немедленного ответа.

## Правда, ложь и withholding

`speaker_posture` описывает отношение NPC к собственному claim:

- `believed_true`;
- `knowingly_false`;
- `mixed`;
- `uncertain`;
- `withheld`.

Не раскрывай posture в utterance автоматически.

Ложь не становится objective fact.

Withholding не равен ложному утверждению.

## Социальная проверка

Обычный ответ не требует проверки.

Назначь check только если NPC пытается убедить, обмануть, запугать, скрыть состояние, добиться уступки или иным образом преодолеть сопротивление.

Не выполняй бросок.

Не определяй решение listener после броска.

## Молчание и handoff

При `silence` верни видимое ближайшее поведение без внутреннего монолога.

При `action_handoff` опиши одно ближайшее намерение. Не рассчитывай маршрут, предметы, тело или consequence.

При `combat_handoff` не определяй попадание, вред и исход боя.

## Запреты

Не:

- используй невоспринятую реплику;
- используй скрытую truth мира;
- создавай решение другого участника;
- превращай успешную проверку в обязательное согласие;
- создавай objective fact из claim;
- выполняй RNG;
- рассчитывай exact time/body/item effects;
- записывай в базу;
- возвращай narration;
- возвращай несколько contributions.

## Reason

Верни краткий `reason` только для internal trace.

Не включай в него новые факты и не пиши длинное рассуждение.

## Самопроверка

1. Ответ дан от лица одного NPC.
2. Использованы только доступные ему сведения.
3. Возвращён один contribution.
4. Нет решения другого персонажа.
5. Claims отделены от objective truth.
6. Разговор, actor action и combat имеют правильные границы.
7. Все refs присутствуют во входе.
8. JSON соответствует schema.

NPC_CONVERSATION_RESPONSE_REQUEST:

{{NPC_CONVERSATION_RESPONSE_REQUEST_JSON}}
```

---

# 40. Runtime prompt: format repair

```text
Ты исправляешь только структуру JSON-ответа conversation agent.

Верни только один JSON-объект требуемой schema.

Используй:

- исходный request;
- исходный output;
- список validation errors;
- разрешённые enums и refs.

Разрешено:

- добавить обязательное поле со значением, уже однозначно следующим из исходного output;
- удалить запрещённое поле;
- исправить enum или тип;
- заменить ссылку на точную уже использованную допустимую ссылку;
- привести JSON к требуемой форме.

Запрещено:

- выбирать другое решение;
- менять utterance meaning;
- менять addressee;
- добавлять новый claim;
- превращать speech в silence или handoff;
- менять automatic на check_required либо наоборот без явного исходного содержания;
- создавать новые факты, refs или operations.

Если смысл нельзя сохранить при исправлении формы, верни:

{
  "status": "unrepairable"
}

REPAIR_INPUT:

{{CONVERSATION_REPAIR_INPUT_JSON}}
```

---

## 41. Примеры

### 41.1. Один NPC, обычный вопрос

Игрок:

```text
Еремей, что ты видел у реки?
```

Player contribution:

- speech;
- primary addressee = Еремей;
- dominant act = question;
- no check;
- response expectation = answer.

После perception applicable policy создаёт `communication / material`; общий evaluator создаёт для Еремея одну aggregated conversation boundary.

### 41.2. Несколько NPC и свидетели

Игрок обращается к Ратше при Еремее и двух рыбаках:

```text
Ратша, при всех отвечай: кто велел тебе напасть?
```

После statement:

- Ратша как прямой адресат получает `communication / material` signal;
- Еремей и рыбаки отдельно проходят perception;
- обычные рыбаки не получают decision signal только потому, что слышат;
- active authority/intervention policy Еремея может создать `objective` и/или `communication` signal;
- все signals каждого NPC агрегируются в одну boundary;
- фактические witnesses определяются по perception, а не intended audience.

### 41.3. Угроза охраннику

Игрок угрожает сторожу склада.

- player interpreter маркирует `threaten`, `guarded_order_affected`;
- social check определяет delivery quality;
- сторож получает message и check cues;
- applicable policy создаёт `communication` и при необходимости `objective` signal;
- signals агрегируются в одну boundary;
- responder решает: подчиниться, позвать помощь, отступить, напасть, продолжить спор или промолчать.

Код не выбирает реакцию сторожа.

### 41.4. Предъявление улики

Игрок:

```text
Показываю Еремею синюю шерсть и говорю, что нашёл её у лодки. Прошу провести меня к Ратше.
```

Если шерсть уже доступна:

- `supporting_operations` показывает предмет;
- speech содержит claim о месте находки;
- request может потребовать social check;
- Еремей получает visual item signal, speech signal и delivery result;
- responder решает, помогать ли.

### 41.5. Ложь NPC

Ратша знает, что видел Жданко, но говорит:

```text
«Не знаю я никакого Жданка. Один был.»
```

Сохраняется:

- exact utterance;
- claim;
- `speaker_posture = knowingly_false` во внутреннем trace;
- listeners know only that Ratsha said it;
- objective truth не меняется.

---

## 42. Минимальный план внедрения

### Этап 1. Формальные контракты

Переиспользовать общие schemas:

```text
npc_decision_signal_v1
npc_decision_boundary_v1
```

Добавить только conversation-specific schemas:

```text
conversation_session_v1
player_conversation_input_v1
player_conversation_contribution_plan_v1
conversation_statement_event_v1
npc_conversation_response_request_v1
conversation_contribution_plan_v1
social_delivery_result_v1
```

Добавить validators и contract tests.

### Этап 2. Player contribution interpreter

В `@rus/turn`:

- добавить conversation semantic resolver port;
- использовать существующий `social_npc` mode;
- подключить общий check pipeline;
- создавать factual statement event;
- поддержать supporting operations.

### Этап 3. Audience and knowledge

Расширить существующий perception path:

- speech signal;
- comprehension result;
- received-message knowledge;
- witness candidate projection.

Не создавать отдельный conversation perception engine.

### Этап 4. NPC responder

В `@rus/npc-runtime` переиспользовать:

```text
evaluateNpcDecisionSignals
buildNpcDecisionBoundary
```

и добавить только conversation-specific чистые функции:

```text
buildNpcConversationResponseRequest
validateNpcConversationContributionPlan
orderNpcConversationDecisionRequests
```

LLM port и цикл остаются в `@rus/turn`.

### Этап 5. Conversation session loop

Добавить в `@rus/turn`:

- active session projection;
- exchange id;
- pending response queue;
- player-response boundary;
- action/combat handoffs;
- safety limit.

### Этап 6. Persistence

Обобщить существующую Phase 3 persistence:

- scenario-specific statement mapping заменить generic statement events;
- сохранить existing interaction, memory, knowledge and check rows;
- добавить только минимальную active session projection при необходимости.

### Этап 7. Social obligations

Расширить `@rus/social-law` одной pure function для party-local commitment, основанного на committed statements и фактических witnesses.

### Этап 8. Первый conformance scenario

Перевести разговор с Еремеем в Lower Dvina Phase 3 на новый общий contract.

Сценарий должен подтвердить:

- обычный вопрос;
- withholding;
- предъявление улики;
- social check;
- disclosure;
- присутствующего рыбака-свидетеля;
- knowledge and memory persistence.

После cutover old scenario-local conversation resolver не остаётся production fallback.

---

## 43. Обязательные изменения документации

Документация обновляется одновременно с runtime cutover.

До этого данный файл остаётся `proposed`.

### 43.1. `AGENTS.md`

Изменить раздел 6 «Для материализации мира сохраняются следующие инварианты».

Текущее общее утверждение:

```text
LLM выбирает только из переданного закрытого набора
```

должно быть сужено до materialization/candidate-selection context.

Добавить разрешённые runtime semantic roles:

- player action semantic plan;
- autonomous NPC semantic plan;
- player conversation contribution;
- NPC conversation response.

Зафиксировать, что они:

- не материализуют objective entities;
- не пишут party state;
- не выполняют RNG;
- используют ограниченный operation contract;
- проходят code revalidation и common actor-step execution.

### 43.2. `data/knowledge-source/corpus/DOCUMENTS/code_driven_world_materialization_architecture.md`

Это высший норматив, поэтому его изменение обязательно.

Обновить:

- главный принцип раздела 1;
- D-010 «LLM выбирает только из закрытого набора»;
- D-011 «Выбор LLM не является последствием»;
- раздел 4.4 `LLM`.

Новая граница должна различать:

```text
materialization and candidate selection
  остаются closed and code-owned;

semantic actor/conversation planning
  допускает один структурированный plan из переданного субъективного context
  и ограниченного operation contract;

objective fact creation and persistence
  остаются code-owned.
```

Не ослаблять запрет LLM создавать G5, NPC, items, containers и hidden truth.

### 43.3. `data/knowledge-source/corpus/DOCUMENTS/temporal_world_and_interruptible_activities.md`

Обновить:

- перечень поддерживаемых temporal activities;
- ownership table;
- NPC decision section;
- meaningful decision boundary rules;
- same-time reaction ordering;
- one factual commit before player boundary.

Добавить:

- conversation contribution как time-bearing actor step;
- общий `npc_decision_signal_v1` и `npc_decision_boundary_v1` с `decision_mode = conversation`;
- закрытый словарь пяти categories и двух significance;
- aggregation всех signals одного NPC и batch в один LLM-вызов;
- perception/knowledge before response;
- sequential per-NPC response processing;
- player-response boundary;
- action/combat handoff;
- exchange safety limit.

### 43.4. `packages/turn/MODULE.md`

Добавить в ownership и public behavior:

- `social_npc` conversation session;
- player contribution resolver port;
- async per-NPC responder loop;
- response boundary queue;
- common checks/consequences/time;
- combined commit to player boundary;
- replay and stale handling.

Уточнить, что `@rus/turn` не создаёт NPC knowledge и social-law consequences.

### 43.5. `packages/npc-runtime/MODULE.md`

Заменить bounded-only описание в части conversation responses.

Зафиксировать общий public trigger API:

```text
validateNpcDecisionSignal
evaluateNpcDecisionSignals
buildNpcDecisionBoundary
```

и conversation-specific APIs:

```text
buildNpcConversationResponseRequest
validateNpcConversationContributionPlan
orderNpcConversationDecisionRequests
```

Зафиксировать:

- один aggregated request на NPC и same-time batch;
- только пять categories и два significance;
- только субъективный context;
- no network/LLM I/O inside package;
- обычные witnesses без decision signal не вызывают LLM;
- conversation response является mode profile общего decision protocol.

### 43.6. `packages/visibility-knowledge-memory/MODULE.md`

Добавить:

- conversation statement event as received-message source;
- actual audience resolution;
- comprehension;
- statement witness candidate;
- claim versus objective fact;
- public history filtered per participant;
- persisted player-safe utterances.

Уточнить, что получение сообщения не означает belief in claim.

### 43.7. `packages/social-law/MODULE.md`

Добавить:

- обработку structured commitment candidate;
- `planPartyLocalCommitment` либо эквивалентное минимальное расширение существующего owner;
- activation только из committed offer/acceptance statements;
- раздельную policy восприятия offer и acceptance; acceptance активирует
  commitment только после factual full perception каждой требуемой policy
  стороны;
- factual witness perception;
- authority/intervention policies for response boundaries.

Не создавать второй promise engine.

### 43.8. `data/knowledge-source/corpus/DOCUMENTS/information_sources_llm_prompts.md`

Обновить разделы runtime LLM roles и запреты.

Добавить:

- player conversation interpreter;
- NPC conversation responder;
- statement content не является objective truth;
- отдельный subjective context каждого NPC;
- no group-wide omniscient prompt;
- social check result does not select NPC response.

Удалить утверждение, что все runtime semantic решения LLM являются только bounded option selection.

### 43.9. `data/knowledge-source/corpus/DOCUMENTS/llm_agent_prompt_templates.md`

Обновить вступительное ограничение разрешённых ролей.

Добавить нормативные templates из разделов 38–40 этого контракта.

Обновить главный pipeline:

```text
conversation semantic contribution
→ common check
→ committed statement
→ perception and knowledge
→ NPC response decision
→ combined factual commit
→ narration
```

Удалить либо пометить historical templates, которые поручают LLM security projection или objective consequence.

### 43.10. `docs/pipelines/turn.md`

Добавить отдельный подраздел `social_npc conversation exchange`:

- input;
- session load;
- player contribution;
- checks;
- statement event;
- perception/knowledge;
- response queue;
- NPC contributions;
- commit;
- narration.

### 43.11. `docs/migration/contracts/TURN_WORKFLOW_CONTRACT_MAP.md`

Зарегистрировать новые schemas, owners и ports.

Указать migration path от Phase 3 scenario-local conversation к общему runtime.

### 43.12. Generated documentation

После изменения formal schemas регенерировать:

```text
generated/schema-reference.json
generated/schema-reference.md
generated/generated-manifest.json
generated/module-index.json
```

Generated files не редактировать вручную.

### 43.13. Lower Dvina scenario documentation/data

После миграции обновить references в Phase 3 content так, чтобы:

- statement templates оставались допустимыми authored content;
- generic conversation runtime владел исполнением;
- old exact command path не считался production owner;
- Еремей и participating fisher использовались как conformance data, а не отдельный engine.

---

## 44. Изменения кода и контрактов по владельцам

### `@rus/contracts`

- новые JSON schemas;
- enums contribution/act/adaptation/comprehension;
- typed errors;
- schema registry and generated references.

### `@rus/turn`

- conversation session orchestrator;
- player semantic resolver port;
- NPC responder port;
- shared actor-step execution;
- response queue;
- combined write plan.

### `@rus/npc-runtime`

- pure context builder;
- request validator;
- contribution validator;
- canonical response ordering.

### `@rus/visibility-knowledge-memory`

- speech perception source;
- received-message merge;
- witness candidate;
- participant-safe history.

### `@rus/social-law`

- role intervention descriptors;
- party-local commitment planning.

### `@rus/party-store` / game-server adapter

- minimal active session projection if needed;
- append statement/contribution events;
- reuse existing interaction, knowledge, memory and check tables;
- atomic commit.

---

## 45. Typed errors

Минимальный набор:

```text
conversation_session_missing
conversation_session_stale
conversation_participant_unavailable
conversation_statement_invalid
npc_decision_boundary_stale
conversation_contribution_schema_invalid
conversation_contribution_ref_invalid
conversation_operation_not_allowed
conversation_exchange_limit_reached
conversation_comprehension_policy_gap
conversation_commitment_policy_gap
conversation_llm_contract_failure
idempotency_conflict
hidden_information_leak
```

`conversation_exchange_limit_reached` по умолчанию завершает текущий exchange на player boundary, а не откатывает уже валидное working state.

---

## 46. Критерии готовности

### Один NPC

1. Игрок задаёт обычный вопрос без проверки.
2. NPC получает только воспринятую реплику.
3. NPC может ответить, солгать, уклониться или промолчать.
4. Exact utterance сохраняется.
5. Claim не становится objective fact.

### Несколько NPC

6. Все conversation triggers используют только пять общих categories.
7. Все signals одного NPC и batch агрегируются в один request.
8. Прямые адресаты обрабатываются перед остальными eligible NPC без отдельного trigger vocabulary.
9. Обычный свидетель без decision signal не вызывает LLM.
10. Role intervention создаёт `objective` и/или `communication` signal, а не отдельный boundary type.
11. Следующий NPC видит предыдущую реплику только после perception.
12. Скрытые знания NPC не смешиваются.

### Проверки

13. Обычный вопрос не вызывает check.
14. Убеждение вызывает common check.
15. RNG выполняет код.
16. Outcome не заставляет NPC согласиться.
17. Общий NPC contribution contract принимает собственный social check при
    зарегистрированных refs; Lower Dvina revision 14 активирует его для лжи и
    торга Ратши.

### Историчность

18. Intent paraphrase может получить historical equivalent.
19. Verbatim anachronism сохраняется как произнесённое слово.
20. NPC не получает современное знание.
21. Ложная реплика не создаёт мир.

### Восприятие и свидетели

22. Неуслышавший NPC не получает knowledge.
23. Частично услышавший получает partial message.
24. Witness знает факт высказывания, а не его истинность.
25. Неадресованный listener может услышать.
26. Addressed NPC может не услышать.

### Время и оркестрация

27. Contribution consumes approved exact time.
28. LLM latency не двигает game clock.
29. Temporal interruption видит evolving state.
30. Exchange заканчивается на player boundary.
31. Infinite NPC-to-NPC loop ограничен safety limit.

### Persistence

32. Replay не повторяет statement.
33. Replay не повторяет RNG.
34. Restart воспроизводит exact utterances и audience records.
35. Session state и contributions сохраняются атомарно.
36. Stale plan не применяется.

### Handoffs

37. NPC может уйти из разговора.
38. Actor action исполняется common executor.
39. Combat handoff не разрешает бой внутри conversation mode.
40. Conversation может быть приостановлен и revalidated после action.

### Обязательства

41. Promise statement сохраняется до obligation.
42. Offer без acceptance не становится active obligation.
43. Witness учитывается только после factual perception.
44. Reload не меняет terms committed promise.

### Security

45. Narrator не получает hidden reasons.
46. Другой NPC не получает speaker posture.
47. Player UI не видит невоспринятую реплику.
48. LLM не создаёт SQL/write plan.
49. Все operations входят в переданный operation contract.

---


## 47. Activation и cutover

Контракт переводится в `active` только после:

1. реализации formal schemas;
2. общего conversation session loop;
3. player interpreter;
4. NPC responder;
5. perception/message integration;
6. common social checks;
7. persistence/replay;
8. миграции Lower Dvina Phase 3 как conformance scenario;
9. обновления высших нормативов;
10. профильных tests;
11. independent architecture audit, так как меняется граница кода и LLM.

До cutover:

- текущий production сохраняет старое bounded behavior;
- данный файл не переопределяет активные нормативы;
- запрещён mixed path внутри одной conversation session;
- запрещён fallback нового semantic mode в old scenario-local resolver после частично применённого exchange.

После cutover:

- общий conversation runtime становится sole production owner режима `social_npc`;
- scenario data задаёт персонажей, statement templates, policies и allowed consequences;
- scenario-local conversation engines удаляются из production path;
- historical compatibility tests могут сохранять старый код только как явный migration/rollback source.

---

## 48. Итоговая архитектурная формула

```text
Игрок задаёт речевое намерение.
Player interpreter создаёт один structured contribution.
Код выполняет проверку и фиксирует точные слова.
Perception owner определяет, кто что услышал.
Knowledge owner сохраняет received messages без превращения их в истину.
Код создаёт generic decision signals только для eligible NPC и агрегирует их в одну conversation boundary на NPC и batch.
Отдельная LLM-сессия каждого NPC возвращает один contribution.
Все действия используют общий actor-step pipeline.
@rus/turn ведёт exchange до ближайшей player-response boundary.
Факты и player-safe package сохраняются атомарно до narration.
```

# Приложение A. Machine contract specifications

```yaml
contract_name: conversation_session_v1
storage: party_runtime_mutable_lifecycle
identity:
  - conversation_id
fields:
  schema: required enum[conversation_session_v1]
  conversation_id: required stable_id
  state_version: required state_version
  status: required enum[active, suspended, ended]
  started_at: required game_timestamp
  location_ref: required entity_ref
  initiator_ref: required entity_ref
  active_participant_refs: required nonempty_relation_set[entity_ref]
  last_contribution_ref: optional entity_ref
  topic_refs: required relation_set[stable_id]
  status_reason: optional string
invariants:
  - The initiator is an active participant and active contributions are accepted only while status is active.
  - The actual audience is resolved per statement and is not persisted as a session-wide audience list.
```

```yaml
contract_name: player_conversation_input_v1
storage: immutable_request
identity:
  - request_id
fields:
  schema: required enum[player_conversation_input_v1]
  request_id: required stable_id
  conversation_id: required stable_id
  state_version: required state_version
  speaker_ref: required entity_ref
  raw_text: required string
  received_at: required system_timestamp
  player_safe_context: required json_object
  operation_contract: required json_object
invariants:
  - raw_text is player input rather than a factual utterance until semantic interpretation and commit.
  - The context is player-safe and the operation contract contains only code-supported capabilities.
  - player_safe_context contains code-owned allowed actor, entity, knowledge and combat target references for the contribution plan.
  - activity.duration_class belongs to player_safe_context.allowed_duration_classes.
```

```yaml
contract_name: player_conversation_contribution_plan_v1
storage: immutable_response
identity:
  - request_id
fields:
  schema: required enum[player_conversation_contribution_plan_v1]
  request_id: required stable_id
  conversation_id: required stable_id
  state_version: required state_version
  speaker_ref: required entity_ref
  input_mode: required enum[verbatim, intent_paraphrase]
  contribution_kind: required enum[speech, silence, leave_conversation, action_handoff, combat_handoff]
  primary_addressee_ref: optional entity_ref
  intended_addressee_refs: required relation_set[entity_ref]
  affected_actor_refs: required relation_set[entity_ref]
  speech: optional json_object
  interpretation: required json_object
  resolution: required enum[automatic, check_required]
  activity: required json_object
  supporting_operations: required relation_set[json_object]
  check: optional json_object
  handoff: optional json_object
invariants:
  - One plan contains exactly one conversation contribution and no implicit continuation.
  - Verbatim input persists only the explicitly spoken words, excluding wrappers such as `Говорю: «...»`, and cannot use historical_equivalent adaptation.
  - Addressees, affected actors, response targets, claim sources, mentioned entities and combat targets belong to player_safe_context.allowed_references.
  - Speech, check and handoff branches are mutually constrained by contribution_kind and resolution.
```

```yaml
contract_name: conversation_statement_event_v1
storage: party_runtime_append_only
identity:
  - statement_id
fields:
  schema: required enum[conversation_statement_event_v1]
  statement_id: required stable_id
  conversation_id: required stable_id
  exchange_id: required stable_id
  speaker_ref: required entity_ref
  intended_addressee_refs: required relation_set[entity_ref]
  utterance_text: required string
  dominant_act: required enum[greet, farewell, question, answer, inform, request, command, offer, accept, refuse, negotiate, promise, threaten, accuse, confess, evade, warn, challenge, apologize]
  interaction_tags: required relation_set[stable_id]
  topic_refs: required relation_set[stable_id]
  claims: required relation_set[json_object]
  message_completeness: required enum[complete]
  spoken_at: required game_timestamp
  duration: required json_object
  social_delivery_result: optional social_delivery_result_v1
  source_plan_ref: required entity_ref
invariants:
  - The exact utterance is factual after commit while its claims do not become objective truth.
  - Perception determines the actual audience and witnesses after the statement exists.
```

```yaml
contract_name: npc_conversation_response_request_v1
storage: immutable_request
identity:
  - request_id
fields:
  schema: required enum[npc_conversation_response_request_v1]
  request_id: required stable_id
  boundary_id: required stable_id
  conversation_id: required stable_id
  exchange_id: required stable_id
  state_version: required state_version
  requested_at: required game_timestamp
  npc_ref: required entity_ref
  decision_reasons: required json_object
  npc: required json_object
  perceived_message: required json_object_or_null
  public_conversation_history: required relation_set[json_object]
  knowledge: required json_object
  memory: required json_object
  social_context: required json_object
  available_resources: required relation_set[json_object]
  allowed_references: required json_object
  decision_scope: required json_object
invariants:
  - A communication boundary requires the current actually perceived message; a boundary without communication requires perceived_message = null.
  - The request contains only messages and conversation history actually perceived by this NPC.
  - Decision reasons reuse the common five categories and contain no mode-specific trigger vocabulary.
  - Hidden reasons, objective unknown facts and other model prompts are excluded.
  - Every actor, entity, knowledge and combat target reference in the response must belong to the explicit code-owned allowed_references set.
  - Every check attribute, skill and profile reference must belong to the explicit decision_scope allowlists.
  - activity.duration_class belongs to decision_scope.allowed_duration_classes.
```

```yaml
contract_name: conversation_contribution_plan_v1
storage: immutable_response
identity:
  - request_id
fields:
  schema: required enum[conversation_contribution_plan_v1]
  request_id: required stable_id
  boundary_id: required stable_id
  conversation_id: required stable_id
  exchange_id: required stable_id
  state_version: required state_version
  speaker_ref: required entity_ref
  contribution_kind: required enum[speech, silence, leave_conversation, action_handoff, combat_handoff]
  primary_addressee_ref: optional entity_ref
  intended_addressee_refs: required relation_set[entity_ref]
  affected_actor_refs: required relation_set[entity_ref]
  speech: optional json_object
  interpretation: required json_object
  resolution: required enum[automatic, check_required]
  activity: required json_object
  supporting_operations: required relation_set[json_object]
  check: optional json_object
  handoff: optional json_object
  reason: required string
invariants:
  - One plan contains one contribution and can hand off at most one ordinary action or combat intent.
  - The reason is internal trace data and never becomes a world fact or player-visible content.
  - A check affects observable delivery only and cannot force the listener's decision.
  - Addressees, affected actors, response expectations, claim sources, mentioned entities and combat targets are closed to the originating request allowed_references.
```

```yaml
contract_name: social_delivery_result_v1
storage: immutable_result
identity:
  - check_resolution_id
fields:
  schema: required enum[social_delivery_result_v1]
  check_resolution_id: required stable_id
  outcome_band: required enum[clean_success, success, success_with_cost, failure_with_consequence, severe_failure]
  delivery_quality: required enum[compelling, credible, credible_with_visible_cost, unconvincing, transparently_manipulative]
  observable_effects: required relation_set[stable_id]
invariants:
  - The result records exactly one code-selected five-band check outcome and its matching delivery quality.
  - Observable effects are factual and listener responses remain separate NPC decisions.
```
