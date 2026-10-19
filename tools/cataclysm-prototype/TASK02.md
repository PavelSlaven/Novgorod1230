# Задание 02 — план, native-first и диагностика P4

Статус: сдача распорядителю; **не приёмка P3/P4 и не разрешение продолжать P3**.
Ветка `codex/cataclysm-p3-semantic`, [draft PR #770](https://github.com/PavelSlaven/Novgorod1230/pull/770), исходный HEAD `287babfeb7c9d608279ed7f4245fb700529997de`. Все команды/записи — внутри worktree `cataclysm-recovery/Novgorod`; основной checkout и внешние CDDA snapshots только читались. Модельные вызовы, Docker, sealed и merge не выполнялись.

## План и стратегия

- [План среза](../../docs/plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md): P2 требует живой процесс; P4 разделён на P4a/P4b. Manual/hourly native save, rollback и видимый восстановленный момент заданы явно. Поколения — только в точках сохранения; operation protocol/RNG state — отладка; warm host заморожен. Новые числа только от владельца: save ≤5 с, start/recovery ≤20 с, поколение ≤512 МиБ.
- Внесены B1, M-план-1…7 и Minor из §3 итогового вердикта: admission подмножества turn-step schema, owner mapping, социальные поля/clock policy до NPC/LLM, локальный Qwen и бенч до sealed, T19/T20, WK, слепая оценка прозы, промежуточная dev-проба, P6 с игрой владельца, платформенные/масштабные/лицензионные риски и сопровождение патчей. P3 — решающая проверка направления с `REVISE_APPROACH`.
- [Reuse Strategy](../../docs/plans/Novgorod1230_Cataclysm_Mechanics_Reuse_Strategy_2026-10-18.md) изменена **ровно в трёх разрешённых местах**: исходные строки 50, 63, 74. Остальной текст не менялся.
- [План следующего изменения кода](TASK02-CODE-PLAN.md) содержит native источники, файлы, тесты, порядок и развилки. Эти изменения кода сейчас не выполнялись. Уже исправленный в task01 `avatar_action::use_item` сохраняется, а не переписывается повторно.

Источники прочитаны целиком: Reuse Strategy и `accept-p4-plan-verdict.md`, `reuse-audit-verdict.md`, `save-mechanism-verdict.md` из `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/`. Карта native-first использована как навигация, сведения сверены с чистым upstream. [Native source inventory](evidence/task02-native-facts.md) фиксирует точные строки и пределы проверки.

## Расхождения для роли «4»

Reference-план фиксирует новое намерение D215/D216, но не меняет current production. Защищённые AGENTS/governance, CONTRACT_INDEX и active contracts не изменялись.

| Расхождение | Действующий источник | Что требуется решить до игрового пути |
| --- | --- | --- |
| Live outcome может исчезнуть после crash; прежний committed должен переживать restart | AI §14/§28.6; `turn_step_llm_contract.md:1446`; `npc_autonomous_decision_contract.md:1532–1548` | Разделить live-applied и saved/durable. Сохранённое не reroll/redecide; несохранённый хвост откатывается целиком |
| Проза может быть прочитана до save, хотя вход нарратора сейчас persisted | AI §13; `turn_step_llm_contract.md:129`; `situational_prose_requirements.md:19,207–211`; `npc_conversation_mode_contract.md:1868`; `temporal_world_and_interruptible_activities.md:166,1339` | Согласовать live-safe evidence, судьбу текста/речи/памяти при rollback и видимый восстановленный момент. Черновая dev-проба не становится production TurnScreen |
| Native save заменяет physical PostgreSQL/P16 owner для среза | AI §15/§23; `packages/party-store/MODULE.md:5`; `apps/game-server/MODULE.md:18,484` | Explicit field-level owner/cutover; не оставлять вторую физику или независимый semantic commit |
| Некоторые reference guides всё ещё требуют durable-first prose | Reuse Strategy исходные `:49,75`; Audit and Migration `:177–190`; Dice Discussion `:150` | Отдельно согласовать правки: задание разрешило только три места стратегии и план среза |

RNG вопрос решён: [Audit and Migration:317](../../docs/plans/Novgorod1230_Cataclysm_Audit_and_Migration_2026-10-18.md) не требует побитового replay. Это не отменяет сохранённые outcomes; `novgorod_rng_state` остаётся debug. CR #758 — issue, собственного требования побитового RNG в нём не установлено. Нового вопроса владельцу о RNG нет.

## Предложения по остальной стратегии — без правок

| Место | Проверенная родная опора | Предлагаемое уточнение |
| --- | --- | --- |
| Стратегия :45, обязательства | `src/missiondef.cpp:189,198–210`, `src/mission.cpp:63–67,850–860`, `src/npc_opinion.h:13` | Назвать native missions/deadline и owed; `social-law` оставлять лишь для непокрытого правового смысла, не второго числового долга |
| :59, цена речи | `src/npctalk.cpp:5673–5689`, `data/json/player_activities.json:1095–1102` | Сначала duration/ACT_GENERIC_EOC. Сейчас activity непрерываемая, duration требует проверки; не заявлять готовую речь или необходимость нового C++ заранее |
| :62, вне bubble | `src/npctalk.cpp:6830,6880–6893`, `src/game.cpp:1757–1759`, `src/overmapbuffer.cpp:1569–1572` | Указать адресный `u_run_npc_eocs` с unique_ids; не объявлять его непрерывной симуляцией поселения |
| :64, identity вещей | `src/item_uid.h:21–39`, `src/savegame_json.cpp:3195–3200`, `src/savegame.cpp:1644–1645,1850` | Указать native item_uid и точечные load/pickup/RLE gaps; второго общего реестра не нужно |
| План исходный :182 / видимый d20 | Dice Discussion `:113–121` в HEAD `287babfeb` уже запрещает второй бросок и fake d20 для normal_roll | Противоречие из карты устарело. Документ о кубиках не менять; общий d20 остаётся proposed только для доказанного gap |

## Ответы на открытые native вопросы

Все ответы — чтение pinned source, не заявка о выполненном gameplay-тесте.

- `npc::say` принимает строку, раскрывает теги и сам выбирает громкость (`src/npc.cpp:2077–2114`). EOC `u_make_sound` принимает текст и явную громкость (`src/npctalk.cpp:6383–6454,8632`). Это не доказывает duration/partial delivery; точный текст проверить отдельно.
- Save-effect в штатном EOC registry/документации не найден. `game_save` event идёт до записи (`src/game_io.cpp:744–746`), не является успешной квитанцией. Родной `game::save()` есть.
- Обычный сон/activity идёт через последовательные `do_turn`; час достигается (`src/do_turn.cpp:543–550,607–641`). Прямые перемотки времени не исследованы; runtime часовой тест ещё нужен.
- `mapbuffer::save` безусловно создаёт popup и при >500 ms вызывает redraw/refresh/pump_events (`src/mapbuffer.cpp:186–202`). Без UI runtime не проверен. Целевой live процесс использует уже существующий UI.

## P4: честное описание и таймеры

MODULE, README, P4 experiment/recovery results и исторический аудит исправлены: parent выполняет `g->setup()` с `load_world_modfiles()`, но не `load(save_t)`/actions/save. Старый warm замер исключал world-specific setup вопреки #760. Старый PASS снят как закрытие ворот; исходные сырые числа не переписывались. Порог ≤5 с на операцию был назначен исполнителем, не выведен из исходного плана; он отменён.

Диагностика использует родной `cata_timer` в отдельном патче; меняется только диагностический вывод, включая перенос `print_stats()` в конец probe. Это измерение существующего пути, не развитие host. Пять C++ файлов скомпилированы заново, остальные объекты взяты из существующей Release-сборки; полный clean rebuild не заявляется. Базовый source HEAD `287babfeb`, executable SHA-256 `2e665836e5ff7656b8b5338e382cfcfc60eadfa7e700113d956665c8da0c46ff`.

Три новых процесса чтения одного native save в WSL2, рабочие данные внутри Windows worktree (`/mnt/c/...`); page cache ОС не сбрасывался. По сообщению второго исполнителя во время замера Ninja/Clang не работали. Это **не повтор исторического окружения Linux filesystem и не p95**. Исторические **11,819 с** остаются старым неполным замером; новые значения не переименованы в его разбивку.

| Фаза, секунды | read-1 | read-2 | read-3 |
| --- | ---: | ---: | ---: |
| Полный процесс, внешний wall timer | 68,791 | 68,828 | 64,891 |
| `setup`, включая строки ниже | 60,610 | 60,830 | 56,626 |
| ↳ `load_world_modfiles`, включая packs/finalize | 60,473 | 60,718 | 56,480 |
| ↳ ↳ `load_packs` | 50,045 | 48,469 | 45,159 |
| ↳ ↳ finalize, включая consistency check | 10,425 | 12,245 | 11,318 |
| Native world load после setup | 2,616 | 2,983 | 2,641 |
| Paths/options + static data + world metadata | 0,185 | 0,164 | 0,188 |
| Остальное внутри init | 4,791 | 4,206 | 4,818 |
| Вне init: process/probe/output/teardown | 0,588 | 0,646 | 0,619 |

Вложенные строки нельзя складывать с их родителями. Полная разбивка, source identity, команды и logs — [evidence/task02-startup](evidence/task02-startup/). Все три reads exit 0 и прошли проверки полноты/вложенности фаз. **Лимит ≤20 с в этих условиях не выполнен**; live save ≤5 с и размер нового штатного поколения здесь не измерялись.

Предложение без реализации: сначала сравнить работу **уже существующего** native JSON/flexbuffer cache и файловое чтение на разрешённой целевой ФС. Новый cache не обоснован. Основная наблюдаемая стоимость packs — 45,159–50,045 с; даже идеальное её устранение оставило бы около 18,75–20,36 с полного процесса. Это верхняя оценка возможного выигрыша по измеренной фазе, не прогноз готовой оптимизации. Для причины отличия от старых 11,8 с требуется сопоставимый эксперимент, а не вычитание неудобных фаз. Смена размещения/подхода — только после решения распорядителя.

CR [#767](https://github.com/PavelSlaven/Novgorod1230/issues/767) исправлен на локальный Qwen через `RUS_LLM_SETTINGS_PATH`; явно записаны STOP и нерешённая идентичность #771. Остальной прежний протокол не считается разрешением новых вызовов.

## Хвосты задания 01

`origin/main` после fetch — `25e705074e6741944cc36d38ce05ac2cbc8f3fff`. Изолированный `git archive` и все временные файлы размещены внутри worktree; прежний бинарник ветки для main не использован.

- #776: на чистом main тот же failure 11 generated-отчётов. Команда: `node --test artifacts/2026-10-19/task02/main-repro-main/data/world-catalogs/novgorod/game-base-v1/scripts/generated-freshness.test.mjs`; exit 1, один тест FAIL. Это baseline, не исправлялся.
- #774: результат независимой сборки main будет внесён после завершения узкого `item_colony_ser_deser`.
- #777: Docker не запускался. Ждут четыре теста `test/acceptance/lower-dvina-trace-s1-first-entry-postgres.test.js` (restart/replay Phase10, independent NPC alternatives, provision fishing camp/S1, singleton entry/failed later S1) и `Chromium restores a saved party through production-v16 and PostgreSQL` из `test/e2e/lower-dvina-trace-browser-acceptance.test.js`.

## Проверки и пределы сдачи

План/стратегия/описания проверены на внутренние противоречия отдельным помощником; это source crosscheck, не назначенная приёмка. Итоговые фактические checks записываются после freeze. Ошибочный первый путь `documentation.test.js` не существовал; тест не выполнился, команда исправлена на штатный `npm run test:docs`. Первый docs suite обнаружил необходимость штатного пересчёта generated docs; PASS до него не заявляется.

Приёмка Sonnet high/Opus high не выполнена. Следующий шаг — «4 Арх-приёмка плана», затем отдельное решение распорядителя о коде и P3. #771 решает распорядитель; #772/#773, Qwen repeats и sealed T06–T12 в этом задании не тронуты. Слияния нет.
