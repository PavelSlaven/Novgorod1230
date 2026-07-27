# Технический аудит разрыва: «След на Нижней Двине»

## Baseline, границы и вывод

- Проверенная ветка до начала работы: `main`.
- Проверенный commit: `66864e751ce594888c792e7061f08ca4bf857592`.
- На момент проверки `main` и `origin/main` указывали на один commit; divergence:
  `0 0`.
- До аудита рабочая копия содержала сторонние untracked
  `.codex/hooks.json` и `.tmp.driveupload/`. Они не изучались, не менялись и не
  входят в аудит.
- Аудит не изменяет runtime, схемы, migrations, каталоги или тесты.

Текущий `Lower Dvina first playable` — работоспособный, но другой вертикальный
срез. Игрок — лодочник на высокой площадке; основной цикл включает спуск к
берегу, одного рыбака, воду, валежник, сеть, верёвку, отдых, лодку и
пограничный переход. Сценарий «След на Нижней Двине» в текущем коде и данных не
реализован.

Инфраструктурная основа пригодна для переиспользования: публичный new-game/turn
контур, pinned content, атомарный PostgreSQL commit, idempotency, item controls,
activity records, safe projection и generic владельцы проверок, времени, тела,
NPC и знаний. Однако first-playable adapter сейчас сам дублирует часть этих
владельцев. Полноценный сценарий нельзя строить расширением этого дублирования.

`lower_dvina_late_summer_open_water_v1` является самостоятельным неизменяемым
boatman scenario. «След на Нижней Двине» должен получить отдельные versioned
scenario definition и binding через существующий scenario API. Запрещены
перезапись старого scenario ID, изменение его исторических результатов, неявная
подмена новым сценарием и ослабление regression-тестов boatman slice.

**Готовность к реализации:** архитектурное разбиение можно утверждать, но
первая runtime-фаза не готова к выдаче. Следующим отдельным заданием должна
стать фаза 0, закрывающая только обязательные data/contract gaps без игрового
хода. Готовность самого сценария к прохождению отсутствует.

## Изученные источники

### Постановка и эталон

- внешний входной документ «Сценарий “След на Нижней Двине”»;
- внешний входной документ «Эталон первого тестового сценария “След на Нижней
  Двине”».

Оба документа переданы пользователем для этого аудита и не являются файлами
репозитория. Их копии в рамках данного PR не добавляются.

Эталон принят как контракт требуемого поведения: игрок — младший приказчик;
Микула — canonical acceptance-персонаж художественного прохождения, тогда как
технический раздел разрешает materializer выбирать name/profile из approved
set;
старт после крушения в 07:00; фиксированная до первого хода скрытая истина;
четыре локальные сцены; Онисим, Еремей, Ратша, Жданко и фоновые рыбаки;
разделение фактов, восприятия, знания, лжи, памяти и гипотез; независимые
доказательные цепочки; свободный ввод; канонические d20; точное время; лечение,
переноска, расписания, опасная сцена, обещания; полное/частичное завершение и
эпилог из committed facts; restart/idempotency и браузерное прохождение.
Точное время означает полный внутренний `GameTimestamp`, calendar/epoch mapping,
calendar/version pins и согласованный environment snapshot, а не только 07:00.
Свободный ввод проходит границу
`committed state → полный закрытый available action set → raw intent + set →
exact option_id | unknown → code-owned consequence/time/write`; LLM не
определяет consequence, elapsed time или write targets. Current
`@rus/turn:eligible(matches)` эту границу ещё не реализует.
Обещание эталона адресовано Ратше: `promisor` — materialized player character
(Микула в canonical fixture), `beneficiary` — Ратша, свидетели — Еремей и
участвующий рыбак. Условное обещание предлагается до проверки сдачи и даёт
утверждённый circumstantial modifier; после успешной сдачи оно фиксируется как
active fact. Scope — отсутствие бессудного убийства при сдаче и отсутствии
дальнейшего вреда. Оно не означает прощения, невиновности или освобождения
Ратши от ответственности.

Canonical профиль Микулы в эталоне фиксирует характеристики: Сила 9 (−1),
Ловкость 11 (+0), Выносливость 10 (+0), Разум 14 (+2), Внимание 13 (+1),
Влияние 12 (+1). Из общего набора 12 навыков эталон задаёт только восемь:
Наблюдательность, Общение, Обычай и закон — `умелый` (+2); Хозяйство, Ремесло,
Выживание — `знаком` (+1); Лечение и Ближний бой — `нет опыта` (+0). Уровни
Атлетики, Скрытности, Дальнего боя и Верховой езды не заданы. Это входной data
gap, а не разрешение вывести удобные значения. Approved profile должен
содержать все 12 уровней/бонусов и биографический `basis` каждого уровня
(`absence_basis` для `нет опыта`): эталон уже сообщает о счёте товара,
переписывании записей, различении владельческих знаков, участии в торгах и
ремесле отца-кожевника; остальные основания должны быть отдельно утверждены до
materialization.

### Репозиторий и документация проекта

- `AGENTS.md`;
- `README.md`;
- `MODULE_INDEX.md`;
- `docs/domain/OWNERSHIP_MAP.md`;
- `docs/pipelines/new-game.md`;
- `docs/pipelines/turn.md`;
- `docs/pipelines/temporal-advance.md`;
- `docs/implementation/lower-dvina-first-playable/README.md` и относящиеся
  manifests/evidence в этом каталоге;
- `data/world-catalogs/novgorod/first-playable-v1/scenario.json`;
- `data/world-catalogs/novgorod/first-playable-v1/catalog.json`;
- `data/world-catalogs/novgorod/first-playable-v1/manifest.json`;
- `data/novgorod-region/novgorod_social_roles_v1_enriched.tsv`;
- `data/novgorod-region/novgorod_occupations_v1_enriched.tsv`.

`docs/implementation/lower-dvina-first-playable/README.md` и evidence относятся
к более старому baseline `d4be6…`. Они использованы как историческая
документация, но не как доказательство поведения commit `66864e…`.

### Runtime, persistence и тесты

