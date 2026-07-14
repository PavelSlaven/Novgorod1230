# Политика нормативного корпуса и knowledge-source

## Источник истины

Единственный канонический runtime-корпус находится в `data/knowledge-source/corpus/DOCUMENTS`. Manifest v2 различает `proposed`, `active` и `deprecated`; production reader по умолчанию видит только `active`. Legacy-файлы остаются rollback evidence, а актуализированный канонический документ хранит отдельный digest legacy provenance.

## Разделение source и generated

Исходные документы являются нормативным источником. `generated/knowledge-source/graph` и `generated/knowledge-source/rag` являются воспроизводимыми представлениями и не имеют права заменять исходный текст. Imported snapshots хранят утверждённые LLM/embedding-результаты, которые код только проверяет и материализует.

## Граница кода и LLM

Код knowledge-source не создаёт нормативные правила или историю. Runtime-код, руководствуясь активными нормативами, может материализовать party instances только из утверждённых categories/templates/profiles/rules. LLM не расширяет каталог и не пишет state patches.

## Fail-closed

Отсутствующий документ, неверный SHA-256, повреждённый manifest, недопустимый диапазон строк или неизвестный `document_id` останавливают операцию typed failure. Approved embedding применяется только при byte-compatible chunks; изменённый документ автоматически становится lexical-only до нового semantic approval. Legacy fallback и подстановка похожего документа запрещены.

## Доступ

Production consumers получают `KnowledgeSourceReader` через composition root. Прямое чтение `data/knowledge-source`, `generated/knowledge-source` или `legacy/DOCUMENTS` из смысловых модулей запрещено.

## Изменение корпуса

Изменение документа требует обновления manifest, пересборки graph/RAG, parity-проверки, полного regression и аудита критика. Ручное редактирование generated output запрещено.

Документ без утверждённого semantic/embedding snapshot получает только structural graph node и lexical-only chunks. Provenance каждого semantic node, link, hyperedge и его `member_source_files` обязан принадлежать exact approved embedding document set; semantic relations не могут ссылаться на structural-only nodes. Semantic relations, embedding vectors и признаки `semantic_indexed` не создаются эвристически.
