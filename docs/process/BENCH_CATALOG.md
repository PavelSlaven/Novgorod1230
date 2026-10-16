# Каталог стендов D41

**Статус:** справочник (REFERENCE / DOMAIN GUIDE), срез инвентаря на 2026-10-02. Это карта найденных артефактов, не план кампании и не подтверждение их актуального запуска или приёмки. Каждая задача, которой нужен модельный стенд, создаёт его у себя по D41; общей кампании нет (решение D77).

## Как читать каталог

- `D41-model` и `D41-model-bench` — обнаруженный стенд с вызовами модели или описание такого прогона. Сам факт наличия README, runner или результата не доказывает успешную гипотезу.
- `offline`, `deterministic`, `fixture`, `dry-run`, `candidate` и `preparation` — вспомогательная проверка или подготовка. Не считать её живым модельным прогоном.
- Связь с S-ID указана только там, где её подтверждает источник. Отсутствующий S-ID не означает, что гипотеза не нужна; запись не создаёт очередь работ.
- Условия, метрики и ограничения ниже — безопасные сведения из README, кода runner и агрегированных отчётов. Модель, параметры, WK и статус конкретного прогона могли остаться непроверенными. Исходный инвентарь исследования: `/srv/novgorod-work/fleet/tasks/iss-181-plan/out/bench-inventory.md`; машинный индекс 72 scope-записей: `/srv/novgorod-work/fleet/tasks/iss-181-plan/out/bench-inventory.jsonl`. Исследование не читало secrets, settings, raw prompts/responses и trace JSONL.

## Общие стенды на servak

| Путь | Что проверяет / подтверждённый предел |
|---|---|
| `/srv/novgorod-work/benches/S03-reasoning-repair` (S03) | Сравнение режимов reasoning для planner/combat_decider на repair; отчёт описывает 108 вызовов. Модель берётся из общих settings, результат JSON, resume не описан. Вывод относится только к этому профилю и набору. |
| `/srv/novgorod-work/benches/S05-conversation-truncation` (S05) | Обрезка conversation при разных лимитах interpreter/responder; 72 вызова описаны в отчёте. Результат **неопределённый**: необходимая нагрузка не создана. Модель из общих settings; JSON, без описанного resume. |
| `/srv/novgorod-work/benches/S08-determinism` (S08) | Повторяемость классификации при t=0. Зафиксировано 90 вызовов; seed не доказан, а production contract был валиден в 0/75 случаев. Не считать PASS или закрытием контракта. |
| `/srv/novgorod-work/benches/S08b-weapon-schema` (отдельная связанная проверка) | A/B проверка схемы оружия, агрегат по 75 случаев на вариант. Не объединять с S08; модель из общих settings, JSON, resume не описан. |
| `/srv/novgorod-work/benches/S13-judge-drift` (S13, offline) | Анализ дрейфа судей на 10 якорных оценках. Это анализ сохранённых оценок, не подтверждённый новый live run. |
| `/srv/novgorod-work/benches/S30-sufficient-threshold` (S30, offline WK) | Анализ сохранённых данных для порога достаточности; live model, embedding и reranker calls отсутствуют. Не результат текущего live WK запуска. |
| `/srv/novgorod-work/benches/S40-verbatim-quotes` (S40, deterministic) | Проверка дословности цитат сборщика; сообщён результат 15/15. Вывод ограничен этой выборкой; модели нет. |
| `/srv/novgorod-work/benches/rt-narr-blocked-outcome` | Проверка narration blocked outcome; в runner описаны JSON, temp 0 и max_tokens 512. Shared model helper, точный model ID и resume не подтверждены. |
| `/srv/novgorod-work/benches/rt-talk-voice` | Проверка голоса NPC в разговоре; README указывает temp 0, thinking off и max_tokens 1000. Есть версии результатов, но они не переоценивались; shared settings, JSON, resume не найден. |
| `/srv/novgorod-work/benches/rt-walk-planner` | Planner на синтетических данных без WK; README/runner указывают temp 0, max_tokens 8000 и JSON. Shared helper; model ID и resume не подтверждены. |
| `/srv/novgorod-work/benches/rt-items-take` | Кандидат runtime-проверки take; README и несколько версий результатов. Отдельная приёмка, идентичность модели и parity не установлены. |
| `/srv/novgorod-work/benches/rt-make-a1` | Семейство capture/helper для make A1. Безопасный обзор не установил README и статус D41; детали не проверены. |
| `/srv/novgorod-work/benches/rt-talk-v17-probe` | Интеграционный fixture с LLM stub, не live-model D41. |
| `/srv/novgorod-work/benches/needs-check-rt` | Детерминированный runtime harness, не модельный стенд. |
| `/srv/novgorod-work/benches/_lib` | Общий worker/adapter с ограничением двух сетевых слотов. Инфраструктура, не стенд; использует private settings, не фиксирует model ID стенда и resume. |