- `apps/game-server/src/runtime/first-playable-public-runtime.js`;
- `apps/game-server/src/runtime/first-playable-semantic-recognizer.js`;
- `apps/game-server/src/runtime/first-playable/{setup,shared,projection,command}.js`;
- `apps/game-server/src/composition/production-spatial-v3.js`;
- `apps/game-server/src/infrastructure/postgres/first-playable/`;
- `apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js`;
- `packages/actors/src/index.js`;
- `packages/new-game/src/stages/stage-11-player-character/`;
- `packages/new-game/src/stages/stage-12-player-character-audit/`;
- `packages/turn/src/{index,command-registry,bounded-decision}.js`;
- `packages/turn/src/stages/{normalize-intent,resolve-mode}.js`;
- `test/spatial-v3/first-playable-public-runtime-postgres.test.js`;
- `apps/game-server/test/first-playable-semantic-recognizer.test.js`;
- `apps/game-web/test/game-web.test.js`;
- `test/e2e/browser-game-flow.test.js`;
- профильные package tests, названные в таблице владельцев.

### Нормативные документы

RAG использован только как навигация. Выполнены четыре
`npm run knowledge:query` по материализации/скрытой истине,
восприятию/проверкам, времени/activities/NPC и
предметам/UI/эпилогу. Выдача была `rag_status=degraded`; требования проверены
по исходным документам:

- `data/knowledge-source/corpus/DOCUMENTS/llm_documentation_navigation.md`;
- `data/knowledge-source/corpus/DOCUMENTS/code_driven_world_materialization_architecture.md`;
- `data/knowledge-source/corpus/DOCUMENTS/world_generation_and_turns.txt`;
- `data/knowledge-source/corpus/DOCUMENTS/player_character_generation.txt`;
- `data/knowledge-source/corpus/DOCUMENTS/character_parameters.txt`;
- `data/knowledge-source/corpus/DOCUMENTS/temporal_world_and_interruptible_activities.md`;
- `data/knowledge-source/corpus/DOCUMENTS/movement_locations_regions.txt`;
- `data/knowledge-source/corpus/DOCUMENTS/items_and_property.txt`;
- `data/knowledge-source/corpus/DOCUMENTS/npc_generation_profiles.txt`;
- `data/knowledge-source/corpus/DOCUMENTS/interface_ux.md`;
- `data/knowledge-source/corpus/DOCUMENTS/formulas.md`;
- `data/knowledge-source/corpus/DOCUMENTS/combat_system.md`.

Из них следуют обязательные границы: экземпляры создаёт код только из закрытых
approved candidate sets; пустой обязательный set — data gap; сохранённые
экземпляры не материализуются повторно; LLM не выбирает вне переданного набора
и не пишет в БД; factual consequences и d20 считает код; время продвигают только
утверждённые timed activities/traversal через единственного владельца;
narration следует после factual commit; предметы раздельно хранят
`owner/holder/controller/placement`.

### Definition и party instance

Scenario revision содержит допустимые candidate sets, graph/slot templates и
полный immutable набор declarative records: activity/check/consequence
profiles, NPC decision/schedule policies, movement bindings,
body/environment profiles, promise lifecycle policy, completion rules и
epilogue rules с exact schemas/versions/digests. Она не содержит runtime
handlers/evaluators либо выбранного для конкретной партии виновника, мотива,
скрытой последовательности, имени игрока или placement улик.

При атомарном создании партии code-owned materializer по seed/pins выбирает
конкретные player name/profile, culprit, motive, hidden sequence, participants,
graph bindings, clue placements и полный набор policy/profile refs. Эти
selections/pins сохраняются до opening screen и больше не выбираются. Таким
образом, «sealed definition» означает sealed пространство допустимых вариантов
и поведения, а «sealed party truth» — один persisted выбор из этого
пространства.

Разделение обязательное: schemas и policy/profile records утверждаются фазой 0
и их отсутствие блокирует party creation; runtime handlers и evaluators
подключаются существующим владельцем в фазе первого использования. Поздняя
фаза не вправе дописать отсутствующий semantic record в уже начатую scenario
revision.

## Фактическое поведение текущего прототипа

### Персонаж, старт и созданные сущности

`data/world-catalogs/novgorod/first-playable-v1/scenario.json` фиксирует:

- `scenario_id`: `lower_dvina_late_summer_open_water_v1`;
- профиль игрока: `player_boatman`;
- старт: защищённая высокая площадка у открытой воды;
- обязательную local scene и опциональную boundary capability.

`data/world-catalogs/novgorod/first-playable-v1/catalog.json` задаёт лодочника с
именами-кандидатами Иван/Микула, `health=100`, `energy=80`, `satiety=70`, без
conditions. Стартовые вещи: верёвка, рыба, льняная рубаха, шерстяная одежда,
ведро и мягкая сумка. Профиль `nov_role_merchant_clerk` в региональном
социальном каталоге существует, но имеет статус `usable_with_caution` и не
входит в current first-playable player candidate set.

`apps/game-server/src/infrastructure/postgres/first-playable/initial.js`
атомарно создаёт:

- party/change set/materialization run и content pins;
- две G5-сцены: high platform и landing, их baselines/G6/positions;
- player profile/body, party clock и player journey location;
- малую гребную лодку, предметы/контейнеры, placements и entity controls;
- snapshot и persisted session screen.

`apps/game-server/src/runtime/first-playable/projection.js:initialState`
фиксирует `location=high_platform`, `clock_minutes=0`, `npc=null`, inventory,
rope controls и лодку у landing. В state нет крушения, case truth, виновника,
мотива, NPC эталона, улик, evidence graph, обещания, completion или эпилога.

При первом приходе на landing
`apps/game-server/src/infrastructure/postgres/first-playable/plan-materialization.js`
лениво и однократно создаёт одного фонового рыбака, сеть, корзину и источник
воды. Онисим, Еремей, Ратша, Жданко и два фоновых рыбака отсутствуют.

### Распознаваемые действия и точные формулировки

`apps/game-server/src/runtime/first-playable-semantic-recognizer.js:RULES`
нормализует регистр/пробелы, но затем принимает только следующие regex-варианты:

