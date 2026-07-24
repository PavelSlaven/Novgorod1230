# Механика течения времени, длительных действий и автономного мира v4

**Проект:** «Русь XIII век»  
**Статус:** `proposed` — целевой норматив; не описывает уже активированный production runtime  
**Канонический репозиторий:** `PavelSlaven/Novgorod1230`  
**Базовая ветка и снимок сверки:** `main` @ `520c0ea8cc366fc16c949a874c710f3547a322f6`  
**Целевая архитектура:** materialization/spatial v3 после атомарного P28 activation gate  
**Предлагаемая версия amendment:** `temporal-world-v1`, с повышением версии spatial-v3 contract set до следующей target-версии  
**Связанный план:** `План_реализации_механики_времени_v4_implementation_ready.md`

## 0. Нормативная сила и модель активации

Этот документ задаёт целевое поведение механики времени после её реализации и активации. На базовом снимке репозитория production-владельцем остаётся materialization v2, а spatial v3 является target-моделью до P28. Поэтому применяются два разных утверждения:

1. **До P28:** production продолжает работать по v2; temporal-v3/v4 код, DDL и contracts допускаются только в target-, test-, migration- и shadow-контуре. Запрещены mixed read, dual write и fallback из v3 в v2.
2. **После успешного P28:** v3 становится единственным production runtime; старый путь не вызывается, не выбирается по feature flag и не используется как semantic fallback.

Этот документ переводится из `proposed` в `active` только после реализации полного обязательного scope, прохождения tests, документационной и индексной интеграции, независимого аудита и P28 activation evidence. Само изменение статуса не активирует runtime.

При конфликте с текущими target-контрактами spatial v3 этот документ считается предложением к их согласованному versioned amendment, а не разрешением создать параллельную модель.

## 1. Назначение

Механика определяет:

- точное игровое время и календарную проекцию;
- `immediate_action`, `timed_activity`, `timed_traversal`;
- ожидание, сон, работу, лечение, караул, изготовление и многосторонние активности;
- точный частичный прогресс, паузу, возобновление, провал и отказ;
- телесные изменения и пороговые состояния;
- временные границы и детерминированные same-time cascades;
- расписания, перемещение, восприятие и реакции NPC;
- bounded NPC decisions;
- свет, доступ, погоду, состояние места и исторические фазы;
- синхронизированное время внутри движущихся носителей;
- lazy catch-up дальнего materialized мира;
- распространение причинных процессов;
- один combined change set, атомарный factual commit и post-commit narration;
- разделение факта мира, знания персонажа и player-facing представления.

Документ не создаёт конкретные исторические факты, расписания, погоду, реакции, формулы лечения или содержательные варианты поведения. Они поступают только из approved categories, profiles, rules, policies, source-backed historical records и сохранённого состояния партии.

## 2. Нормативные слова

- **ОБЯЗАН / ОБЯЗАТЕЛЬНО** — требование, без которого contract или release не принимается.
- **ЗАПРЕЩЕНО** — нарушение блокирует contract activation или commit.
- **МОЖЕТ** — разрешённая ветвь, только если её applicability явно определена approved policy.
- **Data gap** — отсутствие обязательных данных; это hard block, а не повод ослабить фильтр.
- **Authored default** — явно утверждённый вариант внутри конечного candidate set. Это не runtime fallback.

## 3. Главные инварианты

### 3.1. Событийное, а не реальное время

Игровой clock изменяется только вследствие approved time-bearing execution:

- `timed_activity`;
- `timed_traversal`;
- synchronized root-transport slice;
- уже запущенного approved процесса, граница которого достигнута внутри такого slice.

Не двигают часы:

- `immediate_action`;
- загрузка, сохранение, retry и reload;
- поиск пути и подготовка endpoint;
- G6 materialization;
- RAG, Graphify, audit и validation;
- обращение к LLM;
- ожидание сети или пользователя в реальном времени;
- narration и её retry.

`Date.now()`, `new Date()` и `TIMESTAMPTZ` допустимы только для технических lease, operator audit и наблюдаемости. Они не участвуют в игровом ordering.

### 3.2. Одна шкала времени

Авторитетная координата партии — точное неотрицательное рациональное число минут от party epoch.

```text
game_timestamp >= 0
elapsed_time >= 0
whole_minute_index = floor(game_timestamp)
```

`whole_minute_index` — производная величина для minute-indexed правил. Она не заменяет точный timestamp.

Запрещены:

- округление каждого действия до минуты;
- обязательная минимальная минута;
- terminal `ceil`;
- float arithmetic;
- скрытый carry внутри отдельного package;
- RFC3339/TIMESTAMPTZ как game timestamp;
- разные temporal epochs у доменных подсистем одной партии.

### 3.3. Один владелец clock

Каждый committed положительный elapsed имеет ровно одного владельца:

```text
direct_party_clock
shared_root_transport_clock
```

- `direct_party_clock` сам продвигает party clock.
- `shared_root_transport_clock` получает elapsed от root slice и не продвигает clock.
- В одном combined change set допускается ровно один фактический party-clock update.
- Два независимых `direct_party_clock` — `time_owner_conflict`.

### 3.4. Один factual commit до decision boundary

Одна команда игрока обрабатывается до первого из состояний:

- execution завершён;
- достигнут разрешённый traversal step endpoint;
- требуется решение игрока;
- activity paused, failed или явно aborted;
- возник `stranded_state`;
- обнаружен data gap;
- stale state или idempotency conflict;
- техническая ошибка до factual commit.

Все детерминированные изменения до границы входят в один validated combined change set и одну транзакцию.

### 3.5. Factual state раньше narration

Порядок обязателен:

```text
resolve command
→ calculate factual proposals
→ resolve temporal slices and same-time cascades
→ build combined change set
→ derive player-safe visible package from candidate committed state
→ validate hidden boundary
→ build persistence plan
→ atomically commit facts + visible package + narration-pending metadata
→ invoke narration by persisted visible package id/digest
→ build screen projection
```

Narration:

- не определяет consequence;
- не изменяет мир;
- не блокирует уже совершённый factual commit;
- не получает hidden state;
- повторяется идемпотентно по сохранённому visible package;
- при техническом сбое заменяется только структурированным factual screen, а не придуманной deterministic прозой.

## 4. Владение ответственностями

| Ответственность | Нормативный владелец |
|---|---|
| Rational arithmetic, exact timestamps, whole-minute derivation, calendar projection, boundary ordering | `@rus/time-events-history` |
| Общие temporal DTO, vocabularies, typed errors | `@rus/contracts`, без доменной логики |
| Activity execution, attempts, synchronized slices | существующий `@rus/turn/spatial-v3-execution`, расширяемый без второго engine |
| Traversal cost, progress и spatial outcomes | `@rus/movement-routes` и existing spatial-v3 execution contracts |
| Body effects и threshold prediction | `@rus/body-state` |
| Perception, knowledge, memory, player-safe package | `@rus/visibility-knowledge-memory` |
| NPC schedule/runtime/reaction semantics | один явно назначенный NPC runtime owner; выбор package фиксируется ADR после inventory |
| Place/access dynamic state and transition semantics | один явно назначенный spatial/place runtime owner, зафиксированный ADR после inventory; `@rus/turn` не владеет portal/access state |
| Weather state transitions | один явно назначенный environment/weather owner; `@rus/contracts/weather-state` остаётся только contract layer |
| Propagation lifecycle и remote aggregate catch-up | один явно назначенный world-process runtime owner; semantic effects остаются у соответствующих domains |
| Historical phase activation | historical/time contract owner применяет только source-backed records; содержательные effects принадлежат соответствующим domains |
| Orchestration, decision boundary, proposal merge, combined plan | `@rus/turn` |
| Atomic persistence | `@rus/party-store` + PostgreSQL adapter в `@rus/game-server` |
| Narration | `@rus/narration` |

Запрещено:

- переносить body/NPC/place/weather/world-process formulas в `@rus/time-events-history`;
- дублировать rational arithmetic в movement или turn;
- давать provider скрытый доступ к БД;
- создавать новый package только ради удобства, если существующий owner уже есть.

## 5. Exact temporal contracts

### 5.1. Boundary-safe сериализация

Boundary contract использует decimal-string public DTO. JSON DTO не используют JavaScript `number` для потенциально больших целых. Канонические integers сериализуются десятичными строками без знака `+`, leading zero и exponent notation.

```yaml
RationalMinutes:
  numerator: "0" | positive_decimal_string
  denominator: positive_decimal_string
```

Инварианты:

- denominator > 0;
- numerator >= 0;
- `gcd(numerator, denominator) = 1`;
- ноль всегда `0/1`;
- internal arithmetic использует `BigInt` или эквивалент arbitrary-precision integer;
- сравнение выполняется exact cross multiplication с предварительным сокращением;
- canonical digest строится только из нормализованной формы.

### 5.2. `GameTimestamp`

Persistence-friendly каноническая форма согласуется с target `party_clocks`:

```yaml
GameTimestamp:
  whole_minutes: non_negative_decimal_string
  subminute_numerator: non_negative_decimal_string
  subminute_denominator: positive_decimal_string
```

Инварианты:

```text
0 <= subminute_numerator < subminute_denominator
gcd(subminute_numerator, subminute_denominator) = 1
zero fraction = 0/1
```

Логическая величина:

```text
whole_minutes + subminute_numerator / subminute_denominator
```

### 5.3. `ElapsedTime`

```yaml
ElapsedTime:
  exact_minutes: RationalMinutes
```

Для положительного time-bearing result numerator > 0. Нулевой elapsed разрешён только для явного control outcome: blocked, paused-before-progress, failed-before-progress, cancelled stale candidate или иной зарегистрированной zero-time ветви.

### 5.4. Persistence representation

Target DDL на базовом снимке использует `BIGINT`. До активации implementation обязан доказать верхнюю границу или заменить temporal numerator/denominator columns на arbitrary-precision integral `NUMERIC` с `scale=0` и exact application validation. Silent overflow, float conversion и отложенная «потом мигрируем» запрещены.

Рекомендуемое решение для target amendment:

- PostgreSQL `NUMERIC` integer columns для rational components;
- decimal-string DTO на package boundaries;
- `BigInt` internal arithmetic;
- generated canonical serialization;
- database constraints для non-negativity/proper fraction;
- application-level `gcd` validation и property tests.

### 5.5. Arithmetic API

`@rus/time-events-history` предоставляет одну реализацию:

```text
normalizeRationalMinutes
compareRationalMinutes
addRationalMinutes
subtractRationalMinutes
normalizeGameTimestamp
compareGameTimestamp
addElapsedTime
subtractGameTimestamp
wholeMinuteIndex
countCrossedWholeMinuteBoundaries
```

`wholeMinuteIndex` и count возвращают canonical non-negative decimal strings, а не potentially unsafe JavaScript numbers.

Legacy `addMinutes`, `Math.round(duration)` и локальные `addRational` не входят в production exports после cutover.

## 6. Календарь, daylight и light

### 6.1. `CalendarProfile`

Календарная проекция вычисляется только из versioned source-backed profile:

```yaml
CalendarProfile:
  profile_id:
  version:
  epoch:
  calendar_system:
  month_rules:
  leap_rules:
  day_start_rule:
  local_offset_rule:
  daypart_rule_ref:
  season_rule_ref:
  daylight_rule_ref:
  provenance:
  status: approved
```

Отсутствие обязательного profile — `time_calendar_profile_gap`.

### 6.2. Проекция

```text
game_timestamp + CalendarProfile
→ year, month, day, local_time_of_day, daypart, season
```

Projection не сохраняется как альтернативный clock. Кэш допустим только с profile/version pin и digest.

### 6.3. Фактический свет

```text
calendar daylight
+ approved light profile
+ exact place context
+ weather overlay
+ active artificial sources
→ light context
```

`daypart` не подменяет light. Dawn, sunset, opening/closing и extinguishing могут создавать temporal boundaries.

## 7. Классы execution

### 7.1. `immediate_action`

- elapsed = 0;
- не запускает time-driven updates;
- может расходовать action units;
- может атомарно изменить endpoint только по approved action-cost relation;
- может создать future timer, если есть approved causal rule;
- не используется для действия, которое по profile требует времени.

Короткость текста игрока не определяет класс действия. Класс выбирает command/activity contract.

### 7.2. `timed_activity`

- не создаёт physical segment progress;
- выполняется через существующую v3 execution/attempt модель;
- имеет approved `ActivityProfile`;
- имеет ближайшую completion или recheck boundary;
- может иметь exact fixed duration, progress target или condition-with-deadline;
- допускает несколько slices и append-only attempts.

### 7.3. `timed_traversal`

- продвигает ровно один prepared physical segment;
- использует immutable plan step и pinned dynamic snapshot;
- применяет existing spatial-v3 progress/outcome rules;
- не меняет route внутри interval;
- interruption использует exact approved anchor либо `stranded_state`.

## 8. Activity profiles и состояние

### 8.1. Согласование с spatial v3

Канонический persisted activity status остаётся:

```text
active | paused | completed | failed | aborted
```

- `planned` — состояние parent execution/plan до создания active activity row.
- `invalidated` — не отдельный status; это `failed` с `failure_class=precondition_invalidated`.
- voluntary abandonment — `aborted`.
- `blocked` — attempt outcome с нулевым elapsed; execution остаётся nonterminal либо parent переходит в `waiting_at_anchor` по contract.

Это устраняет несовместимый второй state machine.

### 8.2. `ActivityProfile`

```yaml
ActivityProfile:
  activity_profile_id:
  activity_category_id:
  version:
  applicability_rule_ref:
  completion_model:
    kind: fixed_exact | progress_target | condition_or_deadline
    fixed_duration: optional RationalMinutes
    progress_target_ref: optional versioned_ref
    completion_condition_ref: optional versioned_ref
    hard_deadline_policy_ref: optional versioned_ref
  progress_policy_ref:
  resource_policy_ref:
  participant_policy_ref:
  continuation_policy_ref:
  interruption_policy_ref:
  completion_policy_ref:
  same_timestamp_policy_ref:
  body_intensity_profile_ref:
  perception_visibility_policy_ref:
  recheck_policy_ref:
  provenance:
  status: approved
```

Exactly one completion-model branch is populated. Every model produces either a finite completion timestamp or a finite next recheck timestamp. Otherwise `temporal_execution_unbounded`.

### 8.3. Static snapshot amendment

Existing `timed_activity_static_snapshot.planned_total_minutes: positive_integer` is replaced before P28 by a versioned snapshot containing:

- exact `activity_profile_ref`;
- sealed completion model snapshot;
- exact initial duration/condition/deadline fields;
- progress/resource/participant policy refs;
- dependency pins and canonical digest.

Target DDL and contract registry are updated in place as a target-version migration; a parallel `timed_activity_v2` contract is forbidden.

### 8.4. Progress, participants и resources DTO

```yaml
RationalQuantity:
  numerator: non_negative_decimal_string
  denominator: positive_decimal_string

ParticipantBinding:
  participant_ref: entity_ref
  role_id: stable_id
  attendance_started_at: GameTimestamp
  attendance_ended_at: optional GameTimestamp
  contribution_policy_ref: versioned_ref
  state_version: positive_decimal_string

ResourceBinding:
  resource_ref: entity_ref
  quantity: RationalQuantity
  binding_kind: required_tool | reserved_input | consumable_input | output_target
  consumption_policy_ref: optional versioned_ref
  state_version: positive_decimal_string
```

