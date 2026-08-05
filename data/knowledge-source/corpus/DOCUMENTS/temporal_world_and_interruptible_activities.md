---
title: temporal_world_and_interruptible_activities
status: active
scope: production
production_runtime: spatial_v3_production_v1
source_sha256: f97e71536c08a3b5cc0414fe25460bf70b2d95ee94ff861f785b0a3d9fbfb26e
---

# Механика течения времени, длительных действий и автономного мира v4

**Проект:** «Русь XIII век»
**Статус:** `active` — production normative release `spatial-v3-production-v1`
**Канонический репозиторий:** `PavelSlaven/Novgorod1230`
**Базовая ветка и снимок сверки:** `main` @ `520c0ea8cc366fc16c949a874c710f3547a322f6`
**Production архитектура:** materialization/spatial v3 после завершённого `versioned production activation cutover`
**Принятый базовый amendment:** `temporal-world-v1`; immutable spatial-v3
contract snapshot: `4.3.0-target.1`
**Additive PR8 handoff amendment:** `temporal-world-v1.1`; current spatial-v3
contract set: `4.4.0-target.1`
**Связанный план:** `План_реализации_механики_времени_v4_implementation_ready.md`

## 0. Нормативная сила и модель активации

Этот документ задаёт целевое поведение механики времени после её реализации и
активации. P28 exact-head evidence прежнего кандидата принято как immutable
historical evidence и не выполняло production write либо composition switch.
Исторически применялись два разных утверждения:

1. **До `versioned production activation cutover`:** production продолжает
   работать по v2; temporal-v3/v4 код, DDL и contracts допускаются только в
   target-, test-, migration- и shadow-контуре. Запрещены mixed read, dual
   write и fallback из v3 в v2.
2. **После атомарного cutover:** v3 становится единственным production
   runtime; старый путь не вызывается, не выбирается по feature flag и не
   используется как semantic fallback. V2 допустим только как явно выбранный
   migration/rollback source.

Текущее состояние соответствует пункту 2: cutover завершён release
`spatial-v3-production-v1`; v3 является sole production owner.

Документ переведён из `proposed` в `active` после реализации полного
обязательного scope, tests, документационной и индексной интеграции и
независимого аудита. P28 затем приняло exact-head evidence прежнего кандидата,
не активируя runtime. Новый кандидат получает собственную exact-head
validation; изменение технического digest без изменения содержания, схемы или
семантики само по себе не требует повторного semantic approval.

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
- semantic NPC decision signals/boundaries и explicitly pinned historical bounded decisions;
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

Before the completed versioned production activation cutover, existing
`timed_activity_static_snapshot.planned_total_minutes: positive_integer` was
replaced by a versioned snapshot containing:

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
next_attempt_ordinal: non_negative_integer
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

Active execution ОБЯЗАН иметь finite `next_boundary_at`; paused и terminal execution ОБЯЗАНЫ иметь `next_boundary_at=null`. `last_processed_at` не уменьшается и точно совпадает с end timestamp последнего committed attempt. `next_attempt_ordinal` хранится в mutable execution row, начинается с нуля и увеличивается ровно на единицу атомарно с каждым append-only attempt; stage обязан сверять ordinal slice с этим persisted cursor. A failed series may receive at most one approved successor according to existing spatial lineage rules. Terminal rows never reactivate.

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
8. resolve deterministic reactions and NPC decision signals/boundaries;
9. apply propagation/background processes;
10. determine interruption, player decision и terminal state;
11. discover follow-up candidates at the same timestamp;
12. repeat until stable.

Все события одного timestamp образуют единый same-time batch. Общий temporal owner сортирует их по канонической policy, последовательно применяет к общей рабочей версии состояния, повторно проверяет условия перед каждым событием и обрабатывает возникшие follow-up события до стабильного состояния.

Providers и сценарные модули только регистрируют candidates. Им запрещено исполнять их, разделять batch или самостоятельно задавать порядок событий разных подсистем.

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

## 15. NPC runtime и semantic decision boundaries

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

### 15.4. Active semantic NPC decision protocol (revision 14)

Domain owners сохраняют factual transitions и дополнительно выдают только
generic signal descriptors. Единственный active словарь причин содержит ровно
`self`, `others`, `environment`, `objective`, `communication`; significance —
только `material` либо `critical`. Perception-required signal допускается к
aggregation лишь после фактического восприятия или received message.

Все новые signals одного NPC в одном fully resolved same-time batch
агрегируются в не более чем одну `npc_decision_boundary_v1`; наличие critical
делает boundary critical. Одна такая NPC/batch identity вызывает не более
одного LLM-вызова суммарно по всем режимам, а replay использует persisted trace. Conversation не вводит
собственный trigger schema или scheduler.

Semantic request содержит только восприятие, received knowledge, memory и
private state самого NPC, exact boundary identity и зарегистрированный
operation contract. Чужие private knowledge, hidden truth и prompts не
передаются. LLM возвращает одно ближайшее действие/contribution, но не RNG,
успех, exact time, body delta, решение другого actor или write plan. Code owner
повторно проверяет state/version/preconditions и рассчитывает consequence.

Listener/witness может воспринять statement и получить received knowledge без
response boundary. Social check изменяет только наблюдаемое качество подачи и
credibility; решение responder остаётся отдельным semantic result. Combat в
revision 14 только получает typed handoff и здесь не разрешается. Full
autonomous action outside conversation и combat resolution остаются proposed.

### 15.5. Historical bounded NPC decision (explicit revision pin only)

Следующий bounded protocol сохраняет смысл только для genuinely closed domain
choices и historical Lower Dvina revisions, выбранных явным pin. Он не является
fallback current revision-14 conversation path.

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

### 15.6. Historical bounded execution details (explicit revision pin only)

Действие NPC определяется совместно кодом и bounded LLM selector, но их
ответственность не пересекается:

```text
код: момент решения + конечный допустимый option set + исполнение
LLM: одно человеческое намерение из переданного option set
код: повторная проверка + фактический результат + atomic persistence
```

Код владеет factual state: perception и knowledge NPC, placement, body,
items, access, routes, текущей activity, временем, checks, consequences и
write targets. LLM не определяет успех, длительность, маршрут, бросок,
телесный эффект, переход имущества, новое знание или change set. Её
объяснение выбора не становится фактом мира.

#### Когда требуется новое решение

Новая decision boundary возникает только при содержательной необходимости:

- завершилось текущее занятие или нужен следующий план;
- прежнее намерение стало невыполнимым;
- NPC воспринял значимую угрозу, просьбу, приказ, обвинение, предложение или
  иное событие;
- изменились доступность цели, предмета, человека или маршрута;
- появилось противоречие целей, обязанностей или действующих обещаний.

Продолжение уже выбранного намерения исполняет код без нового LLM-вызова.
Traversal по открытому маршруту, следующий approved activity segment и
завершение начатой работы не являются новым человеческим выбором, пока
значимое состояние не изменилось. Автоматические физические последствия —
падение при потере сознания, body effect, потеря доступа, невозможность пройти
закрытый проход — также принадлежат соответствующим code owners.

#### Откуда берётся option set

`@rus/npc-runtime` не перебирает свободно мыслимые поступки. Он строит
конечные options только из applicable approved decision policies, exact
command records и зарегистрированных handlers, связывая их с текущими:

- action/activity, movement, item/property, conversation/knowledge и
  conflict contracts;
- actor/target/item/destination slots;
- perceived event, knowledge, memory и hypotheses NPC;
- role, duties, goals, relations, obligations и approved ограничения;
- placement, body state, resources, access, routes и witnesses.

Сценарий или регион предоставляет конкретное содержание и approved bindings,
но не создаёт отдельный NPC engine. Механически поддерживаемые классы действий
могут покрывать движение, работу с предметом, общение, помощь, защиту,
удержание, освобождение, нападение, сдачу и lifecycle activity. Это не требует
моделировать моргание, движение пальцев, каждый шаг, каждую реплику или каждый
удар инструмента: такие детали либо не моделируются, либо входят в исполнение
крупного намерения.

Код исключает option при нарушении factual precondition или exact approved
policy rule. Он не вправе на лету сочинять психологическое правило вроде
«гордый NPC не сдаётся» или «испуганный NPC обязан бежать». Личность,
настроение, страх, выгода и отношения влияют на выбор LLM; они становятся
code-owned eligibility gate только когда такая precondition явно утверждена в
versioned policy. Один добровольный option на настоящей decision boundary
требует проверки полноты policy: это может быть честная безальтернативность,
но не результат неявного психологического отсечения.

Каждый конкретный option содержит stable `option_id`, exact `command_ref`,
заполненные actor/target/item/destination refs, известные NPC обстоятельства и
preconditions digest. Например, общий approved command скрытия предмета может
создать option «Жданко прячет дорожную сумку в доступном месте» только когда
Жданко контролирует exact item, знает exact destination, имеет доступ, а
capacity и body state допускают действие. Отсутствующая сумка, место, маршрут
или handler удаляет option или создаёт typed gap по утверждённой policy; код и
LLM не подставляют похожую сущность.

#### Decision projection и выбор

Bounded request содержит только знания и восприятие самого NPC, релевантные
части его существующего профиля и состояния, а также закрытые options. Hidden
truth, невоспринятые события, неизвестные маршруты, чужие секреты и будущие
факты не передаются. В option description раскрывается человеческий смысл
намерения, но не вычисляемая вероятность успеха и не обещанный consequence.

