# Архив: снятые инструкции и исторические материалы

> Архив, не норматив. Файлы перенесены через `git mv` без изменения байтов (кроме заголовка у журналов README) и сохранены для истории. Относительные ссылки внутри них указывают на прежние места и могут не разрешаться. Действующие правила — [AGENTS.md](../../AGENTS.md); карта документации — [docs/README.md](../README.md).

| Старый путь | Новый путь | Причина |
|---|---|---|
| `.cursorrules.txt` | [agent-rules/root.cursorrules.txt](agent-rules/root.cursorrules.txt) | правило «код не сочиняет мир» противоречит AGENTS.md §7/§10; Cursor файл не загружал, но агенты находили его поиском и RAG (LW-021) |
| `legacy/.cursorrules.txt` | [agent-rules/legacy.cursorrules.txt](agent-rules/legacy.cursorrules.txt) | копия того же правила для `legacy/` (LW-021) |
| `legacy/.cursor/rules/project.mdc` | [agent-rules/legacy-cursor-project.mdc](agent-rules/legacy-cursor-project.mdc) | действующее nested-правило Cursor (`alwaysApply: true`) с тем же противоречием (LW-021) |
| `.github/README.md` | [github/README.md](github/README.md) | подменял корневой README на странице GitHub; вход для агентов — корневой AGENTS.md |
| `.github/Правила разработки.txt` | [github/Правила разработки.txt](<github/Правила разработки.txt>) | требовал «полностью прочитать» REFERENCE-документ `development_rules.txt` (LW-021) |
| `.github/Работа с картой G0-G4.txt` | [github/Работа с картой G0-G4.txt](<github/Работа с картой G0-G4.txt>) | требовал «полностью прочитать» MIGRATION / ROLLBACK-документ `map_g0_g4_workflow.txt` (LW-021) |
| `.github/Правило вызова агента-критика.txt` | [github/Правило вызова агента-критика.txt](<github/Правило вызова агента-критика.txt>) | снятое правило аудита; действует AGENTS.md §25.1 |
| `README.md`, разделы «RAG readiness — текущая работа» и «PR №7 …» | [readme/README_work_journals_2026-07.md](readme/README_work_journals_2026-07.md) | журналы PR в обзоре для людей (перенесены дословно в DOC-03, #101) |
| `docs/План визуализации архитектуры проекта «Русь XIII век».docx` | [plans/План визуализации архитектуры проекта «Русь XIII век».docx](<plans/План визуализации архитектуры проекта «Русь XIII век».docx>) | исторический план, не текущая архитектура (#120) |
| `world_base_import_report_v1.json` | [reports/world_base_import_report_v1.json](reports/world_base_import_report_v1.json) | исторический отчёт импорта, не текущий источник схемы (#120) |

Имена `Правила разработки.txt` и `Работа с картой G0-G4.txt` в `data/knowledge-source/source-aliases.json` и в provenance world-catalogs (`file_reference`, `access_location`) — исторические имена источников, а не пути; они не менялись.