`RationalQuantity` нормализуется тем же exact arithmetic core, но её `unit_id` задаёт domain profile. Нельзя складывать quantities разных units. Participant/resource bindings являются нормализованными relations, а не только embedded JSON.

### 8.5. `ActivityExecution`

Mutable cumulative state contains:

```yaml
id:
route_plan_execution_id:
plan_step_ordinal:
series_ordinal:
predecessor_activity_execution_id:
activity_snapshot:
status: active | paused | completed | failed | aborted
started_at: GameTimestamp
last_processed_at: GameTimestamp
next_boundary_at: GameTimestamp
exact_elapsed: RationalMinutes
progress:
  unit_id: stable_id
  current: RationalQuantity
  required: RationalQuantity
active_participant_bindings: relation_set<ParticipantBinding>
reserved_resource_bindings: relation_set<ResourceBinding>
preconditions_digest:
state_version:
updated_change_set_id:
terminal_change_set_id:
terminal_reason_code:
```

Active execution ОБЯЗАН иметь finite `next_boundary_at`; paused и terminal execution ОБЯЗАНЫ иметь `next_boundary_at=null`. `last_processed_at` не уменьшается и точно совпадает с end timestamp последнего committed attempt. A failed series may receive at most one approved successor according to existing spatial lineage rules. Terminal rows never reactivate.

### 8.6. `ActivityAttempt`

Каждый committed slice создаёт append-only attempt:

```yaml
activity_execution_id:
attempt_ordinal:
started_at:
ended_at:
planned_elapsed:
actual_elapsed:
progress_before:
progress_after:
resource_reservations:
resource_consumptions:
body_effect_refs:
participant_attendance:
outcome: progressed | completed | paused | blocked | failed
reason_code:
failure_class:
rule_and_policy_pins:
change_set_id:
idempotency_record_id:
trace:
```

Инварианты:

- ordinals contiguous;
- retry того же slice не создаёт второй attempt;
- committed elapsed/progress/resources не откатываются;
- `blocked` имеет zero elapsed и unchanged progress;
- `completed` достигает completion contract;
- `paused` nonterminal;
- `failed` terminal для series;
- `aborted` между attempts не создаёт fictitious attempt.

### 8.7. Progress и ресурсы

Progress policy определяет:

- unit и exact conversion из elapsed;
- staged checkpoints;
- момент reservation и consumption;
- сохранение progress при pause;
- последствия failed/invalidation;
- переносимость между местами/инструментами/исполнителями;
- completion-interruption precedence.

Универсального правила «сохранить половину» нет.

### 8.8. Multi-actor activity

Одна activity execution владеет progress. Participants имеют exact attendance bindings. Policy определяет:

- required/minimum participants;
- роль каждого участника;
- contribution function;
- что происходит при late join/leave/incapacitation;
- допускается ли pause;
- кто может resume;
- расход общих и личных ресурсов.

Уход участника не приводит к silent replacement. Если required candidate set пуст, activity pauses/fails либо hard-blocks по policy.

## 9. Temporal boundaries

### 9.1. Определение

`TemporalBoundary` — точный timestamp, на котором нужно повторно оценить состояние или исполнить approved handler.

Поддерживаются:

1. activity completion/recheck;
2. traversal completion/recheck;
3. exact timer;
4. minute-indexed timer;
5. body threshold;
6. NPC schedule transition;
7. place/access transition;
8. light boundary;
9. weather transition;
10. historical phase transition;
11. perception/reaction follow-up;
12. propagation process;
13. remote catch-up boundary;
14. carrier synchronization boundary.

### 9.2. Provider contract

Provider получает frozen explicit input и возвращает nearest candidate либо `null`:

```yaml
from_timestamp:
limit_timestamp:
party_state_version:
active_execution_refs:
relevant_state_projection:
calendar_profile:
catalog_pins:
provider_version:
```

Provider:

- не читает БД/FS/network/LLM;
- не изменяет input;
- не вызывает другой provider;
- не исполняет событие;
- не создаёт default candidate;
- возвращает только candidate, полностью связанный с rule/policy/version.

### 9.3. Candidate

```yaml
boundary_id:
boundary_kind:
scheduled_at: GameTimestamp
source_ref:
primary_subject_ref:
subject_refs:
scope_ref:
rule_ref:
policy_ref:
preconditions_digest:
resolution_class:
interrupt_effect:
visibility_policy_ref:
idempotency_key:
causal_parent_refs:
```

Consequence не хранится как свободный текст. Candidate указывает registered handler или approved effect profile.

### 9.4. Интервальная семантика

- Состояние на `from_timestamp` уже включает полный stabilized cascade этого timestamp.
- Сначала обрабатывается current-timestamp due batch: все due zero-time candidates на текущем timestamp.
- Положительный slice покрывает interval `(from_timestamp, to_timestamp]`.
- Continuous effects вычисляются за exact elapsed до `to_timestamp`.
- Затем разрешается весь same-time batch на `to_timestamp`.
- `limit_timestamp` включителен.
- Candidate не может быть обработан дважды при соседних slices.

### 9.5. Выбор границы

```text
collect nearest applicable candidate from every relevant provider
+ mandatory execution completion/recheck boundary
→ choose minimum exact timestamp
→ collect all candidates at that timestamp
```

Если execution не имеет completion/recheck boundary, это `temporal_execution_unbounded`.

### 9.6. Exact и minute-indexed timers