| Команда | Поддерживаемые формулировки |
|---|---|
| Осмотр | `осмотр`, `осмотреться`, `осмотреться вокруг`, `осматриваюсь` |
| Разговор | `поговорить`, `поговорить с рыбаком`, `заговорить`, `заговорить с рыбаком` |
| Движение | `идти к берегу`, `спуститься к берегу`, `спуститься по скользкой кромке`, `вернуться на площадку` |
| Вода | `набрать 1000 мл воды`, `набрать литр воды` |
| Валежник | `собрать валежника`, `собрать связку валежника` |
| Сеть | `помочь с сетью`, `помочь рыбаку с сетью` |
| Отдых | только `отдохнуть 30 минут`, `отдохнуть 60 минут`, `отдохнуть 120 минут` |
| Передача | `передать веревку`, `передать верёвку`, с опциональным `рыбаку` |
| Лодка | `сесть в лодку`, `выйти из лодки` |
| Граница | `пройти к южной границе`, `перейти южную границу`, `вернуться через границу`, `продолжить пограничный переход` |
| Save | `сохранить`, `сохранить игру` |

Формулировки осмотра обломков/следов, лечения, переноски, обещания,
противостояния, обезоруживания, возврата пакета и завершения не поддерживаются.
Невидимая цель возвращает `semantic_target_not_visible`; неизвестная фраза —
`semantic_command_unrecognized`. В обоих случаях recognizer предлагает
`elapsed_minutes=0` и пустые mutations, а публичный runtime отвечает HTTP 409
`Действие сейчас недоступно.` Состояние не коммитится.

### Фактическая обработка хода

`apps/game-server/src/runtime/first-playable/command.js:applyCommand` — большой
сценарный `switch` с жёстко заданной прозой и прямыми мутациями snapshot:

- safe local move обычно не тратит время;
- рискованный спуск использует локальный hash-based deterministic roll, только
  survival modifier и DC 10; он не вызывает `@rus/checks-rng:executeCheck` и не
  использует полную формулу эталона;
- неудача спуска добавляет 5 минут, уменьшает energy на 2 и ставит `wet`;
- разговор занимает 5 минут;
- работа с сетью — 30 минут и energy −8;
- отдых напрямую увеличивает energy на `floor(minutes/10)`;
- `next.clock_minutes += elapsed_minutes` выполняется напрямую, без
  `packages/turn/src/temporal-advance.js:createTemporalAdvanceEngine`;
- body mutations не проходят через `@rus/body-state`;
- save имеет нулевое elapsed, но является обычным ходом с hardcoded
  acknowledgment; отдельного checkpoint-механизма эта команда не добавляет,
  потому что каждый успешный ход и так сохраняется.

Хорошая часть текущего item behavior: передача верёвки меняет
holder/controller, но сохраняет owner игрока. Работа с сетью требует, чтобы
рыбак держал/контролировал верёвку, а затем возвращает её.

### Что сохраняется и что восстанавливается

`apps/game-server/src/runtime/first-playable-public-runtime.js:
createFirstPlayablePublicRuntime` публикует `listScenarios`, `startNewGame`,
acknowledgment, `getPartyScreen` и `submitTurn`. Start принимает ровно один из
`start_text`/`scenario_id`; party ID детерминирован из request ID.

`apps/game-server/src/infrastructure/postgres/first-playable/repository.js`
читает последний snapshot и state versions. План хода собирают
`first-playable/turn.js:buildFirstPlayableTurnPlan` и `plan-*.js`; commit
выполняет `spatial-v3-combined-atomic-committer.js` с lock/CAS/idempotency.
Сохраняются snapshot, party clock, session screen, materialized entities,
placements/controls, conversation/activity rows, visible package и
presentation/narration-related rows текущего прототипа.

`test/spatial-v3/first-playable-public-runtime-postgres.test.js` подтверждает
на реальной тестовой PostgreSQL:

- start, look, move, talk, water, give rope, work, board и alight;
- resolved activity profile, 1000 мл воды, relation +1;
- сохранение owner верёвки и activity binding;
- interactions, visible packages и carrier attachments;
- CAS/atomic failure и idempotent replay без повторного roll/time;
- «restart» путём создания нового runtime object над той же БД и чтения
  persisted screen.

Это не restart реального server/browser process и не прохождение эталона.
`apps/game-web/test/game-web.test.js` проверяет безопасный рендер и кнопку
сценария, но не игровой путь. `test/e2e/browser-game-flow.test.js` использует
generic mocked flow и не связывает Lower Dvina, PostgreSQL и restart.
Исторический `docs/implementation/lower-dvina-first-playable/evidence/
browser-rehearsal-result.json` не заменяет актуальный исполняемый тест.

## Матрица требований эталона

Статусы относятся к способности пройти именно эталонный сценарий на проверенном
commit, а не к наличию похожего generic пакета.

- `READY` — существует и подходит без изменения;
- `PARTIAL` — канонический механизм существует, но требует расширения или
  сценарных данных;
- `CONFLICT` — текущее утверждённое поведение противоречит эталону;
- `MISSING` — требуемой способности или данных нет;
- `NOT_REQUIRED` — не требуется для первого полного прохождения.

