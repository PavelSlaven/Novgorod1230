# «След на Нижней Двине»: поэтапная дорожная карта

## Назначение и обязательные границы

Этот документ задаёт архитектурное разбиение реализации после
`lower-dvina-trace-gap-audit.md`. Он не является детальным пофайловым планом.

Для всех фаз действуют правила:

- один PR даёт один ограниченный и проверяемый результат;
- фаза 0 меняет только versioned content и его validation; фаза 1A даёт
  проверяемый внутренний party instance без публикации, а runtime-фазы 1B–11
  дают видимый игровой результат;
- `lower_dvina_late_summer_open_water_v1` сохраняет ID, definition, binding,
  исторические результаты и regression-тесты boatman slice;
- новый сценарий не подменяет и не затеняет boatman scenario;
- сценарий не получает собственные clock, RNG, body, inventory, NPC,
  knowledge, activity, combat, promise или completion engines;
- factual commit выполняется до narration; LLM не выбирает consequence,
  elapsed time или write targets;
- профильные тесты выполняются в каждой фазе; полный `npm test` — только для
  финального кандидата фазы 11;
- пустой обязательный approved candidate/option set либо отсутствующий
  policy/profile record/ref/schema/version/digest блокирует создание партии.

## Scenario definition и party instance

Эти два уровня нельзя смешивать.

| Уровень | Когда создаётся | Что содержит | Чего не содержит |
|---|---|---|---|
| Versioned scenario definition | Фаза 0 | approved candidate sets; immutable activity/check/consequence, NPC decision, movement, body/environment, promise, completion и epilogue policy/profile records; graph/slot templates; exact schemas/versions/digests | runtime handlers/evaluators и выбранный для конкретной партии truth |
| Party scenario instance | Фаза 1A, атомарно до публичного подключения | seed/pins, выбранные player profile/name, culprit, motive, hidden sequence, graph bindings, clue placements, полный набор выбранных policy/profile refs/digests, точный `GameTimestamp`, environment snapshot | незафиксированных fallback-вариантов и позднего изменения смысла revision |

Materializer выбирает только из закрытых наборов definition. Выборы и их
digests сохраняются один раз до opening screen. Поздние PR подключают runtime к
уже зафиксированным данным; они не меняют truth этой партии и не дописывают
scenario revision задним числом.

## Решение по персонажу игрока

Фиксирована роль: **младший приказчик**. Имя и конкретный совместимый профиль
выбирает materializer из approved candidate set по seed/pins. Микула — имя
канонической acceptance-партии с фиксированным seed, а не обязательное имя
каждой партии.

Canonical profile должен фиксировать характеристики эталона:

| Характеристика | Значение | Бонус |
|---|---:|---:|
| Сила | 9 | −1 |
| Ловкость | 11 | +0 |
| Выносливость | 10 | +0 |
| Разум | 14 | +2 |
| Внимание | 13 | +1 |
| Влияние | 12 | +1 |

Полный профиль обязан содержать все 12 навыков общего контракта персонажа.
Эталон задаёт уровни восьми:

| Навык | Уровень | Бонус |
|---|---|---:|
| Наблюдательность | умелый | +2 |
| Общение | умелый | +2 |
| Обычай и закон | умелый | +2 |
| Хозяйство | знаком | +1 |
| Ремесло | знаком | +1 |
| Выживание | знаком | +1 |
| Лечение | нет опыта | +0 |
| Ближний бой | нет опыта | +0 |
| Атлетика | не утверждён — data gap | не утверждён |
| Скрытность | не утверждён — data gap | не утверждён |
| Дальний бой | не утверждён — data gap | не утверждён |
| Верховая езда | не утверждён — data gap | не утверждён |

Уровни и бонусы Атлетики, Скрытности, Дальнего боя и Верховой езды во входном
эталоне не заданы. Это blocking data gap: фаза 0 должна получить approved
значения, а не выводить их из удобства сценария. Каждый из 12 уровней должен
иметь явный `basis`; для `нет опыта` требуется approved `absence_basis`.
Для canonical profile исходный материал уже даёт основу счёту товара,
переписыванию записей, различению владельческих знаков, участию в торгах и
знакомству с ремеслом отца-кожевника; основания для Выживания, двух
`нет опыта` и четырёх незаданных навыков также должны быть утверждены.
Отсутствие любого уровня или basis блокирует materialization.

Семантический owner профиля — существующие
`@rus/new-game/stages/stage-11` (`validateStage11PlayerCharacterOutput`,
`shapePlayerCharacterGameProfile`) и `@rus/new-game/stages/stage-12`
(`buildStage12CodePrecheck`). Их approved-policy/content validation должен
требовать exact six/full twelve для этого scenario profile. `@rus/actors`
остаётся владельцем общего actor shape и skill bindings; его
`validateActor()` не может быть единственным admission gate, поскольку сейчас
принимает любой skills object.

