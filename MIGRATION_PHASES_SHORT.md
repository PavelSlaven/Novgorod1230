# Краткий список фаз миграции «Русь»

Текущий статус: modular runtime и автономный knowledge-source готовы. Legacy не используется production-кодом как источник документации, но сохраняется для rollback и ручной финализации.

1. **Baseline и инвентаризация** — выполнено.
2. **Каркас `Rus_modules`** — выполнено.
3. **Kernel** — выполнено.
4. **Contracts** — выполнено.
5. **Pipeline engine** — выполнено.
6. **LLM runtime** — выполнено.
7. **Data modules** — выполнено.
8. **New-game pipeline** — Stages 2–26 и modular orchestrator выполнены.
9. **Domain modules** — выполнены.
10. **Turn workflow** — выполнен.
11. **Narration и presentation** — выполнено.
12. **Game server и game web** — выполнено; modular route является default.
13. **MapMaker и инструменты** — выполнено.
14. **Тестовая архитектура** — выполнено.
15. **Документация и generated data** — выполнено.
16. **Shadow run и сравнение** — выполнено.
17. **Cutover** — выполнено; rollback route сохранён.
18. **Финализация 0.22.0** — автоматическая часть выполнена, ручное удаление запрещено.
19. **Knowledge Source и corpus 0.23.0** — 29 legacy-файлов классифицированы, 19 canonical sources перенесены byte-for-byte, graph/RAG привязаны к новому corpus, runtime port интегрирован.

## Текущая точка

- Релиз: `0.23.0-migration.23`.
- Canonical corpus: 19 документов.
- Unique-file review: выполнен, unknown = 0.
- Graph: 1295 nodes, 3602 links, 11 hyperedges.
- RAG: 813 chunks, approved embedding snapshot.
- Production legacy DOCUMENTS fallback: отсутствует.
- Legacy deletion allowed: false.
