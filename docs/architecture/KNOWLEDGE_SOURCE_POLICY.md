# Политика нормативного корпуса и knowledge-source

## Источник истины

Единственный канонический runtime-корпус находится в `data/knowledge-source/corpus/DOCUMENTS`. Каждый документ зарегистрирован в `corpus-manifest.json` по стабильному `document_id`, canonical path, размеру и SHA-256. Файлы legacy остаются read-only rollback evidence и не используются production runtime.

## Разделение source и generated

Исходные документы являются нормативным источником. `generated/knowledge-source/graph` и `generated/knowledge-source/rag` являются воспроизводимыми представлениями и не имеют права заменять исходный текст. Imported snapshots хранят утверждённые LLM/embedding-результаты, которые код только проверяет и материализует.

## Граница кода и LLM

Код читает, хеширует, валидирует, ищет буквальные совпадения, проверяет source locations и передаёт выбранные фрагменты. Код не создаёт новые правила, связи, причины, исторические факты или смысловые выводы. Семантическое обогащение допускается только отдельной LLM-процедурой с аудитом и утверждением.

## Fail-closed

Отсутствующий документ, неверный SHA-256, повреждённый manifest, недопустимый диапазон строк, stale graph/RAG или неизвестный `document_id` останавливают операцию typed failure. Legacy fallback и подстановка похожего документа запрещены.

## Доступ

Production consumers получают `KnowledgeSourceReader` через composition root. Прямое чтение `data/knowledge-source`, `generated/knowledge-source` или `legacy/DOCUMENTS` из смысловых модулей запрещено.

## Изменение корпуса

Изменение документа требует обновления manifest, пересборки graph/RAG, parity-проверки, полного regression и аудита критика. Ручное редактирование generated output запрещено.

Документ без утверждённого semantic/embedding snapshot получает только structural graph node и lexical-only chunks. Provenance каждого semantic node, link и hyperedge обязан принадлежать exact approved embedding document set; semantic relations не могут ссылаться на structural-only nodes. Semantic relations, embedding vectors и признаки `semantic_indexed` не создаются эвристически.
