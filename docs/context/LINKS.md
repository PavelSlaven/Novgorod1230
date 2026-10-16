# LINKS — внешняя документация

> status: REFERENCE / DOMAIN GUIDE; при конфликте действует governing-корпус (AGENTS.md) или профильный контракт. Проверено: 2026-09-25, commit 59c1a33c.

Официальная документация под версии, закреплённые в репозитории. Сами версии и их источники — [STACK.md](STACK.md).
Внешний документ описывает инструмент, но не норму проекта: при расхождении действуют AGENTS.md и владельцы.

## Платформа (Node.js 22)

- Node.js 22 API: https://nodejs.org/docs/latest-v22.x/api/
- ES modules: https://nodejs.org/docs/latest-v22.x/api/esm.html
- Packages (`type`, `exports`, `engines`): https://nodejs.org/docs/latest-v22.x/api/packages.html
- `node:test` (test runner): https://nodejs.org/docs/latest-v22.x/api/test.html
- `node:assert`: https://nodejs.org/docs/latest-v22.x/api/assert.html
- npm workspaces: https://docs.npmjs.com/cli/v10/using-npm/workspaces
- `package-lock.json` (lockfileVersion 3): https://docs.npmjs.com/cli/v10/configuring-npm/package-lock-json
- `npm ci`: https://docs.npmjs.com/cli/v10/commands/npm-ci

## База данных (PostgreSQL 16)

- PostgreSQL 16: https://www.postgresql.org/docs/16/index.html
- SQL-команды: https://www.postgresql.org/docs/16/sql-commands.html
- Транзакции и изоляция: https://www.postgresql.org/docs/16/transaction-iso.html
- Ограничения (PK/UNIQUE/FK/CHECK): https://www.postgresql.org/docs/16/ddl-constraints.html
- node-postgres (`pg` 8.x): https://node-postgres.com/
- node-postgres: транзакции: https://node-postgres.com/features/transactions
- node-postgres: pooling: https://node-postgres.com/features/pooling
- embedded-postgres: https://github.com/leinelissen/embedded-postgres
- pg-mem: https://github.com/oguimbal/pg-mem
- Docker Compose: https://docs.docker.com/compose/
- NocoDB (dev-only): https://docs.nocodb.com/

## Тесты, браузер, сборка

- Playwright (library / `playwright-core`): https://playwright.dev/docs/library
- Playwright API: https://playwright.dev/docs/api/class-playwright
- esbuild API (только `MapMaker/`): https://esbuild.github.io/api/
- GitHub Actions `setup-node`: https://github.com/actions/setup-node
- GitHub Actions `setup-python`: https://github.com/actions/setup-python

## Python 3.12

- Python 3.12: https://docs.python.org/3.12/
- `venv` / `pip`: https://docs.python.org/3.12/library/venv.html
- uv (managed Python в `play:local`): https://docs.astral.sh/uv/

## Инструменты агентов

- AGENTS.md (открытый формат): https://agents.md/
- Codex — AGENTS.md: https://developers.openai.com/codex/guides/agents-md
- Codex — skills: https://developers.openai.com/codex/skills
- Claude Code — memory (CLAUDE.md, импорт, AGENTS.md): https://code.claude.com/docs/en/memory
- Claude Code — skills: https://code.claude.com/docs/en/skills
- Claude Code — settings: https://code.claude.com/docs/en/settings
- Cursor — rules: https://cursor.com/docs/context/rules
- Cursor — skills: https://cursor.com/docs/context/skills
- GitHub Copilot — repository custom instructions:
  https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions
- GitHub Copilot — agent skills: https://docs.github.com/en/copilot/concepts/agents/about-agent-skills
- Agent Skills — спецификация: https://agentskills.io/specification
- codebase-memory-mcp v0.10.8: https://github.com/DeusData/codebase-memory-mcp/tree/v0.10.8
  (локальная настройка — [CODEBASE_MEMORY_MCP.md](../setup/CODEBASE_MEMORY_MCP.md))
