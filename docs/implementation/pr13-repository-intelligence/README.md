# PR №13 — Repository Graph

## Цель

Поддерживать подробный локальный Graphify-граф актуального checkout: после смены Git HEAD `repo-intel:ensure` пересобирает artifact и manifest. Нормативный `@rus/knowledge-source` остаётся независимым поиском документов и не является readiness gate Repository Graph.

## Реализовано

- `@rus/repository-intelligence` использует pinned `graphifyy==0.9.17`;
- `repo-intel:build` строит локальный code graph и записывает manifest с `source_commit`, версией Graphify и путём artifact;
- `repo-intel:ensure` не меняет актуальный graph и пересобирает missing/stale graph;
- `repo-intel:status` проверяет Graphify, artifact, manifest и Git HEAD;
- `repo-intel:query` не запускает Graphify при missing/stale graph и сохраняет knowledge-source result отдельно;
- `knowledge-source: degraded` возвращается как warning нормативного канала, но не блокирует Repository Graph;
- Graphify outputs локальные, ignored и изолированы от G0–G5, `world_base`, `party_runtime` и production runtime.

## Не входит в PR №13

- approved embeddings и semantic snapshots нормативного RAG;
- исправление 24 semantic coverage gaps;
- editorial approval нормативного corpus;
- импорт Repository Graph в игровые базы или runtime.

## Проверки перед аудитом

```powershell
npm run repo-intel:ensure
npm run repo-intel:status
npm run repo-intel:query -- --query "Repository Graph lifecycle"
npm run test:repository-intelligence
npm run docs:check
npm run architecture:check
git diff --check
```

CI на `main` устанавливает exact Graphify, строит graph на текущем HEAD, проверяет status и запускает tests Repository Intelligence.

Фактически выполнено локально: `repo-intel:ensure` — `0` (`rebuilt: false` для актуального artifact), `repo-intel:status` — `0` (`repository_graph: ready`, Graphify `0.9.17`, knowledge-source `degraded` как warning), `repo-intel:query` — `0`, `test:repository-intelligence` — `17/17 PASS`, `docs:check` — `0`, `architecture:check` — `0`, `knowledge:check` — `0`, `knowledge:controls` — `6/6 PASS`, `npm test` — PASS (5 PostgreSQL integration tests и 1 Chromium E2E skipped из-за внешних inputs), `git diff --check` — `0`.

## Аудит и интеграция

Независимый аудит актуального незакоммиченного diff от 2026-07-16: `PASS WITH NOTES`. Подтверждены разделение readiness Repository Graph и нормативного канала, `ensure`, manifest/HEAD, exact Graphify в CI, изоляция от игровых модулей и локальные проверки.

Замечания аудита: ignored artifact привязан к committed HEAD, поэтому после локального commit перед push выполняется `repo-intel:ensure`; architecture test не перечисляет исчерпывающий denylist game/G0–G5, но фактические imports и зависимости чисты. Эти замечания не блокируют commit, push и перевод PR из draft.
