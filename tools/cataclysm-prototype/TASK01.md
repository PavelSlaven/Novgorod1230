# Задание 01 — отчёт на остановке перед продолжением провода и sealed

Рабочая ветка — `codex/cataclysm-p3-semantic`, draft [PR #770](https://github.com/PavelSlaven/Novgorod1230/pull/770). Начальный checkpoint `819df27c0` отправлен в origin; по заданию закрыт [#769](https://github.com/PavelSlaven/Novgorod1230/pull/769) с [ссылкой на замену](https://github.com/PavelSlaven/Novgorod1230/pull/769#issuecomment-6257739945). Слияния и push в main не выполнялись. AGENTS/governance и основной checkout владельца не изменялись.

Приёмка ещё не проведена: промежуточная — Claude Sonnet high («2 Помощник ведущего (ревью)»), итоговая — Claude Opus high («4 Арх-приёмка <фаза>»). Source-аудиты и автоматические тесты не заменяют эти приёмки. Sol в этой схеме не участвует.

## Что сделано

| Пункт независимого ревью | Изменение и фактическая проверка |
|---|---|
| 1. P3/Python вне CI | `test:cataclysm-p3` включён в `npm test`; Windows запускает Python через существующий WSL. 32 Node + 19 Python — PASS. Отсутствие Python не маскируется пропуском. |
| 2. Импорты мимо exports | Импорты `packages/*/src` заменены публичными exports. В `@rus/turn` добавлен именованный `requestTurnStepPlanWithRepair`, обновлён MODULE. Прототип включён в `architecture:check`, проверка PASS. |
| 3. Preload и порядок overlays | Semantic patch больше не удаляет preload mode. В README/MODULE зафиксирован порядок всех шести patches. Чистый закреплённый upstream + overlays совпал с build copy и repo C++ sources: 31/31 файлов, zero diff. |
| 4. Потеря token evidence | Sanitizer сохраняет `max_tokens` и `usage`. Настройки читаются из явно заданного `RUS_LLM_SETTINGS_PATH`; один settings owner и одна P3 env-конфигурация доходят до production role runner. |
| 5. Только последний deaf listener | Проверяются оба native deaf listener; speech probe подтвердил heard IDs 2/3 и deaf IDs 4/5=false. Create/apply: 9/13 assertions — PASS. |
| 6. Литералы replay T09 | Счётчики semantic decision, provider и native operation измеряются на фактических вызовах, включая replay. Focused tests — PASS; sealed T09 не выполнялся. |
| 7. Комментарии-пересказы | Удалены пять комментариев. Правило владельца передано исполнителям кода дословно. |
| 8. Whitespace | Новые evidence нормализованы; для обязательных пробелов unified-diff context задано узкое исключение только для semantic patch. Сам применённый C++ проверяется отдельно. Полный diff от базы PR прошёл `git diff --check`. Исторические логи закрытого #769 не переписывались. |
| 9. Непроверенный native fix | Сохранение исходного nested `item_location` собрано и проверено. Финальные focused native tests: 11 cases / 98 assertions — PASS. Полная внешняя приёмка остаётся открытой. |

Коммиты, отправленные в origin: `6d36106a1` — режим/журнал и новый PR; `3c371b12f` — CI, exports и Qwen settings; `be12a4a8f` — P3 бюджеты; `5883a62fd` — провод/evidence; `4c83cd0de` — native fixes, launcher и smoke. Подробная хронология: [JOURNAL.md](https://github.com/PavelSlaven/Novgorod1230/blob/codex/cataclysm-p3-semantic/tools/cataclysm-prototype/JOURNAL.md).

## Windows запуск и сброс

Из корня worktree:

```powershell
powershell -ExecutionPolicy Bypass -File tools/cataclysm-prototype/run-p1-curses.ps1 -Smoke
```

Команда на этой машине копирует неизменный P1 save fixture в новый userdir, подготавливает runtime `data/gfx`, запускает настоящий curses, выбирает язык/мир, выполняет ожидание и движение, сохраняет игру и штатно завершает процесс. Финальный запуск: `p1-curses-20261019-062524`, exit 0; изменились все три ожидаемых файла — avatar save, dimension save и RNG state. Повтор команды даёт новую копию P1 и служит сбросом мира. Используется собранный локальный native build; это не установщик сборки на другой машине.

[PLAY.md](https://github.com/PavelSlaven/Novgorod1230/blob/codex/cataclysm-p3-semantic/tools/cataclysm-prototype/PLAY.md), [native-result.json](https://github.com/PavelSlaven/Novgorod1230/blob/codex/cataclysm-p3-semantic/tools/cataclysm-prototype/evidence/task01-native/native-result.json), [source-identity.json](https://github.com/PavelSlaven/Novgorod1230/blob/codex/cataclysm-p3-semantic/tools/cataclysm-prototype/evidence/task01-native/source-identity.json). Это стенд для агента; свободный разговор и обычные предметы через полную P3 цепочку владельцу ещё не сданы.

## Провод Qwen: остановка после одного ответа

Подготовлены три настоящих production role inputs: два planner и один NPC. Полные сообщения до/после override сохранены; содержание сообщений не менялось. Live использует тот же production P3 runner напрямую, без semantic repair и native apply.

| HTTP | ID из ответа | prompt_tokens | max_tokens | сумма | запас от объявленного 65536 | время |
|---:|---|---:|---:|---:|---:|---:|
| 200 | `qwen3.8-27b` | 11203 | 20000 | 31203 | 34333 | 6937 ms |

Настроенный и объявленный `/models` ID — `qwen3.8-27b-uncensored-w4a16-tp2`. Тождество этого ID и короткого ID из ответа не доказано. После первого POST runner остановился; два остальных не отправлены. Генераций 1, repair/retry/native writes — 0. DeepSeek и внешние/платные модельные API не использовались.

Окно 65536 задано распорядителем для этой конфигурации. `/models` подтвердил только обучающее `n_ctx_train=65536`; фактическое runtime окно API не раскрыл, `/props` и `/openapi.json` вернули 404. P3 input budgets теперь 45536 при output 20000 и 64536 при output 1000. Это metadata конфигурации, не tokenizer/enforcement входа. Успешный ответ доказывает выполнение данного запроса, а не максимальную ёмкость сервера.

[Полные запросы](https://github.com/PavelSlaven/Novgorod1230/blob/codex/cataclysm-p3-semantic/tools/cataclysm-prototype/evidence/task01-wire/requests.json), [live evidence](https://github.com/PavelSlaven/Novgorod1230/blob/codex/cataclysm-p3-semantic/tools/cataclysm-prototype/evidence/task01-wire/live-attempts.json), [сводка](https://github.com/PavelSlaven/Novgorod1230/blob/codex/cataclysm-p3-semantic/tools/cataclysm-prototype/evidence/task01-wire/live-summary.json). Блокировка identity: [#771](https://github.com/PavelSlaven/Novgorod1230/issues/771).

## Проверки и возникшие проблемы

- Native build завершён; focused 11/98, speech 9/13 assertions, настоящий curses smoke с save/exit — PASS. Контрольный набор имеет 160/161 cases и 164765/164767 assertions: падает старое ожидание `item_colony_ser_deser`, [#774](https://github.com/PavelSlaven/Novgorod1230/issues/774). Его не исправляли попутно и не выдавали за PASS.
- Первый nested test обнаружил SIGSEGV в fixture: flashlight вставлялся в уже надетый backpack. Порядок исправлен на «вложить, затем надеть». Старт curses падал из-за отсутствующего runtime `data/gfx`; layout и завершающий slash `--datadir` исправлены. Слепая очередь ввода заменена ожиданием состояний меню. Все неуспешные попытки сохранены в dated artifacts.
- В build copy обнаружился пропущенный preload hunk. Он внесён, бинарники пересобраны, затем независимо сравнены все 31 исходных файла с чистым upstream и шестью overlays. Хеши в evidence относятся к финальной сборке.
- Ранний `npm test` остановился на размещении локальных artifacts; они перенесены в датированную папку и добавлен manifest. После исправления итоговый полный `npm test` остановился на 11 world-catalog report JSON, отличающихся от fresh rebuild: [#776](https://github.com/PavelSlaven/Novgorod1230/issues/776). Каталог game-base-v1 не имеет diff от базы PR; данные под результат теста не переписывались.
- Оставшиеся стадии выполнены отдельно: shadow 8/8, cutover 4/4, integration 65 PASS / 20 skipped, architecture, P3 32 Node + 19 Python — PASS. Acceptance: 1 PASS / 4 FAIL; browser E2E: 2 PASS / 1 FAIL. Пять ошибок требуют недоступный Docker Linux daemon; CLI есть, `docker info` подтверждает отсутствие pipe `dockerDesktopLinuxEngine`: [#777](https://github.com/PavelSlaven/Novgorod1230/issues/777). Docker не устанавливался, образы не загружались. Полный npm suite не объявляется успешным.
- `docs:generate`, `docs:check` и diff whitespace check — PASS. CBM Verify использован; 32 проверенных пути имели изменённую metadata, CPP test macros — partial coverage. Выводы сверены прямым чтением, включая все пропущенные строки.
- При полном npm suite `TMP/TEMP/TMPDIR` не были перенаправлены: тесты могли использовать стандартный системный temp. Основной checkout не менялся; отдельная внешняя очистка не проводилась. Для оставшихся стадий temp перенаправлен в worktree; результаты сохранены в `artifacts/2026-10-19/task01/suffix-test-temp/`.

## Следующий шаг и решения распорядителя

1. Подтвердить либо исправить соответствие настроенного Qwen ID и `response.model` в #771; только после решения завершать оставшиеся диагностические вызовы.
2. До sealed закрыть missing native safety interrupt/follow-up T09 ([#772](https://github.com/PavelSlaven/Novgorod1230/issues/772)) и согласовать one-repeat protocol с двумя возможными NPC repairs ([#773](https://github.com/PavelSlaven/Novgorod1230/issues/773)). Зафиксировать независимые held-outs и физические PASS predicates, включая T10 hearing/time/social outcome.
3. [SEALED_PLAN.md](https://github.com/PavelSlaven/Novgorod1230/blob/codex/cataclysm-p3-semantic/tools/cataclysm-prototype/SEALED_PLAN.md): T06–T10 — предложены 9 вариантов × 3 reset = 27 базовых вызовов; 54 при одном repair, условно 57 по нынешнему NPC path; hard cap 72. Это расчёт для single-step intents, не готовое разрешение. T11 — согласованное save/reload; T12 — crash/retry без повторного эффекта. Их отдельный поток и бюджет ещё нужно зафиксировать; текущий P3 runner эти ID не принимает.
4. Промежуточная проверка Sonnet high, итоговая Opus high. Sealed T06–T12 не запускался и ждёт отдельного OK. После провода следующая цель — первая игровая P3 сборка с разговором и обычным предметом; перед владельцем её с нуля проверяет «3 Игровой стенд CDDA». Слияние выполняет распорядитель после приёмки и явного «да» владельца.
