# @rus/knowledge-source

## Назначение

Read-only доступ к утверждённому нормативному корпусу проекта, его source locations и проверенным generated graph/RAG.

## Владеет

- контрактом чтения документов по стабильному `document_id`;
- проверкой corpus manifest, SHA-256 и source locations;
- техническим полнотекстовым поиском без смыслового дополнения;
- определением current/stale/missing для generated graph и RAG.

## Не делает

- не создаёт и не исправляет смысл документов;
- не выбирает наиболее вероятный отсутствующий источник;
- не обращается к legacy fallback;
- не вызывает LLM, embedding provider, БД или UI;
- не изменяет corpus и generated artifacts.

## Публичный API

- `createFileSystemKnowledgeSourceStorage({ sourceRoot, generatedRoot })`;
- `createKnowledgeSourceReader({ storage })`;
- `KnowledgeSourceError` и типизированные коды ошибок.

## Контракты

Все методы принимают структурированный объект. Результаты возвращаются как новые глубоко замороженные объекты. Отсутствующие или повреждённые источники завершаются typed failure.

## Допустимые зависимости

Стандартная библиотека Node.js и явно переданный storage port.

## Запрещённые зависимости

Legacy runtime, apps, provider SDK, party state, world-base, UI и скрытые singleton-сервисы.

## Инварианты

Текст документа возвращается byte-faithful после проверки SHA-256. Generated index считается current только при совпадении хеша corpus manifest и SHA-256 фактического graph/RAG-артефакта с его generated manifest.

## Ошибки

`CORPUS_NOT_FOUND`, `MANIFEST_NOT_FOUND`, `MANIFEST_INVALID`, `DOCUMENT_NOT_REGISTERED`, `DOCUMENT_FILE_MISSING`, `DOCUMENT_HASH_MISMATCH`, `SOURCE_LOCATION_INVALID`, `PATH_TRAVERSAL_REJECTED`, `GENERATED_INDEX_NOT_FOUND`, `GENERATED_INDEX_STALE`, `GENERATED_PROVENANCE_INVALID`, `SEARCH_BACKEND_UNAVAILABLE`.

## Тесты

Unit/negative/contract tests расположены в `packages/knowledge-source/test`.

## Совместимость

Legacy fallback запрещён. Изменение manifest schema или публичного API требует отдельного migration gate.