LLM сопоставляет options с личностью, настроением, отношениями, обязанностями,
мотивами, памятью, состоянием тела, воспринимаемым риском, свидетелями и
прежними решениями NPC. Она возвращает только точный `request_id`,
`state_version`, `option_id` и `command_token`.

После ответа код повторно проверяет expiry, policy/state version, membership,
token и preconditions на текущей immutable working projection. Сохранившийся
option передаётся его единственному registered handler. Stale option
отменяется, получает только явно approved adjustment либо создаёт новую
decision boundary; свободная корректировка запрещена. Handler затем владеет
activity/traversal/check, временем, предметными переходами, factual
consequences и следующей meaningful boundary.

Разговор использует тот же порядок. Код формирует options только из знания,
knowledge scope, доступных тем, approved disclosure/withholding/lie records и
адресата. LLM выбирает смысловой speech act, а narrator формулирует реплику из
player-safe результата. Ложь остаётся assertion NPC и не переписывает
objective fact, perception, knowledge, hypothesis или memory.

Validated selection и её causal identity сохраняются до factual execution или
атомарно вместе с ним. Retry/restart не вызывает LLM повторно для уже
сохранённой boundary, не меняет выбранное намерение и не повторяет consequence.
Так вариативность существует до решения, а совершившаяся причинность остаётся
воспроизводимой.

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

Для versioned production activation cutover были обязательны и остаются
обязательными approved records:

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
- target v3 had no production authority before the completed versioned production activation cutover;
- release `spatial-v3-production-v1` leaves no legacy production path, mixed
  read, dual write or fallback.

## 25. Устранённые противоречия исходных drafts

| Проблема | Итоговое решение |
|---|---|
| Draft объявлял v3 уже production-active до отдельного cutover | Документ нормативно `active`; историческое P28 evidence не активировало runtime, а последующий `spatial-v3-production-v1` cutover сделал v3 sole owner |
| Предлагалось удалить ожидание cutover | P28 сохранено как immutable historical evidence; production activation является отдельной versioned operation |
| Activity status включал `planned` и `invalidated` | Сохранён spatial-v3 vocabulary; planned принадлежит parent execution, invalidation — failure class |
| Fixed integer `planned_total_minutes` конфликтовал с rational/condition activities | Обязательный versioned amendment existing target snapshot/DDL до production cutover |
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

---

# Приложение A. Canonical contract amendment `temporal-world-v1`

Этот appendix является единственным formal source новых и заменённых DTO
Temporal World. Разделы A.1–A.6 образуют принятый immutable snapshot Spatial
`4.3.0-target.1`; базовые declarations `4.2.0-target.1` также сохраняются как
pinned historical snapshot. Additive раздел A.7 создаёт current contract set
`4.4.0-target.1` только после inventory доказанных cross-package handoff gaps.
Это contract-version amendment, а не новый release stage и не production
activation. Блок с совпадающим `contract_name` заменяет только current-target
definition; новый блок добавляется к registry. Параллельный runtime contract
или side-by-side activity engine не создаётся.

## A.1. Exact temporal values

```yaml
contract_name: rational_minutes
storage: embedded_value
identity:
fields:
  numerator: required non_negative_decimal_string
  denominator: required positive_decimal_string
invariants:
  - Values use canonical unsigned decimal strings without leading zero or exponent notation.
  - Denominator is positive, the fraction is reduced and zero is exactly 0/1.
```

```yaml
contract_name: rational_quantity
storage: embedded_value
identity:
fields:
  numerator: required non_negative_decimal_string
  denominator: required positive_decimal_string
invariants:
  - Values use the same canonical reduced representation as rational_minutes.
  - Unit compatibility belongs to the consuming domain binding and cannot be inferred here.
```

```yaml
contract_name: game_timestamp
storage: embedded_value
identity:
fields:
  whole_minutes: required non_negative_decimal_string
  subminute_numerator: required non_negative_decimal_string
  subminute_denominator: required positive_decimal_string
invariants:
  - The subminute fraction is reduced and proper; zero is exactly 0/1.
  - This linear exact value is the sole authoritative gameplay clock.
```

```yaml
contract_name: elapsed_time
storage: embedded_value
identity:
fields:
  exact_minutes: required rational_minutes
invariants:
  - A time-bearing success is positive; zero is allowed only for an explicit registered control outcome.
```

```yaml
contract_name: calendar_profile_ref
storage: immutable_snapshot
identity:
fields:
  profile_ref: required versioned_ref
  canonical_digest: required sha256_hex
invariants:
  - The referenced calendar profile is approved, source-backed and contains epoch, calendar, month, leap, day-start, offset, daypart, season and daylight rules.
```

```yaml
contract_name: runtime_calendar_snapshot
storage: immutable_snapshot
identity:
fields:
  snapshot_id: required stable_id
  exact_game_timestamp: required game_timestamp
  calendar_profile_ref: required calendar_profile_ref
  year: required non_negative_decimal_string
  month: required positive_decimal_string
  day: required positive_decimal_string
  local_time_of_day: required rational_minutes
  daypart_id: required stable_id
  season_id: required stable_id
  daylight_phase_id: required stable_id
  canonical_digest: required sha256_hex
invariants:
  - Projection is uniquely derived from exact_game_timestamp and the pinned calendar profile.
  - The snapshot is a cache/projection and never becomes a second clock.
```

## A.2. Activity amendment

```yaml
contract_name: activity_profile_ref
storage: immutable_snapshot
identity:
fields:
  profile_ref: required versioned_ref
  canonical_digest: required sha256_hex
invariants:
  - The referenced activity profile is approved and pins all applicability, completion, progress, resource, participant, continuation, interruption, same-time, body, perception and recheck policies.
```

```yaml
contract_name: activity_completion_model_snapshot
storage: immutable_snapshot
identity:
fields:
  kind: required controlled_activity_completion_model
  fixed_duration: optional rational_minutes
  progress_target_ref: optional versioned_ref
  completion_condition_ref: optional versioned_ref
  hard_deadline_at: optional game_timestamp
  hard_deadline_policy_ref: optional versioned_ref
  next_recheck_at: optional game_timestamp
  canonical_digest: required sha256_hex
invariants:
  - fixed_exact requires only fixed_duration.
  - progress_target requires only progress_target_ref plus a finite next_recheck_at.
  - condition_or_deadline requires completion_condition_ref and at least one finite next_recheck_at or hard_deadline_at.
```

```yaml
contract_name: activity_progress_snapshot
storage: immutable_snapshot
identity:
fields:
  unit_id: required stable_id
  current: required rational_quantity
  required: required rational_quantity
  checkpoint_ref: optional versioned_ref
  canonical_digest: required sha256_hex
invariants:
  - Current and required quantities use the same unit and current does not exceed required.
```

```yaml
contract_name: participant_binding
storage: party_runtime_relation
identity:
  - participant_ref
  - role_id
  - attendance_started_at
fields:
  participant_ref: required entity_ref
  role_id: required stable_id
  attendance_started_at: required game_timestamp
  attendance_ended_at: optional game_timestamp
  contribution_policy_ref: required versioned_ref
  state_version: required positive_decimal_string
invariants:
  - Attendance end is not earlier than start and one active binding has no end.
  - A missing required participant is resolved only by the pinned participant policy.
```

```yaml
contract_name: resource_binding
storage: party_runtime_relation
identity:
  - resource_ref
  - binding_kind
fields:
  resource_ref: required entity_ref
  unit_id: required stable_id
  quantity: required rational_quantity
  binding_kind: required enum[required_tool, reserved_input, consumable_input, output_target]
  consumption_policy_ref: optional versioned_ref
  state_version: required positive_decimal_string
invariants:
  - Quantity unit exactly matches the pinned activity resource policy.
  - Retry cannot reserve or consume the same identity twice.
```

```yaml
contract_name: timed_activity_static_snapshot
storage: immutable_snapshot
identity:
fields:
  activity_profile_ref: required activity_profile_ref
  completion_model_snapshot: required activity_completion_model_snapshot
  progress_policy_ref: required versioned_ref
  resource_policy_ref: required versioned_ref
  participant_policy_ref: required versioned_ref
  continuation_policy_ref: required versioned_ref
  interruption_policy_ref: required versioned_ref
  completion_policy_ref: required versioned_ref
  same_timestamp_policy_ref: required versioned_ref
  body_intensity_profile_ref: required versioned_ref
  perception_visibility_policy_ref: required versioned_ref
  recheck_policy_ref: required versioned_ref
  dependency_pins: required dependency_pin_set
  canonical_digest: required sha256_hex
invariants:
  - This replaces planned_total_minutes and seals one exact completion model.
  - Every active execution derived from the snapshot has a finite completion or recheck boundary.
```

```yaml
contract_name: party_timed_activity_execution
storage: party_runtime_mutable
identity:
  - id
fields:
  id: required stable_id
  route_plan_execution_id: required stable_id
  plan_step_ordinal: required non_negative_integer
  series_ordinal: required non_negative_integer
  predecessor_activity_execution_id: optional stable_id
  activity_snapshot: required timed_activity_static_snapshot
  status: required enum[active, paused, completed, failed, aborted]
  started_at: required game_timestamp
  last_processed_at: required game_timestamp
  next_boundary_at: optional game_timestamp
  exact_elapsed: required rational_minutes
  next_attempt_ordinal: required non_negative_integer
  progress: optional activity_progress_snapshot
  preconditions_digest: required sha256_hex
  state_version: required positive_decimal_string
  updated_change_set_id: required stable_id
  terminal_change_set_id: optional stable_id
  terminal_reason_code: optional stable_id
relations:
  active_participant_bindings: relation_set[participant_binding]
  reserved_resource_bindings: relation_set[resource_binding]
invariants:
  - Active requires a finite next_boundary_at; paused and terminal statuses forbid it.
  - last_processed_at never decreases and equals the end of the latest committed attempt.
  - next_attempt_ordinal starts at zero and increments atomically with each committed append-only attempt.
  - failed may have at most one approved successor; terminal rows never reactivate.
```

