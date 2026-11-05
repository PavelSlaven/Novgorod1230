# FINAL-988 — итоговый проход Opus 5.5 xhigh: приёмка и аудит контрактов

Задача: #988, следы людей, птиц и зверей на мягком грунте и снегу (строка 32 плана #906). Дата прохода: 2026-11-04. Проход единственный и только читающий. Записаны только этот файл и файлы в `F/opus-tmp/`. В `R`, `RP`, `W`, `P`, `PK`, `WT`, `U`, `CI` ничего не менялось, git-команд, меняющих состояние, не было, на GitHub ничего не публиковалось.

Обозначения — как в `F/opus-final-brief.md`.

## 0. Проверенные объекты

| Объект | Ветка и голова | Рабочее дерево | Отпечаток |
|---|---|---|---|
| `W` (копия `R`) | `claude/tracks-988` @ `a2fda0992` | 6 изменённых и 6 новых путей | SHA-256 файлов — `F/checks/W-sha256.txt` (хэш самого списка `cbc90881dbc5833c…`); на servak пары совпали — `F/opus-tmp/servak-sha-pairs.txt`; `git -C R diff HEAD \| sha256sum` = `6b299c7632e52194…` (локально) |
| `PK` (копия `RP`) | `claude/tracks-988-packets` @ `a213663a5` | 3 изменённых и 1 новый путь | `F/checks/PK-sha256.txt` (хэш списка `f41df0bc01c8fbab…`); `git -C RP diff HEAD \| sha256sum` = `69f4c6ff1b93288a…` (локально) |

В `W` есть `?? .t988/` — это папка задачи `P`, а не продукт. В коммит она не входит.

## 1. Аудит контрактов (AR §25, §25.1)

Срабатывают триггеры AR §25.1: free actions и восприятие (след как факт мира), Spatial (флаг местности), time (срок жизни поля), narration (вход рассказчика), final acceptance. Строки маршрутизации `R/AGENTS.md`: «spatial», «tooling / CI», «time / processes», «UI» (Narration), «gameplay / turn / LLM» — для `PK`. Строки индекса: `CONTRACT_INDEX.md:160` (Spatial/map), `:164` (Time/activities/processes), `:168` (Narration/UI).

```
CONTRACT AUDIT FINDING

audited_head: claude/tracks-988 @ a2fda0992 + рабочее дерево по F/checks/W-sha256.txt (12 путей)
scope: tools/cataclysm-prototype: native-ground-footprints.patch (src/creature.cpp, src/field_type.h, src/field_type.cpp, src/map_field.cpp), native-overlays.txt, dev-world/footprints.json, dev-world/README.md, wild-surroundings-allowlist.tsv, run-native-tests-ci.sh, test_apply_overlays.py, три замороженных теста; CHANGELOG.md; docs/playtests/2026-11-04_tracks-988_a2fda0992_d340.md
source_set: R/AGENTS.md (правило CDDA, «Всегда действующие правила», «Формула проекта»); AI §11, §13–§17, §28; PC §5, §9.1 (PRODUCT_CONSTITUTION.md:252); WR §24.1, §24.2; GS §26.2 (GIT_SAFETY_RULES.md:42–52); CONTRACT_INDEX §8.1 строки :160, :164; tools/cataclysm-prototype/MODULE.md:58; issue #988 «Механизм» и «Условие закрытия»
source_statuses: строки §8.1 указывают active-источники Spatial v3, G0–G6 и temporal contract для production runtime; инструмент tools/cataclysm-prototype по MODULE.md:58 не подключён к production runtime и не меняет active bindings, поэтому production-контракты Spatial и Time этим diff не затрагиваются; для пути CDDA действуют правило CDDA из AGENTS.md и правила проверок WR/GS
observed_implementation: Creature::on_move вызывает новый leave_ordinary_footprint рядом с родным leave_bloody_footprint; выбор направления — общая функция footprint_direction_index, которой теперь пользуются оба следа; условие — флаг местности SOFT_GROUND или открытый снежный покров (родной weather_manager::get_snow_depth_mm); семейство следа — по родному in_species (HUMAN, BIRD, иначе животное); срок — родные half_life «6 hours» и linear_half_life; осадки — новый параметр поля precipitation_age_speedup и обработчик, зарегистрированный по образцу родного field_processor_underwater_dissipation; мягкий грунт — родные copy-from и extend.flags на 14 типах местности; 12 полей с родным display_field; 12 точных строк допуска эпохи
required_by_active_contract: расширять родной механизм CDDA и для каждого нового указать проверенный родной (файл:строка) и причину отказа (AGENTS.md); один общий механизм без частных случаев (#988 «Механизм»); след о существе — только как факт мира (PC §9.1); живой прогон (WR §24.1, D340); точный допуск эпохи без префиксов (plan-ok-988.md:80–82)
target_if_any: нет
conflict: противоречий с active-контрактами нет; замечания — N3, N5, N6, N7 ниже
precedence_resolution: не требуется
first_bad_boundary: нет
correct_owner: tools/cataclysm-prototype (overlays, dev-world, допуск) — владелец прежний, второго владельца нет
required_code_delta: для слияния — нет
required_docs_delta: номер PR в CHANGELOG.md:4 вместо (#988) после открытия PR (N7)
required_tests: сверх выполненных — нет; на результате слияния в claude/fix04e-devint — проверки GS §26.2 п. 3 и п. 5
severity: P3
verdict: PASS_WITH_NOTES
```