Доменные контракты используют `player_character_id`. В описании канонического
ручного прохождения этот экземпляр называется Микулой. Поэтому promise
сохраняет promisor как materialized player character; в canonical fixture это
Микула.

## Последовательность фаз и PR

| PR | Фаза | Проверяемый результат | Зависит от | Independent critic |
|---:|---|---|---|---|
| 1 | 0. Versioned definition | Полный content + declarative policy/profile package валиден; party/runtime не создаются | аудит | обязателен при добавлении/изменении schema |
| 2 | 1A. Внутренняя materialization | Materializer атомарно фиксирует и восстанавливает party instance; API/UI не меняются | 0 | обязателен |
| 3 | 1B. Публичный старт | Новый scenario выбирается через существующий API и показывает безопасный берег крушения | 1A | обязателен |
| 4 | 2. Осмотр крушения | Raw intent разрешается в exact option и открывает первую улику | 1B | обязателен |
| 5 | 3. Рыбацкий стан | Еремей и рыбаки дают первую независимую цепочку показаний | 2 | обязателен |
| 6 | 4. Сушильня и сдача Ратши | Условное обещание влияет на попытку сдачи и фиксируется после успеха | 3 | обязателен |
| 7 | 5. Лечение Онисима | Timed treatment даёт утверждённый body effect | 4 | обязателен |
| 8 | 6. Переноска Онисима | Многосторонняя carry activity доводит Онисима до стана | 5 | обязателен |
| 9 | 7. Отдых у огня | Проходит 30 минут, одежда сохнет, бодрость растёт, Жданко действует | 6 | обязателен |
| 10 | 8. Клеть Жданко | Опасная сцена завершается surrender/disarm либо альтернативой | 7 | обязателен |
| 11 | 9. Возврат и подтверждение | Сумка/свёрток/печать проверены, Онисим подтверждает события, участники временно определены | 8 | обязателен |
| 12 | 10. Completion и эпилог | Полный/частичный исход вычислен из committed facts | 9 | обязателен |
| 13 | 11. Browser acceptance | Основной и альтернативный пути проходят через web/runtime/PostgreSQL | 10 | обязателен |

## Фаза 0. Versioned scenario definition и validation

### Цель и результат

Создать только immutable definition, из которого позднее может быть
детерминированно создана партия. Игровой runtime, API publication, party state и
экраны не меняются.

### Данные

- approved player role/profile/name candidate sets для младшего приказчика,
  включая шесть характеристик, полный вектор из 12 навыков с
  уровнями/бонусами и биографическим `basis`/`absence_basis` каждого уровня;
- crash/body candidates;
- participant candidate sets Онисима, Еремея, Ратши, Жданко и фоновых рыбаков;
- location profiles/bindings и допустимые topology/slot templates;
- item/container sets и clue placement slots;
- culprit, motive и hidden-sequence candidate sets и compatibility rules;
- clue/evidence graph templates, knowledge seeds/rules, lie/memory rules;
- immutable activity profiles для каждого обязательного действия и перехода,
  включая duration, participants/resources, interruption и nearest-boundary
  rules;
- check profiles с attribute/skill, DC, modifiers, retry/idempotency rules;
- action/consequence profiles со stable `option_id`, допустимыми factual
  effects и write-target classes;
- NPC decision/schedule policies с закрытыми option sets, включая surrender,
  самостоятельное действие Жданко и допустимое временное удержание опасного
  NPC;
- movement bindings, route/time profiles и поздние location bindings;
- body/environment profiles для crash, treatment, carry, fire-rest/drying и
  опасной сцены;
- promise lifecycle policy record с условиями offer/surrender/activation;
- completion rules и epilogue projection/narration rules;
- полный стартовый timestamp specification: calendar/epoch mapping,
  calendar/version refs и environment candidate rules;
- exact schema/version/digest каждого набора/record и правила совместимости.

Definition не выбирает конкретные culprit, motive, hidden sequence, player
name/profile или clue placements. Но ни один обязательный policy/profile record
не может быть отложен: отсутствующий schema/record/ref либо пустой option set
блокирует definition и последующее создание партии.

### Владельцы

- versioned world/scenario catalogs;
- code-driven content validation contract;
- существующий player profile catalog;
- `@rus/new-game/stages/stage-11` и `stage-12` как semantic validation/audit
  owner; `@rus/actors` только как общий actor-shape owner;
- владельцы declarative contracts: `@rus/turn`/activity и `@rus/checks-rng`
  для action/check/consequence records, `@rus/npc-runtime` для
  decision/schedule policies, `@rus/movement-routes` для movement bindings,
  `@rus/body-state` и time/environment owner для body/environment profiles,
  social/knowledge owner для promise record, visibility/knowledge owner для
  completion rules, `@rus/presentation` и `@rus/narration` для epilogue rules.