| № | Область | Статус | Фактическое основание | Что требуется минимально |
|---:|---|---|---|---|
| 1 | Выбор сценария и создание партии | PARTIAL | `setup.js:scenarioCatalog` и `startNewGame` hardcoded для текущего boatman scenario | Фаза 0 утверждает definition; 1A создаёт internal party instance; 1B добавляет multi-scenario publication/dispatch; старый ID/results не менять |
| 2 | Профиль игрока — младший приказчик | CONFLICT | `scenario.json:player_profile_set_ref=player_boatman`; `catalog.json` даёт лодочника; `@rus/actors:validateActor` проверяет `skills` только как arbitrary object; Stage 11/12 проверяют диапазоны, но не exact six/full twelve | Через существующий `@rus/new-game` Stage 11/12 owner утвердить шесть характеристик и 12 skill levels/bonuses с `basis`/`absence_basis`; `validateActor` не использовать как единственный gate; canonical seed — Микула |
| 3 | Скрытая истина до первого хода | MISSING | `projection.js:initialState` не имеет case/truth state | Definition хранит candidates/rules; фаза 1A выбирает и атомарно фиксирует culprit/motive/sequence/graph bindings/placements до publication фазы 1B |
| 4 | Старт после крушения | CONFLICT | `projection.js:openingScreen` показывает высокую площадку; body ready; `clock_minutes=0` | Wreck scene, crash body и полный `GameTimestamp` с calendar pins/environment snapshot |
| 5 | Локации и локальная топология | PARTIAL | Есть high platform/landing и generic local traversal; нет wreck/camp/shed/storehouse | Фаза 0 утверждает profile/binding/slot candidates; 1A выбирает party bindings; movement materializes позднее |
| 6 | Онисим, Еремей, Ратша, Жданко, рыбаки | MISSING | `plan-materialization.js` создаёт одного generic fisher | Фаза 0 утверждает participant sets/knowledge rules; 1A выбирает party refs; materialize по мере сцен |
| 7 | Факты, восприятие, знания, ложь, память, гипотезы | PARTIAL | Generic `@rus/visibility-knowledge-memory` и NPC merge есть; current `plan-shared.js` пишет пустые hypotheses и hardcoded visible data | Подключить existing owner и persistence для player/NPC case facts; разделить statement от world fact |
| 8 | Улики и доказательные цепочки | MISSING | Нет clue/evidence aggregate, chain или threshold | Фаза 0 утверждает graph/slot и completion records; 1A выбирает graph bindings/placements и pins; evaluator подключается только в фазе 10 |
| 9 | Свободный ввод и нормализация намерения | CONFLICT | Помимо regex recognizer, current `@rus/turn:createTurnCommandRegistry().eligible()` сначала фильтрует definitions через `matches()`; при нуле `resolveRegisteredTurnCommand` возвращает `TURN_COMMAND_NOT_REGISTERED`, LLM вызывается только при `eligible.length > 1`; `resolve_mode` идёт до `load_context` | Фаза 2 расширяет `@rus/turn`: committed state → полный available action set → raw text + set в semantic resolver → exact `option_id`/`unknown` → code-owned availability/consequence/time/write; regex только exact fast path |
| 10 | Проверки d20 | CONFLICT | `command.js:applyCommand` считает локальный hash roll с неполной формулой | Вызывать `@rus/checks-rng:executeCheck` через `@rus/turn`, передав approved DC и все modifiers |
| 11 | Точное время и temporal boundaries | CONFLICT | `applyCommand` напрямую изменяет integer `clock_minutes`; нет full timestamp/calendar/environment и nearest boundary | Persist полный `GameTimestamp`; отдельный fire-rest занимает ровно 30 минут и одновременно запускает NPC advance |
| 12 | Состояние тела | CONFLICT | Старт 100/80/70 без crash conditions; energy/wet меняются напрямую | Crash effects и отдельный fire-rest: drying одежды + approved recovery через `@rus/body-state` |
| 13 | Предметы, контейнеры и owner/holder/controller | PARTIAL | `inventory.js`, `carrier.js` и rope flow уже разделяют права; нужных вещей нет | Материализовать пакет/сумку/печать; после disarm отдельно вернуть, проверить seal и сохранить controls |
| 14 | Лечение | MISSING | Есть generic activity/body packages, но нет treatment profile/команды/связки | Treatment activity/check/consequence records утверждаются фазой 0; handlers activity/body подключаются в фазе 5 |
| 15 | Многосторонняя переноска | PARTIAL | Activity participant records и `packages/turn` temporal carriers существуют; wounded-person flow отсутствует | Carry/activity/movement records утверждаются фазой 0; handlers participant/carrier/movement подключаются в фазе 6 |
| 16 | Расписания и самостоятельные действия NPC | PARTIAL | `@rus/npc-runtime` и `party_npc_spatial_schedules` существуют; current first playable их не использует | NPC decision/schedule records Жданко утверждаются фазой 0; runtime advance подключается в фазе 7 |
| 17 | Опасная сцена и обезоруживание | PARTIAL | `@rus/combat-health`, checks и item controls существуют; scenario policy отсутствует | Threat/disarm/temporary-restraint records утверждаются фазой 0; handlers NPC/checks/combat/items подключаются в фазе 8 |
| 18 | Обещания и обязательства | MISSING | Knowledge memory допускает fact kind obligation, но полного promise contract/status/persistence owner нет | Promise offer/surrender/activation record утверждается фазой 0; lifecycle handler подключается в фазе 4 |
| 19 | Полное и частичное завершение | MISSING | Нет objective/evidence/completion state или evaluator | Completion rules утверждаются фазой 0; deterministic evaluator подключается в фазе 10 после обязательных post-conflict facts |
| 20 | Эпилог из committed facts | MISSING | Нет terminal fact package/эпилога; current prose hardcoded до commit | Epilogue rules утверждаются фазой 0; safe terminal projection/post-commit narration handlers подключаются в фазе 10 |
| 21 | Save/restart и idempotency | PARTIAL | Atomic snapshot/CAS/replay и runtime-object restart готовы; case/activity checkpoints отсутствуют | Persist все case/activity/outcome facts и проверить restart в эталонных точках |
| 22 | Первый и последующие игровые экраны | PARTIAL | `projection.js` и game-web panels готовы, но показывают boatman slice | Wreck opening, case journal, body/obligations/evidence и safe terminal screen |
| 23 | LLM narration и hidden-data boundary | PARTIAL | Generic narration/visible packages есть; current hardcoded prose собирается в `applyCommand` до commit | Narration только после commit из safe visible package; hidden leak tests |
| 24 | Браузерное прохождение | MISSING | `browser-game-flow.test.js` mocked generic; `game-web.test.js` только landing/render | Реальный browser + public runtime + PostgreSQL путь и restart checkpoints |

Для первого полного прохождения **NOT_REQUIRED**: внешний переход через южную
границу, универсальный quest/legal engine, новые public commands и обязательное
боевое решение. Текущую boundary capability следует сохранить fail-closed, но
не включать в основной путь «Следа».

## Таблица канонических владельцев

В столбце persistence указано фактическое либо требуемое место владения.
«Нет» означает отсутствие сценарного контракта, а не разрешение создать
параллельную таблицу.