Исключения из общего каталога: `/srv/novgorod-work/prose-test` проверяет прозу. Агрегаты сообщают 75/75 и 180 вызовов, тогда как README заявляет 260; число требует сверки. `/srv/novgorod-work/prop-bench` — стенд свойств предметов, 15 предметов × 2 варианта; наличие результата не доказывает live-run или оценку. Для обоих точные параметры, parity и resume не подтверждены безопасным обзором.

## Task-local стенды и связанные артефакты

Пути относятся к `/srv/novgorod-work/fleet/tasks/<задача>/`. Указанные итоги — только сведения из README/агрегатов в срезе исследования, не текущая приёмка.

| Путь внутри задачи | Что проверяет / статус среза |
|---|---|
| `a1-physics/out/bench` | A1 physics, step3a–step3l; step3l — 12 fixtures × 3, production role runner/WK и per-cell resume; summary сообщает 36/36 ячеек. Точный effective model и параметры не установлены. |
| `iss-152/out/benches` | S31 empty-plan, S32 NPC situation fixture и S34 WK planner format. Для S34 описаны 20 случаев и JSONL `--resume`; live completion не подтверждён. S32 — fixture без model calls. |
| `iss-176/out/bench-S45` | S45 logical_necessity, 15 cases × 2 × 3; README сообщает 90/90 и blind оценки. Точное совпадение с oracle и приёмка данных не установлены. |
| `iss-178/out/benches/iss-178-properties` | Спецификация проверки свойств, 3 × 15 случаев; `model_run:false`, `model_pass:false`. Отдельный `out/d41-analysis` анализирует сохранённые серии, не live-run. |
| `iss-183/out/bench-iss-183`, `iss-183/out/bench-iss-183-v2`, `iss-183/out/bench-iss-183-v3` | Три версии матрицы 15 × 2 × 3. v1 сообщает 90 ответов и провал критического гейта; v2/v3 ожидают live run. v3 использует JSON checkpoint, не JSONL resume. |
| `iss-184/out/bench` | 90 dry-run запросов; live модель/параметры не подтверждены, resume не описан. |
| `iss-185/out/bench` | Матрица 135 dry-run строк; прежний live oracle отвергнут, новый live запуск зависит от integration/gate и не подтверждён. |
| `iss-190/out/bench` | Dry-run прошёл, live не выполнялся по integration report. |
| `iss-199/out/bench` | 12 cases × A/B × 3; ABC описывает 108 вызовов и JSON checkpoint/resume. Завершение production run не подтверждено. |
| `lines-b1/out/bench` | Проверка маршрута B1, 84 вызова; отчёт: A 36/42, C 39/42, named 33/33, false moves 0. Не runtime acceptance; model ID опущен. |
| `move-clarify/out/bench` | 14 фиксированных случаев × 3; smoke сообщает 14/14. Полный live run не подтверждён; JSON, resume не заявлен. |
| `names-gaps/out/bench` | 15 случаев × 3; README сообщает 45/45 на одной выборке. Ограниченный scorer; JSONL есть, resume не описан. |
| `npc-claims/out/bench` | NPC claims с production v17 port, WK grounder и JSONL; Postcode v8 отдельно от v6/v7. Успешная завершённость и resolved параметры не проверялись. |
| `npc-epoch-guard/out/bench` | Production-path fixture Qwen/Giga и несколько серий; отдельная серия сообщает 81 ответ. Единый resume manifest и точные resolved параметры не подтверждены. |
| `npc-identity/out/bench` | 13 случаев × 3 × 3 = 117 deliveries по README; JSONL, Giga env заявлены. Один NPC; профильная/cross-turn приёмка не следует из этого результата. |
| `npc-talk/out/bench` | Серии NPC-разговора с production fixture, JSONL/chunk resume и Giga WK env hook. Наличие нескольких серий не означает одинаковый статус или приёмку. |
| `npc-talk-code/out/bench/d41` | Offline dry-run 15/15; source_refs_checked=0, поэтому source gate не проверен. JSONL `--resume` с fingerprints; live результат не подтверждён. |
| `opening-audit/out/bench-opening-audit` | Frozen replay к N10; replay не имеет подтверждённого live результата. Не смешивать с прежним отчётом N10. |
| `prep-m3-wk/out/benches/prep-m3-wk` | 15-case preparation; все случаи FROZEN REF MISSING/NOT_READY. Giga/model arm только условный. |
| `routes-b2/out/bench` | 12 cases × 2 × 3; отчёт сообщает 72/72, token matches 60/60 и no-token 12/12. JSON без resume; не runtime/traversal acceptance. |
| `ui-guard/out/bench`, `ui-guard/out/bench-f03` | Narrator проверки: main сообщает 90/90; F03 78/78, но case09 semantic preservation FAIL. F03 JSONL resume; main JSON без resume. WK заранее собран, Giga retrieval не выполнялся. |
| `wk-gaps/out/bench` | Несколько WK-серий; новейшая phase4 без model calls, в более ранних/других фазах статус различается. JSONL/resume и Giga hook описаны для отдельных серий; выводы не объединять. |

