# Политика нормативного корпуса и knowledge-source

## Источник истины

Единственный канонический runtime-корпус находится в `data/knowledge-source/corpus/DOCUMENTS`. Manifest v2 различает `proposed`, `active`, `reference` и `deprecated`; поля `status` и `priority_tier` в `corpus-manifest.json` выводит `knowledge:repin` из меток [CONTRACT_INDEX](../../data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md) (ACTIVE → `active`; PROPOSED → `proposed`; UNDECLARED / non-legacy REFERENCE → `reference`; REFERENCE/LEGACY, REDIRECT, SUPERSEDED, MIGRATION → `deprecated`; неизвестная метка — ошибка `knowledge:check`). Ручная правка этих полей запрещена. Production reader по умолчанию видит `active` и `reference`. Legacy-файлы остаются rollback evidence, а актуализированный канонический документ хранит отдельный digest legacy provenance.

## Разделение source и generated

Исходные документы являются нормативным источником. `generated/knowledge-source/graph` и `generated/knowledge-source/rag` являются воспроизводимыми представлениями и не имеют права заменять исходный текст. Generated graph — structural document nodes; RAG — deterministic lexical chunks без embedding-слоя.

## Граница кода и LLM

Код knowledge-source не создаёт нормативные правила или историю. Runtime-код, руководствуясь активными нормативами, может материализовать party instances только из утверждённых categories/templates/profiles/rules. LLM не расширяет каталог и не пишет state patches.

## Fail-closed

Отсутствующий документ, неверный SHA-256, повреждённый manifest, недопустимый диапазон строк или неизвестный `document_id` останавливают операцию typed failure. Legacy fallback и подстановка похожего документа запрещены.

## Доступ

Production consumers получают `KnowledgeSourceReader` через composition root. Прямое чтение `data/knowledge-source`, `generated/knowledge-source` или `legacy/DOCUMENTS` из смысловых модулей запрещено.

Codex, Cursor и другие агенты разработки используют `packages/knowledge-source/src/cli.js` через команды `knowledge:status`, `knowledge:query`, `knowledge:read` и `knowledge:controls`. CLI является read-only adapter над публичными readers и не имеет собственного пути чтения, ranking logic или fallback.

Успешный результат CLI является JSON в `stdout`; typed failure является JSON в `stderr` и ненулевым exit code. Это позволяет агенту или IDE вызывать интерфейс без разбора человекоориентированного текста.

## Изменение корпуса

Изменение документа требует обновления manifest, пересборки graph/RAG, parity-проверки, полного regression и аудита критика. Ручное редактирование generated output запрещено.

Каждый зарегистрированный документ получает structural graph node (для `active`) и deterministic lexical chunks. Embedding vectors, semantic index и признаки semantic coverage не создаются.

## RAG-готовность

`data/knowledge-source/retrieval-policy.json` является формальным техническим контрактом retrieval-слоя. Для каждого зарегистрированного документа он фиксирует тип, нормативный приоритет, подсистемы, связанные документы, модули и контракты, поисковые термины и известные конфликты.

Обычный RAG-поиск использует документы со статусами `active` и `reference` (`default_statuses`). Статус `reference` имеет нижний `priority_tier` и в ранжировании всегда ниже любого `active`. `proposed` и `deprecated` доступны только читателю, которому эти статусы явно разрешены, и только при явном указании статуса в запросе. Каждый результат возвращает статус документа, SHA-256 источника, диапазон строк, метод retrieval, нормативный приоритет и связи. Явно зарегистрированный конфликт возвращается отдельно от обычных результатов с собственным статусом и полным provenance; status isolation не скрывает его и не делает конфликтующий документ обычным нормативным контекстом.

Поиск корпуса — честно лексический: ранжирование по committed lexical chunks. Новый или изменённый active-документ после `knowledge:repin` / `knowledge:generate` остаётся в том же lexical контуре и не переводит RAG readiness в `blocked` из-за отсутствия embedding.

Retrieval policy и generated RAG должны быть привязаны к одному SHA-256 corpus manifest. Расхождение, отсутствующая metadata-карточка или повреждённый generated artifact приводят к typed failure.

Для устойчивых обязанностей системы поддерживаются контрольные запросы. Проверка считается успешной, только если хотя бы один ожидаемый авторитетный документ попал в заданный `top_k`. Контрольные запросы обновляются вместе с изменением терминологии, приоритетов и ответственности подсистем.

## Рабочий процесс агента разработки

```text
knowledge:status
→ knowledge:query по конкретной информационной потребности
→ knowledge:read разделов, найденных через query или маршрутизацию AGENTS.md; документ целиком — только редактируемый или контракт при изменении повышенного риска
→ code search реализаций, контрактов и тестов
→ изменение
→ knowledge:controls и тесты
```

RAG отвечает за обнаружение и provenance, но не отменяет чтение разделов, найденных через query или назначенных маршрутизацией `AGENTS.md`; документ целиком читается, только если он редактируется или является контрактом при изменении повышенного риска. Stale RAG, typed failure или недоступный обязательный документ являются hard block и не могут обходиться прямым файловым поиском.
