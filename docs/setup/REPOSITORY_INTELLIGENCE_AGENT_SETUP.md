# Repository Intelligence MVP: локальная настройка

## Prerequisites

- Node.js согласно `package.json`;
- Python 3.10+ и `uv`;
- локальный `graphifyy==0.9.17` с executable `graphify`.

```powershell
uv tool install "graphifyy==0.9.17"
graphify --version
```

Project-scoped integrations устанавливаются из repository root и не меняют пользовательский `~/.codex/config.toml`:

```powershell
graphify install --project --platform codex
graphify cursor install --project
graphify install --project --platform agents
```

## Использование

```powershell
npm run repo-intel:build
npm run repo-intel:status
npm run repo-intel:query -- --query "specific information need"
```

Если `status` сообщает missing/stale graph или неверную версию, исправьте окружение либо выполните явный `repo-intel:build`. Команды `status` и `query` сами artifacts не создают и не обновляют.

`degraded` у knowledge-source — предупреждение о неполном retrieval. Найденные обязательные нормативы всё равно нужно прочитать полностью; Graphify не заменяет нормативный источник.

Graphify output — только repository graph. Его запрещено копировать, объединять или использовать как G0–G5, world facts, маршруты, materialization candidates или party state.