```yaml
contract_name: party_timed_activity_attempt
storage: party_runtime_append_only
identity:
  - activity_execution_id
  - attempt_ordinal
fields:
  activity_execution_id: required stable_id
  attempt_ordinal: required non_negative_integer
  started_at: required game_timestamp
  ended_at: required game_timestamp
  planned_elapsed: required rational_minutes
  actual_elapsed: required rational_minutes
  progress_before: optional activity_progress_snapshot
  progress_after: optional activity_progress_snapshot
  outcome: required enum[progressed, completed, paused, blocked, failed]
  reason_code: required stable_id
  failure_class: optional controlled_activity_failure_class
  rule_and_policy_pins: required dependency_pin_set
  change_set_id: required stable_id
  idempotency_record_id: required stable_id
  trace: required json_object
relations:
  resource_reservations: relation_set[resource_binding]
  resource_consumptions: relation_set[resource_binding]
  body_effect_refs: relation_set[entity_ref]
  participant_attendance: relation_set[participant_binding]
invariants:
  - Ordinals are contiguous and retry of one slice never creates another attempt.
  - blocked has zero elapsed and unchanged progress; completed satisfies the sealed completion model.
  - Committed elapsed, progress and consumption never roll back; abort between attempts creates no attempt.
```

## A.3. Boundaries, slices and temporal advance

```yaml
contract_name: temporal_boundary_provider_input
storage: immutable_request
identity:
fields:
  from_timestamp: required game_timestamp
  limit_timestamp: required game_timestamp
  party_state_version: required positive_decimal_string
  relevant_state_projection: required json_object
  calendar_profile_ref: required calendar_profile_ref
  catalog_pins: required dependency_pin_set
  provider_version: required authoring_version
relations:
  active_execution_refs: relation_set[entity_ref]
invariants:
  - Input is frozen and explicit; a provider performs no IO, mutation, event execution or semantic fallback.
```

```yaml
contract_name: temporal_boundary_candidate
storage: immutable_proposal
identity:
  - boundary_id
fields:
  boundary_id: required stable_id
  boundary_kind: required enum[activity, traversal, exact_timer, minute_indexed_timer, body_threshold, npc_schedule, place_access, light, weather, historical_phase, perception_follow_up, propagation, remote_catch_up, carrier_sync]
  scheduled_at: required game_timestamp
  source_ref: required entity_ref
  primary_subject_ref: required entity_ref
  scope_ref: required entity_ref
  rule_ref: required versioned_ref
  policy_ref: required versioned_ref
  preconditions_digest: required sha256_hex
  resolution_class: required controlled_temporal_resolution_class
  interrupt_effect: required controlled_interruption_level
  visibility_policy_ref: required versioned_ref
  idempotency_key: required stable_id
relations:
  subject_refs: relation_set[entity_ref]
  causal_parent_refs: relation_set[entity_ref]
invariants:
  - Candidate references one registered handler or approved effect profile and contains no free-text consequence.
  - Identity, schedule and pins are immutable; conflicting duplicate identities are an ambiguity.
```

```yaml
contract_name: temporal_resolution_policy_ref
storage: immutable_snapshot
identity:
fields:
  policy_ref: required versioned_ref
  canonical_digest: required sha256_hex
invariants:
  - Policy orders by timestamp, resolution class, rule ID, primary subject ID and boundary ID.
```

```yaml
contract_name: temporal_boundary_batch
storage: immutable_snapshot
identity:
  - batch_id
fields:
  batch_id: required stable_id
  scheduled_at: required game_timestamp
  is_current_timestamp_batch: required boolean
  resolution_policy_ref: required temporal_resolution_policy_ref
  candidate_set_digest: required sha256_hex
relations:
  candidates: relation_set[temporal_boundary_candidate]
invariants:
  - Candidates are non-empty, unique and share scheduled_at.
  - Candidate order is canonical and independent of input/SQL order.
```

```yaml
contract_name: time_slice_plan
storage: immutable_commit_input
identity:
  - slice_id
fields:
  slice_id: required stable_id
  from_timestamp: required game_timestamp
  to_timestamp: required game_timestamp
  planned_elapsed: required elapsed_time
  clock_commit_mode: required enum[direct_party_clock, shared_root_transport_clock]
  clock_owner_ref: required entity_ref
  requested_execution_ref: required entity_ref
  boundary_batch: optional temporal_boundary_batch
  dependency_pins: required dependency_pin_set
  idempotency_key: required stable_id
  canonical_digest: required sha256_hex
invariants:
  - Positive slice covers exactly the interval from exclusive to inclusive; a current-timestamp batch has zero elapsed.
  - Exactly one clock owner is named and shared local work cannot advance the clock.
```

```yaml
contract_name: time_slice_result
storage: party_runtime_append_only
identity:
  - slice_id
fields:
  slice_id: required stable_id
  result_kind: required enum[positive_slice, zero_time_cascade]
  actual_elapsed: required elapsed_time
  clock_before: required game_timestamp
  clock_after: required game_timestamp
  crossed_whole_minute_boundaries: required non_negative_decimal_string
  proposal_digest: required sha256_hex
  change_set_id: required stable_id
  idempotency_record_id: required stable_id
  trace: required json_object
relations:
  processed_boundary_refs: relation_set[entity_ref]
invariants:
  - clock_after minus clock_before equals actual_elapsed and the crossing count is exact.
  - A replay returns this result and repeats no effect.
```

```yaml
contract_name: temporal_advance_request
storage: immutable_request
identity:
fields:
  party_id: required stable_id
  turn_id: required stable_id
  base_state_version: required positive_decimal_string
  clock_before: required game_timestamp
  clock_commit_mode: required enum[direct_party_clock, shared_root_transport_clock]
  clock_owner_ref: required entity_ref
  requested_execution_ref: required entity_ref
  inclusive_limit_timestamp: required game_timestamp
  active_scope: required controlled_remote_scope_mode
  relevant_state_projection: required json_object
  catalog_pins: required dependency_pin_set
  temporal_resolution_policy_ref: required temporal_resolution_policy_ref
  idempotency_context: required json_object
relations:
  provider_versions: relation_set[versioned_ref]
invariants:
  - Limit is not earlier than clock_before and request names exactly one authoritative clock owner.
  - Provider inputs and state projection are complete; hidden reads and implicit providers are forbidden.
```

```yaml
contract_name: temporal_advance_result
storage: immutable_result
identity:
fields:
  temporal_status: required controlled_temporal_advance_status
  clock_before: required game_timestamp
  clock_after: required game_timestamp
  execution_state_ref: required entity_ref
  combined_change_set: required json_object
  visible_package_candidate: required visible_package_persistence_envelope
  validation_report: required json_object
  trace: required json_object
relations:
  processed_slice_refs: relation_set[entity_ref]
invariants:
  - Technical iteration exhaustion is an error and never a progressed result.
  - Result contains one combined factual change set and no narration output.
```

## A.4. Perception, interruption and NPC decisions

```yaml
contract_name: interruption_outcome
storage: immutable_result
identity:
fields:
  interruption_level: required controlled_interruption_level
  outcome_kind: required enum[continue, pause, fail, abort, strand, decision_required]
  execution_ref: required entity_ref
  boundary_ref: optional entity_ref
  exact_anchor_ref: optional movement_endpoint_ref
  elapsed: required elapsed_time
  reason_code: required stable_id
  progress_preservation_policy_ref: required versioned_ref
  resource_preservation_policy_ref: required versioned_ref
  player_decision_required: required boolean
  dependency_pins: required dependency_pin_set
invariants:
  - Resume is possible only from paused and rechecks place, access, participants, tools and resources.
  - strand requires an exact approved anchor or explicit stranded-state reference.
```

```yaml
contract_name: perception_result
storage: party_runtime_append_only
identity:
  - perception_id
fields:
  perception_id: required stable_id
  perceiver_ref: required entity_ref
  event_ref: required entity_ref
  perceived_at: required game_timestamp
  result: required controlled_perception_result
  recognition_policy_ref: required versioned_ref
  visibility_policy_ref: required versioned_ref
  canonical_digest: required sha256_hex
relations:
  signal_refs: relation_set[entity_ref]
  knowledge_update_refs: relation_set[entity_ref]
invariants:
  - Knowledge or memory update requires this perception or a received message.
  - misinterpreted creates belief/hypothesis only and never changes the factual event.
```

```yaml
contract_name: npc_decision_option
storage: immutable_snapshot_member
identity:
  - option_id
fields:
  option_id: required stable_id
  command_token: required stable_id
  canonical_ordinal: required non_negative_integer
  preconditions_digest: required sha256_hex
  consequence_policy_ref: required versioned_ref
invariants:
  - Option belongs to one finite approved set and contains no free-text consequence.
```

