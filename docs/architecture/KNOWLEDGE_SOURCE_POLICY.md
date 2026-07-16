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

Codex, Cursor и другие агенты разработки используют `packages/knowledge-source/src/cli.js` через команды `knowledge:status`, `knowledge:query`, `knowledge:read` и `knowledge:controls`. CLI является read-only adapter над публичными readers и не имеет собственного пути чтения, ranking logic или fallback.

Успешный результат CLI является JSON в `stdout`; typed failure является JSON в `stderr` и ненулевым exit code. Это позволяет агенту или IDE вызывать интерфейс без разбора человекоориентированного текста.

## Изменение корпуса

Изменение документа требует обновления manifest, пересборки graph/RAG, parity-проверки, полного regression и аудита критика. Ручное редактирование generated output запрещено.

Документ без утверждённого semantic/embedding snapshot получает только structural graph node и lexical-only chunks. Provenance каждого semantic node, link, hyperedge и его `member_source_files` обязан принадлежать exact approved embedding document set; semantic relations не могут ссылаться на structural-only nodes. Semantic relations, embedding vectors и признаки `semantic_indexed` не создаются эвристически.

## RAG-готовность

`data/knowledge-source/retrieval-policy.json` является формальным техническим контрактом retrieval-слоя. Для каждого зарегистрированного документа он фиксирует тип, нормативный приоритет, подсистемы, связанные документы, модули и контракты, поисковые термины, известные конфликты и состояние semantic coverage.

Обычный RAG-поиск использует только документы со статусом `active`. `proposed` и `deprecated` доступны только читателю, которому эти статусы явно разрешены, и только при явном указании статуса в запросе. Каждый результат возвращает статус документа, SHA-256 источника, диапазон строк, метод retrieval, нормативный приоритет и связи. Явно зарегистрированный конфликт возвращается отдельно от обычных результатов с собственным статусом и полным provenance; status isolation не скрывает его и не делает конфликтующий документ обычным нормативным контекстом.

Semantic coverage не подменяется эвристикой. Состояния `baseline_gap` и `required_before_merge` отображаются явно. `required_before_merge` блокирует готовность RAG; `baseline_gap` допускается только как зарегистрированный долг существующего корпуса. Новый или изменённый active-документ без утверждённого embedding обязан получить `required_before_merge`, если semantic snapshot не обновляется в том же PR.

Retrieval policy и generated RAG должны быть привязаны к одному SHA-256 corpus manifest. Расхождение, отсутствующая metadata-карточка, конфликт metadata с фактическим coverage или повреждённый generated artifact приводят к typed failure.

Для устойчивых обязанностей системы поддерживаются контрольные запросы. Проверка считается успешной, только если хотя бы один ожидаемый авторитетный документ попал в заданный `top_k`. Контрольные запросы обновляются вместе с изменением терминологии, приоритетов и ответственности подсистем.

## Рабочий процесс агента разработки

```text
knowledge:status
→ knowledge:query по конкретной информационной потребности
→ полное knowledge:read обязательных и профильных документов
→ code search реализаций, контрактов и тестов
→ изменение
→ knowledge:controls и тесты
```

RAG отвечает за обнаружение и provenance, но не отменяет обязательное полное чтение документов, перечисленных в `AGENTS.md`. Stale RAG, typed failure, semantic blocker или недоступный обязательный документ являются hard block и не могут обходиться прямым файловым поиском.
