# misc — домены, добавленные критиком полноты

**Статус:** candidate по всем доменам (не утверждено; собрано под ролью collector, не approver).
**Сборщик:** collect-misc. **Источник задачи:** `scratchpad/gb-retry/misc.json`.

## Домены

| Домен | Строк | Приоритет | Статус |
|---|---:|---|---|
| [hazards_dangers](hazards_dangers/) | 24 | M2c | candidate |
| [anachronism_denylist_lexicon](anachronism_denylist_lexicon/) | 20 | M2c | candidate |

Оба домена — с `README.md` (метод, источники, приёмка, пробелы) и `scripts/build.mjs` + `scripts/check.mjs`, прогнанными и показывающими `OK`.

**Исправления 2026-09-26:** оба домена прошли rework по независимой верификации (`VERIFICATION.md`) — подробности по каждой строке в `hazards_dangers/README.md` и `anachronism_denylist_lexicon/README.md`, разделы «Исправления 2026-09-26». `anachronism_denylist_lexicon/denylist.csv` больше не дублирует костюмные ANTI001–020 (владелец — `clothing-appearance/garments/denylist.csv`, status candidate), отсюда падение счёта строк с 30 до 20.

## Что не сделано в этом проходе (честные пробелы, не в счёт как готовое)

- Привязка `hazards.csv` к конкретным `graph_edges`/`places`/32 G4 стартовой территории v17 — не сделана; строки типизированы по `route_or_edge_kinds`, не по G4-id.
- `period_term` словарь эпохи внутри `anachronism_denylist_lexicon` — 0 строк, отдельный проход нужен.
- Общий скрипт проверки denylist по всем ~60 доменам каталога (соглашение `anachronism`) не запущен — вне физического доступа этого сборщика к остальным группам каталога.
- world_db (`world-base-postgres-1`) не проверялся для этих двух доменов — обе целевые таблицы (`region_risks`, `llm_validation_rules`, `llm_context_packs`, `spatial_v3_traversal_*`) по прежним находкам (sweep-d4) пусты (0 строк); readback после утверждения — задача владельца persistence.
