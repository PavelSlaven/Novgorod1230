# Правила зависимостей

## Разрешённое направление

```text
apps
  -> workflow/presentation packages
  -> domain packages
  -> platform packages
  -> @rus/kernel
```

Infrastructure adapters реализуют публичные ports пакетов и подключаются только в composition root. Пакет не импортирует конкретную инфраструктуру, которую должен получать через port.

## Категории модулей

- `apps/*` — composition roots и transport wiring; доменная логика запрещена.
- `packages/new-game`, `packages/turn`, `packages/narration`, `packages/presentation` — workflow и player-facing boundaries.
- domain packages — владельцы локальных формул и контрактов предметной области.
- `packages/contracts`, `packages/materialization`, `packages/pipeline-engine`, `packages/llm-runtime`, `packages/world-base`, `packages/party-store`, `packages/kernel` — platform layer.
- `tools/*` — автономные CLI; production runtime их не импортирует.

## Запрещённые связи

- `packages/* -> apps/*`;
- domain package -> UI, provider SDK, PostgreSQL driver или `legacy`;
- stage -> implementation соседнего stage;
- `game-web -> game-server` или party database;
- `world-base -> party-store`;
- `contracts -> implementation`;
- `kernel -> @rus/*`;
- production runtime -> `tools/*`;
- source code -> `generated/*` как редактируемый источник истины.

## Публичные entrypoints

Внешний импорт выполняется через package export или `src/index.js`. Импорт private/internal файлов другого пакета запрещён. Compatibility subpath считается публичным только если объявлен в `package.json.exports`.

## Infrastructure exceptions

- PostgreSQL driver разрешён только в `apps/game-server/src/infrastructure/postgres/`.
- Provider transport подключается через `@rus/llm-runtime` и production provider adapter.
- Прямой импорт `legacy` разрешён только явно названному compatibility facade/adapter до cutover.

## Проверка

`npm run architecture:check` проверяет направление импортов, запрещённые SDK/SQL/runtime связи, размеры файлов, обязательные entrypoints и документационные границы.