| № / область | Канонический владелец и публичный entrypoint | Persistence owner | Существующие тесты | Без изменения? / минимальное изменение | Запрещённая параллельная реализация |
|---|---|---|---|---|---|
| 1. Scenario/new game | game-server new-game pipeline; `createFirstPlayablePublicRuntime().listScenarios/startNewGame` | `first-playable/initial.js` + combined atomic committer | `first-playable-public-runtime-postgres.test.js`, `game-web.test.js` | Инфраструктура да; добавить отдельные versioned definition/binding без изменения boatman slice | Второй scenario server/API, reuse/redirect старого ID |
| 2. Player profile | semantic owner — `@rus/new-game/stages/stage-11:validateStage11PlayerCharacterOutput/shapePlayerCharacterGameProfile` и `stage-12:buildStage12CodePrecheck`; `@rus/actors:validateActor/normalizeActor` владеет только generic shape/bindings | `party_player_characters.profile` через Stage 24/25 party commit; current first playable — player profile/body rows из `initial.js` | `src/world/new-game-pipeline/new-game-pipeline-stage11-player-character.test.js`, `new-game-pipeline-stage12-player-character-audit.test.js`, `packages/actors/test/domain.test.js`, content/public runtime tests | Частично; Stage 11/12 уже проверяют ranges/basis, но не completeness exact six/full twelve; расширить их approved policy/content gate, `validateActor` не считать semantic admission | Hardcoded имя, роль только в prose, scenario-local skill validator или новый actor engine |
| 3. Hidden truth | code-owned world materialization; current public entry отсутствует | party runtime transaction/snapshot; отдельного case write contract нет | Materialization/content tests покрывают только current slice | Definition даёт candidates/rules; materializer фазы 1A атомарно пишет resolution до public screen | Concrete truth в definition, LLM selection или поздний re-roll |
| 4. Wreck start | first-playable scenario adapter; `projection.js:initialState/openingScreen` | `initial.js`, party clock/body/location/screen | public runtime PostgreSQL test | Нет; заменить только trace binding/baseline | Отдельный wreck runtime |
| 5. Topology/movement | `@rus/movement-routes:createMovementPlanner`; first playable traversal adapter | entity placements, player journey/location, route state | `packages/movement-routes/test/domain.test.js`, temporal carrier tests | Planner да; phase 0 defines candidates, phase 1A persists selected bindings | Teleport, scenario map store или поздний re-roll topology |
| 6. NPC roster | `@rus/npc-runtime`; first-entry materialization adapter | NPC profiles, placements, schedules, knowledge/memory через party runtime | `packages/npc-runtime/test/npc-runtime.test.js`, `reaction-options.test.js`, public runtime conversation test | Engine да; phase 0 defines sets/rules, phase 1A persists selected refs | Bespoke NPC store или поздняя смена selection |
| 7. Facts/knowledge/memory | `@rus/visibility-knowledge-memory:mergeValidatedKnowledgeMemory/mergeFormalKnowledgeMemory` | party NPC knowledge/merge state, visible packages; player case contract частичен | `packages/visibility-knowledge-memory/test/domain.test.js`, perception-reaction tests | Generic owner частично; расширить player/case bindings | Сценарные массивы `known_facts` как второй store |
| 8. Evidence chains | Ближайший владелец — visibility/knowledge; публичного evidence evaluator нет | Отсутствует канонический chain/completion write contract | Только knowledge tests; clue-chain tests отсутствуют | Phase 0 создаёт declarative graph/completion records у owner; 1A pins party graph/rules; phase 10 добавляет только evaluator/handlers | Quest engine, позднее добавление rules или смена party graph |
| 9. Intent | `@rus/turn`: расширяемые public `createTurnCommandRegistry` + `runTurnWorkflow`; target `createTurnAvailableActionSet` + `resolveTurnSemanticIntent`; current internal `resolveRegisteredTurnCommand` недостаточен | raw intent, full available-set digest, resolver/version trace, exact `option_id`/`unknown`, turn idempotency | `first-playable-semantic-recognizer.test.js`, `packages/turn/test/turn-workflow.test.js`, `packages/turn/test/bounded-decision.test.js` | Нет: current `eligible()` зависит от `matches()`, LLM не вызывается при нуле, `resolve_mode` предшествует `load_context`. Фаза 2 добавляет state-first full-set builder и semantic resolver; regex только optional exact fast path | Второй parser/registry, direct LLM routing или LLM-selected consequences/writes |
| 10. d20 | `@rus/checks-rng:executeCheck`, `@rus/turn` checks stage | roll audit/write set в party runtime | `packages/checks-rng/test/domain.test.js`, `packages/turn/test/turn-workflow.test.js`, public runtime roll test | Generic owner да; first playable должен перестать считать сам | Hash/randomizer в scenario command |
| 11. Time/boundaries | `packages/turn/src/temporal-advance.js:createTemporalAdvanceEngine`; `@rus/time-events-history`; `@rus/turn` | `party_clocks`, full timestamp/calendar/environment pins, activities/routes, combined commit | `packages/turn/test/temporal-advance.test.js`, `temporal-presentation-lifecycle.test.js`, time domain tests | Нет для adapter; materialize full `GameTimestamp` и подключить existing engine | `scenario_clock`, только `07:00` или прямой `clock_minutes +=` |
| 12. Body | `@rus/body-state:applyBodyStateChange/calculateBodyTimeEffectProposal/predictNearestBodyThreshold` | party body state в game-server transaction | `packages/body-state/test/domain.test.js`, temporal advance tests | Owner да; нужны crash/effect bindings | `scenario_body_state` или новая health formula |
| 13. Items/property | `@rus/items-property:planInventoryTransfer` и inventory access/topology API | `entity_placements`, `party_entity_controls` | `packages/items-property/test/inventory-foundation.test.js`, public runtime rope tests | Owner да; добавить approved item instances | Отдельные `package_owner`/inventory arrays |
| 14. Treatment | existing activity state machine + `@rus/body-state`; единого first-playable entry нет | timed activity/participants/resources + body state | temporal advance/body tests; scenario treatment tests отсутствуют | Phase 0: declarative treatment/check/consequence records; phase 5: handlers | `scenario_treatment`, поздний profile или мгновенное лечение в switch |
| 15. Carry | `packages/turn` temporal carriers + movement/items | carrier attachments, entity placements, activity participants | `packages/turn/test/temporal-carriers.test.js` | Phase 0: carry/activity/movement records; phase 6: handlers | `scenario_carry`, поздний profile или ручное перемещение NPC |
| 16. NPC schedules/actions | `@rus/npc-runtime:proposeNpcScheduleTransition/decideBoundedNpcAction`; turn perception-reaction cycle | `party_npc_spatial_schedules`, decision/perception/knowledge writes | NPC runtime tests, `spatial-v3-perception-reaction-cycle.test.js` | Phase 0: NPC decision/schedule records; phase 7: handlers/orchestration | Таймеры NPC внутри scenario switch или поздняя policy |
| 17. Danger/disarm | `@rus/combat-health` для harm, checks-rng для проверки, items-property для control | harm/injury facts и entity controls через combined commit | `packages/combat-health/test/domain.test.js`, checks/items tests | Phase 0: threat/disarm/restraint records; phase 8: handlers | Второй combat resolver, поздняя policy или прямой owner rewrite |
| 18. Promises | Ближайшие owners: social/knowledge/memory; полного публичного promise entrypoint нет | Канонический offer/check/active lifecycle store отсутствует | `packages/social-law/test/domain.test.js`, knowledge tests не покрывают lifecycle обещания | Phase 0: declarative offer/surrender/activation record у назначенного owner; phase 4: lifecycle handler/persistence | `scenario_promises`, поздний promise record или promise до/без успешной сдачи |
| 19. Completion | Scenario policy поверх committed facts; публичный evaluator отсутствует | Completion/outcome write contract отсутствует | Тесты completion отсутствуют | Phase 0: completion rules/schema; phase 10: минимальный evaluator после post-conflict facts | Completion сразу после disarm, поздние rules, quest engine или решение LLM |
| 20. Epilogue | `@rus/presentation` + `@rus/narration` после factual commit | safe visible/terminal package, narration job/result | `packages/presentation/test/presentation.test.js`, `packages/narration/test/narration-flow.test.js` | Phase 0: epilogue projection/narration rules; phase 10: handlers | Поздние rules или hardcoded hidden-aware prose до commit |
| 21. Save/restart | party-store/game-server; repository + combined committer | snapshots, state versions, idempotency/change sets, screens | public runtime PostgreSQL test, first-playable P16 tests | Infra да; расширить write/read trace state | Save-файл или вторая БД |
| 22. Screens | `@rus/presentation` и game-web renderers; `openingScreen/turnScreen` adapter | persisted session screen/visible package | presentation tests, `apps/game-web/test/game-web.test.js` | Shell да; новые safe projections/panels | UI-запрос hidden tables |
| 23. Narration/hidden boundary | `@rus/narration` flow + visible projection stage | visible context packages, narration jobs/results | narration flow, turn workflow, visibility tests | Generic owner да; убрать factual prose из precommit switch | Передача full snapshot/hidden truth в LLM |
| 24. Browser acceptance | game-web + public API + production composition | реальная test PostgreSQL party state | `test/e2e/browser-game-flow.test.js` и `game-web.test.js` недостаточны | Нет; добавить real scenario browser path | Mock-only evidence или ручной JSON как PASS |

