# Статус обновления knowledge-source для Новгородской земли

Дата: 2026-07-12

## Подготовлено

Создан update candidate:

```text
data/knowledge-source/imports/novgorod-region-scope-2026-07-12
```

Он содержит:

- актуальный `world_regions.txt`;
- `novgorod_region_scope_and_cell_workflow_1230.md`;
- `NOVGOROD_V6_LEGACY_STATUS.md`;
- обновлённую навигацию LLM;
- manifest с SHA-256.

## Почему production corpus пока не заменён

Действующий knowledge-source проверяет:

1. точный corpus manifest;
2. approved semantic graph snapshot;
3. точное совпадение RAG chunks;
4. approved embedding vectors для каждого chunk.

Добавление или изменение документа делает старые graph/RAG snapshots несовместимыми. Без нового semantic graph review и новых embeddings автоматическая замена привела бы к блокировке production startup.

## Обязательный дальнейший gate

```text
update candidate
→ semantic graph review
→ graph snapshot update
→ RAG rechunk
→ embedding generation
→ knowledge:generate
→ knowledge:check
→ npm test
→ critic audit
→ corpus cutover
```

До прохождения этого gate старый production corpus сохраняется неизменным, а update candidate служит единственным подготовленным источником следующей миграции.
