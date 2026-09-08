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
  партии; custom OpenAI-compatible provider остаётся явной альтернативой;
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
поднимает тот же managed runtime, запускает настоящий Chromium, передаёт PLAYER
только фактический DOM, вводит намерения через UI и сохраняет private traces.
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

Финальная реальная кампания:
`npm run gameplay:acceptance:local -- <output-directory> <focus> [turn-count] [sequence]`.

## Не владеет

Не владеет game-server composition, gameplay, migrations как публичным
операторским API, production deployment или удалением/reset локальных данных.