### Остальные найденные task-local scope

Инвентарь также включал записи, не являющиеся подтверждёнными live D41 стендами. Пути ниже приведены относительно `fleet/tasks/`; классификация — из машинного индекса. «Не D41» значит только, что запись не подтверждает модельный прогон.

| Scope | Назначение по классификации инвентаря |
|---|---|
| `ap-o1-closure-2/out/bench`, `ap-o1-v5/out/bench`, `ap-o1-v6/out/bench-carry`, `ap-o1-v7/out/bench-carry-4e`, `ap-o1-v8/out/bench-carry-4f`, `data-o1a-fix/out/bench` | Проверки данных (data-check); не подтверждение live модельного стенда. |
| `ap-o1a-rel-2/out/bench` | Fixtures данных. |
| `ap-pass-labels/out/bench` | Проверка/ревью меток данных. |
| `entry-lines/out/bench` | Артефакт не классифицирован как D41. |
| `env-dynamic/out/benches` | Проверка пакета. |
| `fleet-tools-3/out/bench` | Unit test. |
| `iss-109-plan/out/bench-cases.json`, `iss-109-plan/out/bench-plan.md` | Кандидатные cases и план, не исполнение D41. |
| `iss-187/out/bench`, `iss-187-pilot/out/bench` | Детерминированные route/structure checks. |
| `line-names/out/bench-report.json`, `line-names/out/bench-v3-dev-report.json`, `line-names/out/bench-v3-report.json`, `line-names/out/bench-v3.mjs`, `line-names/out/bench-v4-report.json`, `line-names/out/bench.mjs` | Метрики, вычисляемые скриптом. |
| `m2c-accept/out/bench` | Unit test на fake world. |
| `needs-check-rt/out/bench`, `npc-season/out/bench` | Детерминированные runtime checks. |
| `news-221/out/bench` | Диагностика dry-run пакета. |
| `npc-talk/out/bench-design.md` | Заметка о дизайне; запуск не доказан. |
| `o1-closure/out/bench` | Кандидатная проверка данных. |
| `v17-channels/out/bench`, `v17-channels/out/bench-carry-4e`, `v17-channels/out/bench-carry-4f` | Смешанные offline/candidate harness; не приравнивать к live D41 без отдельного evidence. |

## Новый модельный стенд через fleet

Для новой задачи сначала проверь, требуется ли стенд по [D41, HOW_WE_WORK §11](HOW_WE_WORK.md#11-стенд-проверка-гипотезы-до-сборки-игры). Рабочий каталог — `out/bench/<имя>/` внутри задачи. Скрипт хранит результаты и checkpoint рядом с собой, используя путь от `import.meta.url`; абсолютные пути в `args` не указывай.

Создай `out/bench/<имя>/req-<запуск>.json` ровно с шестью полями. Например:

```json
{
  "script": "bench/<имя>/run.mjs",
  "args": ["--resume"],
  "cwd": ".",
  "needs_llm": true,
  "needs_wk": false,
  "timeout_min": 120
}
```

`script` задаётся относительно `out/`. Относительный `cwd` считается от каталога стенда, поэтому для запуска в нём укажи `"."`. Рабочую копию задачи `/srv/novgorod-work/worktrees/<задача>` указывай абсолютным путём, если стенд читает конфигурацию репозитория. `timeout_min` — от 1 до 240. `needs_llm` подключает model environment, `needs_wk` — Giga environment.

Поставь запрос командой:

```sh
/srv/novgorod-work/fleet/bin/bench-request "$FLEET_DIR/out/bench/<имя>/req-<запуск>.json"
```

Команда ставит задачу в общую очередь, печатает ID и завершается. Результат приходит в мост задачи блоком `RESULT-<задача>-bench-<id>` и запускает следующую сессию. Не опрашивай очередь; `--wait` используй только для короткого прогона. Передай `--resume` в args, если runner умеет продолжать после обрыва; продолжение реализует сам runner по своему checkpoint.

Прогон выполняется отдельным пользователем; сеть доступна только серверу модели, settings, secrets и файлы задач флота недоступны. При `needs_llm: true` прогон выставляет `RUS_LLM_SETTINGS_PATH` для использования runner-ом. Не печатай ключ, его base64/hex или путь к settings и не записывай путь в код: такой вывод переводит результат в карантин (`BENCH_OUTPUT_QUARANTINED`). Отдельный слот очереди общий; во время среза v17 модельные стенды ждут. Полученный результат проверяет ведущий, решение об acceptance остаётся за владельцем.

## Границы инвентаря

Срез охватил 72 scope-записи: task-local `out/bench*`, 15 каталогов `/srv/novgorod-work/benches/` вместе с `_lib` и исключения `prose-test`/`prop-bench`. Он не доказывает полноту по всему filesystem и историческим worktrees. Оценки качества, параметры текущего окружения, raw traces и runtime acceptance в рамках справочника не проверялись. Для конкретного повторного использования сверяй README/runner и актуальный связанный issue/CR.