Если у указанного владельца нет минимального declarative schema, фаза 0
добавляет этот schema/validation contract и scenario record у владельца.
Runtime handlers, orchestration и evaluators не подключаются. Второй
scenario-local engine или неизвестный deferred ref запрещены.

| Обязательная категория | Текущее состояние | Результат фазы 0 | Runtime-фаза |
|---|---|---|---:|
| Activity/check/consequence | Generic contracts частичны; trace records отсутствуют | Complete schemas/records для всех обязательных ходов | 2–9 |
| NPC decision/schedule | `@rus/npc-runtime` есть; scenario policies отсутствуют | Closed option records, включая surrender, действие Жданко и temporary restraint | 3, 4, 7, 8 |
| Movement | Generic planner есть; trace bindings отсутствуют | Location/route/time bindings | 3, 6, 8, 9 |
| Body/environment | Generic owners есть; crash/treatment/rest profiles отсутствуют | Crash, treatment, carry, drying/recovery, danger и environment records | 1A, 2, 5–8 |
| Promise | Полного lifecycle schema/owner contract нет | Назначенный owner, declarative offer/surrender/activation schema и record | 4 |
| Completion | Evaluator и scenario rules отсутствуют | Declarative evidence thresholds/outcome rules | 10 |
| Epilogue | Generic presentation/narration есть; trace rules отсутствуют | Terminal projection allowlist и narration rules | 10 |

### Persistence

Только versioned catalog artifacts и digests. Party persistence отсутствует.

### Проверки

- schema/content validation и reproducible digest;
- все обязательные candidate sets непусты;
- совместимые комбинации существуют для каждого обязательного slot;
- все обязательные policy/profile records существуют, валидны и имеют exact
  schema/version/digest;
- каждый NPC policy option и каждый activity/check/consequence ref разрешается
  внутри package без неизвестного deferred ref;
- canonical clerk profile содержит шесть заданных характеристик, все 12
  approved skill levels и биографический basis;
- Stage 11/12 admission отклоняет missing/unknown skill, неверный bonus и
  отсутствующий required basis; одного `validateActor()` недостаточно;
- definition не содержит конкретного party truth;
- удаление любого обязательного activity/check/consequence, NPC decision,
  movement, body/environment, promise, completion или epilogue record
  fail-closed блокирует package;
- boatman artifacts и regression fixtures не изменены.

### Ручная проверка

Проверить manifest definition: candidate sets, полный policy/profile inventory
и exact digests присутствуют, а выбранных culprit/name/clue placements, party
IDs и runtime handlers нет.

### Критерии приёмки

- package полностью определяет пространство допустимой narrative truth и
  обязательное игровое поведение через immutable declarative records;
- пустой обязательный set или несовместимый slot блокирует принятие;
- materializer сможет выбрать и pin-нуть truth и все records без смыслового
  fallback;
- API ещё не публикует новый scenario;
- runtime, persistence и player-facing screens не изменены.

### Не входит

Party creation, runtime handlers/evaluators, semantic resolver и интеграция
`@rus/turn`/time/checks/body. Declarative policy/profile records и их schemas
в фазу 0, напротив, входят обязательно.

### Independent critic gate

Если фаза 0 добавляет либо меняет schema публичного owner, независимый критик
проверяет границы владельцев, referential completeness, fail-closed validation
и отсутствие scenario-local engine до merge.

## Фаза 1A. Внутренняя materialization party instance

### Цель и проверяемый результат

Создать внутренний code-owned materializer и атомарно сохранить конкретный
party instance без изменения scenario catalog, HTTP API, UI и opening screen.
Результат виден в профильном integration test и после repository rehydrate, но
ещё недоступен игроку.

### Затрагиваемые владельцы

- code-driven materializer;
- `@rus/body-state`, `@rus/items-property`, time owner;
- party-store/game-server atomic committer;

### Выборы materializer

Из definition фазы 0 по seed/pins выбираются и фиксируются:

- конкретные name/profile игрока при фиксированной роли младшего приказчика;
- culprit, motive и hidden sequence;
- участники и profile refs;
- location/topology bindings;
- item refs, clue graph bindings и конкретные clue placements;
- knowledge/lie/memory seeds;
- выбранные refs/digests всех обязательных activity/check/consequence, NPC
  decision/schedule, movement, body/environment, promise, completion и
  epilogue records;
- полный `GameTimestamp`, calendar/version pins и environment snapshot.

Canonical acceptance seed обязан давать игрока по имени Микула; другие
разрешённые seeds могут выбрать другое approved имя/профиль.

