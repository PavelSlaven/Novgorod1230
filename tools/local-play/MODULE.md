# local-play

## Назначение

Поддерживаемый localhost launcher `npm run play:local` для первой локальной
игры через текущий production runtime.

## Владеет

- проверкой Node.js, process-local `DEEPSEEK_API_KEY` и Docker;
- owned local PostgreSQL container/volume, first-time production setup и повторным использованием party DB;
- загрузкой current runtime-catalog pin, server env и HTTP readiness production server (`/api/v1/health`, `/api/v1/scenarios`).

## Не владеет

Не владеет game-server composition, gameplay, migrations как публичным
операторским API, production deployment или удалением/reset локальных данных.