```yaml
contract_name: npc_decision_request
storage: immutable_request
identity:
  - request_id
fields:
  request_id: required stable_id
  npc_ref: required entity_ref
  requested_at: required game_timestamp
  state_version: required positive_decimal_string
  decision_policy_ref: required versioned_ref
  options_digest: required sha256_hex
  gameplay_deadline: optional game_timestamp
  dependency_pins: required dependency_pin_set
relations:
  options: relation_set[npc_decision_option]
invariants:
  - Zero options is a data gap; one option is resolved by code; LLM is allowed only for a multi-option policy.
  - request_id and options_digest are deterministic from causal state.
```

```yaml
contract_name: npc_decision_trace
storage: party_runtime_append_only
identity:
  - request_id
fields:
  request_id: required stable_id
  state_version: required positive_decimal_string
  option_id: required stable_id
  command_token: required stable_id
  options_digest: required sha256_hex
  validated_at: required game_timestamp
  status: required enum[validated, committed, cancelled]
  idempotency_key: required stable_id
  change_set_id: optional stable_id
  trace_digest: required sha256_hex
invariants:
  - Token, membership, policy version, state version and preconditions are revalidated before consequence calculation.
  - Retry reuses the validated selection and cannot ask for a different option.
```

## A.5. Remote aggregates and propagation

```yaml
contract_name: propagation_process_ref
storage: party_runtime_mutable
identity:
  - process_ref
fields:
  process_ref: required entity_ref
  process_kind: required controlled_propagation_process_kind
  source_ref: required entity_ref
  causal_basis_ref: required entity_ref
  scope_ref: required entity_ref
  path_ref: optional entity_ref
  started_at: required game_timestamp
  next_boundary_at: optional game_timestamp
  status: required enum[pending, active, completed, terminated]
  visibility_policy_ref: required versioned_ref
  termination_policy_ref: required versioned_ref
  rule_pins: required dependency_pin_set
  idempotency_key: required stable_id
invariants:
  - Factual process and information about it are separate.
  - Process target, path, timing and effect are pinned and never invented during catch-up.
```

```yaml
contract_name: remote_aggregate_state
storage: party_runtime_mutable
identity:
  - aggregate_id
fields:
  aggregate_id: required stable_id
  scope_ref: required entity_ref
  scope_mode: required controlled_remote_scope_mode
  last_updated_at: required game_timestamp
  next_boundary_at: optional game_timestamp
  state_version: required positive_decimal_string
  canonical_digest: required sha256_hex
relations:
  aggregate_process_refs: relation_set[propagation_process_ref]
  pending_incoming_effect_refs: relation_set[entity_ref]
  coarse_rule_versions: relation_set[versioned_ref]
invariants:
  - State is persisted and deterministic; catalog revision never rematerializes or rewrites it.
  - Coarse remote scope never expands into minute-by-minute NPC simulation.
```

```yaml
contract_name: remote_catch_up_request
storage: immutable_request
identity:
fields:
  aggregate_state: required remote_aggregate_state
  activation_timestamp: required game_timestamp
  exact_elapsed: required elapsed_time
  rule_pins: required dependency_pin_set
  idempotency_key: required stable_id
relations:
  incoming_process_refs: relation_set[propagation_process_ref]
invariants:
  - Activation timestamp is not earlier than aggregate last_updated_at and exact_elapsed reconciles them.
```

```yaml
contract_name: remote_catch_up_result
storage: immutable_result
identity:
fields:
  status: required enum[completed, blocked]
  clock_before: required game_timestamp
  clock_after: required game_timestamp
  aggregate_state: required remote_aggregate_state
  proposed_change_set: required json_object
  trace: required json_object
relations:
  applied_process_refs: relation_set[propagation_process_ref]
  deferred_work_refs: relation_set[entity_ref]
invariants:
  - Result is deterministic and idempotent for the same state, elapsed time, pins and incoming processes.
  - Entering active detail first catches up exactly and only then materializes approved detail.
```

## A.6. Visible package and atomic write amendment

```yaml
contract_name: visible_package_persistence_envelope
storage: party_runtime_append_only
identity:
  - package_id
fields:
  package_id: required stable_id
  party_id: required stable_id
  turn_id: required stable_id
  committed_state_version: required positive_decimal_string
  change_set_id: required stable_id
  package_digest: required sha256_hex
  visible_payload: required json_object
  presentation_status: required enum[pending, delivered, failed_retryable]
  projection_policy_ref: required versioned_ref
  dependency_pins: required dependency_pin_set
  idempotency_record_id: required stable_id
invariants:
  - Payload contains only perceived/known player-safe facts, uncertainty and already calculated affordances.
  - Hidden queues, future timestamps, unperceived knowledge, motives, raw options, traces, rolls, DC and state patches are forbidden.
  - Package and pending status commit atomically with facts; narration output is stored separately.
```

```yaml
contract_name: combined_write_plan
storage: immutable_commit_input
identity:
fields:
  plan_id: required stable_id
  party_id: required stable_id
  write_plan_kind: required enum[semantic_commit, blocked_audit]
  operation_kind: required stable_id
  canonical_input_digest: required sha256_hex
  expected_state_versions: required expected_state_version_set
  validation_report_digest: required sha256_hex
  write_set_digest: required sha256_hex
  idempotency_record_id: required stable_id
  visible_package_envelope: optional visible_package_persistence_envelope
invariants:
  - semantic_commit requires a hidden-safe visible package in the same write set; blocked_audit forbids it.
  - Plan contains no narration output, semantic alternatives or duplicate write targets.
  - Only CombinedAtomicCommitter may apply the plan.
```

```yaml
contract_name: party_traversal_interval_result
storage: party_runtime_append_only
identity:
  - id
fields:
  id: required stable_id
  route_plan_execution_id: required stable_id
  plan_step_ordinal: required non_negative_integer
  interval_ordinal: required non_negative_integer
  progress_before_ppm: required ppm
  planned_progress_after_ppm: required ppm
  actual_progress_after_ppm: required ppm
  planned_elapsed: required rational_minutes
  actual_elapsed: required rational_minutes
  cumulative_elapsed_before: required rational_minutes
  cumulative_elapsed_after: required rational_minutes
  crossed_whole_minute_boundaries: required non_negative_decimal_string
  clock_commit_mode: required enum[direct_party_clock, shared_root_transport_clock]
  synchronized_time_slice_result_id: optional stable_id
  execution_context_snapshot: required factual_spatial_context_snapshot
  result_kind: required enum[progressed, segment_completed, paused_in_transit, interrupted_at_anchor, stranded, blocked_before_progress]
  result_code: required stable_id
  dynamic_dependency_pins: required dependency_pin_set
  result_change_set_id: required stable_id
  idempotency_record_id: required stable_id
invariants:
  - Exact elapsed and cumulative state reconcile without float conversion.
  - direct_party_clock owns one clock update; shared_root_transport_clock owns none.
  - Existing six traversal outcomes and spatial completion/interruption semantics are unchanged.
```

```yaml
contract_name: synchronized_time_slice_result
storage: party_runtime_append_only
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  root_transport_execution_id: required stable_id
  root_traversal_interval_result_id: required stable_id
  exact_elapsed: required rational_minutes
  crossed_whole_minute_boundaries: required non_negative_decimal_string
  world_time_before: required game_timestamp
  world_time_after: required game_timestamp
  dependency_pins: required dependency_pin_set
  result_change_set_id: required stable_id
  idempotency_record_id: required stable_id
relations:
  carrier_local_result_refs: relation_set[entity_ref]
invariants:
  - Root result advances the clock once; linked local results use shared_root_transport_clock and zero local crossing count.
  - All linked positive results share exact_elapsed; root zero forbids local positive progress.
```

## A.7. PR8 journey and perception handoff amendment

Inventory PR8/PR10 и последующий contract/storage mapping подтвердили восемь
отсутствующих public handoff:

1. четыре отдельные intent-класса journey ingress при уже существующих
   route-plan, execution, timed-activity, traversal, idempotency и write-plan
   contracts;
2. closed cross-package input и replay evidence для уже существующего pure
   perception resolver `@rus/npc-runtime`;
3. явную связь каждого NPC decision option с approved versioned
   `decision_command`, без которой token membership не доказывает наличие
   command record и зарегистрированного code-owned handler;
4. immutable prepared-scene member для first-entry, когда approved target
   preparation должна существовать до пути, но G5/G6 baseline создаётся
   атомарно только вместе с arrival.
5. sealed read projection approved decision-command record, включая exact
   handler и declared consequence contract;
6. formal request/result envelope для code-owned reaction handler;
7. perception/message-to-knowledge delta и deterministic merge result,
   которые не передают ownership от `@rus/visibility-knowledge-memory`;
8. sealed reaction-option context, approved policy rules и formal option-set
   proposal, без которых `@rus/npc-runtime` не может code-owned способом
   доказать 0/1/many semantics до bounded selection.

Именно эти declarations обосновывают `4.4.0-target.1`. Journey/perception
request handoffs additive; overrides `preparation_snapshot_member` и
`npc_decision_option` несовместимы с прежними определениями и действуют только
в current-target registry. Snapshot
`4.3.0-target.1` не изменяется задним числом. Новые declarations не требуют
собственного package, route/activity engine, clock или journal.

Journey command producer — authenticated game-server/turn ingress. Он
нормализует client intent вместе с sealed server-side state projection.
Клиент не передаёт authoritative `game_timestamp`, `clock_before`,
`scheduled_at` или elapsed interval. Consumer — `@rus/turn`; он вызывает
существующие movement/activity owners и объединяет proposals. Persistence
использует существующие route-plan/execution/event/idempotency contracts.

