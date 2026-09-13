# codebase-memory-mcp: локальная настройка

`codebase-memory-mcp` — локальный MCP-инструмент навигации по исходному коду. Он строит структурный граф, поддерживает поиск символов, трассировку вызовов, проверку покрытия и анализ влияния изменений.

Граф не является нормативным источником и не заменяет `@rus/knowledge-source`, `AGENTS.md`, профильные контракты, `MODULE.md`, schemas, код или тесты.

## Установка

Используйте закреплённый стабильный release `v0.10.8` и официальный Windows installer этого тега:

```powershell
Invoke-WebRequest -Uri https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/v0.10.8/install.ps1 -OutFile install.ps1
Get-Content .\install.ps1
Unblock-File .\install.ps1
.\install.ps1
```

Installer настраивает обнаруженные Codex, Cursor и VS Code. После установки перезапустите клиенты и доверьте новые Codex hooks через `/hooks` после просмотра.

На Windows храните checkout в ASCII-пути, например `C:\Users\name\Documents\Novgorod`: CBM 0.10.8 не запускается из рабочего каталога с кириллицей ([upstream issue #1715](https://github.com/DeusData/codebase-memory-mcp/issues/1715)).

## Индексация

```powershell
codebase-memory-mcp config set auto_index true
codebase-memory-mcp config set auto_watch true
codebase-memory-mcp cli index_repository --repo-path "C:\path\to\Novgorod1230"
```

`auto_index` создаёт индекс при первом подключении проекта. `auto_watch` поддерживает уже созданный индекс актуальным. SQLite cache хранится вне репозитория; `.codebase-memory/graph.db.zst` в Git не добавляется.

## Использование

- `get_architecture` — обзор структуры;
- `search_graph` и `search_code` — поиск владельцев и символов;
- `trace_path` — callers/callees;
- `detect_changes` — влияние рабочего diff;
- `check_index_coverage` — проверка полноты данных;
- `index_status` — состояние индекса.

Для нормативных вопросов используйте `npm run knowledge:query`. Любой вывод графа подтверждайте чтением соответствующих исходников; отсутствие результатов не доказывает отсутствие реализации без проверки coverage.

## Обновление

Watcher обновляет индекс, но бинарник не проверяет releases в фоне. Для обновления установленной версии выполните `codebase-memory-mcp update` и запустите напечатанную команду installer.
