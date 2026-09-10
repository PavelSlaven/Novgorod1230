# local-play

## Назначение

Поддерживаемый localhost launcher `npm run play:local` для первой локальной
игры через текущий production runtime.

## Владеет

- проверкой Node.js, Windows x64, NVIDIA GPU/VRAM, RAM и свободного места;
- resumable/checksummed provisioning pinned Gemma Q4_K_P, CUDA `llama.cpp`,
  managed Python/Giga и embedded PostgreSQL в platform user-data/cache;
- owned lifecycle inference, Giga worker, PostgreSQL и game-server, включая
  readiness, один restart inference и graceful shutdown;
- default local Gemma provider для всех gameplay LLM roles и диагностикой до
  партии; сохранённый custom OpenAI-compatible provider читается до provisioning
  и не запускает ненужный managed Gemma process;
- загрузкой current runtime-catalog pin, server env и HTTP readiness production server (`/api/v1/health`, `/api/v1/scenarios`).

Gameplay не зависит от engine API: launcher поднимает pinned `llama.cpp`, а
единый `@rus/llm-runtime` видит только OpenAI-compatible `chat/completions`.
Никакого fallback на DeepSeek нет. Подробности:
[`docs/setup/LLM_PROVIDERS.md`](../../docs/setup/LLM_PROVIDERS.md).

`gameplay-gap-campaign.mjs` — development-only HTTP driver реальных production
HTTP turns для отдельно назначаемой gameplay-testing фазы (World Knowledge
contract §§0.1, 112.12). Injected explorer получает только актуальный public screen и
предыдущие намерения; не получает WK inventory, hidden state или ответы.
Private party JSONL связывает input, WK planner request/plan/query, фактический
consumer slice, structured model output и owner commit/rejection. Driver
сохраняет каждый turn до следующего, включая неуспехи, без provider reasoning.
`captured` означает только наличие трассы, не factual approval и не saturation.
Для regression API драйвера принимает `resumePartyId` вместе с
`replayGapIdsByTurn`: использует существующую тестовую партию через HTTP,
не создаёт новую и не меняет БД напрямую. Такая кампания не допускается
в acceptance mode; исходный player-safe screen сохраняется в trace.
`local-gemma-acceptance.mjs` — единственный финальный browser-only runner:
по умолчанию поднимает тот же managed Gemma runtime, запускает настоящий Chromium, передаёт PLAYER
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
CLI, и локальная Gemma в этом режиме не запускается.
Private terminal observer читает committed Phase 10 state и ready presentation
через PostgreSQL owners только после хода; PLAYER по-прежнему получает лишь DOM.
120 секунд ограничивают отдельный LLM transport call; browser runner ждёт весь
составной ход до 20 минут, потому что он включает несколько последовательных
production roles.

## Не владеет

Не владеет game-server composition, gameplay, migrations как публичным
операторским API, production deployment или удалением/reset локальных данных.