Perception request producer — `@rus/turn` из sealed factual event, exact
server-side timestamp, topology, environment, observer state, policies,
versions and pins. Consumer — pure `@rus/npc-runtime`. Result остаётся
`perception_result`; validation/merge knowledge and memory принадлежит
`@rus/visibility-knowledge-memory`. Replay evidence связывает существующие
append-only perception result и idempotency record и не создаёт отдельный
store. Наличие `world_perception_signal` в base registry само по себе не
делает его общим handoff и не заменяет declarations ниже.

Reaction option producer — pure `@rus/npc-runtime` из applicable approved
decision policy, approved command records, registered handler identities,
perception/knowledge state, exact timestamp, state versions and pins.
`command_ref` обязан разрешаться в approved command record, быть покрыт
dependency pins и иметь ровно один зарегистрированный handler. Ноль
применимых options является typed data gap; один option выполняется без LLM;
несколько options передаются bounded selector только когда policy это
разрешает. `command_token` детерминированно связывает request, NPC, option,
command, policy, state version, preconditions и полный option-set digest.
Ни token, ни LLM response не являются consequence: выбранный command
исполняется только соответствующим code-owned handler.

`world_base.decision_command_catalog` является runtime projection approved
Temporal authoring record, а не самостоятельным источником новых команд.
Reader возвращает полный `approved_decision_command_snapshot`; строка без
source binding, version, applicability, declared contracts либо ровно одного
зарегистрированного handler не участвует в candidate set. Handler получает
только formal `npc_reaction_consequence_request`, не читает скрытое состояние
и возвращает formal proposal, payload которого валидируется по объявленному
contract до объединения turn proposals.

`@rus/npc-runtime` возвращает только formal knowledge delta proposal.
`@rus/visibility-knowledge-memory` проверяет его causal perception/message,
разделяет facts и hypotheses, выполняет deterministic merge и возвращает
formal merge result. `misinterpreted` не создаёт factual knowledge.
Persistence mapping использует append-only
`party_perception_replay_evidence`,
`party_npc_reaction_consequences`,
`party_npc_knowledge_merge_results`, versioned
`party_npc_knowledge_merge_states` и target-owned nullable branch
существующей `party_npc_knowledge`. Legacy v2 rows сохраняют все target-поля
`NULL`; target row атомарно заполняет полный набор target-полей и ссылается на
validated perception, merge proposal/result и change set. Частичное заполнение
target branch, недоказуемый backfill и смешанное authoritative чтение v2/v3
запрещены. Полный knowledge ref сохраняется как исходные `entity_kind` и
`entity_id`; legacy `fact_id` не считается достаточным target reference.
Доказанный current-target storage gap закрывает immutable target
migration `009_party_runtime_pr8_reaction_knowledge.sql`; после
`spatial-v3-production-v1` она входит в sole-owner v3 production loader.

First-entry использует существующие `preparation_snapshot`,
`preparation_claim`, route-plan и execution identities. Для уже
materialized target member сохраняет resolved baseline/G6/position. Для
ещё не materialized target member сохраняет полный approved
`prepared_scene_materialization_snapshot`; он резервирует стабильные IDs,
G4 scope, template/profile, catalog/materializer versions и pins, но не
утверждает существование строк baseline. Arrival commit берёт lock
`(party_id, g4_id)` до absence read, повторно читает exact
snapshot/member/plan/execution/claim, создаёт зарезервированную цепочку,
переводит claim в consumed и меняет position в одной транзакции.
Существующая migration `003_party_runtime_v3_planning.sql` не имеет prepared
branch и требует уже resolved triple; доказанный current-target storage gap
закрывает immutable target migration
`008_party_runtime_pr8_first_entry.sql`. После `spatial-v3-production-v1` она
входит в sole-owner v3 production loader.

```yaml
contract_name: prepared_scene_materialization_snapshot
storage: immutable_snapshot
identity:
fields:
  g4_id: required stable_id
  g5_site_id: required stable_id
  g5_origin: required enum[canonical, generated]
  scene_baseline_id: required stable_id
  g6_instance_id: required stable_id
  position_id: required stable_id
  scene_template_ref: required versioned_ref
  materialization_profile_ref: required versioned_ref
  catalog_digest: required sha256_hex
  materializer_version: required authoring_version
  dependency_pins: required dependency_pin_set
  canonical_digest: required sha256_hex
invariants:
  - IDs are reserved by approved target preparation and do not prove that party baseline rows already exist.
  - g4_id is the exact canonical target G4 and defines the absence-lock scope together with party_id.
  - Template, profile, catalog, materializer and dependency pins are complete and applicable to the target.
```

Следующее определение является current-target override одноимённого
`4.3.0-target.1` contract:

```yaml
contract_name: preparation_snapshot_member
storage: party_runtime_immutable_relation
identity:
  - preparation_snapshot_id
  - ordinal
fields:
  preparation_snapshot_id: required stable_id
  ordinal: required non_negative_integer
  member_kind: required enum[endpoint, transfer_scene]
  source_authoring_ref: required versioned_ref
  resolved_endpoint_snapshot: optional endpoint_contract_snapshot
  resolved_scene_baseline_id: optional stable_id
  resolved_g6_instance_id: optional stable_id
  resolved_position_id: optional stable_id
  prepared_scene_materialization: optional prepared_scene_materialization_snapshot
  dependency_pins: required dependency_pin_set
  share_mode: required enum[execution_exclusive, reusable]
  member_digest: required sha256_hex
invariants:
  - endpoint requires resolved_endpoint_snapshot and forbids every scene field.
  - transfer_scene requires exactly one branch: the complete resolved baseline/G6/position triple or prepared_scene_materialization.
  - A resolved position belongs to the declared G6 and active baseline; a prepared branch is materialized only by its atomic first-entry commit.
  - Ordinals are contiguous from zero and the selected member is linked to the exact route-plan execution through preparation_claim.
  - Duplicate member_kind plus dependency-pin digest is forbidden within one snapshot.
  - member_digest covers kind, source, resolved or prepared payload, share mode and dependency pins.
```

Следующее определение является current-target override одноимённого
`4.3.0-target.1` contract:

```yaml
contract_name: npc_decision_option
storage: immutable_snapshot_member
identity:
  - option_id
fields:
  option_id: required stable_id
  command_ref: required versioned_ref
  command_token: required stable_id
  canonical_ordinal: required non_negative_integer
  preconditions_digest: required sha256_hex
  consequence_policy_ref: required versioned_ref
invariants:
  - command_ref resolves to one applicable approved decision-command record and is covered by dependency_pins of the enclosing request.
  - The approved command record names one registered code-owned handler and the handler output is validated as the declared consequence contract.
  - command_token binds request, NPC, option, command_ref, policy, state version, preconditions and the complete immutable option set.
  - Option belongs to one finite approved set and contains no free-text consequence.
```

```yaml
contract_name: approved_decision_command_snapshot
storage: immutable_read_projection
identity:
  - command_ref
fields:
  command_ref: required versioned_ref
  domain: required stable_id
  handler_id: required stable_id
  input_contract_name: required stable_id
  consequence_contract_name: required stable_id
  source_record_ref: required versioned_ref
  applicability: required snapshot_list[stable_id]
  status: required enum[approved]
  dependency_pins: required dependency_pin_set
  canonical_digest: required sha256_hex
invariants:
  - command_ref resolves to the exact approved world_base.decision_command_catalog projection and uses entity kind decision_command.
  - source_record_ref resolves to the approved Temporal authoring record whose provenance, sources, version and applicability created this projection.
  - handler_id, command_ref, input_contract_name and consequence_contract_name match exactly one entry in the closed current-target code-owned reaction-handler registry.
  - canonical_digest covers the complete projection; a self-asserted or unregistered handler identity is invalid.
  - Missing, draft, ambiguous, unpinned or inapplicable records are excluded; an empty required command set is npc_decision_policy_gap.
```

```yaml
contract_name: npc_reaction_handler_input_snapshot
storage: immutable_snapshot
identity:
fields:
  source_perception: required perception_result
  reaction_scope_ref: required entity_ref
  observed_preconditions_digest: required sha256_hex
  dependency_pins: required dependency_pin_set
  canonical_digest: required sha256_hex
invariants:
  - The source perception is the complete formal causal result; a bare observer/event pair is insufficient.
  - The snapshot has a closed field set and cannot contain a state patch, clock mutation, SQL, IO handle or arbitrary command payload.
  - dependency_pins match the enclosing request and canonical_digest covers the complete handler input.
```

```yaml
contract_name: npc_reaction_consequence_request
storage: immutable_request
identity:
  - request_id
  - canonical_input_digest
fields:
  request_id: required stable_id
  npc_ref: required entity_ref
  selected_option: required npc_decision_option
  decision_trace: required npc_decision_trace
  command_record: required approved_decision_command_snapshot
  consequence_input_snapshot: required npc_reaction_handler_input_snapshot
  current_state_version: required positive_decimal_string
  executed_at: required game_timestamp
  dependency_pins: required dependency_pin_set
  idempotency_key: required stable_id
  canonical_input_digest: required sha256_hex
invariants:
  - Option, trace, command record, NPC, state version, command/source/policy pins and idempotency identity match exactly.
  - consequence_input_snapshot contains every causal handler input and no hidden IO is permitted.
  - idempotency_key is derived deterministically from request, state, trace and command-record digests; callers cannot substitute an unrelated handler retry identity.
  - Retry with the same validated trace and canonical input reuses the same deterministic consequence; changed state is rejected stale.
```