## Противоречия, устаревшие утверждения и обходы

| Точный путь и символ/контракт | Фактическое поведение | Требование эталона | Влияние | Рекомендуемое минимальное решение |
|---|---|---|---|---|
| `data/world-catalogs/novgorod/first-playable-v1/scenario.json:player_profile_set_ref/start` | Лодочник на high platform | Микула-приказчик после крушения | Неверны персонаж, premise и стартовые данные | Новый versioned trace definition; текущий slice не переписывать задним числом |
| `packages/actors/src/index.js:validateActor/normalizeActor`; `packages/new-game/src/stages/stage-11-player-character/validation.js:validateAttributes/validateSkills`; `stage-12-player-character-audit/precheck.js:buildStage12CodePrecheck` | `@rus/actors` принимает arbitrary skills object; Stage 11/12 проверяют присутствующие ranges и basis только для высоких skills, но не требуют exact six/full twelve | Шесть exact характеристик и полный набор 12 навыков с approved levels/bonuses и биографическим основанием | Несогласованный профиль приказчика может пройти materialization и менять d20 | Фаза 0 утверждает полный profile record и расширяет существующий Stage 11/12 approved gate; четыре отсутствующих уровня/basis закрываются как data gap; generic `@rus/actors` не превращать в scenario validator |
| `apps/game-server/src/runtime/first-playable/setup.js:scenarioCatalog` | Hardcoded публикует один `SCENARIO_ID` | Отдельно выбираемый «След на Нижней Двине» | Одних JSON definition/binding в фазе 0 недостаточно | В фазе 1A создать internal materializer без catalog changes; в 1B добавить минимальный multi-scenario publication/dispatch, boatman entry не менять |
| `apps/game-server/src/runtime/first-playable/projection.js:initialState/openingScreen` | `clock_minutes=0`, ready body, high platform, нет truth/graph | Полный `GameTimestamp`, environment, последствия крушения и вся evidence basis committed | Невозможны воспроизводимые schedules/light/weather, restart-safe расследование и корректный экран | Atomic start фиксирует timestamp/pins/environment и sealed package до projection |
| `apps/game-server/src/runtime/first-playable/command.js:applyCommand` | Hardcoded switch сам считает время, body, risk и prose | Канонические owners, exact time, narration post-commit | Дублирование четырёх владельцев и риск расхождения | Оставить adapter тонким: предложения существующим owners и один commit |
| `apps/game-server/src/runtime/first-playable-semantic-recognizer.js:RULES` | Принимает только перечисленные regex и сразу выдаёт command | Raw text должен сопоставляться с полным закрытым набором доступных действий | Расширение regex не создаст свободный semantic ingress | Оставить regex только exact fast path внутри расширенного `@rus/turn`; отсутствие совпадения обязано перейти к semantic resolver, а не завершить ход |
| `packages/turn/src/command-registry.js:createTurnCommandRegistry/resolveRegisteredTurnCommand`; `workflow-stages.js:createTurnStageDefinitions` | `eligible()` фильтрует через `matches()`; при нуле выдаётся `TURN_COMMAND_NOT_REGISTERED`; LLM вызывается только при нескольких matches; `resolve_mode` выполняется до `load_context` | `committed state → full available set → raw text + set → exact option_id/unknown → code-owned consequence/time/write` | Назначение `@rus/turn` owner без расширения сохраняет regex/manual parser prerequisite | Фаза 2 меняет stage order и добавляет public `createTurnAvailableActionSet`/`resolveTurnSemanticIntent`; player-safe set строится до raw-text matching, selected option проходит membership/version/availability validation |
| `apps/game-server/src/infrastructure/postgres/first-playable/plan-shared.js:visibleEnvelope/sharedWriteSets` | Видимый пакет hardcoded, hypotheses пусты | Разделённые факты/восприятие/знание/гипотезы | Journal prose не может заменить модель расследования | Строить package из committed knowledge owner |
| `apps/game-server/src/infrastructure/postgres/first-playable/plan-materialization.js:buildMaterializationWriteSet` | Только generic fisher/net/basket/water | 4 ключевых NPC, 2 фоновых, clues/items | Нет causal actors и evidence | Approved slots и однократная materialization |
| `apps/game-server/src/infrastructure/postgres/first-playable/plan-conversation.js` | Один fisherman profile, interaction и hardcoded memory summary | Разные знания, ложь и память каждого NPC | Разговор не доказывает epistemic boundary | Использовать NPC/knowledge contracts для каждого profile |
| `data/world-catalogs/novgorod/first-playable-v1/manifest.json:boundary capability` | Manifest по-прежнему описывает boundary как blocked | `production-spatial-v3.js` активирует v3 release с boundary ready-for-runtime-acceptance | Документация/manifest не отражают текущую production composition | Не использовать manifest statement как runtime truth; синхронизацию вынести из сценарной реализации |
| `docs/implementation/lower-dvina-first-playable/README.md` | Фиксирует старые SHA/branch/worktree и прошлый acceptance | Аудит текущего `66864e…` | Устаревшие PASS могут создать ложную готовность | Считать файл историческим; acceptance подтверждать только current executable tests |
| `docs/implementation/lower-dvina-first-playable/evidence/browser-rehearsal-result.json` | Ручной/исторический rehearsal | Реальное браузерное прохождение current trace через PostgreSQL | Не является регрессионной защитой | Фаза 11: воспроизводимый browser test |
| `test/e2e/browser-game-flow.test.js` | Generic mocked server responses | Trace flow, real runtime, DB, restart | Название E2E переоценивает покрытие сценария | Не менять тест попутно; добавить профильный trace acceptance в финальной фазе |
| `test/spatial-v3/first-playable-public-runtime-postgres.test.js` | Пересоздаёт runtime object, но не server/browser process | Save/restart в десяти сценарных checkpoints | Доказывает persistence plumbing, не весь recovery contract | Переиспользовать fixture и добавить trace checkpoints по фазам |

