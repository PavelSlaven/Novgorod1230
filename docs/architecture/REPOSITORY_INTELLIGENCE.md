# Repository Intelligence MVP

## Назначение

PR №13 добавляет локальный read-only инструмент навигации по репозиторию. Он соединяет два независимых канала:

```text
@rus/knowledge-source ── нормативные документы
Graphify              ── topology исходного кода
```

`@rus/knowledge-source` сохраняет нормативную authority, source SHA и source ranges. Graphify показывает только файлы, модули, символы, импорты и вызовы. Graphify result и `INFERRED` edge никогда не являются нормативным утверждением.

## Публичный MVP

```powershell
npm run repo-intel:build
npm run repo-intel:status
npm run repo-intel:query -- --query "информационная потребность"
```

`build` запускает локальный Graphify code-only extraction и записывает `generated/repository-intelligence/manifest.json`. Manifest содержит pinned Graphify version и `git rev-parse HEAD`.

`status` не изменяет файлов. Он проверяет executable `graphify`, exact version `0.9.17`, `graphify-out/graph.json`, manifest и совпадение manifest commit с текущим HEAD. `degraded` knowledge-source остаётся warning; unavailable или malformed knowledge readiness возвращает typed failure.

`query` сначала проверяет status, затем выполняет оба поиска независимо и возвращает раздельные `knowledge_source` и `graphify` результаты. При проблеме одного разрешённого канала результат другого сохраняется с `partial: true`. Graphify query не запускается при missing, stale или invalid graph и не выполняет скрытый build.

## Граница с игрой

Repository Intelligence не импортирует game runtime, world/party database adapter, G0–G5 materialization module, SQL client, LLM provider или network client. Он не читает и не записывает `world_base`, `party_runtime`, игровые nodes, edges, routes либо facts.

Локальные outputs находятся только в:

```text
graphify-out/
generated/repository-intelligence/
```

Эти каталоги игнорируются Git и воспроизводятся `repo-intel:build`; это не G0–G5 и не runtime storage.

## Отложено

MVP не доказывает полный repository coverage, не создаёт document-index lane, не требует database acceptance и не исправляет существующие semantic gaps. Эти работы не должны маскироваться как readiness или использоваться для ослабления materialization rules.