```
CONTRACT AUDIT FINDING

audited_head: claude/tracks-988-packets @ a213663a5 + рабочее дерево по F/checks/PK-sha256.txt (4 пути)
scope: tools/prose-probe/src/packets.mjs (строки 94–95 и 217–218), tools/prose-probe/README.md, tools/prose-probe/test/tracks-988.acceptance.test.js, CHANGELOG.md
source_set: CONTRACT_INDEX §8.1 :168 (Narration/UI); PC §9.1 (PRODUCT_CONSTITUTION.md:252); WR §24.3, §24.4 (WORKFLOW_RULES.md:365–384); situational_prose_requirements.md (строки 19–30, 48, 57, 67, 69); F/out/CR-988.md:28–29 «Стенд»; F/in/plan-ok-988.md:84–89
source_statuses: Narration/UI — active; prose-probe собирает вход роли writer (tools/prose-probe/prompt-review-writer.md), значит действует WR §24.4
observed_implementation: для поля с суффиксом типа _n/_w/_s/_e к строке добавляется «; направление поля — на <сторона>»; правило общее для 12 новых следов и 4 родных кровавых; в пакете нет fd_-идентификаторов, координат, автора следа и причины исчезновения; сторона клетки по-прежнему берётся из location(object.direction) (packets.mjs:87–89)
required_by_active_contract: изменение проекции входа LLM-роли сдаётся с полными запросами до и после и проверяется стендом §24.3 по одному изменению (WORKFLOW_RULES.md:384); пространственные опоры относительно героя (situational_prose_requirements.md)
target_if_any: нет
conflict: стенд не проведён — F/out/DONE-988.md:68 (N1); сторона клетки теряется при английской записи восприятия — дефект существовал до задачи (N2)
precedence_resolution: WR §24.4 обязателен; plan-ok-988.md:89 перенёс модельный вызов за отдельный BENCH-OK-988, это откладывает стенд, но не отменяет его
first_bad_boundary: слияние PK в main без стенда
correct_owner: tools/prose-probe (пакет рассказчику) — владелец прежний
required_code_delta: до стенда — нет; по итогам стенда возможна смена формулировки (N4)
required_docs_delta: полные запросы до и после (F/deputy/checks/done/step8-*-writer.log) — в описание PR; номер PR в CHANGELOG.md:4
required_tests: стенд §24.3 по фактору «фраза ориентации» после BENCH-OK-988, на записи восприятия с русскими direction либо после исправления N2
severity: P2
verdict: PASS_WITH_NOTES — коммит и PR допустимы, слияние в main — только после стенда
```

## 2. Проверки

### 2а. Рамка правок — PASS