```yaml
contract_name: npc_reaction_consequence_proposal
storage: immutable_proposal
identity:
  - request_id
  - canonical_input_digest
fields:
  request_id: required stable_id
  npc_ref: required entity_ref
  option_id: required stable_id
  command_ref: required versioned_ref
  handler_id: required stable_id
  consequence_contract_name: required stable_id
  consequence_payload: required immutable_snapshot
  state_version: required positive_decimal_string
  proposed_at: required game_timestamp
  dependency_pins: required dependency_pin_set
  canonical_input_digest: required sha256_hex
  request_snapshot: required npc_reaction_consequence_request
  canonical_digest: required sha256_hex
invariants:
  - The exact registered handler named by the approved command record is the sole producer.
  - request, NPC, option, command, handler, state version, timestamp, dependency pins and canonical input digest match request_snapshot exactly.
  - consequence_payload validates against consequence_contract_name before turn may merge it.
  - The proposal changes no clock, performs no IO and is not itself a database write.
```

```yaml
contract_name: npc_reaction_effect_snapshot
storage: immutable_snapshot
identity:
fields:
  effect_kind: required enum[investigate_signal, seek_safety, report_to_authority]
  source_perception_ref: required entity_ref
  successor_command_kind: required enum[prepare_target, replan, immediate_action]
  successor_command_payload: required immutable_snapshot
  effective_at: required game_timestamp
  canonical_digest: required sha256_hex
invariants:
  - investigate_signal maps only to prepare_target, seek_safety only to replan and report_to_authority only to immediate_action.
  - successor_command_payload is constructed by the registered handler from the sealed request and is revalidated by the existing target command adapter.
  - The snapshot is a proposal for turn orchestration, not a direct state patch, clock update or database write.
```

```yaml
contract_name: knowledge_memory_delta_proposal
storage: immutable_proposal
identity:
  - proposal_id
fields:
  proposal_id: required stable_id
  owner_ref: required entity_ref
  source_kind: required enum[perception]
  source_ref: required entity_ref
  source_perception: required perception_result
  expected_state_versions: required expected_state_version_set
  dependency_pins: required dependency_pin_set
  canonical_digest: required sha256_hex
relations:
  fact_refs: relation_set[entity_ref]
  hypothesis_refs: relation_set[entity_ref]
invariants:
  - perception source requires the complete matching formal perception_result; a received-message branch remains a formal DATA_GAP until a committed-message evidence contract exists.
  - not_perceived grants neither facts nor hypotheses; misinterpreted grants hypotheses only.
  - fact_refs plus hypothesis_refs equal source_perception.knowledge_update_refs exactly; merge cannot invent a reference absent from the causal result.
  - Facts and hypotheses are unique, canonically ordered and disjoint.
  - The proposal does not mutate knowledge and contains no player-facing prose.
```

```yaml
contract_name: knowledge_memory_merge_result
storage: immutable_result
identity:
  - proposal_id
  - result_digest
fields:
  proposal_id: required stable_id
  owner_ref: required entity_ref
  source_ref: required entity_ref
  state_version_before: required state_version
  state_version_after: required state_version
  state_changed: required boolean
  dependency_pins: required dependency_pin_set
  proposal: required knowledge_memory_delta_proposal
  result_digest: required sha256_hex
relations:
  state_before_fact_refs: relation_set[entity_ref]
  state_before_hypothesis_refs: relation_set[entity_ref]
  accepted_fact_refs: relation_set[entity_ref]
  accepted_hypothesis_refs: relation_set[entity_ref]
invariants:
  - @rus/visibility-knowledge-memory is the sole merge owner and deterministically unions accepted references with current sealed state.
  - proposal, owner, source and dependency pins match exactly; accepted sets equal the canonical union of the corresponding sealed state-before set and proposal set.
  - state_changed is true exactly when the canonical merged state differs; state_version_after then equals state_version_before plus one, otherwise it preserves the version.
  - The result creates no objective fact and is persisted only through the combined write plan.
```

```yaml
contract_name: journey_prepared_execution_start_command
storage: immutable_request
identity:
  - command_id
fields:
  command_id: required stable_id
  intent_kind: required enum[start_prepared_execution]
  party_id: required stable_id
  route_plan_id: required stable_id
  route_plan_execution_id: required stable_id
  route_plan_digest: required sha256_hex
  expected_state_versions: required expected_state_version_set
  dependency_pins: required dependency_pin_set
  idempotency_key: required stable_id
invariants:
  - The execution is planned, uniquely owns the immutable ready plan and repeats no prior committed start.
  - Exact current time is read only from the sealed server-side state projection; the command contains no client-authored clock.
  - Start performs no replanning and cannot change the active immutable route plan.
```

```yaml
contract_name: journey_execution_continue_command
storage: immutable_request
identity:
  - command_id
fields:
  command_id: required stable_id
  intent_kind: required enum[continue_execution]
  party_id: required stable_id
  route_plan_id: required stable_id
  route_plan_execution_id: required stable_id
  route_plan_digest: required sha256_hex
  expected_state_versions: required expected_state_version_set
  dependency_pins: required dependency_pin_set
  idempotency_key: required stable_id
invariants:
  - Continue rechecks execution status, immutable plan digest, versions and dependencies before collecting boundaries.
  - Exact current time is read only from the sealed server-side state projection.
  - Continue cannot replace the plan or revise already committed intervals.
```

```yaml
contract_name: journey_execution_cancel_command
storage: immutable_request
identity:
  - command_id
fields:
  command_id: required stable_id
  intent_kind: required enum[cancel_execution]
  party_id: required stable_id
  route_plan_id: required stable_id
  route_plan_execution_id: required stable_id
  route_plan_digest: required sha256_hex
  control_reason_code: required stable_id
  expected_state_versions: required expected_state_version_set
  dependency_pins: required dependency_pin_set
  idempotency_key: required stable_id
invariants:
  - Cancel is a zero-time command/control outcome at the sealed current timestamp, not a future temporal boundary candidate.
  - Cancel creates no fictitious traversal interval or activity attempt and preserves committed elapsed, progress and effects.
  - Result status follows only the pinned activity/traversal policy and existing execution state machine.
```

```yaml
contract_name: journey_successor_plan_preparation_command
storage: immutable_request
identity:
  - command_id
fields:
  command_id: required stable_id
  intent_kind: required enum[prepare_successor_plan]
  party_id: required stable_id
  predecessor_route_plan_id: required stable_id
  predecessor_execution_id: required stable_id
  predecessor_handoff_endpoint_ref: required movement_endpoint_ref
  predecessor_handoff_snapshot_digest: required sha256_hex
  successor_path_query: required path_query
  expected_state_versions: required expected_state_version_set
  dependency_pins: required dependency_pin_set
  idempotency_key: required stable_id
invariants:
  - Preparation has zero elapsed and starts a new plan/execution lineage from the predecessor exact committed handoff endpoint.
  - The successor path query start endpoint equals predecessor_handoff_endpoint_ref and its digest binds all target, method, carrier, capability and recovery inputs.
  - Preparation never mutates the predecessor immutable payload, active plan or committed intervals.
```

```yaml
contract_name: perception_signal_snapshot
storage: immutable_snapshot
identity:
fields:
  signal_ref: required entity_ref
  channel: required enum[visual, acoustic]
  source_scope_ref: required entity_ref
  source_ref: required entity_ref
  emission_strength: required enum[1, 2, 3, 4]
  signal_state_version: required state_version
  player_visibility_class: required enum[public_source, visible_if_perceived, hidden_source]
  canonical_digest: required sha256_hex
invariants:
  - The snapshot references an already existing factual event signal and creates no world fact.
  - For acoustic signals emission_strength equals sound_event.loudness; for visual or world signals it is the closed 1..4 band resolved from the pinned approved strength profile.
  - hidden_source never becomes player-visible merely because the signal or approximate direction was perceived.
```

```yaml
contract_name: perception_propagation_edge_snapshot
storage: immutable_snapshot_member
identity:
fields:
  edge_ref: required entity_ref
  from_ref: required entity_ref
  to_ref: required entity_ref
  permitted_channels: required snapshot_list[enum[visual, acoustic]]
  relation_kind: required enum[visibility_link, acoustic_edge]
  relation_state_version: required state_version
  visibility_quality: optional enum[clear, partial]
  distance_band: optional enum[near, short, medium, long, remote]
  acoustic_base_loss: optional enum[0, 1, 2]
  portal_ref: optional entity_ref
  portal_state: optional enum[open, closed, locked, destroyed]
  visibility_portal_result: optional enum[clear, partial, blocked]
  acoustic_portal_extra_loss: optional enum[0, 1, 2, blocked]
  condition_profile_ref: optional versioned_ref
  resolved_condition_visibility: optional enum[clear, partial, blocked]
  resolved_condition_acoustic_loss: optional enum[0, 1, 2, blocked]
  canonical_digest: required sha256_hex
invariants:
  - Permitted channels are unique and canonically ordered.
  - visibility_link requires exactly visual, visibility_quality and distance_band; it forbids acoustic loss fields.
  - acoustic_edge requires exactly acoustic and acoustic_base_loss; it forbids visibility_quality and distance_band.
  - portal_ref, portal_state and the channel-specific portal result are all present or all absent.
  - condition_profile_ref and the channel-specific resolved condition result are both present or both absent.
  - Every copied value equals the pinned active visibility_link or acoustic_edge row and the resolved portal/condition state at the request timestamp.
```

