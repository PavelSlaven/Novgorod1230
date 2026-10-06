# local-play

## Назначение

Поддерживаемый localhost launcher `npm run play:local` для первой локальной
игры через текущий production runtime.

## Владеет

- проверкой Node.js и launcher prerequisites;
- resumable/checksummed provisioning managed Python/Giga и embedded PostgreSQL
  в platform user-data/cache;
- owned lifecycle Giga worker, PostgreSQL и game-server, включая readiness и
  graceful shutdown;
- честным `unconfigured` состоянием до настройки exact default Qwen model через
  пользовательский OpenAI-compatible vLLM endpoint; gameplay model launcher не
  скачивает и не запускает;
- загрузкой current runtime-catalog pin, server env и HTTP readiness production server (`/api/v1/health`, `/api/v1/scenarios`).

Gameplay не зависит от engine API: единый `@rus/llm-runtime` видит только
OpenAI-compatible `chat/completions` настроенного vLLM endpoint.
Ошибки endpoint/provider завершают вызов без fallback. Подробности:
[`docs/setup/LLM_PROVIDERS.md`](../../docs/setup/LLM_PROVIDERS.md).

`RUS_RUNTIME_SETUP=spatial-v3-m3-development-v14` включает только явный
development setup для новой БД без партий. Он активирует approved v14 release,
применяет versioned actor owner migrations, replay-проверяет approved
`actor_base_attributes_v1` import/activation и передаёт active exact binding
обычному new-game path. Default/production setup не меняется; существующие
parties и old saves этот режим отклоняет.

`gameplay-gap-campaign.mjs` — development-only HTTP driver реальных production
HTTP turns для отдельно назначаемой gameplay-testing фазы (World Knowledge
contract §§0.1, 112.12). Injected explorer получает только актуальный public screen и
предыдущие намерения; не получает WK inventory, hidden state или ответы.
Private party JSONL связывает input, redacted `world_knowledge_boundary_trace_v1`
(safe need, planner request/plan/query, exact Core slice и consumer WK input),
structured model output и owner commit/rejection. Driver
сохраняет каждый turn до следующего, включая неуспехи, без provider reasoning.
`captured` означает только наличие трассы, не factual approval и не saturation.
Для regression API драйвера принимает `resumePartyId` вместе с
`replayGapIdsByTurn`: использует существующую тестовую партию через HTTP,
не создаёт новую и не меняет БД напрямую. Такая кампания не допускается
в acceptance mode; исходный player-safe screen сохраняется в trace.
`local-provider-acceptance.mjs` — единственный финальный browser-only runner:
требует exact Qwen provider metadata, запускает настоящий Chromium, передаёт PLAYER
только фактический DOM, вводит намерения через UI и сохраняет private traces.
Перед выбором намерения runner открывает доступные игровые панели обычными
кликами и передаёт PLAYER их видимый текст. Диагностика и настройки исключены;
наблюдения панелей сохраняются рядом с исходным экраном в trace.
Он не вызывает gameplay REST напрямую и не объявляет saturation без отдельного
premise audit. Acceptance candidate требует clean неизменного checkout; development-прогоны
из dirty tree не являются финальным acceptance evidence.

Запуск development exploration:
`node tools/local-play/gameplay-gap-campaign.mjs <output-directory> <focus> [turn-count]`.
Explorer делает отдельный model call из driver process; переиспользуется
только transport configuration существующей `turn_step_planner` role,
не игровой prompt или planner authority. Новый runtime role/owner не вводится.

Premise audit и backlog принадлежат development authoring workflow, не
серверу игры. Аудитор не меняет party state, corpus, semantic plan или outcome.
После сохранения завершённой trace отдельный development-time NLI-аудитор может
проверить relevance/entailment доставленных premises. Он работает вне gameplay
runtime и critical path, не является role binding, не запускает repair или veto,
не пишет party/WK state; его PASS не заменяет независимый premise audit.

