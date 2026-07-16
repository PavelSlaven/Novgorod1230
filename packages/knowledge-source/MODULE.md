# @rus/knowledge-source

## Назначение

Read-only доступ к утверждённому нормативному корпусу проекта, его source locations и проверенным generated graph/RAG.

## Владеет

- контрактом чтения документов по стабильному `document_id`;
- проверкой corpus manifest, SHA-256 и source locations;
- техническим полнотекстовым поиском без смыслового дополнения;
- ranked lexical retrieval по committed RAG chunks;
- status-aware metadata, provenance, readiness и контрольными запросами;
- определением current/stale/missing для generated graph и RAG;
- read-only CLI-интерфейсом нормативного поиска для Codex, Cursor и других агентов разработки.

## Не делает

- не создаёт и не исправляет смысл документов;
- не выбирает наиболее вероятный отсутствующий источник;
- не обращается к legacy fallback;
- не вызывает LLM, embedding provider, БД или UI;
- не изменяет corpus и generated artifacts;
- не объявляет lexical ranking семантическим поиском.

## Публичный API

- `createFileSystemKnowledgeSourceStorage({ sourceRoot, generatedRoot })`;
- `createKnowledgeSourceReader({ storage })`;
- `createKnowledgeRagReader({ storage })`;
- `validateRetrievalPolicy(value, manifest)`;
- `rankKnowledgeChunks(input)`;
- `KnowledgeSourceError` и типизированные коды ошибок.

## Agent CLI

CLI расположен в `packages/knowledge-source/src/cli.js` и вызывается корневыми npm-командами:

```bash
npm run knowledge:status
npm run knowledge:query -- --query "материализация NPC" --limit 8
npm run knowledge:read -- --document-id code-driven-world-materialization-architecture
npm run knowledge:controls
```

Дополнительные параметры:

- `--statuses active,proposed` — явное разрешение и запрос дополнительных статусов;
- `--document-ids id-a,id-b` — ограничение поиска конечным списком документов;
- `--query-ids id-a,id-b` — выбор контрольных запросов;
- `--root <path>` — корень репозитория при прямом запуске CLI.

Успешный результат выводится в `stdout` как JSON. Ошибка выводится в `stderr` как `rus.knowledge_cli_error.v1`; exit code `2` означает ошибку аргументов, `1` — typed failure knowledge-source или провал control queries.

## Контракты

Все методы принимают структурированный объект. Результаты возвращаются как новые глубоко замороженные объекты. Отсутствующие или повреждённые источники завершаются typed failure. CLI является тонким adapter-слоем и не дублирует retrieval logic.

## Допустимые зависимости

Стандартная библиотека Node.js и явно переданный storage port.

## Запрещённые зависимости

Legacy runtime, apps, provider SDK, party state, world-base, UI и скрытые singleton-сервисы.

## Инварианты

Текст документа возвращается byte-faithful после проверки SHA-256. Generated index считается current только при совпадении хеша corpus manifest и SHA-256 фактического graph/RAG-артефакта с его generated manifest. CLI использует те же readers и не имеет обходного пути к corpus или generated files.

## Ошибки

`CORPUS_NOT_FOUND`, `MANIFEST_NOT_FOUND`, `MANIFEST_INVALID`, `DOCUMENT_NOT_REGISTERED`, `DOCUMENT_FILE_MISSING`, `DOCUMENT_HASH_MISMATCH`, `DOCUMENT_STATUS_NOT_ALLOWED`, `SOURCE_LOCATION_INVALID`, `PATH_TRAVERSAL_REJECTED`, `GENERATED_INDEX_NOT_FOUND`, `GENERATED_INDEX_STALE`, `GENERATED_PROVENANCE_INVALID`, `RETRIEVAL_POLICY_STALE`, `SEMANTIC_COVERAGE_GAP`, `SEARCH_BACKEND_UNAVAILABLE`, `CLI_ARGUMENT_INVALID`.

## Тесты

Unit/negative/contract tests расположены в `packages/knowledge-source/test`. `agent-cli.test.js` запускает реальный CLI как subprocess и проверяет JSON/exit-code contract.

## Совместимость

Legacy fallback запрещён. Существующий `searchDocuments` сохранён. Новый RAG reader и CLI являются добавочными публичными интерфейсами. Изменение manifest schema или существующего публичного API требует отдельного migration gate.