Сверено по `F/in/plan-ok-988.md:114–127` (раздел 8) и разрешениям нити:

| Путь | Разрешение |
|---|---|
| `tools/cataclysm-prototype/native-ground-footprints.patch` (??) | plan-ok-988.md:117 |
| `tools/cataclysm-prototype/native-overlays.txt` (M, +1 строка после `native-perception-capture`) | plan-ok-988.md:118 |
| `tools/cataclysm-prototype/dev-world/footprints.json` (??; 14 местностей, 12 полей) | plan-ok-988.md:119 |
| `tools/cataclysm-prototype/wild-surroundings-allowlist.tsv` (M, +12 строк) | plan-ok-988.md:120 и :80–82 |
| `tools/cataclysm-prototype/dev-world/README.md` (M, +8), `CHANGELOG.md` (M, +1) | plan-ok-988.md:121 |
| `docs/playtests/2026-11-04_tracks-988_a2fda0992_d340.md` (??) | plan-ok-988.md:122 |
| `tools/cataclysm-prototype/run-native-tests-ci.sh` (M, +3) | правка распорядителя, plan-ok-988.md:57; runner `W` побайтно равен runner `WT` |
| `tools/cataclysm-prototype/test_apply_overlays.py` (M, строка 83) | `F/in/answer-988-6.md:5–7` (замечание N5) |
| `novgorod_tracks_test.cpp`, `test-data/novgorod_tracks.json`, `test_tracks_988.py` (??) | замороженные тесты, plan-ok-988.md:41–52 |
| `PK`: `packets.mjs`, `tools/prose-probe/README.md`, `CHANGELOG.md` (M) | plan-ok-988.md:123 и :84–89 |
| `PK`: `tracks-988.acceptance.test.js` (??) | замороженный тест, plan-ok-988.md:50 |

Пути без разрешения не найдены. Файлы из списка «Не меняешь» (`apply-overlays.sh`, `native-capture/novgorod_capture.cpp`, `check_wild_surroundings.py`, прежние overlays, `AGENTS.md`, `docs/governance/`) не изменены.

### 2б. Родной CI — PASS

- `CI/status`: `exit=0`. Все файлы `CI/logs/*.exit` содержат 0. Исключение — `live-list.exit=32`: это число тестов от `--list-tests`, а не код провала.
- `CI/logs/slice.log`: строк с `Json error`, `ERROR` или `FAILED` — 0.
- `CI/logs/tracks.log:9` — `Filters: [novgorod_tracks]`; `:26` — `All tests passed (115008 assertions in 21 test cases)`.
- В клоне CI применён патч задачи. SHA файлов `novgorod_tracks_test.cpp` (`1c358395…`), `novgorod_tracks.json` (`2c26bed…`) и `footprints.json` (`e63009db…`) совпадают с `F/checks/W-sha256.txt`.
- `CI/status-before.txt` совпадает с текущим `git status --short` в `W`.

### 2в. Повтор проверок на servak — PASS

Окружение: Node v24.15.0, Python 3.13.5.

| Команда | Итог | Лог |
|---|---|---|
| `python3 tools/cataclysm-prototype/test_tracks_988.py` в `W` | 9 тестов OK, EXIT 0 | `F/opus-tmp/run1.txt:29–32` |
| `python3 tools/cataclysm-prototype/test_apply_overlays.py` в `W` | 4 теста OK, EXIT 0 | `F/opus-tmp/run1.txt:36–39` |
| `node --test` по трём файлам из plan-ok §9 в `PK` | 85/85, EXIT 0 | `F/opus-tmp/run1-node3.txt` |
| `node --test tools/prose-probe/test/*.test.js` (7 файлов) в `PK` | 172/172, EXIT 0 | `F/opus-tmp/run2-nodeall.txt` |

Числа совпадают с DONE и `F/deputy/checks/done/summary.log`. Хэш `git status --short --untracked-files=all` до и после прогонов: `W` — `3ae4f296…`, `PK` — `75f7909a…`. Он не изменился.

### 2г. Приёмочные тесты не ослаблены — PASS