### Materialization

Материализуются только игрок, место крушения, стартовые body state/items,
часы/environment и hidden truth resolution. Поздние NPC, места и улики получают
sealed selections/slots, но их экземпляры создаются только при причинном входе
в соответствующую сцену.

### Persistence

Одна транзакция фиксирует seed/pins, все selections и digests, полный
`GameTimestamp`, environment snapshot, truth/evidence bindings, стартовые
entities/controls, полный policy/profile pin set и snapshot. Replay request
возвращает тот же instance; repository rehydrate не выбирает заново.

### Тесты

- canonical seed выбирает Микулу, другие seeds — только approved candidates;
- canonical profile имеет точные шесть характеристик, все 12 skill
  levels/bonuses и biography basis;
- profile прошёл Stage 11/12 semantic validation, а не только generic
  `@rus/actors:validateActor`;
- все party selections принадлежат definition sets;
- все обязательные policy/profile refs разрешены в definition фазы 0 и
  pin-нуты до публикации; отсутствие любого ref блокирует создание;
- culprit/motive/sequence/placements фиксируются атомарно;
- replay/rehydrate сохраняют selections, IDs, timestamp и environment;
- rollback не оставляет частичную party.

### Ручная проверка

Через внутренний test harness создать canonical party, пересоздать repository
adapter и сравнить player identity, полный профиль, timestamp/environment и
sealed selection digests.

### Критерии приёмки

- party instance доступен только после atomic commit полного resolution;
- роль игрока — младший приказчик; canonical fixture — Микула;
- нет позднего выбора culprit/motive/clue placement;
- поздняя фаза не может добавить отсутствующий record или re-pin его для уже
  созданной party;
- scenario catalog/API/UI и boatman artifacts не изменены.

### Independent critic gate

Независимый критик проверяет atomic persistence, materialization,
time/body/items contracts и отсутствие второго runtime. Все blocking
findings устраняются до merge; после содержательного исправления аудит
повторяется.

### Не входит

Scenario publication, opening screen, игровой ход, semantic intent, d20,
разговоры и поздняя materialization.

## Фаза 1B. Публичное подключение сценария и первый экран

### Цель и игровой результат

Минимально расширить существующий scenario publication/dispatch. Игрок выбирает
отдельный versioned scenario «След на Нижней Двине»; existing API вызывает
materializer фазы 1A и только после успешного commit показывает безопасный
первый экран на берегу крушения.

### Затрагиваемые владельцы

- existing scenario/new-game API и first-playable composition;
- materializer фазы 1A как единственный creator party instance;
- presentation opening projection;
- party-store/game-server read/restart path.

### Данные и persistence

Новых truth selections нет. Binding связывает новый scenario ID с definition и
materializer фазы 1A. Safe projection получает только committed visible state;
session screen сохраняется существующим persistence owner. Старый
`lower_dvina_late_summer_open_water_v1` не меняется и не перенаправляется.

### Тесты

- новый scenario виден и выбирается через существующий API;
- start вызывает materializer фазы 1A, а не второй creator;
- opening screen появляется только после полного commit;
- missing mandatory policy/profile pin возвращает data gap и не создаёт
  party/screen;
- hidden truth отсутствует в API/UI/narration input;
- public restart сохраняет identity, полный профиль, selections, timestamp,
  environment и screen;
- boatman scenario остаётся доступен и проходит прежние regression-тесты.

### Ручная проверка

Создать canonical trace party через публичный API, проверить первый экран,
перезапустить server и сравнить safe state. Отдельно запустить boatman scenario
по прежнему ID.

### Критерии приёмки

- игрок видит берег крушения и точное безопасное состояние;
- API не отдаёт экран до успешного materialization commit;
- restart не запускает materializer повторно;
- старый scenario ID, результаты и regression behavior неизменны.

### Independent critic gate

Независимый критик проверяет scenario API, code/LLM hidden-data boundary,
restart orchestration и отсутствие неявной подмены boatman scenario.

### Не входит

Игровой ход, semantic intent, d20, разговоры и поздняя materialization.

## Фаза 2. Осмотр крушения и первая улика

### Цель и игровой результат

Игрок формулирует осмотр свободно; система проходит цепочку
`committed state → полный закрытый набор доступных действий → raw text + набор
→ exact option_id | unknown → code-owned consequence/time/write`, выполняет
канонический d20 и фиксирует первую улику.

### Владельцы

- `@rus/turn` — канонический владелец, но его public
  `createTurnCommandRegistry`/`runTurnWorkflow` требует минимального расширения;
- существующий порядок `normalize_intent → resolve_mode → load_context`
  меняется так, чтобы committed state загружался до semantic resolution;
