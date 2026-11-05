---
name: cdda-reuse-first
description: "Owner's main architecture rule for CDDA (PR #754, 2026-10-19): reuse native CDDA mechanisms first, extend only on a proven gap, build new only when absent — check every executor plan and delivery against it"
metadata:
  node_type: memory
  type: project
  originSessionId: 78d510c9-6cad-477e-aba3-ac3349e7e821
  modified: 2026-10-19T02:43:14.217Z
---

Главное архитектурное правило владельца для перехода на CDDA: «максимально использовать уже готовые механизмы CDDA, расширяя их при необходимости и делать новые только в случае отсутствия». Источник и порядок проверки — `docs/plans/Novgorod1230_Cataclysm_Mechanics_Reuse_Strategy_2026-10-18.md` §1–§4 (PR #754): штатные JSON/настройки/EOC → нативный API и композиция примитивов → минимальный примитив в CDDA при доказанном пробеле; один физический факт — один writer.

**Why:** владелец 2026-10-19 спросил, не придумал ли Codex вторую механику сохранения поверх родного `game::save()`; приёмка P4 это правило систематически не проверяла.
**How to apply:** в каждом задании исполнителю и в каждой приёмке (2, 4) — пункт «для каждого нового механизма: какой родной механизм CDDA проверен и почему не подошёл (файл:строка)»; нет ответа — механизм не принимается. Где искать родное: сначала карта `cdda-native-map/INDEX.md` (236 нужд → родное, ловушки дублей, чего нет; таблица — скриптом `cdda-native-map/tools/index_table.py`), затем граф codebase-memory-mcp `cdda-upstream-0d8843f` (чистый upstream без патчей Codex; Codex видит тот же граф) и снимок `C:/Users/Slaven/cdda-src/0d8843f` (`src`, `tests`, `data/json`, `data/mods`, `doc` — в `doc/` и `doc/JSON/` родные описания EOC, NPC, активностей, JSON); при смене пина upstream — новый снимок `git archive <commit>` из WSL `/home/slaven/cataclysm-recovery` и новый индекс. Аудит 2026-10-19 — `codex-direct/reuse-audit-verdict.md`.
