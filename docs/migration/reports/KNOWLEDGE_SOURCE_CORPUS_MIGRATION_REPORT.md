# Отчёт фазы: Knowledge Source and Documentation Corpus Migration

Дата: 2026-07-12  
Релиз: `0.23.0-migration.23`

## Выполнено

- Проведена рекурсивная инвентаризация 29 файлов legacy DOCUMENTS.
- Классифицированы 19 canonical sources, 6 graph artifacts, 2 RAG artifacts и 2 provenance documents; unknown = 0.
- Legacy canonical sources скопированы byte-for-byte в `data/knowledge-source/corpus/DOCUMENTS`; native-документы зарегистрированы без второго смыслового источника.
- Актуальный состав corpus и разбиение legacy/native определяет `data/knowledge-source/corpus-manifest.json`.
- Созданы aliases, append-only import history и сохранённая legacy inventory.
- Создан модуль `@rus/knowledge-source` с explicit storage port, immutable outputs и typed failures.
- Graph materializer сохраняет approved semantic snapshot и добавляет только structural document nodes; актуальные counts и coverage определяет `generated/knowledge-source/graph/manifest.json`.
- RAG materializer сохраняет утверждённые semantic vectors и добавляет lexical-only coverage без embeddings; актуальные counts определяет `generated/knowledge-source/rag/manifest.json`.
- Production composition передаёт `ports.knowledgeSource` в runtime bindings.
- Legacy fallback отсутствует в production source.
- Runtime проверяет SHA-256 corpus, graph и RAG artifacts и останавливает startup при отклонении.
- Generated verification и документация воспроизводятся без доступного legacy corpus.

## Инварианты

- Код не создаёт смысл документов, graph relations или отсутствующие факты.
- Generated data не является source of truth.
- Повреждение corpus или stale generated artifacts блокирует production startup.
- Legacy не удалён и остаётся только rollback/read-only материалом.

## Проверки

- Актуальные targeted, full-regression, clean-clone CI и PostgreSQL evidence ведутся в `docs/migration/reports/TEST_REPORT.md`.
- Актуальные findings, remediation cycles и admission verdict ведутся в `docs/migration/reports/KNOWLEDGE_SOURCE_CRITIC_REPORT.md`.
- ZIP integrity и byte-parity нормативов проверяются отдельным corpus gate и зафиксированы в указанных evidence reports.
- Documentation/generated-data reproducibility и architecture boundaries входят в обязательный clean-clone workflow.

## Решение

Техническое состояние фазы определяется каноническими manifests и evidence reports выше. Удаление legacy остаётся запрещённым до отдельных операторских и владельческих подтверждений.