- target public contracts владельца:
  `createTurnAvailableActionSet({ registry, committedState, actorId,
  policyPins })` и `resolveTurnSemanticIntent({ rawText, actionSet,
  semanticResolver })`;
- первый контракт строит детерминированный **полный** available action set из
  committed state, visibility/knowledge и pinned records, без фильтрации raw
  text; `option_id` берётся из phase-0 record, не из совпавшего ordinal;
- второй передаёт semantic resolver только raw text, player-safe closed option
  set и state/policy versions. Versioned result содержит только exact
  `option_id` либо типизированный `unknown`; primitives digest/token/membership
  переиспользуются из bounded-decision;
- membership/version/precondition validation остаётся у bounded-decision
  contract; после выбора registry повторно проверяет availability, а код
  выполняет consequence, time и write targets;
- `matches()`/regex остаётся только optional exact fast path для однозначной
  фразы внутри уже построенного available set. При отсутствии fast-path
  совпадения semantic resolver всё равно получает полный набор;
- `@rus/checks-rng`, temporal advance, `@rus/body-state`;
- visibility/knowledge и item/scene persistence.

### Данные и persistence

Используются только утверждённые фазой 0 и pin-нутые фазой 1A
action/check/consequence records осмотра; новые records/refs здесь не
добавляются. Фаза подключает semantic resolver и runtime handlers существующих
owners. Clue slot и placement уже sealed в party instance. Сохраняются raw
intent, digest полного available set, exact `option_id` либо `unknown`,
resolver/version trace, RNG audit, elapsed time, body effects,
observations/knowledge/evidence links и snapshot.

### Тесты

- available set строится из committed state/pins и не зависит от `matches()`;
- порядок options и digest детерминированы, hidden actions/data не передаются;
- эквивалентные raw intents дают один exact `option_id`;
- semantic resolver никогда не получает команду вне полного registered set;
- при нуле regex/matches совпадений semantic resolver всё равно вызывается;
- invented/stale `option_id` и `unknown` fail-closed без mutation;
- exact regex fast path и semantic path выбирают один и тот же `option_id`;
- LLM не задаёт consequence, time или write targets;
- replay не меняет option/roll/time/facts;
- hidden truth не попадает в visible/narration package.

### Ручная проверка

Проверить exact fast path, свободную перефразировку без `matches()` совпадения,
неоднозначную и неизвестную формулировки; после restart сравнить available-set
digest, option, roll, timestamp и первую улику.

### Критерии приёмки

- `matches()`/regex не является prerequisite или semantic owner;
- полный available set строится до разбора raw text из committed state/pins;
- resolver возвращает только exact `option_id` либо `unknown`;
- одна команда заканчивается ближайшей meaningful boundary;
- улика — committed fact, а не prose;
- party definition и selections не меняются.

### Independent critic gate

Независимый критик проверяет публичную intent boundary, code/LLM boundary,
checks/time/body orchestration и fail-closed semantics.

### Не входит

Движение в стан, NPC conversations и cross-chain evaluation.

## Фаза 3. Рыбацкий стан и Еремей

### Цель и игровой результат

Игрок приходит в стан, видит Еремея и фоновых рыбаков, получает показание и
может заметить расхождение с уликой крушения.

### Владельцы

`@rus/movement-routes`, `@rus/npc-runtime`, `@rus/turn`,
`@rus/visibility-knowledge-memory`, conversation activity и presentation.

### Данные и persistence

Используются phase-0-approved и party-pinned traversal/conversation/NPC
decision records первого входа в стан; фаза подключает их runtime handlers.
Materializer создаёт NPC только из sealed participant selections. Сохраняются
position, NPC profile binding, conversation activity, statement, player
journal, NPC memory и knowledge/evidence relation. Ложное statement не
становится world fact.

### Тесты

- movement занимает approved exact time;
- materialization выполняется один раз;
- Еремей не знает hidden truth;
- background fishers не получают необоснованную promotion;
- statement/fact/knowledge/hypothesis различаются;
- restart сохраняет NPC IDs и память.

### Ручная проверка

Перейти в стан, поговорить до/после первой улики, перезапустить server и
проверить расхождение в журнале.

### Критерии приёмки

Один и тот же Еремей восстанавливается после restart; видимый экран не раскрывает
невидимых NPC/фактов; следующий выбор игрока остаётся открытым.

### Independent critic gate

Критик проверяет movement/NPC/knowledge persistence и отсутствие сценарного
диалогового store.

### Не входит

Сушильня, promise, treatment и carry.

## Фаза 4. Сушильня, условное обещание и сдача Ратши

### Цель и игровой результат

Игрок находит Онисима и пытается добиться сдачи Ратши. Условное обещание
предлагается **до** проверки сдачи и может дать утверждённый circumstantial
modifier. Только после успешной сдачи обещание становится committed
обязательством.