Финальная реальная кампания с фиксированным числом ходов:
`npm run gameplay:acceptance:local -- <output-directory> <focus> [turn-count] [sequence]`.
Для прохождения до code-owned Phase 10 terminal вместо числа ходов передаётся
`completion`. Прерванный после сохранённого хода прогон продолжается с той же
party/DB и report при `RUS_ACCEPTANCE_RESUME=true`; continuation остаётся частью
исходной unseen campaign и не считается отдельным regression или новым unseen.
Pending proposal сохраняется до UI click. При resume готовый terminal log event
потребляется без нового click; иначе сохранённая browser identity либо точный
`turn.requested` восстанавливается один раз через Playwright context storageState.
Continue использует обычный browser recovery. Proposal без request/event вводится
и отправляется через UI; reload не воскрешает уже снятый pending request.
Для явно выбранного внешнего OpenAI-compatible endpoint/model runner читает
`RUS_ACCEPTANCE_LLM_BASE_URL`, `RUS_ACCEPTANCE_LLM_MODEL` и optional
`RUS_ACCEPTANCE_LLM_API_KEY_FILE`. Для воспроизводимого evidence обязательны
`RUS_ACCEPTANCE_LLM_BACKEND`, `RUS_ACCEPTANCE_LLM_BACKEND_VERSION`,
`RUS_ACCEPTANCE_LLM_RUNTIME_METADATA` и `RUS_ACCEPTANCE_LLM_HARDWARE_METADATA`;
они описывают назначенный endpoint, а не текущий ПК. Ключ не передаётся через
CLI; gameplay inference process runner не запускает.
Private terminal observer читает committed Phase 10 state и ready presentation
через PostgreSQL owners только после хода; PLAYER по-прежнему получает лишь DOM.
120 секунд ограничивают отдельный LLM transport call; browser runner ждёт весь
составной ход до 20 минут, потому что он включает несколько последовательных
production roles. Authored new-game opening после scenario selection ждёт тот
же composed 20-minute bound для последовательных Stage 22/23 roles; это не
увеличивает timeout отдельного model call.

`v17-slice-run.mjs` (`npm run play:v17-slice`) — development-only живой прогон
среза D49 на Linux, без браузера: свежая пара v17 в Docker PostgreSQL
(`bootstrapV17PresenceE2e` тестовой фикстуры, фикстурные attestation, только
одноразовые БД), production composition root с реальной LLM из файла
`RUS_LLM_SETTINGS_PATH` (файл только читается), `createGameHttpServer` на
127.0.0.1 и скриптовые ноги по публичному HTTP API: start → walk out → meet →
talk → take → make. После каждого хода — SQL-снимок (позиция, размещения в G6
игрока, предметы, `party_resource_nodes`, реплики NPC). Developer GET
`llm-turn-reports` даёт снимок каждой попытки new-game (проза writer, Stage 23,
repair, `pre_repair` после semantic repair) в `opening.opening_attempts` и
таблице playtest; при `committed_presentation_pending` драйвер вызывает тот же
`POST presentation-recovery`, что веб-клиент, агрегат `presentation_recovery` и
исход по ходу попадают в `report.json`/Markdown; неудачная доставка сохраняет
ход с `delivery_failed` до остановки ноги. Итог ноги — `pass`, `fail` или
`blocked` с причиной; выходы: `report.json` и Markdown-заготовка отчёта
`docs/playtests/` (WR §24.1, дословный экран по ходам, секреты вырезаются).
World Knowledge энкодер по умолчанию — заглушка (нулевые векторы), это
помечается в отчёте; `--wk-encoder giga` требует `RUS_WORLD_KNOWLEDGE_PYTHON`.
На общей машине запускать под слотом: `pg-slot node tools/local-play/v17-slice-run.mjs`.
Уборка (сервер, root, пулы, `docker rm -fv`) выполняется всегда, включая сигнал и
дедлайн игрового окна (`--deadline-min`, по умолчанию 26 мин после bootstrap). Выход: 0 все ноги pass, 1 нога fail
или blocked, 2 аргументы, 3 preflight, 4 сбой стенда. Windows-раннеры выше не
затрагиваются и остаются на сценарии v16.

## Не владеет

Не владеет game-server composition, gameplay, migrations как публичным
операторским API, production deployment или удалением/reset локальных данных.