- Exact timer due, когда `current_timestamp >= scheduled_at`, и исполняется не более одного раза по idempotency identity.
- Minute-indexed timer хранит конкретный absolute `due_whole_minute_index`; crossing нескольких минут выбирает только реально зарегистрированные due indexes внутри interval, а не запускает global minute loop.
- `crossed_whole_minute_boundaries` используется для validation/query window, но сам по себе не создаёт событие на каждую минуту.
- Timer на current timestamp входит в current-timestamp due batch до положительного slice.

### 9.7. Stale candidate

Перед handler candidate rechecks preconditions. Versioned policy возвращает ровно одно:

```text
execute
cancel
replace_with(exact approved candidate)
hard_block
```

Normal `cancel` — control outcome, не ошибка. `temporal_candidate_stale` возникает только при отсутствии разрешённой disposition, противоречивом replacement или повреждённых pins.

## 10. Same-time batch и cascade

### 10.1. Resolution policy

Все candidates сортируются по:

```text
scheduled_at
→ versioned resolution class
→ stable rule id
→ stable primary subject id
→ boundary id
```

Порядок не зависит от SQL row order, object insertion order или LLM.

### 10.2. Фазы

Базовая policy:

1. validate due candidates и dependency graph;
2. finalize continuous physical/body progress to timestamp;
3. derive co-occurring completion/arrival/body-threshold facts;
4. resolve physical hazards, access/topology/place changes;
5. compose activity/traversal outcomes by domain same-time policy;
6. apply NPC schedule transitions;
7. resolve signal reach, perception and knowledge;
8. resolve deterministic reactions and bounded decisions;
9. apply propagation/background processes;
10. determine interruption, player decision и terminal state;
11. discover follow-up candidates at the same timestamp;
12. repeat until stable.

### 10.3. Co-occurring outcomes

- Если traversal progress достиг prepared endpoint, spatial-v3 `segment_completed` владеет location transition. Co-occurring damage или loss of consciousness не отменяет arrival, но применяется в том же change set.
- Generic activity completion и interruption на одном timestamp разрешаются обязательной `same_timestamp_policy_ref`.
- Body-critical effect не может быть отброшен только потому, что activity завершилась.
- Access closure at timestamp не переписывает законно завершённый interval до этого timestamp; она влияет на subsequent state и completion effect по policy.

### 10.4. Cascade safety

Обязательны:

- deduplication по idempotency key;
- parent/child causal links;
- dependency graph;
- deterministic ordering;
- cycle detection;
- safety iteration limit как hard technical error, не silent truncation.

Cycle возвращает `temporal_boundary_cycle`; factual commit не выполняется.

## 11. TemporalAdvance orchestration

### 11.1. Вход

```yaml
TemporalAdvanceRequest:
  party_id:
  turn_id:
  base_state_version:
  clock_before: GameTimestamp
  clock_commit_mode:
  requested_execution:
  inclusive_limit_timestamp: GameTimestamp
  active_scope:
  relevant_state_projection:
  catalog_pins:
  provider_versions:
  temporal_resolution_policy_ref:
  idempotency_context:
```

### 11.2. Цикл

```text
validate request, pins, clock and execution
→ process due zero-time batch at current timestamp
→ collect nearest boundaries
→ select earliest exact batch
→ plan exact slice
→ apply continuous domain proposals
→ recheck and execute ordered same-time batch
→ resolve perception and reactions
→ resolve interruption/player decision
→ merge proposals and validate invariants
→ update immutable working projection
→ repeat until completion/decision/block
→ build one combined change set
→ derive and validate visible package
→ commit atomically
```

`@rus/turn` не вычисляет body, traversal, weather или NPC formulas. Оно передаёт snapshots соответствующим owners и объединяет proposals.

### 11.3. Результат

```yaml
TemporalAdvanceResult:
  temporal_status: completed | progressed | decision_required | paused | blocked | stranded
  clock_before:
  clock_after:
  processed_slice_refs:
  execution_state_ref:
  combined_change_set:
  visible_package_candidate:
  validation_report:
  trace:
```

`decision_required` означает только решение игрока. Bounded NPC selection разрешается внутри factual resolution и не создаёт player decision boundary. `progressed` допустим только если command contract явно запросил конечный ограниченный slice/progress quantum; технический iteration limit не может завершить ход статусом `progressed` и возвращает typed failure.

Outer turn/presentation status — отдельный словарь:

```text
resolved | committed_presentation_pending | technical_failure
```

Domain status и delivery status не смешиваются. `technical_failure` до commit оставляет factual state неизменным; narration failure после commit возвращает `committed_presentation_pending`.

## 12. Тело, сон и лечение

### 12.1. Body owner

`@rus/body-state` получает:

- exact elapsed;
- approved intensity profile;
- environment snapshot;
- active conditions;
- body time-effect policy pins.

Возвращает:

- body change proposal;
- nearest threshold candidates;
- validation report;
- trace.

Новые физиологические формулы не вводятся без синхронного изменения `character_parameters.txt` и `formulas.md`.

### 12.2. Threshold prediction

Provider вычисляет exact ближайшее пересечение значимого threshold: голод, бодрость, холод, жажда, кровопотеря, болезнь, unconsciousness и activity infeasibility.

Long activity нельзя проверять только в конце.