### Promise contract

- `promisor`: materialized player character; в canonical fixture — Микула;
- `beneficiary`: Ратша;
- witnesses: Еремей и участвующий рыбак;
- scope: Микула не позволит убить Ратшу без разбирательства, если Ратша сдастся
  и не причинит дальнейшего вреда;
- promise не означает прощения, невиновности или освобождения от
  ответственности.

До исхода проверки сохраняется offer/attempt, но active promise ещё нет.
Успешная сдача атомарно фиксирует surrender fact и active promise. Неуспех не
создаёт active promise и оставляет следующую meaningful boundary игроку.

### Владельцы

`@rus/npc-runtime`, `@rus/checks-rng`, `@rus/turn`, social/knowledge owner,
items-property для пут/оружия и party transaction owner.

### Persistence

Phase-0-approved и party-pinned promise/surrender record уже назначен
social/knowledge owner. Эта фаза подключает минимальный lifecycle handler и
write set: offer, conditions, parties, witnesses, check modifier provenance,
surrender result и active status. Scenario-only promise store запрещён.

### Тесты

- offer предшествует check и влияет только утверждённым modifier;
- active promise отсутствует до успешной surrender;
- success атомарно сохраняет surrender + promise;
- failure/replay не создают promise;
- parties/witnesses/scope/non-immunity точны;
- restart восстанавливает outcome и lifecycle.

### Ручная проверка

В canonical party Микула при Еремее и рыбаке предлагает условие, выполняет
попытку сдачи, затем после success проверяет active promise. Отдельно проверить
failure без active obligation.

### Критерии приёмки

Причинность `offer → modifier/check → surrender → committed promise` видна в
audit trail; promise не отменяет ответственность Ратши; ход не скрывает
автоматическое насилие за narration.

### Independent critic gate

Критик проверяет новый публичный promise lifecycle, persistence, check
provenance, NPC orchestration и legal/non-immunity semantics.

### Не входит

Treatment, carry, отдых и окончательное решение по участникам.

## Фаза 5. Лечение Онисима

### Цель и игровой результат

Игрок подготавливает и завершает timed treatment Онисима. Лечебный эффект
возникает только после утверждённой activity progression.

### Владельцы

Existing activity state machine, `@rus/body-state`, `@rus/turn`/temporal
advance, item resources и party transaction owner.

### Данные и persistence

Используется phase-0-approved и party-pinned treatment profile; эта фаза
подключает activity/body handlers. Сохраняются activity
instance/status/progress, participants/resources, elapsed time и resulting
body effect. Preparation не подменяет лечение.

### Тесты

Preparation не лечит; interruption/restart/resume сохраняют один activity;
эффект и время применяются один раз; nearest body/time boundary соблюдается.

### Ручная проверка

Начать treatment, остановиться на допустимой boundary, выполнить restart и
завершить тот же activity.

### Критерии приёмки

Онисим получает approved effect; нет `scenario_treatment`; clock/body commits
атомарны.

### Independent critic gate

Критик проверяет activity/body/time contracts и persistence/replay.

### Не входит

Переноска, отдых и самостоятельное действие Жданко.

## Фаза 6. Многосторонняя переноска Онисима

### Цель и игровой результат

Игрок и утверждённые помощники переносят Онисима из сушильни в рыбацкий стан.

### Владельцы

Temporal carriers/activity participants, movement-routes, items-property,
body-state, turn и party persistence.

### Данные и persistence

Используется phase-0-approved и party-pinned carry profile; эта фаза подключает
activity/carrier/movement handlers. Сохраняются carried entity, participant
roles, capacity/load, занятые руки, route/progress, interruption и final
placement.

### Тесты

Несколько участников обязательны; capacity и body constraints проверяются;
restart продолжает тот же carry; final placement меняется один раз; replay не
дублирует elapsed time.

### Ручная проверка

Начать переноску, перезапустить server на boundary и довести Онисима до стана.

### Критерии приёмки

Нет `scenario_carry` и ручного teleport; участники/маршрут/время аудируемы.

### Independent critic gate

Критик проверяет activity/movement/items/body ownership и atomic persistence.

### Не входит

Отдых у огня, лечение и действия в клети Жданко.

## Фаза 7. Отдых у огня и самостоятельное действие Жданко

### Цель и игровой результат

Игрок выполняет отдельное действие **отдых у огня — 30 минут**. Одежда
подсушивается, бодрость восстанавливается по approved body effect, а Жданко за
тот же temporal interval выполняет своё bounded самостоятельное действие.

### Владельцы

Activity/time owner, `@rus/body-state`, `@rus/npc-runtime`,
perception/reaction cycle и `@rus/turn`.

### Данные и persistence

