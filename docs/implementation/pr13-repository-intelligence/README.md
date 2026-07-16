# PR №13 — Hybrid Repository Intelligence MVP

## Статус

`готово к интеграции как MVP`; независимый аудит дал `PASS WITH NOTES`.

Рабочая ветка: `chatgpt/repository-intelligence-graphify`. Этот файл — журнал фактически выполненной работы PR №13.

## Реализовано и проверено

- добавлен пакет `@rus/repository-intelligence` с локальными операциями `build`, `status` и `query`;
- Graphify проверяется как exact `graphifyy==0.9.17`;
- build выполняет code-only Graphify extraction, проверяет появление `graphify-out/graph.json` и только затем пишет manifest с текущим HEAD;
- status проверяет executable, version, artifact, manifest и HEAD SHA, ничего не перестраивая;
- `degraded` `@rus/knowledge-source` показан как `KNOWLEDGE_SOURCE_DEGRADED` warning; unavailable или malformed readiness блокирует соответствующий lane;
- hybrid query сохраняет результаты обоих каналов раздельно, показывает partial failure и не запускает Graphify при missing/stale graph;
- package изолирован от game runtime, G0–G5, SQL, `world_base`, `party_runtime`, LLM и сети;
- public root scripts ограничены MVP: `repo-intel:build`, `repo-intel:status`, `repo-intel:query`, `test:repository-intelligence`;
- обновлены `AGENTS.md`, `.github/AGENTS.md`, MODULE registry и локальная setup/architecture documentation.

Фактически выполненные команды после текущих исправлений:

```powershell
npm run test:repository-intelligence
git diff --check
node --test tools/docs-tools/test/documentation-generation.test.js
npm run repo-intel:status
npm run repo-intel:query -- --query "repository intelligence MVP"
npm test
```

Результаты: targeted tests `14/14 PASS`; documentation-generation `8/8 PASS`; полный `npm test` — PASS, с 5 намеренно skipped PostgreSQL integration tests из-за отсутствия внешней database configuration и 1 skipped browser E2E из-за отсутствующего Chromium; `status` и `query` успешно работают локально с warning `KNOWLEDGE_SOURCE_DEGRADED`; `git diff --check` проходит.

## Реализовано, но ещё не проверено полным контуром

- текущие CLI/build tests и README требуют финального targeted run после последнего изменения;
- перед аудитом будет повторён `repo-intel:build`, `status`, `query`, `docs:check`, `knowledge:check` и `architecture:check` на итоговом diff.

## Не реализовано (вне сокращённого MVP)

- доказательство coverage всех tracked files;
- отдельный document-index lane;
- coverage policy и content digests;
- `read`, `path`, `explain`, `controls`, `coverage` public CLI;
- exhaustive fixtures и subprocess matrix;
- исправление semantic coverage gaps;
- database acceptance.

## Внешние hard blocks

- `knowledge:status` сообщает 24 semantic coverage gaps. Для MVP это warning навигации, но не утверждение полной semantic readiness и не основание для materialization.
- database preflight не принимается без фактических `POSTGRES_PASSWORD`, `DATABASE_URL`, `DEEPSEEK_API_KEY` и обязательных Novgorod G1–G4 TSV. Фиктивные значения, seed и fallback-каталоги не создавались.

## Граница архитектуры

`graphify-out/graph.json` — локальный repository graph, не G0–G5. Он не импортируется в `world_base` или party database, не является игровым фактом, маршрутом, candidate set либо runtime dependency.

## Следующий этап

Выполнить финальный scope review, локальный commit и push в существующий draft PR №13. Полное coverage, document-index lane и исправление 24 semantic gaps остаются отдельной будущей работой.

## Независимый аудит

Повторный независимый аудит MVP: `PASS WITH NOTES`.

Подтверждены exact Graphify version/HEAD/manifest checks, warning для `degraded`, blocking unavailable knowledge-source, разделённые hybrid lanes, partial failures, отсутствие Graphify query при stale graph, проверка artifact до manifest, изоляция от runtime/DB/G0–G5 и JSON CLI error/exit code.

Notes: `graphify-out/` и `generated/repository-intelligence/` намеренно локальные и ignored; MVP использует version+HEAD, а не coverage/digest baseline. 24 semantic gaps остаются warning только для navigation MVP и не означают готовность materialization/runtime.