### 12.3. Сон

Сон — `timed_activity`. Approved profile определяет:

- start conditions;
- environment quality;
- recovery/expenditure policies;
- noise/pain/cold/hunger interactions;
- wake conditions;
- notice/interruption classes;
- completion condition;
- preservation of committed recovery.

«Обычный сон» в коде не hardcoded.

### 12.4. Лечение

Лечение разделяется на:

```text
immediate preparation
→ timed treatment activity
→ approved follow-up condition/timer
```

Материалы, participants, progress и interruption применяются по policy. Успешная команда не превращает длительное лечение в immediate consequence.

## 13. Traversal и environment

Traversal полностью сохраняет spatial-v3 outcomes:

```text
progressed
segment_completed
paused_in_transit
interrupted_at_anchor
stranded
blocked_before_progress
```

Movement duration использует approved formula:

```text
base_minutes
× method_factor
× environment_factor
× load_factor
× body_factor
× pace_factor
× interval_progress_fraction
+ explicit_additive_delays
```

`environment_factor` — один approved composite/worst applicable factor. Weather, darkness, snow и mud не умножаются независимо без отдельного ADR и изменения higher-priority formula.

## 14. Place access, light, weather и history

### 14.1. Place/access

Boundaries включают portal state, opening/closing schedule, blocker, capacity, authority и activity precondition loss. Закрытый проход не считается открытым по default.

### 14.2. Weather

Weather transition существует только из approved weather profile/process. Runtime не генерирует случайную погоду без profile, seed policy, applicable candidates и owner.

Weather может влиять на:

- composite environment factor;
- light/visibility/acoustics;
- body;
- fire;
- traces;
- access.

Отсутствующий required weather catalog — readiness blocker.

### 14.3. Исторические фазы

Historical events, figures, phases и dates — source-backed authoring data. Runtime не назначает approximate dates, не создаёт отсутствующий календарь и не меняет утверждённые даты. Runtime может только:

- выбрать approved applicable record;
- активировать phase на exact timestamp;
- применить approved local effect rule;
- создать party instance по approved causal rule.

LLM запрещено назначать приблизительные даты, создавать runtime historical calendar или менять approved dates.

Hidden phase identity не передаётся игроку; видимы только воспринимаемые признаки.

## 15. NPC runtime и bounded decisions

### 15.1. Runtime state

Для relevant NPC хранится:

```text
factual placement
current activity execution
schedule profile and current schedule state
next exact transition boundary
body/attention state as applicable
knowledge and memory
relationship state
runtime status
state version
```

### 15.2. Schedule transition

На boundary code-owned handler повторно проверяет placement, access, orders, danger, body state и current activity. Он может:

- продолжить/завершить approved activity;
- начать следующую approved activity;
- запланировать ready path;
- сделать NPC unavailable;
- создать approved follow-up timer;
- создать perception/reaction request.

Он не придумывает цель, маршрут или занятие.

### 15.3. Perception pipeline

```text
factual event
→ signal propagation through G6 visibility/acoustic topology
→ attention
→ recognition policy
→ perception result
→ knowledge/hypothesis update
→ allowed reaction set
```

Результаты:

```text
not_perceived
perceived_unidentified
perceived_partial
recognized
misinterpreted
```

`misinterpreted` создаёт belief/hypothesis, но не изменяет factual event. Memory update без perception или полученного сообщения запрещён.

### 15.4. Bounded NPC decision

Код строит конечный option set из approved role, duties, goals, fears, relations, authority, resources, routes, witnesses, body state и perceived event.

- 0 options → typed data gap/hard block;
- 1 option → code handler без LLM;
- >1 options и policy требует смыслового выбора → bounded request.

LLM возвращает только:

```yaml
request_id:
state_version:
option_id:
command_token:
```

Код повторно проверяет token, option membership, policy version, state version и preconditions, затем сам рассчитывает consequence.

`request_id` и `options_digest` детерминированы causal state. Selection сохраняется в technical decision trace до factual commit либо атомарно связывается с ним; retry переиспользует ту же validated selection и не обращается к LLM повторно с возможностью выбрать другой option. Если LLM/decision service недоступен до validated selection, factual commit не выполняется и game time не меняется. Несколько bounded NPC decisions одного timestamp упорядочиваются общей temporal policy; каждый следующий option set строится из обновлённой immutable working projection.

Technical issued/expires timestamps decision lease могут быть `TIMESTAMPTZ`; они не являются игровыми deadlines. Gameplay deadline хранится отдельно как `GameTimestamp`.

## 16. Interruption

Уровни:

```text
background
notice
interaction
hard_interrupt
emergency
strand
```

- `background` — activity продолжается.
- `notice` — perception occurred; auto-continue только по policy.
- `interaction` — player decision; activity pauses.
- `hard_interrupt` — preconditions потеряны; pause или failed/invalidation reason.
- `emergency` — activity прекращается и hazard применяется.
- `strand` — traversal/carrier continuation невозможен без exact anchor.

`InterruptionPolicy` задаёт severity, required perception, auto-continue, pause/fail mapping, progress/resource preservation, player decision, same-time precedence и resume preconditions.

Resume:

- только из `paused`;
- создаёт новый attempt;
- повторно проверяет position, access, participants, tools и resources;
- не переписывает committed history.