Используются phase-0-approved и party-pinned fire-rest и schedule/action
profiles Жданко; эта фаза подключает activity/body/NPC handlers. Fire-rest
record задаёт duration 30 minutes, условия огня и drying/body effects.
Сохраняются activity, exact elapsed interval, body/clothing state, Жданко
schedule transition/decision trace и воспринимаемые последствия.

### Тесты

- elapsed ровно 30 минут;
- одежда переходит только в approved более сухое состояние;
- бодрость восстанавливается один раз;
- Жданко действует на том же factual advance;
- NPC action воспроизводимо, ограничено знаниями и не раскрывает hidden truth;
- restart/replay не повторяют effects/decision.

### Ручная проверка

Отдохнуть у огня, сравнить timestamp/body/clothing, выполнить restart и
проверить косвенное последствие действия Жданко.

### Критерии приёмки

Отдых — самостоятельный player choice, не побочный эффект лечения/переноски;
один clock owner атомарно фиксирует player и NPC consequences.

### Independent critic gate

Критик проверяет critical temporal orchestration, body effects, NPC schedule и
perception boundary.

### Не входит

Клеть Жданко, threat/combat и disarm.

## Фаза 8. Клеть Жданко, опасная сцена и обезоруживание

### Цель и игровой результат

Игрок входит в клеть Жданко. Сцена заканчивается на meaningful boundaries и
может привести к деэскалации, surrender, retreat, вреду или обезоруживанию.

### Владельцы

`@rus/npc-runtime`, `@rus/checks-rng`, `@rus/combat-health`,
`@rus/items-property`, `@rus/turn`, visibility/knowledge.

### Данные и persistence

Используются phase-0-approved и party-pinned threat/action/disarm и temporary
restraint records; эта фаза подключает NPC/checks/combat/items handlers.
Сохраняются NPC decision trace, checks, harm/injury, witnesses, positions,
temporary restraint и смена holder/controller оружия. Owner не меняется без
отдельного основания.

### Тесты

NPC действует из доступных committed facts; disarm меняет
holder/controller; replay не повторяет roll/harm/transfer; defeat/retreat
остаются валидными; narration строится после commit.

### Ручная проверка

Пройти деэскалацию и disarm path с restart на каждой meaningful boundary.

### Критерии приёмки

Нет второго combat/RNG/item engine; опасность не разрешается целиком без
следующего ввода игрока.

### Independent critic gate

Критик проверяет combat/checks/items/NPC/turn orchestration, persistence и
границу code/LLM.

### Не входит

Возврат сумки/свёртка, проверка печати и completion.

## Фаза 9. Возврат имущества, подтверждение и временное решение

### Цель и игровой результат

После разрешения угрозы игрок:

1. возвращает сумку и свёрток под корректный holder/controller;
2. проверяет печать и её состояние;
3. возвращается к Онисиму;
4. сопоставляет и подтверждает последовательность событий;
5. принимает временное, не окончательно-правовое решение по Ратше и Жданко.

Completion ещё не вычисляется.

### Владельцы

Items-property, movement-routes, visibility/knowledge/memory, NPC runtime,
conversation activity и turn persistence.

### Данные и persistence

Используются phase-0-approved и party-pinned item/movement/conversation/
consequence records; фаза подключает соответствующие handlers. Сохраняются
item controls/placements, seal inspection fact, return traversal, Онисимово
statement/confirmation, merged evidence facts и temporary disposition records.
Promise Ратше продолжает действовать по status и не означает освобождения.

### Тесты

- сумка/свёрток/печать имеют корректные owner/holder/controller;
- повторная проверка не rematerializes предмет;
- Онисим подтверждает только доступные ему события;
- temporary disposition не равен completion/acquittal;
- restart сохраняет seal/evidence/promise/disposition.

### Ручная проверка

Вернуть вещи, проверить печать, пройти обратный маршрут, поговорить с Онисимом
и выбрать временную меру; выполнить restart перед completion.

### Критерии приёмки

Все обязательные постконфликтные facts committed; completion не запускается
сразу после disarm; доказательная последовательность доступна следующей фазе.

### Independent critic gate

Критик проверяет multi-owner persistence, item rights, knowledge merge,
promise status и отсутствие преждевременного completion.

### Не входит

Completion threshold, terminal outcome и epilogue narration.

## Фаза 10. Evidence/completion evaluator и эпилог

### Цель и игровой результат

После фазы 9 код вычисляет полный, частичный или незавершённый исход из
committed facts и формирует безопасный эпилог.

### Владельцы

Visibility/knowledge owner утверждённого фазой 0 completion record,
presentation, narration и party-store.

### Данные и persistence