### Дублирование владельцев и сценарные обходы

- `command.js:applyCommand` дублирует `@rus/checks-rng`, temporal advance и
  `@rus/body-state`; расширять этот подход для расследования запрещено.
- Hardcoded factual prose в `command.js` и `plan-shared.js` обходит
  post-commit narration/visible projection boundary.
- Fisher-only materialization и conversation write sets являются узким
  prototype adapter, а не NPC/knowledge engine. Копировать их по одному на
  каждого NPC нельзя.
- Rope flow корректно демонстрирует `owner/holder/controller`; добавление
  отдельных полей собственности для пакета/оружия создало бы второго владельца.
- Команда save не должна превращаться во вторую persistence подсистему: source
  truth уже сохраняется после каждого успешного commit.

## Что сохранить, заменить и не переносить

### Сохранить

- весь `lower_dvina_late_summer_open_water_v1`: ID, definition, binding,
  исторические результаты и regression-тесты boatman slice;
- `createFirstPlayablePublicRuntime` и существующие публичные
  scenario/new-game/turn entrypoints;
- production v3 binding, content pins/digests и fail-closed validation;
- combined atomic committer, CAS, idempotency и repository restart;
- однократную materialization и stable IDs;
- item placements/controls и правильную передачу rope holder/controller без
  смены owner;
- activity/conversation write layouts;
- safe visible package/presentation/narration infrastructure;
- generic владельцев checks, body, movement, NPC, knowledge и combat.

### Заменить или сузить для trace

- создать отдельные trace definition/binding приказчика после крушения, не
  заменяя и не затеняя boatman scenario;
- high-platform/landing slice на четыре утверждённые локальные сцены;
- fisher-only NPC binding на profiles эталона;
- exact regex-owner на state-first полный available action set + semantic
  resolver (`raw text + set → exact option_id | unknown`); regex оставить
  только fast path, а giant switch сузить до code-owned handlers;
- прямые integer clock/body/hash-roll mutations на существующих владельцев;
- hardcoded journal/prose на committed facts, knowledge и post-commit narration.

### Не переносить в полноценный сценарий

- действия с водой, валежником и сетью как обязательный основной путь;
- внешний южный boundary traversal;
- ready body лодочника и стартовую лодку capacity 2 как сценарную истину;
- generic fisherman как замена Еремею/Онисиму/фоновой группе;
- исторические evidence-файлы как критерий PASS;
- обязательное боевое решение кульминации;
- любые scenario-local clock/RNG/body/NPC/inventory/combat/save engines.

## Реальные блокировки и data gaps

**Закрываются только definition-фазой 0:**

1. `nov_role_merchant_clerk` имеет `usable_with_caution`; нет approved
   player-role/profile/name sets для младшего приказчика. Нет единого полного
   profile record с шестью характеристиками, 12 skill levels/bonuses и
   биографическим `basis`/`absence_basis` каждого уровня. Эталон не задаёт
   уровни Атлетики, Скрытности, Дальнего
   боя и Верховой езды, поэтому их нельзя домыслить materializer-ом.