```yaml
contract_name: perception_propagation_snapshot
storage: immutable_snapshot
identity:
fields:
  source_scope_ref: required entity_ref
  target_scope_ref: required entity_ref
  canonical_digest: required sha256_hex
relations:
  edges: relation_set[perception_propagation_edge_snapshot]
invariants:
  - Edges form one finite, ordered, acyclic path from source_scope_ref to target_scope_ref.
  - An empty path is valid only when source and target scopes are equal.
```

```yaml
contract_name: perception_environment_snapshot
storage: immutable_snapshot
identity:
fields:
  light_state_id: required enum[bright, dim, dark]
  environment_state_ref: required entity_ref
  environment_state_version: required state_version
  weather_state_ref: required entity_ref
  weather_state_version: required state_version
  weather_visibility_result: required enum[clear, partial, blocked]
  weather_acoustic_loss: required enum[0, 1, 2, blocked]
  target_acoustic_profile_ref: required entity_ref
  target_acoustic_profile_state_version: required state_version
  target_ambient_noise: required enum[0, 1, 2]
  transient_visibility_result: required enum[clear, partial, blocked]
  transient_acoustic_loss: required enum[0, 1, 2, blocked]
  transient_modifier_dependency_pins: required dependency_pin_set
  canonical_digest: required sha256_hex
relations:
  visibility_modifiers: relation_set[visibility_modifier]
invariants:
  - weather visibility/acoustic values are the resolved closed effects of the pinned weather state; they are not free numeric modifiers.
  - target_ambient_noise and profile state version equal the pinned receiving g6_acoustic_profile.
  - visibility_modifiers contain the complete applicable active set and preserve their source pins and state versions.
  - transient effects are closed categorical values derived only from transient_modifier_dependency_pins; absent applicable modifiers resolve to clear and zero.
  - The digest covers all light, weather, access and transient propagation inputs used by the resolver.
  - A changed environment state/version creates a different canonical request.
```

```yaml
contract_name: perception_attention_snapshot
storage: immutable_snapshot
identity:
fields:
  attention_state_ref: required entity_ref
  status: required enum[awake, sleeping]
  attended_channels: required snapshot_list[enum[visual, acoustic]]
  observer_position_ref: required movement_endpoint_ref
  observer_position_state_version: required state_version
  observer_azimuth_mdeg: required azimuth_mdeg
  observer_vertical_direction: required enum[level, up, down, mixed]
  visual_capability_level: required enum[0, 1, 2, 3, 4]
  acoustic_capability_level: required enum[0, 1, 2, 3, 4]
  orientation_digest: required sha256_hex
  canonical_digest: required sha256_hex
invariants:
  - Attended channels are unique and canonically ordered.
  - Orientation and capability values are explicit resolver inputs; their digests never stand in for hidden payload.
  - Position, orientation, attention or state-version change permits a new evaluation and forbids observer/event-only deduplication.
```

```yaml
contract_name: perception_recognition_snapshot
storage: immutable_snapshot
identity:
fields:
  recognition_state_ref: required entity_ref
  outcome: required enum[recognized, misinterpreted, partial, unidentified]
  canonical_digest: required sha256_hex
invariants:
  - misinterpreted is an interpretation/hypothesis input and never rewrites the factual signal.
```

```yaml
contract_name: perception_policy_snapshot
storage: immutable_snapshot
identity:
fields:
  recognition_policy_ref: required versioned_ref
  visibility_policy_ref: required versioned_ref
  acoustic_policy_ref: optional versioned_ref
  provenance_ref: required versioned_ref
  status: required enum[approved]
  darkness_visual_result_cap: required controlled_perception_result
  sleeping_attention_channels: required snapshot_list[enum[visual, acoustic]]
  canonical_digest: required sha256_hex
invariants:
  - All referenced policies are approved, applicable and present in dependency_pins.
  - darkness_visual_result_cap is one of not_perceived, perceived_unidentified or perceived_partial.
```

```yaml
contract_name: npc_perception_request
storage: immutable_request
identity:
  - perception_id
  - canonical_input_digest
fields:
  perception_id: required stable_id
  perceiver_ref: required entity_ref
  event_ref: required entity_ref
  perceived_at: required game_timestamp
  target_scope_ref: required entity_ref
  factual_signal: required perception_signal_snapshot
  propagation_snapshot: required perception_propagation_snapshot
  environment_snapshot: required perception_environment_snapshot
  attention_snapshot: required perception_attention_snapshot
  recognition_snapshot: required perception_recognition_snapshot
  perception_profile: required perception_policy_snapshot
  expected_state_versions: required expected_state_version_set
  dependency_pins: required dependency_pin_set
  idempotency_key: required stable_id
  canonical_input_digest: required sha256_hex
relations:
  known_fact_refs: relation_set[entity_ref]
  candidate_knowledge_fact_refs: relation_set[entity_ref]
invariants:
  - The request is sealed by @rus/turn and contains every causal input used by the pure resolver; hidden reads and IO are forbidden.
  - Opaque digests prove identity but never substitute for a causal value required by the resolver.
  - canonical_input_digest covers all fields, ordered relations, exact timestamp, policy versions, dependency pins, state versions and idempotency identity.
  - candidate_knowledge_fact_refs are proposals only; @rus/npc-runtime never mutates knowledge or memory.
  - A change in light, position, orientation, attention, propagation, recognition policy, state version or another digest-bound input creates a new valid evaluation.
```

```yaml
contract_name: perception_replay_evidence
storage: immutable_result
identity:
  - perception_id
  - canonical_input_digest
fields:
  perception_id: required stable_id
  canonical_input_digest: required sha256_hex
  perception_digest: required sha256_hex
  expected_state_versions_digest: required sha256_hex
  dependency_pins_digest: required sha256_hex
  policy_versions_digest: required sha256_hex
  idempotency_key: required stable_id
  canonical_digest: required sha256_hex
invariants:
  - Replay is permitted only when all identity and digest fields equal the current sealed request and committed perception result.
  - Evidence maps to the existing idempotency record plus append-only perception result; it creates no separate persistence owner.
  - Perceiver/event identity alone is insufficient, and no extra causal-parent field is introduced without a later formal gap.
```

```yaml
contract_name: npc_reaction_option_rule_snapshot
storage: immutable_snapshot_member
identity:
  - option_id
fields:
  option_id: required stable_id
  command_ref: required versioned_ref
  consequence_policy_ref: required versioned_ref
  allowed_perception_results: required relation_set[stable_id]
  required_capability: required enum[investigate_signal, seek_safety, report_to_authority]
  requires_direct_threat: required boolean
  requires_safe_anchor: required boolean
  requires_authority_recipient: required boolean
  canonical_digest: required sha256_hex
invariants:
  - Every allowed_perception_results value is a controlled_perception_result and not_perceived is forbidden.
  - command_ref resolves to one approved_decision_command_snapshot and consequence_policy_ref is pinned.
  - Rules are declarative filters only and contain no consequence patch, default option or prose.
```

```yaml
contract_name: npc_reaction_policy_snapshot
storage: immutable_snapshot
identity:
  - policy_ref
fields:
  policy_ref: required versioned_ref
  source_record_ref: required versioned_ref
  status: required enum[approved]
  bounded_decision_when_multiple: required boolean
  zero_options_outcome: required enum[npc_decision_policy_gap]
  one_option_mode: required enum[code_owned_without_llm]
  many_options_mode: required enum[bounded_selection]
  dependency_pins: required dependency_pin_set
  canonical_digest: required sha256_hex
relations:
  option_rules: nonempty_relation_set[npc_reaction_option_rule_snapshot]
  approved_command_records: nonempty_relation_set[approved_decision_command_snapshot]
invariants:
  - option_id and command_ref are unique, canonically ordered and source-backed; every rule resolves exactly one approved_command_record with the same source_record_ref.
  - dependency_pins include the source record, every command record dependency and every consequence policy.
  - No authored default or semantic fallback is permitted.
```

```yaml
contract_name: npc_reaction_option_context_snapshot
storage: immutable_snapshot
identity:
  - source_perception
  - npc_ref
  - npc_state_version
fields:
  source_perception: required perception_result
  npc_ref: required entity_ref
  reaction_scope_ref: required entity_ref
  npc_state_version: required positive_decimal_string
  can_investigate_signal: required boolean
  can_seek_safety: required boolean
  can_report_to_authority: required boolean
  threat_level: required enum[none, possible, direct]
  safe_anchor_ref: optional movement_endpoint_ref
  authority_recipient_ref: optional entity_ref
  expected_state_versions: required expected_state_version_set
  dependency_pins: required dependency_pin_set
  canonical_digest: required sha256_hex
invariants:
  - npc_ref equals source_perception.perceiver_ref and is covered by expected_state_versions.
  - Capability, threat, anchor and authority values come from one sealed server-side projection.
  - The snapshot contains no DB handle, hidden read instruction, LLM output or state patch.
```

