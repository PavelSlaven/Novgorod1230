# @rus/knowledge-source

## Назначение

Read-only доступ к утверждённому нормативному корпусу проекта, его source locations и проверенным generated graph/RAG.

## Владеет

- контрактом чтения документов по стабильному `document_id`;
- проверкой corpus manifest, SHA-256 и source locations;
- техническим полнотекстовым поиском без смыслового дополнения;
- status-aware ranked retrieval по committed RAG chunks;
- проверкой retrieval metadata, semantic coverage gaps и контрольных запросов;
- определением current/stale/missing для generated graph и RAG.

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
- `createKnowledgeRagReader({ storage, allowedStatuses })`;
- `validateRetrievalPolicy(value, manifest)`;
- `rankKnowledgeChunks(input)`;
- `KnowledgeSourceError` и типизированные коды ошибок.

`createKnowledgeRagReader` предоставляет `getRetrievalPolicy`, `searchKnowledge`, `runControlQueries` и `getReadinessStatus`.

## Контракты

Все методы принимают структурированный объект. Результаты возвращаются как новые глубоко замороженные объекты. Отсутствующие или повреждённые источники завершаются typed failure.

Ranked retrieval возвращает `document_id`, статус, source SHA-256, section/range, retrieval method, priority tier, semantic coverage status и зарегистрированные связи. По умолчанию доступны только `active`; иные статусы требуют явного разрешения reader и явного запроса.

## Допустимые зависимости

Стандартная библиотека Node.js и явно переданный storage port.

## Запрещённые зависимости

Legacy runtime, apps, provider SDK, party state, world-base, UI и скрытые singleton-сервисы.

## Инварианты

Текст документа возвращается byte-faithful после проверки SHA-256. Generated index считается current только при совпадении хеша corpus manifest и SHA-256 фактического graph/RAG-артефакта с его generated manifest.

Retrieval policy обязана покрывать каждый зарегистрированный документ и быть привязана к тому же corpus manifest, что и generated RAG. Semantic gaps маркируются явно; `required_before_merge` является hard block.

## Ошибки

`CORPUS_NOT_FOUND`, `MANIFEST_NOT_FOUND`, `MANIFEST_INVALID`, `DOCUMENT_NOT_REGISTERED`, `DOCUMENT_FILE_MISSING`, `DOCUMENT_HASH_MISMATCH`, `DOCUMENT_STATUS_NOT_ALLOWED`, `SOURCE_LOCATION_INVALID`, `PATH_TRAVERSAL_REJECTED`, `GENERATED_INDEX_NOT_FOUND`, `GENERATED_INDEX_STALE`, `GENERATED_PROVENANCE_INVALID`, `RETRIEVAL_POLICY_INVALID`, `RETRIEVAL_POLICY_INCOMPLETE`, `RETRIEVAL_POLICY_STALE`, `SEMANTIC_COVERAGE_GAP`, `SEARCH_BACKEND_UNAVAILABLE`.

## Тесты

Unit/negative/contract tests расположены в `packages/knowledge-source/test`. Retrieval tests отдельно проверяют status isolation, manifest pin, metadata completeness, semantic gaps и контрольные top-k запросы.

## Совместимость

Legacy fallback запрещён. Изменение manifest schema или публичного API требует отдельного migration gate. Старый `createKnowledgeSourceReader.searchDocuments` сохраняется как точный full-text интерфейс; новый ranked retrieval предоставляется отдельным `createKnowledgeRagReader`.