- `sha256sum -c` по `F/in/acceptance/MANIFEST.sha256` в корнях `W` и `PK` и по `F/tests/out/MANIFEST.sha256` в корнях `WT` и `WT/.t988t/pk`: все строки `OK`. Оба манифеста побайтно равны.
- Все 4 замороженных файла есть в `R` и `RP` с теми же SHA.
- Хэш A10 изменился с `007f88cd…` (plan-ok-988.md:47) на `1c358395…`. Цепочка разрешений прослежена:
  - нить тестов исправила A10, причина — «приёмочный тест» (`F/tests/out/baseline-red.md:9–22`: возврат через `setpos`, A10 красный на базе);
  - заместитель распорядителя разложил исправленный файл (`F/in/tracks-988-7.md:40–44`);
  - DONE фиксирует новый хэш (`F/out/DONE-988.md:30`).
- `git -C R diff` по трём файлам рамки:
  - в `test_apply_overlays.py` ни одно утверждение не удалено, в ожидаемом списке на строке 83 добавлен `"native-ground-footprints"`;
  - в `run-native-tests-ci.sh` три добавленные строки совпадают с plan-ok-988.md:57;
  - в допуске — 12 новых точных строк `field … keep … dev-world/footprints.json` после строки 157, по одной на поле (plan-ok-988.md:80–82).

### 2д. Родные механизмы CDDA — PASS

Для каждого нового механизма в `F/out/PLAN-988.md` §1–§6 и `PLAN-988-2.md` указан проверенный родной механизм с файл:строка и причина отказа. С `U` (`git show 0d8843f:<файл>`) сверено 13 ссылок, все совпали:

| Ссылка | Что подтверждено |
|---|---|
| `src/creature.cpp:326–344` | `on_move` и его проверки; место вызова следа |
| `src/creature.cpp:375–412` | родной `leave_bloody_footprint`: работает только с `bloody_feet`, направление по умолчанию — `_s` |
| `data/json/field_type.json:17–41` | родные `fd_blood_footprint_*` — образец полей |
| `src/field.cpp:94–130` (линейный срок — 100–103) | `half_life` и `linear_half_life` |
| `src/field.cpp:170–203` | `add_field` не сбрасывает возраст, поэтому патч обновляет возраст сам |
| `src/field_type.h:203–204`, `src/field_type.cpp:301–302` | образец параметра `outdoor_age_speedup` |
| `src/map_field.cpp:534–540`, `:2270–2272` | образец обработчика и его регистрации |
| `src/map_field.cpp:277–302`, `:600` | `outdoor_age_speedup` работает только в `spread_gas`, для следа не годится |
| `src/map.cpp:4006` | `field_entry cur = fp.second` — копия (связано с #1017) |
| `src/weather.cpp:455–481` | родное смывание — только при `rains`, снег не стирает |
| `src/weather.h:216`, `src/weather.cpp:1127`, `:1160–1177` | `get_snow_depth_mm` — родной снежный покров |
| `src/map.cpp:3068–3078` | `has_floor` |
| `data/json/species.json:18` (BIRD), `:237` (HUMAN) | родные виды для трёх семейств |

Дублирования родного нет: кровавый след переведён на ту же таблицу направлений, родной механизм расширен, а не продублирован. Замечание — N3.

### 2е. Красная проверка окрестности (day) — PASS

Checker `check_wild_surroundings.py --mode day` остаётся с кодом 1, но только по допущенным причинам:

- Скрипт `F/opus-tmp/day_keys.py` (только чтение, вывод — `F/opus-tmp/day_keys.out`):
  - разобрал `F/deputy/checks/done/day.log.gz`: 171 169 диагностик, 13 ключей `[категория, список, id, имя]`;
  - набор ключей и количества равны `F/deputy/checks/q07/fullrows.log`;
  - Nudist (1862/1862) и звук CHK (31/31) точно совпадают с базой построчно;
  - остальные 11 ключей входят в категории A-lead-14 (water_murky, сообщение CHK, фраза Жирко) и A-lead-17 п. 11 (миссия, деревянная дверь, четыре «warm», finish waiting, Saving game);
  - `T_NULL_ROWS 0` — условие A-lead-14 п. 4 выполнено;
  - `RESULT PASS`.
- `F/deputy/checks/done/source-intersections.log`: для всех 12 категорий (4 из A-lead-14 и 8 из A-lead-17) найден родной источник, а пересечения с diff задачи пусты (`files=EMPTY []; ids=EMPTY []`). Оба условия A-lead-14 п. 2 доказаны.
- `day-submission-compare.log`: `SUBMISSION_EQUAL=True`.
- `wild-baseline-compare.log`: `EXACT_FAILURE_LINES_EQUAL=True`. Это 2 FAIL (#956) и 3 ERROR (отсутствует файл фикстуры), те же, что на базе.
- Новое поле `fd_human_footprint_n` встречается 1821 раз и допущено строкой допуска. Отказов по новым полям нет.

### 2ж. Игра и рассказчик — PASS с замечаниями

По плейтесту `F/out/2026-11-04_tracks-988_a2fda0992_d340.md` (побайтно равен файлу в `R`):

- **Рождение следа.**
  - Шаги героя дают 4 направления на траве, лесной подстилке и пороге ворот (строки 40–47).
  - Песок даёт след (59–64).
  - На сухом пне без снега следа нет (59–64), на деревянном полу полей нет (74–80).
  - ИИ зайцев оставил 14 полей `fd_animal_footprint_*` (82–92).
  - NPC Прокша оставил `fd_human_footprint_w` на `t_dirt` (183–233; граница — A-lead-19 п. 3, `F/deputy/A-lead.md:265`).
- **Снег.** Покров 1,2 мм подтверждён на ходе 28886583, след на пне родился на 28886584, его возраст на 28886586 — 13 (183–233).
- **Угасание.**
  - Сухой след исчез ровно через 6:01 (156–181).
  - Под дождём открытый след исчез к 31:01, а крытый контрольный дожил до возраста 1872 (94–106).
  - Под снегопадом — к 31:05 (114–124).
- **Сохранение.** Возраст следа до и после save/load одинаков (253–273).
- **Рассказчик.** В `F/deputy/checks/done/step8-*-before/after-*.log` и `writer-pairs.log` запросы писателю до и после отличаются только фразой ориентации и разбиением групп. След доходит до пакета с видом («след человека/животного/птицы») и направлением, без `fd_`, координат и автора.
- **Что видит рассказчик на servak.** На записи восприятия D340 у вещей и полей нет стороны клетки:
  - в `/srv/novgorod-work/worktrees/deputy/tmp/t3-checks/writer/*/after/` 138 строк «Рядом с героем» против 30 строк «К … от героя»;
  - например, `east_w/after/packets.json:44–46`: «Рядом с героем — след человека; направление поля — на юг.»;
  - в `animal_w/after/animal_w.req.txt:63` одиннадцать следов из разных клеток сведены в одну группу «рядом с героем».

  Это находка N2.

### 2з. Условия закрытия #988 (`gh issue view 988`: OPEN)

| Условие | Итог | Артефакт |
|---|---|---|
| После прохода зверя или человека по грязи, снегу или песку герой видит след с направлением; на твёрдом грунте следа нет | выполнено | плейтест 40–92, 183–233; грязь — `t_dirt` (NPC) и родной тест в `novgorod_tracks_test.cpp`; CI `tracks.log:26` |
| След гаснет со временем, дождь и снег стирают его быстрее | выполнено | плейтест 94–124, 156–181 |
| След доходит до рассказчика в пакете восприятия | выполнено (вид и направление), с замечанием N2 о стороне клетки | `RP/tools/prose-probe/src/packets.mjs:94–95, 217–218`; `step8-*-after-packets.log` |
| CR и аудит контрактов приняты; живой прогон (D340) | CR — `F/out/CR-988.md`, PLAN одобрен в `F/in/plan-ok-988.md`; аудит — этот проход (PASS_WITH_NOTES); D340 — плейтест | — |

## 3. Порядок двух PR

- Взаимной зависимости по коду и тестам нет:
  - `W` не трогает `tools/prose-probe`;
  - правило `PK` работает по суффиксу типа любого поля, включая родные кровавые следы, и не требует полей из `W`;
  - приёмочный тест `PK` использует свои кадры.
- `W` → `claude/fix04e-devint`. Голова devint пока `a2fda0992` (база `W`). Открытые PR в devint:
  - #1030 правит `wild-surroundings-allowlist.tsv`, но дописывает строки в конец файла (после строки 1034) и удаляет строку 306. Текстового конфликта с 12 строками `W` (после строки 157) не будет;
  - #1015 правит `CHANGELOG.md` — возможен тривиальный конфликт.

  Если к слиянию `W` голова devint сдвинется, на результате слияния нужны проверки GS §26.2 п. 3, живой прогон по п. 5 (изменение затрагивает ход) и повтор day. Если голова останется `a2fda0992`, дерево результата слияния равно дереву `W`, и достаточно CI и D340.
- `PK` → `main`: слияние — после BENCH-OK-988 и стенда (N1).
- Рекомендуемый порядок: `W` сливать первым, как только пройдут проверки GS §26.2; `PK` — после стенда. Обратный порядок технически допустим. При синхронизации `main` → devint возможен тривиальный конфликт `CHANGELOG.md`.

## 4. Находки

| № | Где (файл:строка) | Что не так | Что ожидается | Причина | Блокировка |
|---|---|---|---|---|---|
| N1 | `RP/tools/prose-probe/src/packets.mjs:94–95, 217–218`; `F/out/DONE-988.md:68`; `R/docs/governance/WORKFLOW_RULES.md:384`; `F/out/CR-988.md:28–29` | Изменена проекция входа роли writer, а стенд §24.3 не проведён: BENCH-OK-988 нет | BENCH-OK-988, затем стенд по одному фактору (фраза ориентации); полные запросы до и после — в описание PR; стенд — на записи с русскими direction или после исправления N2 | задание (plan-ok-988.md:89 вынес модельный вызов за отдельный BENCH-OK, а §9 его не требует) | **блокирует слияние PK**; коммит и PR не блокирует |
| N2 | `RP/tools/prose-probe/src/packets.mjs:87–89` (используется на :218); `R/tools/cataclysm-prototype/native-capture/novgorod_capture.cpp:80–81`; запись `/srv/…/tracks-988/.t988/tmp/B/live-988/captures/03-live-game-restart/perception.jsonl` (`"direction":"east"` 1903, `"north"` 1016, `"west"` 634 и т. д.) | `location()` знает только русские ключи, а запись нелокализованной сборки пишет `direction` по-английски (`direction_name`). Сторона клетки теряется у всех вещей и полей: в пакетах 138 строк «Рядом с героем», следы из разных клеток сливаются в одну группу. Дефект был до задачи; DONE-988:69 описывает его как «west/east», то есть занижает масштаб. Английские имена родных полей в пакетах («bloody footprint») — вероятно, та же причина (не уверен). | Пакет на настоящем фрагменте записи с английскими `direction` даёт «к западу от героя» и т. п.; либо запись пишет ключ, не зависящий от языка, и тест проверяет это | среда (сборка без локализации); масштаб в DONE — исполнитель | не блокирует; отдельный issue |
| N3 | `R/tools/cataclysm-prototype/native-ground-footprints.patch:25–42` (`default: return 2`), применение — :76 и :135 | Шаг по диагонали со сменой уровня (`ABOVE*`/`BELOW*` у `direction_from`) даёт след «на юг». Поведение унаследовано от родного `leave_bloody_footprint` (`U:src/creature.cpp:397`, умолчание `_s`). Рамп в моде нет, тестов на такой шаг нет. | Направление по проекции шага на плоскость либо записанное решение, что смена уровня вне рамки | исполнитель (не уверен: поведение родное) | не блокирует; отдельный issue |
| N4 | `RP/tools/prose-probe/src/packets.mjs:218` | Фраза «направление поля — на …» двусмысленна по-русски: в окрестности двора есть настоящие поля. Все поля с суффиксом — следы, поэтому «след ведёт на …» точнее. Не уверен. | Формулировка решается стендом N1 | задание (правило из одобренного PLAN §5) | не блокирует; решается внутри N1 |
| N5 | `F/in/answer-988-6.md:7` | Ответ разрешает правку «в строках 79–82», а список в `test_apply_overlays.py` занимает строки 79–83; правка на строке 83 — единственно возможное место | — | задание | не блокирует; issue не нужен: неточность в сообщении нити, не в репозитории |
| N6 | `F/in/acceptance/baseline-red.md` | Копия базы красных тестов у исполнителя — в прежней редакции (DONE-988t-2), без раздела о возврате A10, хотя манифест рядом уже с новым хэшем. Правильная редакция — `F/tests/out/baseline-red.md:9–22`. | Копия раскладки равна сдаче нити тестов | задание (раскладка) | не блокирует; issue не нужен: файл папки задачи |
| N7 | `R/CHANGELOG.md:4`, `RP/CHANGELOG.md:4` | Указан `(#988)`, а нужен номер PR | Номер PR после открытия | задание (номер до открытия неизвестен) | не блокирует |
| N8 | `RP/tools/prose-probe/src/packets.mjs:420` (на базе — :417) | Повторяющиеся следы в группе «Вещи вокруг» считаются фразой «Таких предметов было…», хотя след — не предмет (`animal_w.req.txt:63`). Дефект был до задачи. Не уверен. | Для полей — своя формулировка счёта; проверить на стенде N1 | данные (общая формулировка пакета) | не блокирует; отдельный issue или внутри N1 |

## FINAL-988: ACCEPT

- **Коммит `W` в `claude/tracks-988`:** да. В коммит входят ровно 12 путей из `F/checks/W-sha256.txt`; `.t988/` не коммитить.
- **Коммит `PK` в `claude/tracks-988-packets`:** да, 4 пути из `F/checks/PK-sha256.txt`.
- **PR `W` → `claude/fix04e-devint`:** открыть. Слияние — по GS §26.2. Если голова devint к тому времени отличается от `a2fda0992`, на результате слияния нужны быстрые наборы, живой прогон и повтор day.
- **PR `PK` → `main`:** открыть. Слияние — только после BENCH-OK-988 и стенда §24.3 (N1, блокирует слияние).
- **Порядок PR:** PR независимы. `W` — первым, `PK` — после стенда.
- **#988 и строка 32 плана #906:** закрывать после слияния обоих PR. Закрыть вручную со ссылками на оба merge-коммита: PR в devint сам issue не закроет. Сейчас — не закрывать.
- **В другие issue** (что не так, где, условие закрытия):
  1. N2 — сторона клетки и имена полей теряются при записи с английской локалью. Где: `tools/prose-probe/src/packets.mjs:87–89, 218`; `tools/cataclysm-prototype/native-capture/novgorod_capture.cpp:80–81`. Условие закрытия: тест пакета на фрагменте настоящей записи с английскими `direction` даёт русскую сторону клетки, либо запись пишет ключ, не зависящий от языка, и это проверено тестом.
  2. N3 — направление следа при шаге со сменой уровня. Где: `tools/cataclysm-prototype/native-ground-footprints.patch:25–42`. Условие закрытия: родной тест шага по диагонали со сменой z на мягком грунте даёт верное направление, либо записанное решение «вне рамки».
  3. N8 — «Таких предметов было…» для следов. Где: `tools/prose-probe/src/packets.mjs:420`. Условие закрытия: для полей — своя формулировка счёта и тест; либо закрыть итогом стенда N1. Не уверен.
  4. N4 решается внутри стенда N1, отдельный issue не нужен.

## Что не проверено

- Игру сам не собирал и не запускал; родной CI не перезапускал. Опирался на логи `CI/` и плейтест (бриф допускает повтор только Python- и Node-проверок).
- Модельный стенд не проводился (N1).
- `codebase-memory-mcp` не использовался: только прямое чтение, `grep` и `git show` по `U`.
- Локализация сборки игрока (Windows-демо) не проверена, поэтому масштаб N2 для живой игры игрока неизвестен.