```yaml
contract_name: npc_reaction_option_set_proposal
storage: immutable_proposal
identity:
  - request_id
  - source_perception_ref
  - state_version
  - options_digest
fields:
  request_id: required stable_id
  source_perception_ref: required entity_ref
  state_version: required positive_decimal_string
  options_digest: required sha256_hex
  context_snapshot: required npc_reaction_option_context_snapshot
  policy_snapshot: required npc_reaction_policy_snapshot
  decision_request: required npc_decision_request
  canonical_digest: required sha256_hex
invariants:
  - source_perception_ref identifies the complete context perception and decision_request binds the same NPC, timestamp, state version, policy, pins and canonical filtered options.
  - request_id is npc-reaction:<sha256> of source perception digest, NPC, state version, policy digest and context digest.
  - Each preconditions_digest covers context_digest, policy_digest and rule_digest. The ordered token-free option descriptors form option_set_digest; each command_token is cmd.v1:<sha256> over contract version, request_id, NPC, option, command, policy, state version, preconditions_digest and option_set_digest.
  - options_digest equals decision_request.options_digest and covers the complete ordered options including their request-bound command_token values.
  - Zero applicable options returns npc_decision_policy_gap instead of this proposal.
  - One option proceeds without LLM; more than one uses bounded selection only when policy_snapshot permits it.
```

---

# Приложение B. Temporal typed-error amendment

| Error code | Meaning | Required reaction | Retryability |
|---|---|---|---|
| `time_timestamp_invalid` | GameTimestamp is malformed, noncanonical or inconsistent | Reject request/read; preserve factual state | no |
| `time_elapsed_invalid` | ElapsedTime is malformed, negative or invalid for the control outcome | Reject request/result | no |
| `time_calendar_profile_gap` | Required approved calendar profile is absent | Hard block; authoring repair | after_data_repair |
| `time_owner_conflict` | More than one clock owner or a shared local update attempts to own time | Reject combined plan/commit | fresh_state |
| `time_window_invalid` | Temporal limit or slice window is reversed or inconsistent | Reject request | no |
| `temporal_execution_unbounded` | Active execution has no finite completion/recheck boundary | Hard block execution | after_data_repair |
| `temporal_boundary_ambiguous` | Candidate identity/order/replacement has conflicting definitions | Reject resolution | after_data_repair |
| `temporal_boundary_cycle` | Same-time causal dependency graph contains a cycle | Abort factual resolution | no |
| `temporal_candidate_stale` | Candidate has no valid cancel/execute/replacement disposition | Reject resolution; re-read state | fresh_state |
| `temporal_change_set_conflict` | Temporal proposals conflict or fail exact reconciliation | Reject combined plan/commit | fresh_state |
| `activity_profile_gap` | Required approved activity profile is absent | Hard block; authoring repair | after_data_repair |
| `activity_policy_gap` | Required activity policy ref or finite candidate set is absent | Hard block; authoring repair | after_data_repair |
| `activity_precondition_stale` | Activity preconditions changed before resolution/commit | Re-resolve under pinned policy | fresh_state |
| `activity_transition_invalid` | Activity status/attempt transition violates the canonical machine | Reject transition | no |
| `event_rule_gap` | Required exact timer/event rule is absent | Hard block; authoring repair | after_data_repair |
| `event_effect_gap` | Event has no approved registered effect profile | Hard block; authoring repair | after_data_repair |
| `npc_schedule_gap` | Required NPC schedule/activity transition is absent | Hard block relevant transition | after_data_repair |
| `npc_decision_policy_gap` | Bounded NPC option/policy set is missing or empty | Hard block decision | after_data_repair |
| `perception_policy_gap` | Required propagation/attention/recognition policy is absent | Hard block perception update | after_data_repair |
| `weather_profile_gap` | Required approved weather/light transition profile is absent | Hard block environment transition | after_data_repair |
| `historical_phase_rule_gap` | Required source-backed historical phase/local rule is absent | Hard block historical transition | after_data_repair |
| `remote_catch_up_rule_gap` | Required coarse aggregate catch-up rule is absent | Hard block scope activation | after_data_repair |
| `propagation_rule_gap` | Required process path/timing/effect rule is absent | Hard block propagation | after_data_repair |
| `visible_package_persistence_gap` | Hidden-safe visible package cannot be built or committed with facts | Abort factual commit | fresh_state |

Expected `blocked`, `paused`, `decision_required`, `stranded`, policy-authorized
stale `cancel` and `committed_presentation_pending` остаются control/delivery
outcomes и не превращаются в generic exceptions.

---

# Приложение C. Controlled vocabulary amendment

Accepted Temporal baseline registry `data/contracts/spatial-v3/controlled-vocabularies.v2.json`
наследует все 13 закрытых B.0.1 registries версии 1.0.0, нормативно расширяет
`controlled_entity_kind` и `controlled_write_target`, а также добавляет следующие
8 закрытых registries. Полный current-target registry содержит ровно 21
vocabulary и 498 values; aggregate digest:
`c0529491f7cda2e22081e5fc0db5618aeabeebe5cbaebb1412961364fd42098c`.
Baseline v1 и accepted Temporal v2 остаются immutable historical artifacts.

В `controlled_entity_kind` добавлены только именованные Temporal World entity
targets: `activity_profile`, `body_effect`, `body_state`, `calendar_profile`,
`carrier_condition`, `environment_overlay_state`, `light_state`, `load_state`,
`npc_decision_trace`, `participant_binding`, `party`, `perception_result`,
`portal_access_state`, `propagation_process`, `remote_aggregate_state`,
`resource_binding`, `runtime_calendar_snapshot`, `temporal_boundary_candidate`,
`time_slice_result`, `visible_package_persistence_envelope` и `weather_state`.
В `controlled_write_target` добавлены только новые party-runtime contracts:
`npc_decision_trace`, `participant_binding`, `perception_result`,
`propagation_process_ref`, `remote_aggregate_state`, `resource_binding`,
`time_slice_result` и `visible_package_persistence_envelope`. Immutable request,
proposal, snapshot и combined-plan DTO не становятся write targets.

| Pseudo-type | Registry ID | Registry path | Version | Digest |
|---|---|---|---|---|
| `controlled_entity_kind` | `spatial.contract.entity_kind` | `data/contracts/spatial-v3/controlled-vocabularies.v2.json` | `2.0.0` | `f42ff9df9806f7406527bf24c22b012a33cebf855e9f51da2b6d9bc759831b0a` |
| `controlled_write_target` | `spatial.runtime.write_target` | `data/contracts/spatial-v3/controlled-vocabularies.v2.json` | `2.0.0` | `673aad14e3b9951441d6f01327c5f691a8bf781e24f10ab3553c34d87169caa4` |
| `controlled_activity_completion_model` | `temporal.activity_completion_model` | `data/contracts/spatial-v3/controlled-vocabularies.v2.json` | `2.0.0` | `769b059bf5fdb0545e96aa06e9fcc43becd7d2bf56b27261cc7b97c3fc35a43d` |
| `controlled_activity_failure_class` | `temporal.activity_failure_class` | `data/contracts/spatial-v3/controlled-vocabularies.v2.json` | `2.0.0` | `1e5fbe79620fbaa49922828867c6035365c347c5eed521b235ee04c2845e5df9` |
| `controlled_interruption_level` | `temporal.interruption_level` | `data/contracts/spatial-v3/controlled-vocabularies.v2.json` | `2.0.0` | `69a870463fef09429fe9b112e3057ee828adc7e7bdc66a11d5ed292c77c500dc` |
| `controlled_perception_result` | `temporal.perception_result` | `data/contracts/spatial-v3/controlled-vocabularies.v2.json` | `2.0.0` | `2eadda37e480d532c408dace432b6fa1b945b2fc1137d6d1cb17f480d88ccc39` |
| `controlled_temporal_resolution_class` | `temporal.resolution_class` | `data/contracts/spatial-v3/controlled-vocabularies.v2.json` | `2.0.0` | `cfd6204f09945bbda2c4fe723af01f2bca11fdd1202364c132293bb385e5d533` |
| `controlled_temporal_advance_status` | `temporal.advance_status` | `data/contracts/spatial-v3/controlled-vocabularies.v2.json` | `2.0.0` | `8f63771d967c308dd0cda610b8b418934fada9ea77b9f9f982ce8daaf7c14e0c` |
| `controlled_remote_scope_mode` | `temporal.remote_scope_mode` | `data/contracts/spatial-v3/controlled-vocabularies.v2.json` | `2.0.0` | `b49edbf5ceba5159b741d33e3b175921b22dad77b54872aef438b5cba85468f5` |
| `controlled_propagation_process_kind` | `temporal.propagation_process_kind` | `data/contracts/spatial-v3/controlled-vocabularies.v2.json` | `2.0.0` | `eae3da75a6536935b5cd0214301dc5f2b722e3cf69d43d7f4258dca06d0032c4` |

## C.1. PR8 current-target vocabulary amendment

Contract gap A.7 доказал, что approved Temporal authoring и
`world_base.decision_command_catalog` используют stable entity kind
`decision_command`, которого нет в immutable registry v2. Current-target
registry `data/contracts/spatial-v3/controlled-vocabularies.v3.json` наследует
v2, добавляет только это значение в `controlled_entity_kind` и содержит
21 vocabulary / 499 values. Aggregate digest:
`a325d72c1a7eabd5717216371d61e7505444c7dbb75ca94c25ce25156deaa7db`.

| Pseudo-type | Registry ID | Registry path | Version | Digest |
|---|---|---|---|---|
| `controlled_entity_kind` | `spatial.contract.entity_kind` | `data/contracts/spatial-v3/controlled-vocabularies.v3.json` | `3.0.0` | `3c3a2587415a41513f5bce842453d8bf79fb729ae107e64e37936dc51334c49a` |

Все остальные значения и consumer semantics наследуются из v2 без
содержательного расширения. Изменившиеся технические digests v3 обусловлены
новыми version/path bindings и перечислены в generated registry; они не
переобъявляют semantic approval неизменённых values.
