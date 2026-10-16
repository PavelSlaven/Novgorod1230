# M2c target v17: HTTP, Chromium и первый ход — run 61316

## Результат и граница проверки

**PASS: публичный start → opening → ACK → форма → свободный осмотр → повтор → reload.** Session `44295`, Node PID `61316`, 24 сентября 2026 года. PostgreSQL acceptance: **1/1, 0 skipped**, 239,706 с вместе с подготовкой БД и ожиданием ручных действий Chromium.

Использованы настоящий HTTP handler, game-web, official production root с явно выбранным v17 и отдельный Chromium через browser-harness. БД изолирована; operational item/actor approvals выданы только тестовым fixture. World Base и каталоги импортированы существующими владельцами. Live production, default release и исторические партии не переключались.

Проверен target `novgorod_spatial_v3_target_contract_approval_001`, сценарий `novgorod_pine_ridge_approach_v1`. Это один canonical start, а не обход всех 32 G4. Генерируемый G5, local/cross-G5 traversal, видимость NPC и новых предметов мира не проверены и этим результатом не разрешены. Из вещей доступны собственные известные предметы одежды. Выходы не раскрывались.

Ответы внешних моделей заменены детерминированным тестовым провайдером. Проверка подтверждает интеграцию и доставку, но не качество реальной модели или литературного текста. Writer копирует предоставленные факты; тестовый auditor не является production DATA/Contract approval.

## Первый экран: дословно

Текст DOM после автоматического ACK:

```text
ХРОНИКА
Русь
⚙
☀
ВЫ
Микула, лесной промысловик
МЕСТО
На подходе к лесной гряде
ДАТА
1.7.1230
Персонаж
Ноша
Люди
Путь
Карта
Летопись

НА ПОДХОДЕ К ЛЕСНОЙ ГРЯДЕ

Микула — лесной промысловик.

Вы не ранены; сил достаточно для работы; сильного голода нет.

нижняя рубаха; низкая кожаная обувь; штаны

ТВОЁ ДЕЙСТВИЕ
Enter — отправить · Shift+Enter — новая строка
Совершить
```

`textarea[name=raw_text]` и кнопка отправки доступны после ACK. Поле opening DTO `input_panel.free_text_enabled=false` само по себе не блокирует эту форму: game-web допускает её по состоянию доставки opening. Suggested actions отсутствуют.

## Ввод и результат: дословно

Ввод в Chromium с проверкой Unicode до отправки:

```text
Осматриваюсь вокруг, оставаясь на месте.
```

После успешного хода:

```text
ХРОНИКА
Русь
⚙
☀
ВЫ
Микула, лесной промысловик
МЕСТО
Окрестности.
ХОД ЗАНЯЛ
1 мин
Персонаж
Ноша
Люди
Путь
Карта
Летопись

Вы внимательно изучили обстановку.

ТВОЁ ДЕЙСТВИЕ
Enter — отправить · Shift+Enter — новая строка
Совершить
```

Ответ содержит `turn_number:1`, `state_version:1`, `screen_status:ready`, `movement:null`. После reload и «Продолжить» показан тот же текст. Отдельный GET screen также вернул turn 1. Изменение отображаемого заголовка места на «Окрестности.» не сопровождалось перемещением: normalized position rows не изменились.

## HTTP и измерения

Идентификаторы партии и запроса в таблице заменены обозначениями. Повтор использовал **тот же** raw text, request_id и idempotency_key.

| Запрос | HTTP | Chromium, мс | Вызов official root, мс |
|---|---:|---:|---:|
| POST `/api/v1/new-games` | 201 | 898,8 | 893,5385 |
| POST `/api/v1/parties/<party>/opening-ack` | 200 | 19,9 | 16,4843 |
| POST `/api/v1/parties/<party>/turns`, первый ввод | 200 | 699,5 | 692,5886 |
| Тот же POST, повтор | 200 | 172,6 | 162,6640 |
| GET screen после reload/«Продолжить» | 200 | 84,1 | 78,9992 |
| Отдельный GET screen | 200 | 66,8 | 62,1629 |

HTTP JSON success envelope и тела ответов сохранены в локальном evidence JSON. GET scenarios, settings и progress также вернули 200. Настройки провайдера в этот отчёт не перенесены.

Раздельных замеров catalog loading, generation, commit, projection и остатка внутри этих boundary durations нет. Они **не выводятся расчётом** из общего времени. Измерения модели ниже — только время выполнения детерминированного stub, не latency реального inference. Подготовка/import БД и человеческое ожидание входят в 239,706 с, поэтому это не latency старта игры.

## Фактические вызовы моделей