Используются phase-0-approved и party-pinned completion/epilogue records; новые
rules/refs здесь не добавляются. Фаза подключает минимальный
evidence/completion evaluator к запечатанному party graph и runtime handlers
terminal projection/narration. Сохраняются evaluation inputs, evidence used,
outcome, promise outcomes, terminal visible package и narration job/result.

### Тесты

- completion невозможен до обязательных facts фазы 9;
- полные/частичные/незавершённые комбинации детерминированы;
- observation не подменяет доказанное knowledge;
- promise не означает acquittal;
- LLM не определяет outcome;
- epilogue не раскрывает недоказанную hidden truth;
- retry/restart сохраняют outcome.

### Ручная проверка

Получить полный и частичный исход после одинаковой последовательности до фазы 9
с различными committed facts; сравнить safe epilogues после restart.

### Критерии приёмки

Outcome вычисляет код; evaluator не становится универсальным quest engine;
epilogue строится только после factual commit.

### Independent critic gate

Критик проверяет evidence/completion public contract, persistence,
code/LLM boundary и terminal orchestration.

### Не входит

Новые сценарии, универсальный legal/quest engine и browser coverage.

## Фаза 11. Сквозная браузерная приёмка

### Цель и игровой результат

Реальный browser/public runtime/PostgreSQL контур проходит основной и
альтернативные пути от scenario selection до эпилога.

### Владельцы

Game-web, public API, production first-playable composition, PostgreSQL party
runtime и browser harness.

### Проверки

- canonical seed materializes Микулу и фиксированную party truth;
- альтернативный seed остаётся в approved sets;
- checkpoints: start, clue, camp, promise attempt/surrender, treatment, carry,
  30-minute fire rest/NPC action, danger/disarm, item return/seal, Onisim
  confirmation/disposition, completion;
- restart и idempotent request в ключевых checkpoints;
- hidden-data scan API/UI/narration;
- boatman regression;
- профильные suites;
- один полный `npm test` только на финальном кандидате.

### Ручная проверка

Пройти canonical path в браузере на чистой тестовой БД с restart во время
activity и перед completion. Подтвердить отдельный запуск boatman scenario.

### Критерии приёмки

Тест использует реальный runtime/PostgreSQL, не mock/evidence JSON; основной и
частичный исходы достижимы; selections/RNG/time/IDs стабильны; hidden truth не
утекает.

### Independent critic gate

Независимый критик выполняет финальный cross-subsystem аудит. Green CI не
заменяет проверку owner boundaries, persistence safety и code/LLM separation.

### Не входит

Новые игровые возможности и несвязанный рефакторинг.

## Порядок pull request

1. PR 1 — definition/validation без runtime.
2. PR 2 — внутренняя materialization фазы 1A без API/UI publication.
3. PR 3 — публичное подключение и opening screen фазы 1B.
4. PR 4–12 — по одной runtime-фазе 2–10.
5. PR 13 — browser acceptance фазы 11 и единственный финальный полный
   `npm test`.
6. Каждый следующий PR зависит от принятого предыдущего.
7. Невыполненный acceptance criterion не переносится молча дальше.
8. Для фаз с critic gate PR не готов к merge до устранения blocking findings.

## Independent critic gate

Критик должен быть независим от автора изменения. Gate обязателен, если фаза
затрагивает хотя бы одно из следующего:

- публичные контракты нескольких подсистем;
- persistence или DDL;
- границу code/LLM;
- критическую orchestration.

Критик сверяет diff с owner map, проверяет отсутствие второго движка,
атомарность/idempotency, hidden-data boundary и профильные тесты. После
содержательного исправления blocking finding аудит повторяется.

## Правило остановки при data gap

Definition не проходит фазу 0, а party не создаётся, если отсутствует
обязательный candidate set либо declarative activity/check/consequence, NPC
decision/schedule, movement, body/environment, promise, completion или
epilogue schema/record/ref/version/digest; если option set пуст; либо нет ни
одной совместимой комбинации.

Конкретные player/culprit/motive/sequence/clue-placement selections не являются
definition data: их делает materializer в фазе 1A вместе с выбором и pinning
полного policy/profile set до opening screen. После создания party selections
и pins неизменяемы. Если поздняя фаза обнаруживает отсутствующий record,
смысловой вариант или handler-incompatible schema, работа останавливается:
сначала выпускается новая versioned scenario revision и создаётся новая party;
ослабление фильтра, позднее дописывание record и fallback запрещены.

## Правило запрета второго движка

Запрещены scenario-local clock, RNG, body, inventory, knowledge, NPC scheduler,
activity/carry/treatment, combat, promise, evidence/completion и save engines.
Если существующий owner не покрывает declarative schema/record, минимально
расширяется этот owner в фазе 0. Если отсутствует runtime handler/evaluator для
уже утверждённого record, owner минимально расширяется в фазе первого
использования с профильными тестами и independent critic gate.
