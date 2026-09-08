# local-play

## Назначение

Поддерживаемый localhost launcher `npm run play:local` для первой локальной
игры через текущий production runtime.

## Владеет

- проверкой Node.js и Docker; если `DEEPSEEK_API_KEY` задан, launcher проверяет
  default provider до PostgreSQL setup, иначе запускает UI для выбора local/custom
  OpenAI-compatible provider без требования DeepSeek;
- owned local PostgreSQL container/volume, first-time production setup и повторным использованием party DB;
- загрузкой current runtime-catalog pin, server env и HTTP readiness production server (`/api/v1/health`, `/api/v1/scenarios`).

Local inference process остаётся внешним engine-neutral процессом: launcher не
скачивает модель и не привязывает gameplay к vLLM/Ollama/LM Studio. Пользователь
запускает любой сервер с OpenAI-compatible `chat/completions`, затем выбирает
endpoint/model в UI и выполняет connection check. Подробности:
[`docs/setup/LLM_PROVIDERS.md`](../../docs/setup/LLM_PROVIDERS.md).

`gameplay-gap-campaign.mjs` — development-only driver реальных production
HTTP turns для отдельно назначаемой gameplay-testing фазы (World Knowledge
contract §§0.1, 112.12). В текущей статической фазе PR92 систематические
campaigns/replays/saturation не запускаются. Injected explorer получает только актуальный public screen и
предыдущие намерения; не получает WK inventory, hidden state или ответы.
Private party JSONL связывает input, WK planner request/plan/query, фактический
consumer slice, structured model output и owner commit/rejection. Driver
сохраняет каждый turn до следующего, включая неуспехи, без provider reasoning.
`captured` означает только наличие трассы, не factual approval и не saturation.
Для regression API драйвера принимает `resumePartyId` вместе с
`replayGapIdsByTurn`: использует существующую тестовую партию через HTTP,
не создаёт новую и не меняет БД напрямую. Такая кампания не допускается
в acceptance mode; исходный player-safe screen сохраняется в trace.
Acceptance candidate требует clean неизменного checkout; development-прогоны
из dirty tree не являются финальным acceptance evidence.

Запуск development exploration:
`node tools/local-play/gameplay-gap-campaign.mjs <output-directory> <focus> [turn-count]`.
Explorer делает отдельный model call из driver process; переиспользуется
только transport configuration существующей `turn_step_planner` role,
не игровой prompt или planner authority. Новый runtime role/owner не вводится.

Premise audit и backlog принадлежат development authoring workflow, не
серверу игры. Аудитор не меняет party state, corpus, semantic plan или outcome.

## Не владеет

Не владеет game-server composition, gameplay, migrations как публичным
операторским API, production deployment или удалением/reset локальных данных.