## 17. Carriers и synchronized time

Root transport clock остаётся единственным владельцем времени движущегося носителя.

Slice заканчивается по minimum среди:

- root traversal recheck/completion;
- local activity completion/recheck;
- local interruption;
- shared temporal boundary.

Все participants получают один фактический elapsed, ограниченный remaining work. Local control outcome может иметь zero elapsed. Если root elapsed = 0, local positive progress запрещён.

Stationary/paused carrier-local activity может получить `direct_party_clock` только после явного clock ownership handoff. Detach/attach требует exact endpoint и atomic ownership/location validation.

## 18. Remote catch-up и propagation

### 18.1. Scope modes

```text
exact_active_g6
exact_current_g5_g4
causal_neighbor_scope
coarse_remote_materialized_scope
canonical_unmaterialized_scope
```

### 18.2. Remote aggregate

Хранится:

```text
last_updated_at exact timestamp
aggregate process refs
pending incoming effects
coarse rule versions
next exact/coarse boundary
state version
digest
```

Catch-up:

```text
persisted aggregate
+ exact elapsed
+ approved coarse rules
+ incoming causal processes
→ deterministic aggregate update
```

Запрещены minute-by-minute remote simulation, creation of concrete remote NPC actions без trigger и rematerialization baseline.

Перед входом remote scope в active detail выполняется catch-up до exact activation timestamp, затем approved materialization/projection. Catalog revision не переписывает persisted party state.

### 18.3. Propagation

Approved process types:

```text
rumor
order
alarm
pursuit
fire
shortage
weather_front
historical_pressure
```

Process имеет source, causal basis, path/scope, state machine, timing, visibility policy, termination policy, rule pins и idempotency identity.

Factual process и сведения о нём различаются. Слух может прийти позже, быть искажённым или не дойти, не меняя factual source event.

## 19. Persistence и атомарность

### 19.1. Существующие target stores, которые переиспользуются

До создания новых таблиц implementation обязан адаптировать существующие:

- `party_v3_change_sets`;
- `party_change_set_write_plans`;
- `party_command_idempotency`;
- `party_clocks`;
- `party_clock_owner_handoffs`;
- `party_route_plan_executions` и events;
- `party_timed_activity_executions` и `party_timed_activity_attempts`;
- `traveller_travel_states` и interval results;
- `party_synchronized_time_slices` и results;
- NPC placement/schedule stores;
- visible read models и existing decision trace stores.

Legacy `party_change_sets`, `party_autonomous_updates.scheduled_for TIMESTAMPTZ` и simple `time_band` schedules мигрируются/заменяются по versioned mapping. Дублировать их новым журналом с тем же смыслом запрещено.

### 19.2. Дополнительные logical stores

Только после physical inventory допускаются stores для:

- temporal events/dependencies;
- activity resource/participant bindings;
- NPC runtime transitions;
- perception/witness records;
- body temporal history;
- remote aggregate state;
- propagation processes;
- persisted visible packages;
- narration jobs/attempts.

Queryable IDs/relations нормализуются; JSONB не является единственным storage для actor position, event subjects, dependencies, schedules или activity lifecycle.

### 19.3. Combined commit

Transaction проверяет:

- base/expected state versions;
- one clock owner;
- exact clock before/after and elapsed reconciliation;
- attempt/interval ordinals;
- candidate and dependency digests;
- rule/profile/catalog pins;
- write allowlist и duplicate targets;
- same-time dependency graph;
- hidden-safe visible package;
- idempotency lease/result.

Retry не повторяет time, progress, resource consumption, memory update, event или attempt.

### 19.4. Technical vs game timestamps

`TIMESTAMPTZ` допустим для:

- `created_at`, `committed_at` operator metadata;
- lease expiry;
- delivery/narration attempts;
- audit timestamps.

Gameplay ordering, timer due time, schedule boundary, historical phase, catch-up и propagation используют `GameTimestamp`.

## 20. Visible package и presentation lifecycle

Visible package строится детерминированным code-owned projector из candidate post-change state и perception/knowledge results. LLM не выполняет security projection.

Пакет содержит только:

- perceived scene and changes;
- sensory details;
- visible/recognized NPC and objects;
- known context;
- uncertainty and hypotheses;
- player-safe interruption reason;
- allowed action affordances, если они уже рассчитаны кодом.

Не содержит:

- hidden event queue;
- future exact timestamps;
- unperceived knowledge;
- hidden motives;
- raw options/tokens;
- internal traces, rolls, DC и state patches.

Package ID/digest и narration-pending status фиксируются в factual transaction. Narration output хранится отдельно и не меняет factual state version.

## 21. Typed errors и control outcomes

### 21.1. Reused spatial errors

Повторно используются существующие:

```text
time_accumulator_invalid
time_factor_invalid
time_delay_occurrence_invalid
activity_retry_lineage_invalid
travel_interval_conflict
travel_interruption_unresolved
state_version_conflict
idempotency_conflict
hidden_information_leak
generated_schema_mismatch
controlled_vocabulary_gap
```

### 21.2. Temporal additions

Добавляются в один versioned typed-error registry:

```text
time_timestamp_invalid
time_elapsed_invalid
time_calendar_profile_gap
time_owner_conflict
time_window_invalid
temporal_execution_unbounded
temporal_boundary_ambiguous
temporal_boundary_cycle
temporal_candidate_stale
temporal_change_set_conflict
activity_profile_gap
activity_policy_gap
activity_precondition_stale
activity_transition_invalid
event_rule_gap
event_effect_gap
npc_schedule_gap
npc_decision_policy_gap
perception_policy_gap
weather_profile_gap
historical_phase_rule_gap
remote_catch_up_rule_gap
propagation_rule_gap
visible_package_persistence_gap
```

Каждая ошибка имеет severity, subject ref, dependency pins, retryability, remediation class и player-safe message key.

Expected outcomes `blocked`, `paused`, `decision_required`, `stranded`, stale-candidate `cancel` и narration pending не являются generic exceptions.

## 22. Readiness данных

До P28 должны существовать approved records:

- calendar/daylight/light profiles;
- activity categories and profiles;
- progress/resource/participant/continuation/interruption/completion/same-time policies;
- body time-effect profiles and thresholds;
- NPC schedules, activities, perception and decision policies;
- exact timer/event/trigger/effect profiles;
- place access schedules;
- weather transition profiles/processes;
- historical phase/local-effect rules;
- traversal recheck contracts;
- propagation profiles;
- remote catch-up rules;
- carrier synchronization and rescue/recovery policies.

Пустой required set блокирует activation. Scope не сокращается автоматически и не заполняется LLM repair.

## 23. Обязательные сценарии

1. Wait с exact sub-minute elapsed.
2. Sleep до времени и sleep до body threshold.
3. Interrupted sleep с сохранённым recovery.
4. Work с partial progress и NPC interaction.
5. Treatment с resource consumption и delayed effect.
6. Multi-actor work, где required participant leaves.
7. Crafting checkpoint и resume.
8. Door closes during activity.
9. Dawn/weather changes visibility/traversal factor.
10. NPC schedule transition, perception и bounded reaction.
11. Fire → smoke → alarm → access closure → interruption same-time cascade.
12. Traversal completion и hazard на одном timestamp.
13. Treatment inside moving boat.
14. Root hazard interrupts local activity.
15. Stranded and approved rescue without teleportation.
16. Historical phase changes local access without revealing hidden phase identity.
17. Remote catch-up after hours/days.
18. Rumor/order/fire process enters active scope at correct timestamp.
19. Duplicate retry changes nothing twice.
20. Narration failure after factual commit, followed by idempotent retry.

## 24. Инварианты готовности

Механика определена и может быть активирована только если одновременно истинно:

- одна exact clock scale и один owner per commit;
- every action classified;
- every timed execution bounded by completion/recheck;
- all arithmetic canonical and slicing-independent;
- no gameplay TIMESTAMPTZ;
- activity state machine совпадает с spatial-v3;
- same-time ordering versioned and deterministic;
- cascade cycles block commit;
- committed progress/resources never roll back or duplicate;
- perception precedes memory/reaction;
- LLM returns no consequences;
- historical facts/dates remain editor-owned;
- distant world is coarse/lazy, not globally ticking;
- factual state and player knowledge separated;
- visible package is committed before narration;
- narration cannot mutate or roll back facts;
- target v3 has no production authority before P28;
- after P28 no legacy production path, mixed read, dual write or fallback remains.

## 25. Устранённые противоречия исходных drafts

| Проблема | Итоговое решение |
|---|---|
| Draft объявлял v3 уже active, тогда как `main` держит v2 до P28 | Документ `proposed`; v2 остаётся production owner до атомарного P28 |
| Предлагалось удалить ожидание cutover | Существующий P28 сохраняется и расширяется temporal evidence |
| Activity status включал `planned` и `invalidated` | Сохранён spatial-v3 vocabulary; planned принадлежит parent execution, invalidation — failure class |
| Fixed integer `planned_total_minutes` конфликтовал с rational/condition activities | Обязательный versioned amendment existing target snapshot/DDL до P28 |
| Narration была до commit в current pipeline | Visible package входит в factual commit; narration только после commit |
| `scheduled_for TIMESTAMPTZ` использовался как game time | Gameplay due time переводится в `GameTimestamp`; TIMESTAMPTZ остаётся technical metadata |
| В movement был собственный Number-based rational helper | Вся arithmetic переносится к sole owner `@rus/time-events-history` |
| `formulas.md` приписывал time package body/NPC/weather effects | Time package владеет clock/boundaries; effects остаются у domain owners |
| Исторический документ одновременно запрещал и разрешал LLM придумывать даты | Runtime creation of dates/calendar полностью запрещён |
| План заранее предполагал NPC/weather packages | Owner выбирается по inventory и ADR; second engine не создаётся по умолчанию |
| Projector/narrator роли были смешаны | Security projection code-owned; LLM narrator получает persisted safe package |
| «Fallback» использовался неоднозначно | Разрешён только approved authored default inside finite candidate set |

## 26. Статический acceptance этого документа

Документ считается готовым для передачи implementation agent, если:

- все controlled vocabularies объявлены один раз;
- нет противоречия active-v2/target-v3;
- lifecycle совпадает с spatial-v3 contracts;
- ordering commit/narration однозначен;
- ownership не дублируется;
- DDL изменения описаны как amendment существующего target;
- data gaps fail closed;
- plan implementation ссылается на каждый обязательный раздел и test scenario.
