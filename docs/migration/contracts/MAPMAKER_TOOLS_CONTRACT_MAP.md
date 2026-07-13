# Карта контрактов MapMaker и инструментов

| Владелец | Вход | Выход | Запрещено |
|---|---|---|---|
| `@rus/map-maker` | approved G0-G5 graph JSON | `rus.game_graph.v1`, `rus.map_layout.v1`, SVG preview | DB writes, semantic node/edge invention |
| `@rus/db-tools` | `rus.db_tool_manifest.v1` | `rus.db_tool_plan.v1` | SQL execution, bypass dry-run/approval |
| `@rus/docs-tools` | document graph/corpus/chunks + embedding port | verification result, `rus.rag_index.v1` | provider SDK, game state writes |
| `@rus/audit-tools` | source tree | `rus.audit_manifest.v1` | secrets, runtime artifacts, nested ZIP |
