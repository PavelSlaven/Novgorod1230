# Knowledge corpus extension gate

## Цель

Расширить канонический knowledge corpus новыми нормативными документами проекта без создания дублирующих источников, без ослабления проверки целостности и без автоматического создания смысловых связей.

## Граница изменения

Изменяются только технические механизмы:

- manifest и aliases канонического corpus;
- проверка SHA-256, размера, уникальности ID и путей;
- опциональная историческая provenance-ссылка на legacy;
- детерминированная materialization graph/RAG;
- документационные реестры и generated manifests.

Код не создаёт и не исправляет содержание нормативных документов, semantic nodes, semantic links или embeddings.

## Канонический источник

Каждый нормативный документ имеет один физический канонический файл в:

```text
data/knowledge-source/corpus/DOCUMENTS/
```

Пути вне corpus могут существовать только как исторические aliases/previous paths в реестрах. Одновременное хранение byte-identical нормативных копий в `docs/normative` и corpus запрещено.

## Совместимость manifest

Схема `rus.knowledge_corpus_manifest.v1` сохраняется.

- `source_legacy_path` остаётся optional;
- старые 19 документов сохраняют legacy provenance;
- новые документы могут не иметь legacy provenance;
- отсутствие `source_legacy_path` не является ошибкой целостности corpus.

## Разделение проверок

### Canonical corpus gate

`verifyCanonicalCorpus` проверяет:

- schema version manifest и aliases;
- уникальность `document_id` и `canonical_path`;
- допустимый путь внутри `corpus/DOCUMENTS`;
- фактический SHA-256 и размер;
- совпадение `file_name` с basename пути;
- ссылки aliases только на зарегистрированные документы.

### Legacy migration report

Legacy inventory используется только для исторической сверки записей, у которых указан `source_legacy_path`. Он не определяет допустимое число документов текущего corpus.

### Generated graph/RAG gate

Graph и RAG считаются current только после пересборки против текущего manifest и проверки generated provenance. Старые snapshots не могут объявляться current после изменения corpus manifest.

## TDD

Обязательные тесты:

1. corpus из legacy и native документов проходит проверку;
2. документ без `source_legacy_path` допустим;
3. stale hash отклоняется;
4. duplicate ID/path отклоняется;
5. alias на неизвестный ID отклоняется;
6. traversal path отклоняется;
7. generated graph/RAG со старым manifest hash отклоняются;
8. clean clone → corpus check → generation → full test проходит без legacy fallback.

## Порядок миграции

1. Ввести independent canonical corpus verifier.
2. Добавить тесты и CLI/npm gate.
3. Перенести нормативы в corpus и удалить физические дубли.
4. Обновить corpus manifest, aliases и CANONICAL_PATHS.
5. Заменить hardcoded counts на значения manifest/inventory contracts.
6. Пересобрать graph/RAG без создания новых semantic facts кодом.
7. Обновить generated manifests и отчёты.
8. Выполнить clean-clone CI.
9. Передать полный diff, тесты и нормативы агенту-критику.

## Критерии допуска

Изменение допускается к объединению только если:

- все автоматические проверки зелёные;
- нет двух физических канонических копий одного документа;
- graph/RAG provenance связан с текущим corpus manifest;
- critic audit вернул `PASS` или допустимый `PASS WITH NOTES`.
