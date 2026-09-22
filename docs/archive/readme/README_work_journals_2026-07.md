# Журналы работ из README.md (июль 2026)

> Архив. Раздел перенесён дословно из корневого `README.md` в DOC-03 (#101). Описывает состояние на момент тех PR, не текущее поведение; текущее — код, active bindings, контракты и тесты.

## RAG readiness — текущая работа

### Цель

Привести RAG нормативного корпуса к формальному правилу полноты metadata, status-aware retrieval, явной фиксации semantic gaps и проверяемых контрольных запросов; предоставить обязательный интерфейс для Codex и Cursor.

### Выполненные изменения

- добавлен `data/knowledge-source/retrieval-policy.json` с metadata для всех 28 зарегистрированных документов;
- зарегистрированы нормативный приоритет, подсистемы, связи с документами, модулями и контрактами, поисковые термины и semantic coverage disposition;
- добавлен и публично экспортирован `createKnowledgeRagReader`, не изменяющий совместимость существующего full-text reader;
- ranked retrieval работает только по committed semantic/lexical RAG chunks и возвращает provenance каждого результата;
- `active` используется по умолчанию; `proposed` и `deprecated` требуют явного разрешения и запроса;
- stale corpus/policy/RAG pins, отсутствующая metadata и ложное semantic coverage завершаются typed failure;
- добавлены контрольные top-k запросы и readiness report;
- добавлен JSON CLI `query|read|status|controls` и корневые npm-команды;
- добавлены профильные инструкции Codex/Cursor в `AGENTS.md` и `.cursor/rules/knowledge-rag.mdc`;
- добавлены unit, negative, repository и subprocess CLI contract tests.

### Принятые решения

По состоянию на 2026-07-16 canonical corpus содержит 30 зарегистрированных документов, из них 28 `active`: четыре имеют approved semantic snapshot, 26 имеют только lexical coverage. В default active-only status видны 24 `baseline_gap` и ноль blockers; два `proposed` lexical-only gaps исключены из этого default статуса. Для новых изменений используется `required_before_merge`, если semantic snapshot не обновляется в том же PR.

Каждый документ canonical corpus обязан иметь retrieval-policy metadata и generated lexical provenance coverage независимо от статуса. `proposed` и `deprecated` индексируются lexical-only: это не меняет их статус, не означает semantic approval и не добавляет их в active semantic graph. Default query остаётся active-only; non-active документы доступны только через явный `--statuses`.

CLI является тонким adapter-слоем существующего модуля, а не отдельным пакетом. Он не дублирует ranking, не читает файлы в обход storage/readers и не обращается к сети, LLM или БД. Ошибки аргументов возвращают exit code `2`, knowledge-source failures и провал controls — exit code `1`.

### Структура результата

- policy registry: `data/knowledge-source/retrieval-policy.json`;
- validation/ranking: `packages/knowledge-source/src/domain/`;
- read-only retrieval service: `packages/knowledge-source/src/services/rag-reader.js`;
- agent CLI: `packages/knowledge-source/src/cli.js`;
- filesystem port: `packages/knowledge-source/src/adapters/filesystem-storage.js`;
- Codex/Cursor rules: `AGENTS.md`, `.cursor/rules/knowledge-rag.mdc`;
- нормативная техническая политика: `docs/architecture/KNOWLEDGE_SOURCE_POLICY.md`;
- tests: `packages/knowledge-source/test/rag-*.test.js`, `packages/knowledge-source/test/agent-cli.test.js`.

### Порядок интеграции

Изменения объединяются одним PR. Сначала проходят knowledge-source tests, CLI contract tests и полный CI, затем обязательный аудит критика. Merge допустим только при `PASS` или допустимом `PASS WITH NOTES`.

### Выполненные проверки

GitHub CI run `29499174723` завершён успешно. Фактически выполнены clean-clone checkout и install, проверка tracked world-base source bundle, проверка схемы и выполнение DDL в PostgreSQL, проверка канонического knowledge corpus, детерминированная генерация документации и knowledge artifacts, проверка воспроизводимости generated-файлов и полный `npm test`, включающий subprocess CLI contract tests.

### Обязательный аудит

Результат критика фиксируется в PR после повторного CI. До получения `PASS` или допустимого `PASS WITH NOTES` работа считается незавершённой.

### Известные ограничения и оставшиеся задачи

По состоянию на 2026-07-16 approved semantic snapshots существуют для 4 из 30 зарегистрированных документов. Остальные 26 документов имеют полноценное lexical coverage, но остаются явным semantic coverage debt; 24 active gaps видимы в default status, а два proposed lexical-only gaps доступны только при явном запросе non-active статуса. Их embedding snapshot должен обновляться редакторским процессом без deterministic или эвристического fallback.

### Repair: coverage зарегистрированных non-active документов

Исходный fail-closed сбой `RETRIEVAL_POLICY_INCOMPLETE` показал отсутствие policy metadata у `universal-category-classification-policy` и `universal-category-classification-references`. Оба документа остаются `proposed`. Технический contract knowledge-source теперь требует retrieval-policy metadata и deterministic lexical provenance coverage для каждого registered corpus document; status управляет только query-time visibility.

`proposed` и `deprecated` получают lexical-only coverage без approved semantic embedding и без участия в active semantic graph. Default reader и query остаются active-only; доступ к non-active документу требует явного `--statuses`. Изменённый `interface-ux` понижен с `covered` до `baseline_gap`, потому что его approved semantic snapshot не соответствует текущему canonical text; новая semantic approval не создавалась автоматически.

Штатно выполнены `npm ci`, corpus check, knowledge/docs generation, `test:knowledge-source`, materializer tests, `knowledge:check`, `docs:check` и architecture check. Generated RAG artifacts обновлены только генераторами. Независимый критик выполнил цикл из четырёх аудитов: первые три `CHANGES REQUIRED` выявили и подтвердили устранение fail-closed gaps (non-active semantic injection, coverage-to-chunk provenance и устаревшие числа README); заключительный результат — `PASS`. Stage 16, activation и существующие партии данным этапом не изменяются.

### Repair: Stage 16 approved-catalog contract

Исходно `node --test test/modules/code-materialization-run.test.js` завершался `4/8` с первым gate `ITEM_APPROVED_CATALOG_BLOCK_MISSING`: legacy fixture не передавал обязательные Stage 8 `quantity_requirements` и `equipment_candidates`. После добавления version pin и реального SHA-256 digest fixture дошёл до следующего корректного gate — отсутствующего `quantity_requirement_id` в положительном item candidate.

Обновлены только fixtures и contract tests: quantity requirement теперь связан с тем же template/revision, item передаёт explicit unit, mass и external hand cost. Negative tests проверяют unapproved/foreign requirement, template mismatch, range, unit, physical profile, owner/holder/controller и equipment approval. Production repair минимален: materializer теперь fail-closed сравнивает declared item unit с approved quantity requirement и требует approved same-revision equipment candidate. Старые party instances, activation и каталог не менялись; readiness остаётся `0/120` approved templates и все 120 блокируются историческими evidence, regional profiles/rules и legacy gaps.

Дополнительно устранена Node 24-несовместимость Stage 3C promotion sorter (`map(structuredClone)` передавал index как options): исходные три `test:world-catalog` failure устранены одноаргументным clone callback. Выполнены Stage 16, G5, Stage 24/25, world-catalog, schema, knowledge, documentation и architecture checks; полный `npm test` прошёл, generated-артефакты воспроизводимы. Stage 16 audit, knowledge-source audit и итоговый полный audit PR7 завершились `PASS`. Activation и rematerialization существующих партий отсутствуют.
## PR №7 — Stage 3C

### Цель

Подготовить version-pinned promotion полного набора из 120 item/container templates в новую world revision, approved-only Stage 8 и fail-closed Stage 16. Частичная promotion запрещена; activation остаётся отдельной операцией.

### Выполненные изменения

- добавлены promotion planner, catalog/manifest digest, dependency closure, transactional readback и rollback contract;
- Stage 8 получает immutable approved snapshot и выдаёт только revision/region/period applicable item, container, equipment, quantity и property candidates;
- пустой required domain выдаёт typed `REQUIRED_APPROVED_CANDIDATE_SET_EMPTY` и hard block без LLM repair;
- Stage 16 требует explicit quantity requirement, unit, mass, hand cost, equipment reference и раздельные owner/holder/controller;
- materialization trace сохраняет revision, catalog digest, quantity refs и created refs.

### Принятые решения и фактический результат

Stage 3B-2 установил `0/120` templates ready for approval. Поэтому Stage 3C остановлен `APPROVED_CATALOG_EMPTY` до начала транзакции: для promotion требуется одобрение всех 120 templates, а не подмножества. Target revision `world_revision_novgorod_1230_item_catalogue_002` не создана, старая approved revision не изменена, activation и runtime loader switch не выполнялись, существующие партии не изменялись.

### Структура результата

- `tools/world-catalog-workflow/src/revision-promotion.js`;
- `packages/new-game/src/stages/stage-8-item-profile-candidates/`;
- `packages/materialization/src/placement-materializers.js` и `stage-helpers.js`;
- `data/knowledge-source/imports/universal-category-classification-2026-07-15/stage-3c/`.

### Порядок интеграции

1. получить reviewed approval для всех 120 templates;
2. обновить exact approval ID list без частичной promotion;
3. выполнить promotion dry-run и closure audit;
4. выполнить transactional apply/readback;
5. отдельно запросить activation;
6. атомарно переключить loader, не меняя revision pins существующих партий.

### Проверки

На локально восстановленном targeted-наборе выполнены Stage 3C, Stage 8 и Stage 16 тесты; все изменяемые JS-файлы прошли `node --check`. Итоговый статус полного CI фиксируется GitHub Actions на head PR №7.

### Аудит и ограничения

Обязательный независимый code-critic должен завершиться `PASS` либо `PASS WITH NOTES`. До его фактического запуска результат не считается окончательно закрытым. PostgreSQL apply/readback не выполнялся, поскольку пустой approved subset запрещает начинать транзакцию.

## PR №7 — legacy migration inventory и all-120 approval

### Цель

Проверять реальные legacy-строки operator PostgreSQL/NocoDB, классифицировать каждое legacy-поле как `mapped`, `data_gap`, `migration_conflict` или `deferred` и запрещать promotion, пока одновременно не готовы все 120 templates и полная dependency closure.

### Выполненные изменения

- добавлен DB-exporter `scripts/export-legacy-item-classification-inventory.mjs`, который читает фактические доступные колонки `world_base.item_templates` и `world_base.container_templates`;
- отсутствие доступа к operator DB фиксируется как `LEGACY_SOURCE_NOT_VERIFIED`; количество legacy-строк остаётся `null`, а не `0`;
- добавлены детерминированный readiness report, evidence-review plan и coherent approval plan;
- source bindings могут перейти `needs_review → reviewed` только после готовности всей когорты;
- переходы `draft → approved` формируются атомарно только для полной когорты 120/120;
- добавлен strict `buildAllTemplateRevisionPromotionPlan`, запрещающий 119/120 и любой частичный promotion;
- activation, runtime loader switch и изменения существующих партий не входят в этот workflow.

### Фактический результат

Operator PostgreSQL/NocoDB из текущей среды недоступен, поэтому реальный export не выполнен и отсутствие legacy-данных не утверждается. Повторный readiness: `0/120` полностью готовы; все 120 заблокированы источниками, параметрами, profiles/rules и непроверенным legacy inventory; `0/120` готовы к editorial approval. Review/approval transitions не создавались.

### Структура и интеграция

- код: `tools/world-catalog-workflow/src/legacy-classification-inventory.js`, `editorial-readiness.js`, `all-template-promotion.js`;
- exporter: `scripts/export-legacy-item-classification-inventory.mjs`;
- evidence: `data/knowledge-source/imports/universal-category-classification-2026-07-15/stage-3c/readiness/`;
- порядок: выполнить exporter против фактической DB → вручную проверить каждую строку → устранить source/parameter/profile/rule gaps → пересобрать readiness → получить explicit all-120 attestation → выполнить transactional promotion → отдельно запрашивать activation.

### Проверки и аудит

Локально выполнены targeted Node tests для classifier/readiness/promotion gates и `node --check` для новых scripts. Полный GitHub Actions должен подтвердить интеграцию и generated reproducibility. Независимый code-critic в этой среде недоступен; результат не объявляется `PASS` без его фактического запуска.