| № | Роль | Время stub, мс |
|---|---|---:|
| 1 | Opening gameplay narrator | 0,8859 |
| 2 | Opening gameplay narrator auditor | 0,3521 |
| 3 | World Knowledge query planner | 0,0130 |
| 4 | Turn step planner | 0,0299 |
| 5 | Turn gameplay narrator | 0,0341 |
| 6 | Turn gameplay narrator auditor | 0,0440 |

WK вернул разрешённый `NO_KNOWLEDGE_REQUIRED` для обзора уже предоставленного current context. Turn planner использовал существующее `visible_general_look`: direct observation, semantic moment/none, operations пусты. Новые факты и visibility не создавались. Router отдельно не вызывался. Повтор и reload не вызвали повторного планирования. Неизвестная роль в fixture приводит к ошибке; **generative materialization calls: 0** по полному перехвату вызовов.

## PostgreSQL readback

| Факт | До хода | После первого хода | После повтора |
|---|---:|---:|---:|
| Party state version | 0 | 1 | 1 |
| Clock whole minutes | 261120 | 261121 | 261121 |
| Clock state version | 1 | 2 | 2 |
| State snapshots | 1 | 2 | 2 |
| Materialization runs | 1 | 1 | 1 |
| G5 sites | 1 | 1 | 1 |

Полные body rows и journey position rows до/после совпали. Результат повторного submit глубоко равен первому; весь captured gameplay snapshot после повтора равен snapshot после первого хода. Видимые NPC пусты. Никакого нового G5, NPC или предмета этот осмотр не материализовал.

## Найденные дефекты и промежуточные попытки

Все промежуточные evidence JSON сохранены локально; их не следует считать успешной acceptance.

| PID / evidence suffix | Исход | Причина и наблюдение |
|---|---|---|
| 34868 | Start failed; первого экрана нет | `Client was closed and is not queryable`: public reader удерживал client завершённого activation lock. UI: «Действие временно недоступно. Попробуйте ещё раз.» Исправлено у v17 release owner: последующие чтения используют pool. |
| 65940 | Частичный smoke | Start/ACK прошли, но первый browser input был ошибочно закодирован как mojibake. Turn/retry: `TRACE_TURN_STEP_OWNER_PROFILES_INVALID`, DB без изменений, GET screen 200/turn 0. Этот ввод не считается проверкой заданной фразы. |
| 58312 | Exact-input failure | Точный Unicode input: `TRACE_TURN_STEP_OWNER_PROFILES_INVALID` до planner; HTTP 500 с `TEMPORARY_ACTION_UNAVAILABLE`. Повтор тот же, DB без изменений. «Продолжить» повторял pending turn; тест завершился ошибкой из-за отсутствовавшего отдельного GET screen. |
| 54824 | Fixture failure после admission fix | Target profile допущен, но fixture не знал WK planner: HTTP 503 `LLM_PROVIDER_UNREACHABLE`, `turn_commit_status:not_started`. GET screen 200/turn 0, DB без изменений. Это ошибка тестового провайдера, не production gate. |
| 64356 | Turn committed, presentation pending | Fixture не распознал turn narrator с JSON preamble и другим input shape. Turn 1 сохранён один раз; HTTP 200 `committed_presentation_pending`, повтор тот же, GET screen 200/turn 1. UI: «Факты хода сохранены; экран ещё готовится.» |
| 61316 | PASS | Все шесть реально запрошенных ролей обработаны; ready screen, replay и reload подтверждены. |

В owner-profile admission не добавлялся allowlist нового ID. Expected tuple приходит из release-selected loader после exact approved manifest/dataset verification; consumer сравнивает id, revision, canonical digest и artifact pin. Historical v16 branch сохранён. Проверки missing/malformed/wrong pin и изменённого profile payload отклоняют данные.

## Воспроизведение и evidence

```powershell
$env:RUS_TARGET_HTTP_BROWSER_SMOKE='true'
node --test tools/runtime-catalog-activation/test/target-catalog-successor-postgres.test.js
```

Fixture печатает local URL и ждёт browser-harness. После start/ACK/ввода, точного повтора и reload наблюдения отправляются в тестовый `/__smoke/finish`. Обычный запуск без этой env-переменной не поднимает ожидающий Chromium HTTP fixture.

Основной evidence: `%TEMP%/novgorod-target-http-smoke-61316.json`; direct-root evidence: `%TEMP%/novgorod-target-official-start-61316.json`. Первый содержит verbatim DOM, фактические HTTP status/body, роли и DB snapshots. Промежуточные файлы имеют те же prefixes и PID из таблицы. Это локальные диагностические артефакты, не operational approval.

Профильные тесты release/runtime profiles/generic owners: **20/20 PASS**. `architecture:check`, `git diff --check`, syntax изменённого fixture: PASS. Финальный Contract Audit проводится отдельно; этот playtest не утверждает готовность всего M2c или live activation.