2. Нет полной versioned scenario revision с participant/location/item,
   culprit/motive/hidden-sequence candidate sets; graph/slot templates;
   knowledge/rule/profile refs и exact versions/digests.
3. Нет validated timestamp/environment specification с calendar/epoch refs и
   допустимыми environment rules.
4. Нет полного immutable набора declarative activity/check/consequence,
   NPC decision/schedule, movement, body/environment, promise, completion и
   epilogue records/schemas с exact versions/digests. Отсутствующий record,
   неизвестный ref либо пустой обязательный option set блокирует definition и
   party creation.

Фаза 0 не выбирает имя игрока, culprit, motive, sequence или clue placements,
не подключает runtime handlers/evaluators. При этом schemas и immutable
policy/profile records обязательны именно в фазе 0; если у существующего owner
нет минимального declarative schema, это data/contract gap фазы 0, а не
разрешение отложить record.

**В фазе первого использования подключаются только runtime capabilities:**

- фаза 1A: internal materializer, atomic party persistence, полный
  `GameTimestamp`, environment snapshot и pins всех phase-0 records — без
  API/UI publication;
- фаза 1B: scenario publication/dispatch, safe opening screen и public restart;
- фаза 2: расширение `@rus/turn` для state-first full available set, semantic
  resolver, checks/time/body handlers;
- фаза 4: promise offer/check/active lifecycle handler и persistence;
- фазы 5–8: treatment, carry, fire-rest/schedule и threat/disarm handlers для
  уже pin-нутых records;
- фаза 10: evidence/completion evaluator и terminal narration handlers для уже
  pin-нутых completion/epilogue rules;
- фаза 11: real-browser/real-PostgreSQL acceptance.

До первого экрана materializer должен выбрать из definition и зафиксировать
player name/profile, culprit, motive, hidden sequence, graph bindings, clue
placements, весь policy/profile ref set и exact digests. Пустой обязательный
candidate/option set или missing record/ref блокирует создание партии. После
старта selections/pins не меняются; новый смысл требует новой versioned
revision и новой party. Ослабление фильтра и fallback запрещены.

## Архитектурные риски

- Рост `command.js` превратит first-playable adapter во второй turn engine.
- Сохранение case truth только внутри JSON snapshot без формального owner/write
  contract затруднит knowledge, restart, audit и completion.
- Запуск партии до sealing полного clue graph/candidate selections сделает
  последующие PR ретроактивными авторами уже начатой scenario revision.
- Запуск партии без полного immutable policy/profile set позволит поздним PR
  задним числом определить допустимые действия, NPC решения, consequences,
  completion или epilogue уже начатой revision.
- Универсальный quest/evidence engine до проверки одного сценария расширит
  задачу и создаст новую архитектурную границу без необходимости.
- Длинная команда лечения/переноски/угрозы без nearest boundary лишит игрока
  решения и нарушит единый temporal owner.
- Передача hidden truth в LLM ради «умной» реплики создаст прямую утечку.
- Перезапись текущего immutable scenario вместо нового versioned definition
  уничтожит воспроизводимость прототипных тестов.
- Schedule, treatment, carry и disarm, реализованные локальными полями
  first-playable state, продублируют уже существующие owners и PostgreSQL
  контракты.
- Утверждение роли приказчика без закрытия `usable_with_caution` data gap
  превратит спорную историческую категорию в неаудированную игровую истину.
- Хранение только локального времени `07:00` без calendar pins/environment
  сделает schedules, свет, погоду и temporal boundaries невоспроизводимыми.
- Сохранение current `@rus/turn:eligible(matches)` как prerequisite оставит
  псевдосвободный ввод даже при bounded decision: semantic resolver не увидит
  полный state-derived set при нуле matches. Regex допустим только exact fast
  path; consequence/time/write остаются code-owned.
- Completion сразу после disarm пропустит возврат имущества, проверку печати,
  подтверждение Онисима и временное решение по участникам.

## Независимый критик

Independent critic gate обязателен для фаз, меняющих persistence/DDL, публичные
контракты нескольких подсистем, границу code/LLM или critical orchestration.
Это фаза 0 при добавлении/изменении declarative schema, а также фазы 1A, 1B и
2–11 дорожной карты. Критик не должен быть автором изменения; blocking findings
устраняются до merge, а после содержательного исправления аудит повторяется.
Green CI не заменяет этот gate.

## Заключение

Проект пока не готов к первой runtime-фазе. Следующая самостоятельная задача —
**фаза 0: versioned scenario definition и validation**. Она утверждает только
narrative candidate sets/graph/slot templates, полный профиль приказчика и все
обязательные declarative activity/check/consequence, NPC decision/schedule,
movement, body/environment, promise, completion и epilogue records/schemas с
exact versions/digests. Она не выбирает party truth, не подключает runtime
handlers/evaluators/semantic resolver, не меняет `scenarioCatalog()` и не
объявляет сценарий выбираемым.

Только после принятия фазы 0 исполнима фаза 1A: internal atomic materializer без
API/UI publication, которая также pin-ит полный phase-0 policy/profile set.
Отдельная фаза 1B подключает готовый materializer к существующему scenario API
и opening screen. Фаза 2 должна расширить `@rus/turn` state-first semantic
contract; текущее `eligible(matches)` этим контрактом не является. Роль игрока
фиксирована как младший приказчик; name/profile выбираются из approved set, а
canonical seed выбирает Микулу. Полная последовательность 0, 1A, 1B, 2–11 и
порядок PR 1–13 зафиксированы в
`docs/plans/lower-dvina-trace-phased-roadmap.md`.

## Проверки аудита

- Проверены `git status --short --branch`, `git branch --show-current`,
  `git rev-parse HEAD`, `git fetch origin main` и divergence относительно
  `origin/main`.
- Выполнено точечное чтение перечисленных source/docs/tests и `rg` по
  контрактам; тесты, БД и полный `npm test` не запускались.
- Финальные документационные проверки и `git diff --check` фиксируются в
  commit/PR отчёте после завершения обоих документов.
