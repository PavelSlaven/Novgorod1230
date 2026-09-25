# Context dump: обновление карт `docs/context/*`

> Процедура. Норм не создаёт: при конфликте действует AGENTS.md, CONTRACT_INDEX и профильные контракты. Проверено: 2026-09-25, commit 21bd0938.

Карты в `docs/context/` — производные справочники (status REFERENCE / DOMAIN GUIDE). Они ссылаются на
владельцев и не копируют правила. Context dump сверяет их с фактическим репозиторием и обновляет штамп.

## Когда запускать

- после крупного merge, который меняет стек, CI, схему БД, модули или UI (например, merge PR #98: смена LLM по
  умолчанию, миграция 034, CI-матрица);
- в начале нового спринта (новый milestone в [CURRENT_SPRINT](../work/CURRENT_SPRINT.md)) и в начале нового этапа плана Runtime — на той ветке, где идёт работа этапа;
- когда агент заметил расхождение факта в карте с кодом — тогда можно обновить только эту карту.

Мелкую опечатку в одной карте правят обычным docs-PR без полного dump.

## Общие правила

1. Работать от свежего HEAD ветки, карты которой обновляются: для main — от `origin/main` в отдельной ветке; для долгоживущей ветки этапа (например, PR #98) — в самой этой ветке. На ветке этапа карты описывают её состояние, и пометки «⚠ PR #N меняет» для этой ветки снимаются. Одна задача = новая сессия ([WORKFLOW](WORKFLOW.md)).
2. Каждый факт в карте — со ссылкой на источник (файл, скрипт, раздел). Нет источника — факта нет.
3. Правила не переписываются в карты: ссылка на AGENTS.md / CONTRACT_INDEX / MODULE.md.
4. Части, которые меняет открытый PR, помечаются строкой «⚠ PR #N меняет: …».
5. После сверки обновить шапку: `Проверено: <YYYY-MM-DD>, commit <short sha>` — sha от `git rev-parse --short HEAD`
   базы, по которой сверяли.
6. Лимиты строк: STACK ≤150, ARCHITECTURE ≤200, DB_SCHEMA ≤200, EDGE_CASES ≤200, UI_KIT ≤150, LINKS ≤80,
   TESTING ≤180.
7. Результат — **один docs-PR** со всеми обновлёнными картами, строка в CHANGELOG
   (`- docs(context): context dump <дата> (#PR)`), новые расхождения — LW-записи в
   [LEGACY_WARNINGS](../work/LEGACY_WARNINGS.md).

## Рецепты по картам

Команды даны для Git Bash; `rg` — ripgrep.

### [STACK](../context/STACK.md)

```bash
node -e "const p=require('./package.json');console.log(p.version,p.engines,p.workspaces,p.dependencies,p.devDependencies)"
node -e "console.log(require('./package-lock.json').lockfileVersion)"
rg -n "node-version|python-version|postgres:" .github/workflows/test.yml
cat docker-compose.yml .env.example
ls docs/setup; rg -n "default|provider|model" packages/llm-runtime/MODULE.md
```

Сверить: версии Node/Python/PostgreSQL, зависимости, LLM-провайдер по умолчанию (ссылкой), версию CBM в
`docs/setup/CODEBASE_MEMORY_MCP.md`, раздел «нельзя».

### [ARCHITECTURE](../context/ARCHITECTURE.md)

```bash
ls -d */; ls apps packages tools
ls docs/architecture docs/domain docs/pipelines
rg -n "hardBytes|25|export" tools/architecture/check-boundaries.mjs
```

Сверить: назначение каждой корневой папки, ссылки на MODULE_RULES / DEPENDENCY_RULES / CONTRACT_POLICY /
OWNERSHIP_MAP / MODULE_INDEX, лимиты из `check-boundaries.mjs` и `docs/architecture/MODULE_RULES.md`.

### [DB_SCHEMA](../context/DB_SCHEMA.md)

```bash
ls schemas/party-db | tail -5; ls schemas/party-db | wc -l
rg -n "files|DIGEST" apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js
rg -n "test \"\$table_count\"" .github/workflows/test.yml
rg '^## ' infra/world-base/SCHEMA_REFERENCE.md | head -50
ls infra/operator-control
```

Сверить: число миграций party_runtime, число таблиц world_base (проверка CI), `MODULE.md` party-store.

### [EDGE_CASES](../context/EDGE_CASES.md)

```bash
node -e "const s=require('./packages/contracts/src/spatial-v3/typed-error-specifications.json');console.log(Object.keys(s.errors).length)"
git ls-files | rg "(^|/)errors\.js$"
rg -n "status\(|statusCode" apps/game-server/src | head
```

Сверить: число typed errors, список `errors.js`, HTTP-коды, ссылки на `docs/pipelines/*`.

### [UI_KIT](../context/UI_KIT.md)

```bash
ls apps/game-web/src apps/game-web/src/features 2>/dev/null; ls apps/game-web/public
rg -n "^\s*--[a-z0-9-]+:" apps/game-web/public/styles.css | head -40
```

Сверить: структура `features/*`, хелперы, которые нельзя писать заново, CSS-переменные, `MODULE.md` presentation.

### [LINKS](../context/LINKS.md)

Сверить закреплённые версии (по STACK) с версиями документации в ссылках; проверить, что ссылки открываются.
Ссылки на инструменты агентов — по их актуальной документации.

### [TESTING](../context/TESTING.md)

```bash
node -e "const s=require('./package.json').scripts;console.log(Object.keys(s).length);for(const k in s)if(/^test/.test(k))console.log(k,'=',s[k])"
rg -n "name:|matrix|npm run|npm test" .github/workflows/test.yml
node tools/spatial-v3/check-temporal-docs.mjs | tail -5
```

Сверить: раскладку тестов, состав `npm test`, jobs CI, baseline non-gate проверок.

## Проверки docs-PR

`git diff --check`, `npm run test:tools` (включает тест ссылок `test:docs`), `npm run docs:check`; `docs:generate`
и коммит результата — если менялся файл, зарегистрированный в `docs/migration/CANONICAL_PATHS.json`
(AGENTS §24; матрица — [TESTING](../context/TESTING.md)). Contract Auditor не нужен, пока меняются только карты
REFERENCE; если dump выявил расхождение контракта с кодом — это отдельная задача и триггер AGENTS §25.1.
