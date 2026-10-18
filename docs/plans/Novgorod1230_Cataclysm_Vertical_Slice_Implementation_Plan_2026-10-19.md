# Novgorod1230 × Cataclysm: план вертикального среза

**Статус:** `REFERENCE / DOMAIN GUIDE` — конкретизация **исследовательского плана**, а не ACTIVE-контракт, подтверждённая реализация, архитектурный cutover или разрешение на релиз.  
**Дата составления:** 2026-10-19.  
**Рабочий PR:** [#754 — аудит Cataclysm и план перехода](https://github.com/PavelSlaven/Novgorod1230/pull/754). Исходное состояние обсуждения: HEAD `788a9cc8f0347a23de0a72bf85f3d5957df4febf`, base `7de7c419010269a2c7b760ee6cd3eed79626ef50`.  
**Исследованный CDDA:** `CleverRaven/Cataclysm-DDA`, SHA `0d8843f1c500052c3e026e3da6f8edaf5e00b626`.  
**Граница:** P0–P6 из [основного плана перехода](./Novgorod1230_Cataclysm_Audit_and_Migration_2026-10-18.md). P7–P9 (CR, миграция, активация) **не входят** в этот срез.

## 1. Решение и цель

**Задача первого среза:** не построить весь Новгород и не портировать прежнюю игру на новый стек, а **на работающем движке доказать один сквозной причинный цикл**:

```text
свободное намерение игрока
→ существующая semantic boundary Novgorod (@rus/turn)
→ проверенная native операция и исполнение CDDA
→ фактический результат, игровое время и состояние NPC
→ согласованное durable поколение с operation identity
→ player-safe readback
→ существующие narration/presentation и отдельный журнал CDDA
```

**Главные четыре результата, необходимые для решения о пригодности CDDA:**

1. Novgorod1230 может направлять действия в **настоящую** симуляцию CDDA и получать readback, не запускающий вторую физику.
2. Общий semantic planner может интерпретировать **новые, не предусмотренные примерами** физически осмысленные попытки, не упираясь в whitelist demo-команд; недостающий общий native primitive становится явным техническим gap.
3. CDDA и минимальное семантическое состояние Novgorod согласованно сохраняются и восстанавливаются; повтор запроса не выполняет действие дважды.
4. Игрок видит подтверждённые результаты в прозе, на карте и в коротком журнале без раскрытия скрытого состояния, фантазий нарратора и посекундных LLM-вызовов.

Не выполнять интеграцию с текущим production runtime, не конвертировать существующие party/saves, не менять active bindings/profiles до отдельного P7. **Стоп при невыполнении любого критического условия**, а не обход проблемы описанием от LLM.

## 2. Установленные факты и неразрешённые гипотезы

| Тема | Подтверждено чтением исходников / актуальных владельцев | Ещё не доказано |
| --- | --- | --- |
| Сборка CDDA | Есть CMake-конфигурация и native тесты: [CMakeLists.txt](https://github.com/CleverRaven/Cataclysm-DDA/blob/0d8843f1c500052c3e026e3da6f8edaf5e00b626/CMakeLists.txt), [tests/CMakeLists.txt](https://github.com/CleverRaven/Cataclysm-DDA/blob/0d8843f1c500052c3e026e3da6f8edaf5e00b626/tests/CMakeLists.txt) | Воспроизводимая сборка выбранного SHA на целевой машине |
| Игровой ход | [`game::do_turn()`](https://github.com/CleverRaven/Cataclysm-DDA/blob/0d8843f1c500052c3e026e3da6f8edaf5e00b626/src/do_turn.cpp#L533-L707) обслуживает общий ход и вызывает `handle_action()` и `process_activity()`; ход — одна игровая секунда | Практичная программная граница управления без curses/SDL UI |
| Тестовые механизмы | [`tests/test_main.cpp`](https://github.com/CleverRaven/Cataclysm-DDA/blob/0d8843f1c500052c3e026e3da6f8edaf5e00b626/tests/test_main.cpp#L113-L162) создаёт тестовый мир; [`player_helpers.cpp`](https://github.com/CleverRaven/Cataclysm-DDA/blob/0d8843f1c500052c3e026e3da6f8edaf5e00b626/tests/player_helpers.cpp#L247-L289) имеет helpers для activity и NPC | Что тестовый harness воспроизводит **весь** игровой цикл, а не отдельно продвинутую activity |
| Физика и предметы | CDDA уже имеет map/pathfinding, body, inventory, activities, recipes, RNG, NPC behavior | Исполнение новых свободных действий без непропорционального C++ расширения |
| Сохранение | [`game::save()`](https://github.com/CleverRaven/Cataclysm-DDA/blob/0d8843f1c500052c3e026e3da6f8edaf5e00b626/src/game_io.cpp#L734-L783) последовательно пишет player, NPC/factions, dimension, карты и другие файлы | Atomic **общее** сохранение CDDA + Novgorod, crash recovery, exactly-once effects |
| Журнал | [`Messages::recent_messages()`](https://github.com/CleverRaven/Cataclysm-DDA/blob/0d8843f1c500052c3e026e3da6f8edaf5e00b626/src/messages.cpp#L434-L470) возвращает краткие **текстовые** сообщения, есть native history и сохранение | Безопасный инкрементальный доступ к журналу из выбранного host |
| Игра Novgorod | [`@rus/turn`](../../packages/turn/MODULE.md), [`@rus/npc-runtime`](../../packages/npc-runtime/MODULE.md), [`@rus/narration`](../../packages/narration/MODULE.md), [`@rus/presentation`](../../packages/presentation/MODULE.md), [`@rus/visibility-knowledge-memory`](../../packages/visibility-knowledge-memory/MODULE.md) — действующие отдельные владельцы | Их безопасная композиция с CDDA без двух часов, NPC arbiters, writers и двойного commit |
| Карта браузера | [`apps/game-web/src/features/map/render.js`](../../apps/game-web/src/features/map/render.js) выводит **условную** схему мест | Нативно обоснованная actor-safe карта CDDA в браузере |
| Журнал браузера | В `apps/game-web` есть [`renderJournalPanel`](../../apps/game-web/src/features/journal/render.js) | Подключение реальных разрешённых CDDA messages |
| Статус миграции | PR #754 — docs-only; отдельный runtime [PR #98](https://github.com/PavelSlaven/Novgorod1230/pull/98) был открыт как Draft при анализе | Согласованное переключение production; ни один PR сам по себе его не подтверждает |

**Вывод:** повторное использование CDDA обещает большой выигрыш в физике. **Основная неизвестность — seam между CDDA, семантикой и durable persistence.** Оценивать жизнеспособность по количеству готовых классов C++ нельзя.

## 3. Размер и содержимое среза

**Минимальная тестовая сцена, не историческая реконструкция готового Новгорода:**

| Состав | Ограничение первого игрового среза |
| --- | --- |
| Пространство | Один двор → участок улицы → маленькая торгово-ремесленная площадка; три связанные игровые зоны. Сначала разместить в **одном или нескольких native OMT** без собственной геометрии; выбор размеров зависит от проверенного mapgen |
| Персонаж игрока | Один actor; свободный текст как основной режим ввода |
| NPC | Три уникальных: ремесленник, торговец, стражник. ID и физическое состояние — native; не декорации и не три отдельные scripted AI |
| Вещи | Ориентир 6–12 ordinary предметов с осмысленным назначением, количеством, массой/контейнерами; один случай расхода или физического изменения |
| Поведение | Одно нативное занятие/обязательство NPC, одна реакция на обстоятельства, один свободный разговор и одна существенная новая decision boundary |
| Время | Перемещение, короткая речь, одна продолжительная native activity и одно прерывание; общий clock |
| UI | Свободный ввод, утверждённая проза, минимальная карта из CDDA, **отдельная** панель CDDA journal |
| Сохранение | Один действительный общий checkpoint и crash/retry/readback сценарии на временном мире |
| Игровой прогон | Ориентир 15–20 минут **наблюдаемой игровой демонстрации**, не ограничение длительности игровой сессии |

Исторически одобренные данные обязательны **до заявления о достоверном Новгороде 1230 года**. На P1 можно использовать явно помеченную временную fixture-карту. Не выдавать произвольную геометрию за точное расположение исторической улицы или здания.

**Сквозной UX-пример:** герой выходит во двор, идёт к ремесленнику через улицу, встречает прохожего, пытается взаимодействовать с дверью/вещью, произносит свободную реплику, наблюдает работу NPC, начинает длительное действие, сталкивается с реальным прерыванием, читает журнал и художественный итог, сохраняет игру и продолжает после загрузки. Это **проверочный маршрут**, а не scripted последовательность обязательных игровых команд. В другой формулировке и в другом порядке должны действовать те же общие механизмы.

**Обязательный контроль свободы:** кроме привычных «иду», «беру», «говорю» — незнакомая заранее парафраза и одна новая ordinary-трансформация/необычное использование существующей вещи. Отсутствие точного рецепта **не равняется физической невозможности**; если общего класса native исполнения действительно нет — фиксировать недостаток и минимально расширять CDDA либо останавливать квалификацию, но не вводить сценарный `switch`/template.

## 4. Границы ответственности и объём собственного кода

| Ответственность | Owner на целевом **изолированном** прототипе | Запрет |
| --- | --- | --- |
| Физическое время, moves, позиция, map, тело, инвентарь, RNG, activities, NPC locomotion/needs | **CDDA** | Старые JS writers тех же физических полей не вызываются в эксперименте |
| Семантика свободных намерений и индивидуальных открытых NPC решений | Existing `@rus/turn` / semantic owners Novgorod | Новый scenario-local planner, text-keyword whitelist, LLM расчёт точной физики |
| Социально-историческая память, знания и отношения | Novgorod — **только явно назначенные поля** | Дублировать CDDA faction/opinion/hostility/ownership без field-level mapping |
| Actor-safe perception | Native сенсоры CDDA + утверждённая player-safe/ NPC-safe проекция Novgorod | Отправлять в браузер или промпт всезнающий engine state |
| Save/readback и operation identity | Проверяемая общая generation boundary; C++ engine state + семантические факты согласованы | Второй mutable physical mirror, смешанные поколения, retry исполнения вслепую |
| Литературный текст | Existing `@rus/narration` только после confirmed/durable state | Посекундные вызовы, текст как источник физического результата |
| Краткая история | Native CDDA `Messages`; read-only фильтруемый adapter к имеющейся Journal-panel | Парсить локализованный лог как authoritative world events |
| Локальная карта | CDDA geometry/visibility/map memory → компактная read model → existing web | Второй spatial owner или самостоятельный browser LOS/fog |
| Экспериментальные C++ расширения | Только соответствующий CDDA owner после negative native gap-test | Форк ради переноса всей старой физики Novgorod |

**Кодовые границы для минимального diff:**

- Вначале использовать **existing CDDA tests и тестовые helpers** для проверки возможностей. Не начинать с полноценного headless сервера, нового IPC-фреймворка или переписывания `game::do_turn()`.
- Если штатного тестового пути недостаточно, добавить **узкий нативный harness** в CDDA и минимальные операции чтения/исполнения с явным lifecycle. Способ доставки (локальный процессный обмен/встраивание) выбирается **после** P2 measurement, не заранее.
- Затем сделать один тонкий adapter на стороне действующего composition owner Novgorod; не переносить в него нативные формулы. UI подключать только после подтверждения state/readback.
- Любые изменения public API, operation, persisted schema, ownership, LLM prompt/topology, narration policy требуют своих CR/Contract Audit в будущей реализации; этот документ сам ничего не активирует.

## 5. Зависимости этапов и порядок

```text
P0  рамка и доказательные критерии
 └─ P1  reproducible CDDA build + маленький мир
     └─ P2  native execution/readback + единое время
         ├─ P4  ранняя проверка общего checkpoint  [BLOCKER]
         └─ P3  свободные намерения + индивидуальный NPC
             `--> P5  approved prose + journal + карта
                    (только после закрытия gate P4)
                    └─ P6  сквозной игровой прогон и заключение
```

Нумерация **сохранена** по основному плану P0–P6; P4 начинается **сразу после P2**, может выполняться параллельно с P3 и блокирует P5/P6. Описанная ниже декомпозиция — единицы реализации и проверки, **не новый набор независимых подсистем**.

### P0 — Подготовить измеримый, изолированный эксперимент

**Вход:** открытый PR #754 как исследование; pinned исходники; актуальные governing/active contracts.  
**Работы:**

1. Зафиксировать точные SHA Novgorod и CDDA, ОС/компилятор, CMake flags, toolchain, тестовую платформу, версию и настройку игрового календаря.
2. Зафиксировать actor, map fixture, 3 NPC, объекты, начальные состояния, ограничение по историческому provenance, две альтернативные свободные формулировки и одну новую попытку.
3. Описать readback evidence: native position, inventory/item state, clock, NPC state, executed operation ID, snapshot identity, projected observations.
4. До реализации закрепить acceptance table §6 и crash matrix §7; выбрать измеряемые бюджеты времени/памяти на **конкретном hardware**, не выдумывать upstream производительность.
5. Ограничить запуск отдельным временным миром/профилем; не поднимать production БД и не открывать/конвертировать существующие saves.

**DoD / GO:** воспроизводимое описание тестового мира и проверки; один owner каждого физического поля; все ещё не доказанные способности обозначены гипотезами.  
**STOP:** задачи требуют менять active production bindings или использовать пользовательские сохранения до P7.

### P1 — Собрать CDDA и создать минимальный исторический fixture

**Зависит от:** P0.  
**Работы:**

1. Повторяемая сборка точного `0d8843f1…`: первоначальный кандидат CMake `TILES=OFF`, `CURSES=ON`, `TESTS=ON`; документировать реально выбранные параметры. В этой ревизии tiles требует SDL3 и не нужен для первого headless experiment.
2. Запустить релевантные native tests. Проверить независимую повторную сборку. При специфичной проблеме experimental SHA допускается сравнение со stable `0.I-1` как **диагностика**, не автоматическая смена архитектуры.
3. Создать изолированный тестовый мир через native тестовый механизм, JSON/mapgen; разместить героя, NPC, препятствия и ordinary вещи. Содержимое временного мира пока не выдавать за подтверждённую историческую карту.
4. Проверить ID сущностей, persistence native предметов и загрузку минимального участка.

**Evidence:** точные build commands/флаги и успешный лог, test exit code, native world readback.  
**DoD / GO:** сборка и инициализация повторяются; реальные объекты существуют в CDDA.  
**STOP:** нужный бинарник не собирается/не запускается на выбранной платформе и устранение требует смены задач на масштабный порт.

### P2 — Доказать настоящую native execution boundary

**Зависит от:** P1.  
**Работы:**

1. Воспроизвести движение героя в доступную клетку, отказ на реальном препятствии и одну предметную операцию. Сравнить `before/after` координат, `moves`, инвентаря/объекта, времени.
2. Провести одну штатную `player_activity` с корректным расходом времени и материалов. Проверить partial progress/stop.
3. Заставить CDDA самостоятельно продвинуть состояние **хотя бы одного** NPC в рамках настоящего игрового шага; проверить, что тест не вызывает вручную только `npc::move()` и не накручивает календарь в обход общего цикла.
4. Получить минимальный **программный** readback результатов и идентичностей без чтения экрана curses; определить минимальную boundary между game loop и native API.
5. Проверить одно настоящее прерывание движения/работы; причины прерывания поступают из CDDA, не из LLM и не из текста лога.
6. Измерить сложность/стоимость предлагаемого seam: число native patches, входные зависимости, startup/shutdown, отсутствие побочного UI-поведения.

**Evidence:** native test/harness run, true state transition и readback; воспроизводимая interruption fixture.  
**DoD / GO:** действие исполняется физическим CDDA; время, NPC и события мира продвигаются в **одном** игровом механизме.  
**STOP:** требуются отдельный JS-тик, ручное управление UI или масштабное переписывание ядра `do_turn`; без обоснования не разрабатывать full RPC/server.

### P4 — Ранний блокирующий checkpoint / retry / crash (после P2)

**Зависит от:** P2. Это **барьер принятия архитектуры**, не финальная полировка.  
**Гипотеза из основного плана:** изолированные **полные** поколения сохранения (CDDA physical files + обязательное semantic state + executed IDs), старое поколение неизменно до принятия нового; восстановление выбирает только полный принятый generation.

**Работы:**

1. Снять реальный список всех файлов, кэшей, autosave effects и побочных данных, которые пишет [`game::save()`](https://github.com/CleverRaven/Cataclysm-DDA/blob/0d8843f1c500052c3e026e3da6f8edaf5e00b626/src/game_io.cpp#L734-L783). Одного JSON персонажа недостаточно.
2. Проверить один **минимальный** изолированный механизм получения законченного поколения без in-place перезаписи уже принятого сохранения; измерить создание, проверку, recovery и затраты диска.
3. Связать с поколением минимальные, но обязательные semantic facts (например, произнесённую и воспринятую реплику или долг) и `operation_id`. Исключить отдельный независимо коммитящий mutable Node sidecar.
4. Убить процесс на разных стадиях и восстановить мир **до публикации** следующей прозы/квитанции. Проверить, что повторный `operation_id` не создаёт второй предмет, не тратит вторично ресурс, не повторяет речь и не перескакивает время.
5. Определить честный `pending/uncertain` исход, если система не способна доказать, применилось ли действие. Не обещать exactly-once поверх невыясненной crash boundary.

**Evidence:** fault-injection matrix с native state hashes/IDs, version markers, журнал тестов и стоимость сохранения на целевом диске.  
**DoD / GO:** после каждой аварии виден старый **или** новый целостный мир; непринятый эффект не выдаётся за durable; принятый не исчезает при retry.  
**STOP:** невозможность изолировать полные поколения или приемлемо быстро их восстанавливать; **не подменять** решение отдельной PostgreSQL физикой, 2PC, ledger или маркером поверх перезаписываемых файлов.

### P3 — Семантика свободных действий, NPC и речь

**Зависит от:** P2; P4 может идти параллельно, но зависимые durable последствия не принимаются без P4.  
**Работы:**

1. Подключить существующую единственную player boundary `turn_step_request_v1 → turn_step_plan_v1` из `@rus/turn`. Сохранить exact fast path для реально совпадающего смыслового класса и общий путь для остальных свободных заявок.
2. Передавать в CDDA **намерение и проверяемые параметры**, а не готовый success. Все physical preconditions/результаты и native RNG исполняются один раз.
3. Проверить эквивалентные, **не заложенные в код** формулировки, в том числе новый способ применить ordinary вещь. При отсутствии общего примитива — воспроизводимый gap; минимальный C++ extension только при доказанной необходимости.
4. Проверить один native NPC duty/activity и одну открытую индивидуальную decision boundary с NPC-safe контекстом. Не вызывать LLM на каждый NPC тик. Проставить field-level mapping для реально используемых `faction/opinion/hostility/ownership` и semantic trust/debt.
5. Проверить свободный разговор: actual speaker, слышимость/слушатели, точный текст, факт доставки и социальное последствие. Для короткой реплики **3 игровые секунды — обсуждаемая target baseline**, а не измеренное upstream правило; время списывает native owner.
6. Создать новый ordinary экземпляр предмета и NPC native средствами. Это не обещание полноценной генерации новых произвольных категорий без установленных механизмов.
7. Проверить риск/неудачу: нативная проверка не дублируется вторым `d20`; невыполнимое действие не становится возможным при хорошем броске.

**Evidence:** replayable тесты с alternate/unseen phrasing, native effects, NPC ID и собственными решениями, exact committed dialogue.  
**DoD / GO:** физическая семантика открыта за пределами demo-команд; LLM не пишет direct state, нет двойного arbiter, clock или RNG.  
**STOP:** закрытый action whitelist под маской semantic adapter; JS переопределяет native результат или создаёт нематериализованную вещь прозой.

### P5 — Один экран: проза, карта, журнал, приватность

**Зависит от:** P2 + P3 + **успешный P4** для durable published outcome.  
**Работы:**

1. Подключить существующий `@rus/narration` только к confirmed, player-safe, **durable** outcome после physical/semantic commit. Модель получает фактическую сцену, а не лог как truth.
2. Вызывать нарратора на смысловой границе: завершение / существенное **native** прерывание / явная просьба описать место. В ходе многосекундного процесса — 0 промежуточных prose calls, если не было boundary.
3. Показать **отдельный CDDA journal** через текущий `apps/game-web` Journal renderer. Сначала проверить native headless read access: `Messages::recent_messages` возвращает текст, не структурированные confirmed events. Фильтровать debug/hidden/не воспринимаемое; не реконструировать engine truth парсером строк.
4. Выбрать один самый узкий player-safe map transport: штатный viewport capture **если он реально доступен** или native клеточная проекция. Screenshot API требует SDL/TILES renderer и не является готовым headless transport. В браузере не пересчитывать LOS или карту мира.
5. Сохранить действующий UI invariant: `TurnScreen` только с **approved narration**; `FactualTurnDeliveryScreen v1` — ограниченное degraded recovery, **не** обычный «беспрозовый ход». Если нужны тихие microstep обновления, сначала отдельный scoped presentation proposal и audit; не обходить active contract.
6. Во время ожидания LLM, чтения прозы и UI-сетевых запросов время **не идёт автоматически**. Самостоятельные процессы, уже запущенные в CDDA, продвигаются только по явной и проверенной общей clock policy.
7. Ошибка/повтор narration никогда не исполняет физическое действие или реплику заново.

**Evidence:** UI screenshot/read model, журнал и narrator на той же подтверждённой границе, hidden-state leaks tests, счётчик вызовов LLM и сравнение native clock.  
**DoD / GO:** журнал, карта и проза согласованы; одна длительная активность не даёт десятки prose calls; нет выдачи hidden/недолговечных фактов.  
**STOP:** UI поддерживает только фальшивую карту, вытягивает правду из локализованного CDDA журнала или публикует unapproved/неподтверждённую прозу.

### P6 — Сквозная приёмка на временном мире

**Зависит от:** P1–P5; все critical gates закрыты.  
**Работы:** независимый воспроизводимый test run на целевом runtime, а не только unit tests/harness. Старт → свободный путь → препятствие → предмет → NPC и разговор → работа → interrupt → журнал/карта/проза → save → kill/reload → продолжение. Отклонение от предложенного маршрута не должно ломать механику.

**Evidence:** каждый проведённый **настоящий** gameplay run документируется по [WR §24.1](../../docs/governance/WORKFLOW_RULES.md) как отдельный санитизированный файл в `docs/playtests/` **в PR этого запуска**: exact SHA, ввод и видимый результат, mechanical outcomes, commit/persistence/readback, findings и verdict. Failed run не переписывать под green.

**DoD:** законченная acceptance matrix §6, реальные метрики, известные ограничения и решение `GO_FOR_P7 / BLOCKED / REVISE_APPROACH`. `GO_FOR_P7` **не означает** разрешение на production cutover.

## 6. Тестовая матрица, фиксируемая до реализации

| ID | Проверка | Наблюдаемое доказательство / допустимый исход | Этап |
| --- | --- | --- | --- |
| T01 | Перемещение, разные доступные направления | Координаты + native moves/seconds изменены CDDA; без JS path owner | P2 |
| T02 | Непроходимая дверь/стена | Нет телепортации; физическая причина доступна игроку | P2 |
| T03 | Поднять, переместить либо израсходовать ordinary вещь | Native item/inventory readback и баланс количества; одна операция | P2 |
| T04 | Длительная работа и самостоятельный мир | Activity расходует реальное время, NPC исполняет нативный ход в общем engine loop | P2 |
| T05 | Прерывание опасностью | Не выполненная часть движения/работы **не считается** состоявшейся, фактическое положение верно | P2/P6 |
| T06 | Разные фразы одного намерения | Та же применимая механика, без exact text matching | P3 |
| T07 | Новая ordinary попытка без готового demo-рецепта | Реальный native general primitive **или** честно подтверждённый blocking gap, не фальшивый success | P3 |
| T08 | Физически невозможная попытка | Причинный failure/partial, no fabricated entity и no magic `d20` | P3 |
| T09 | NPC activity и индивидуальный выбор | Native actor ID/состояние, actor-safe decision, нет LLM every tick | P3 |
| T10 | Свободная речь | Точная utterance, слышимость, elapsed, собственные последствия, 1 writer | P3 |
| T11 | Физическое и семантическое save/reload | Одно и то же поколение: положение, время, NPC, вещи, utterance, executed IDs | P4 |
| T12 | Авария/повтор до/после commit | Старое либо новое целое состояние, без второго расхода/движения/реплики | P4 |
| T13 | Нет прозы на каждый секундный тик | Длинная native activity → одна prose boundary при завершении, если без иных прерываний | P5 |
| T14 | Native журнал отдельно от нарратора | Время/короткие разрешённые сообщения, repeats, no debug/hidden leaks | P5 |
| T15 | Карта и туман войны | Видно только доступное actor; стены/ночь/неизвестное скрыты; UI не вычисляет истину | P5 |
| T16 | Ошибка narrate / delivery retry | Физика не исполняется повторно, approved-prose policy не обойдена | P5/P6 |
| T17 | Незнакомый порядок действий в живом прогоне | Не сценарный whitelist; тот же actor и те же механики, корректное persistence | P6 |
| T18 | Уход из active bubble и возвращение | NPC/вещи сохраняют identity, нет дублей; уровень offscreen fidelity честно ограничен | P6 |

T18 **не является** доказательством детальной удалённой экономики и жизни всего города. Тесты на 25/50/100/200 **одновременно активных NPC** и полноценный оффскрин-квартал остаются **последующими нагрузочными исследованиями**, не условием этого первого игрового среза.

### Измерения, чтобы не спорить по впечатлениям

Записывать: exact test host, компилятор, CDDA SHA; p50/p95 длительности native turn и action round-trip; величину и время save generation/reload; память; число LLM calls **по смысловым границам**, а не только total; latency/размер безопасного map payload; число recovery/duplicate/leak failures.

**Численные бюджеты установить в P0 до реализации** на целевой машине. В этом документе нет выдуманных «гарантированных 100 NPC» или произвольного SLA, будто это результаты тестов.

## 7. Fault-injection matrix (ранний обязательный P4 gate)

| Точка остановки | Допустимое наблюдение после recovery |
| --- | --- |
| До native effect | Подтверждено отсутствие действия; можно заново валидировать операцию |
| После native effect, но до общего durable generation | Восстановлено предыдущее **полное** поколение при доказанном отсутствии нового принятого; предварительное действие не выдаётся за сохранённое. Если исход неизвестен — `uncertain` и остановка |
| В середине последовательного native save | Ни смешанная карта/NPC, ни половина semantic update **не принимаются** как новый world |
| После сохранения CDDA, до связывания с semantic state и executed IDs | Новый mixed generation не открывается игроку; recovery выбирает только целое поколение |
| После atomic acceptance целого поколения, до UI receipt | То же native/semantic событие читается заново; повторный request не исполняет его вновь |
| После UI receipt / при ошибке LLM narrator | Уже принятое действие остаётся; повторный рассказчик не создаёт новый физический outcome |
| Во время прерванной долгой activity | Только фактически исполненная часть и её state; unfinished continuation не считается завершённой |

Успешный возврат `game::save()` **не считается** доказательством этой матрицы. Если гипотеза isolated complete generations на выбранной ФС не проходит, **P4 = BLOCK** и разработка P5/P6 не объявляется безопасной.

## 8. Риски и явные стоп-условия

| Приоритет | Риск | Быстрое опровержение | Действие при провале |
| --- | --- | --- | --- |
| P0 | Нет встраиваемой native execution boundary без UI | P2: реальное действие + full game loop без curses input | Пересмотреть seam; не строить второй engine или большой RPC |
| P0 | Mixed/crash-corrupt save generations | P4: fault tests нескольких native файлов и semantic state | Остановить интеграцию; переоценить способ изоляции/стоимость |
| P1 | Закрытый список разрешённых действий | P3: unseen equivalent и atypical ordinary transformation | Исправлять общий primitive/semantic boundary, не добавлять точечный `if` |
| P1 | Два физических writers или два NPC arbiters | P2/P3 field-level owner table + actual writes | Отключить конкурента в эксперименте |
| P1 | Некорректная речь, скрытое знание, двойной RNG | P3: exact audience, readback, roll ownership | Исправить owner/handoff, не замазывать прозой |
| P1 | Нативные сообщения раскрывают скрытые события | P5: hostile hidden-state probes | Безопасный фильтр у actor boundary; не отправлять сырой log |
| P1 | Псевдокарта/проза расходятся с CDDA | P5: сравнение native sight/position и public read model | Выбрать меньший working native-projection path |
| P2 | Исторически посторонние предметы или fake карта | P1 fixture provenance и data review | Оставить пометку «технический тест», не объявлять историческим результатом |
| P2 | Рост длительности native tick при плотной карте | P6 metrics; дальнейший crowd benchmark | Оптимизировать измеренный hot path уже после базового успеха |

**Анти-разрастание:** один проверяемый seam, один владелец поля, минимальный native adapter, существующие сервисы Novgorod. Не внедрять до доказанной нужды: новый event bus, отдельную БД физики, narrator scheduler, rematerialization engine, general AI-crowd-controller, новую сеть координат Земли или массовый перенос JS симуляции в C++.

## 9. Не входит в P0–P6 первого игрового среза

- Полная планировка Великого Новгорода, все концы/кварталы, население города, торговая экономика и многолетняя внепузырьковая жизнь каждого NPC.
- Полная планета Земля, глобальные географические швы/полюса, сложные дальние маршруты и морское/конное сообщение.
- Нагрузочный crowd benchmark сотен одновременно активных NPC; он следует после подтверждённого работающего фундамента.
- Полное историческое наполнение ассетов, все предметы, рецепты, занятия, обычаи и закон.
- Полноценный combat UX и унифицированная механика d20 для всех штатных действий CDDA; native combat smoke возможен, но не отдельный боевой проект.
- Production UI polish, новая архитектура портретов, переписывание narration, новый канал диалога и замена старых игр/сохранений.
- Production migration/cutover P7–P9. Нельзя незаметно активировать CDDA в `main` просто потому, что P6 прошёл.

Эти цели не отменены: данный срез **не предназначен** измерять всё будущее население, экономику, глобальную географию и игровую полноту.

## 10. Документация, решения и форма сдачи

**Единица исполнения:** маленькая задача/CR на один проверяемый риск или owner-boundary. Связывать её с P0–P6, фиксировать acceptance **до написания кода** (WR §24.2), не подгонять тесты под реализацию. Не расширять PR #754 случайным production code: текущий PR — исследовательская документация.

**Артефакты этапов:**

- P0: pinned experiment specification, native scenario fixture, заранее выбранные checks и performance budget.
- P1: reproducible build, world fixture, CDDA unit evidence.
- P2: native harness/adapter + truthful readback и interruption evidence; именно он показывает, годится ли выбранный seam.
- P4: crash/retry matrix и измеренная стоимость общего сохранения.
- P3: semantic/NPC/dialogue cases с unseen variant и field-level owner mapping.
- P5: один UI из native-safe карты, Journal panel и approved narration; leak/call-count tests.
- P6: реальный gameplay run и [обязательный playtest-report](../../docs/playtests/README.md), список блокеров, verdict для P7.

**Contract Audit:** по [AR §25.1](../../docs/governance/AUDIT_RULES.md) **implementation plan, опирающийся на proposed/target материалы, требует независимой проверки**. Перед merge этого планового изменения обеспечить read-only Contract Auditor с явным `audited_head`, статусами reference/active и проверкой отсутствия production activation. Реализация public API, persistence/LLM/owner handoff проходит **отдельные** scope audits. Этот файл не является собственным verdict auditor и не утверждает, что аудит состоялся.

Сверять active contracts по [CONTRACT_INDEX §8.1](../../data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md) и нормативному корпусу [AGENTS.md](../../AGENTS.md). Текущие `Temporal World v4`, `Spatial v3`, `@rus/turn`, `@rus/npc-runtime` и `TurnScreen` продолжают действовать **до явного одобренного cutover**; исследовательский документ не может сам переключить владельцев.

### Решение после P6

- **`GO_FOR_P7`** — все обязательные gates и реальные проверки прошли, ограничения задокументированы; запрашивается **отдельный** architecture CR + Contract Audit для миграции.
- **`BLOCKED`** — нет native seam, general physical primitives либо integrity гарантии; не начинать перенос production.
- **`REVISE_APPROACH`** — гипотеза оказалась слишком дорогой, требуется другой узкий CDDA host/seam или другой объём эксперимента с неизменными продуктовыми инвариантами.

**Никакого автоматического merge/cutover после P6.** Решение о production принадлежит отдельному P7–P9.

## 11. Исходные документы и проверяемые точки

- [Основной аудит CDDA и миграция P0–P9](./Novgorod1230_Cataclysm_Audit_and_Migration_2026-10-18.md)
- [Стратегия native reuse и реальные gaps](./Novgorod1230_Cataclysm_Mechanics_Reuse_Strategy_2026-10-18.md)
- [Жизнь NPC, толпа и ограничения населённого города](./Novgorod1230_Cataclysm_NPC_Daily_Life_Schedules_and_Behavior_Discussion_2026-10-18.md)
- [Нарратор и отдельный CDDA message log](./Novgorod1230_Cataclysm_Narration_Boundaries_and_Player_Event_Log_Discussion_2026-10-18.md)
- [Общее время, длинные activities и свободная речь](./Novgorod1230_Cataclysm_Time_and_Group_Conversation_Discussion_2026-10-18.md)
- [Карта и player-safe fog of war](./Novgorod1230_Cataclysm_Map_UI_and_Fog_of_War_Discussion_2026-10-18.md)
- [Движение, путешествия, физические маршруты](./Novgorod1230_Cataclysm_Movement_and_Travel_Discussion_2026-10-18.md)
- [Крафт, ordinary transformations и offline процессы](./Novgorod1230_Cataclysm_Crafting_and_Autonomous_Simulation_Discussion_2026-10-18.md)
- [Характеристики, броски, одна проверка](./Novgorod1230_Cataclysm_Character_States_Attributes_and_Dice_Checks_Discussion_2026-10-18.md)
- [Нативный бой и семантические действия](./Novgorod1230_Cataclysm_Combat_Turns_and_Semantic_Actions_Discussion_2026-10-18.md)
- [Нативная карта и гипотеза земной географии](./Novgorod1230_Cataclysm_Native_Earth_Map_Discussion_2026-10-18.md)
- CDDA [`do_turn.cpp`](https://github.com/CleverRaven/Cataclysm-DDA/blob/0d8843f1c500052c3e026e3da6f8edaf5e00b626/src/do_turn.cpp), [`main.cpp`](https://github.com/CleverRaven/Cataclysm-DDA/blob/0d8843f1c500052c3e026e3da6f8edaf5e00b626/src/main.cpp), [`tests/test_main.cpp`](https://github.com/CleverRaven/Cataclysm-DDA/blob/0d8843f1c500052c3e026e3da6f8edaf5e00b626/tests/test_main.cpp), [`game_io.cpp`](https://github.com/CleverRaven/Cataclysm-DDA/blob/0d8843f1c500052c3e026e3da6f8edaf5e00b626/src/game_io.cpp), [`messages.cpp`](https://github.com/CleverRaven/Cataclysm-DDA/blob/0d8843f1c500052c3e026e3da6f8edaf5e00b626/src/messages.cpp), [`npcmove.cpp`](https://github.com/CleverRaven/Cataclysm-DDA/blob/0d8843f1c500052c3e026e3da6f8edaf5e00b626/src/npcmove.cpp).

## 12. Статус выполнения на дату документа

**Это план после анализа кода и документов, не отчёт о работающем срезе.** На момент записи **не выполнялись**: сборка выбранного CDDA, тестовый native harness, headless bridge, интеграция LLM, общей БД/FS checkpoint, городская сцена, проверка journal transport, browser map, аварийные испытания и живой игровой прогон. Нельзя публиковать `PASS` по пунктам §6–§7 на основании одного чтения исходников.

**Первое исполняемое задание:** P0 зафиксировать P1/P2 эксперимент; затем собрать CDDA и доказать один полный native ход с программным readback. Следующее блокирующее задание — P4. Только после них расширять NPC, прозу и UI.

Документ **не изменяет** `AGENTS.md`, `docs/governance/*`, active contracts/`CONTRACT_INDEX`, `MODULE.md`, release bindings/profiles, код, persistent schemas, CDDA, сервер, данные или пользовательские сохранения. Разрешение на такие изменения он не выдаёт.
