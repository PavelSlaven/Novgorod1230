# Правка документа нормативного корпуса

> Процедура. Норм не создаёт: при конфликте действует AGENTS.md, CONTRACT_INDEX и профильные контракты. Проверено: 2026-09-22, commit c5501419.

Корпус — `data/knowledge-source/corpus/DOCUMENTS/*`, реестр —
[corpus-manifest.json](../../data/knowledge-source/corpus-manifest.json) (44 документа). Правила изменения корпуса
задают [KNOWLEDGE_SOURCE_POLICY](../architecture/KNOWLEDGE_SOURCE_POLICY.md) («Изменение корпуса», «RAG-готовность»)
и [CONTRACT_INDEX §10](../../data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md). Правка нормативного
документа — триггер Contract Auditor ([AGENTS.md §25.1](../governance/AUDIT_RULES.md)).

## Область: что можно править по этой процедуре

Режим документа — поле `provenance_mode` его записи в corpus-manifest (подсчёт на c5501419):

| `provenance_mode` | Документов | Как править |
|---|---|---|
| `native` | 25 | по шагам ниже. Прецедент — PR #97: commit d41f494c (правка `CONTRACT_INDEX.md` и `code_critic_invocation_rule.txt` + manifest + generated) и commit 6eefbd35 (пин в `retrieval-policy.json`) |
| `canonicalized_from_legacy` | 17 | дополнительно: то же изменение в зеркале `legacy/DOCUMENTS/documents-kg/corpus/DOCUMENTS/<файл>`, `bytes`/`sha256` зеркала в [legacy-inventory.json](../../data/knowledge-source/imports/legacy-inventory.json) и новая запись в [import-history.json](../../data/knowledge-source/import-history.json) (её `inventory_sha256` — от нового inventory). Прецедент есть только в PR #98 (ветка `codex/live-world-runtime`: `character_parameters.txt`, `npc_generation_profiles.txt`). **До merge #98 — стоп и решение владельца** |
| `legacy_mirror` | 2 | `weapons_and_armor.txt`, `world_regions.txt` — байтово неизменны, не править |

Байтово неизменны и файлы с атрибутом `-whitespace` в [.gitattributes](../../.gitattributes) (в корпусе —
`semantic_world_actions_materialization_and_processes_contract.md`): не нормализовать пробелы и концы строк.

Проверка режима:

```bash
node -e "const m=require('./data/knowledge-source/corpus-manifest.json');for(const d of m.documents)console.log(d.provenance_mode,d.canonical_path)"
```

## Шаги

1. **Правка** документа. Перед ней — `rg` по имени файла в [LEGACY_WARNINGS](../work/LEGACY_WARNINGS.md) и в
   списке закреплённых фраз ниже.
2. **`npm run knowledge:repin`.** Для `native` пересчитывает `sha256`/`bytes` в
   [corpus-manifest.json](../../data/knowledge-source/corpus-manifest.json), закрепляет SHA-256 новых байтов
   manifest в [retrieval-policy.json](../../data/knowledge-source/retrieval-policy.json) и вызывает
   `docs:generate`. Изменённый документ с legacy provenance требует отдельной процедуры выше; команда
   останавливается без переписывания его записи. Generated вручную не править (KSP «Изменение корпуса»).
3. **Проверки:** `knowledge:check-corpus`, `knowledge:check`, `knowledge:controls`, `knowledge:status`,
   `temporal-v4:check-docs` (baseline на 21bd0938 — `conflict_count: 0`), `docs:check`, `test:knowledge-source`, `test:tools`, `git diff --check`.
   Полный `npm test` — в CI (AGENTS §24).
4. **CONTRACT_INDEX** — обновить в том же PR, если документ создан, повышен, переименован, перемещён, заменён или
   существенно изменён (CONTRACT_INDEX §10). Сам индекс — `native`-документ: его правка идёт по этим же шагам.
5. **Коммит generated** вместе с правкой: CI делает `git diff --exit-code -- generated/ …` после `docs:generate`
   ([test.yml](../../.github/workflows/test.yml)).

## Нормы KNOWLEDGE_SOURCE_POLICY и практика

- **L29** требует при изменении документа «полного regression и аудита критика». Практически это: полный
  `npm test` как merge gate в CI (AGENTS §24) + Contract Auditor по AGENTS §25.1.
- RAG корпуса — лексический: после `knowledge:repin` / `knowledge:generate` новый или изменённый
  active-документ получает lexical chunks и не блокирует `knowledge:status` отсутствием embedding
  (`docs/architecture/KNOWLEDGE_SOURCE_POLICY.md`, «RAG-готовность»).

## Закреплённые фразы и байты

Перед правкой проверьте, не держит ли проверка ваш текст. Список получен `rg` по `tools/` и `test/` на c5501419.

**Входят в `npm test`:**

- `tools/docs-tools/test/documentation-generation.test.js` (`test:docs` ⊂ `test:tools`):
  - `AGENTS.md`: должны быть «Канонический индекс контрактов», «`codebase-memory-mcp` в режиме Verify (Tier 2)»,
    «`detect_changes` для фактического diff», «`check_index_coverage` для всех путей», «`@rus/knowledge-source`
    остаётся отдельным нормативным каналом», «очевидной локальной задачи … прямой `rg`»; запрещены «Перед любой
    задачей полностью прочитай», «Перед grep, file search, GitHub code search», «PR №13», «Graphify», «repo-intel»;
  - `development_rules.txt`: должна быть фраза «Эти правила реализуют active-архитектуру materialization v2 и
    проверяются единым release gate»;
  - `llm_documentation_navigation.md`: статус superseded, ссылка на `CONTRACT_INDEX.md`, порядок «root AGENTS.md →
    CONTRACT_INDEX.md → active release/profile/bindings», фраза «Proposed, migration, historical and reference
    documents are not current production contracts»;
  - `README.md`: запрещены «.github/AGENTS.md» и «Правила автоматического применения».
- `test/shadow/ordinary-materialization-shadow-boundary.test.js` (`test:shadow`): в `AGENTS.md` нет строки
  «O1 … active»; читает также `semantic_world_actions_materialization_and_processes_contract.md`.
- `test/shadow/n1-taxonomy-contract.test.js`: `semantic_world_actions_…_contract.md`,
  `npc_autonomous_decision_contract.md`.
- `tools/spatial-v3/check-production-activation-boundary.mjs` (часть `docs:check`): явный список current-status
  файлов (README, 19 документов корпуса, ADR-001/002/004, ряд `MODULE.md` и др.) должен содержать точный термин
  «versioned production activation cutover»; в нём и во всех `MODULE.md` `apps/*`, `packages/*`, а также в `.md`
  из `docs/adr`, `docs/architecture`, `docs/domain`, `docs/pipelines` запрещены устаревшие P28-формулировки
  («after P28», «до P28», «current production v2» и т. п.); в `base_turn_orchestration.txt` — фрагменты
  visible-package lifecycle в заданном порядке.
- knowledge-source тесты и `knowledge:check-corpus` сверяют sha256/bytes из manifest с файлами.

**Не входят в `npm test` (non-gate, сравнивать с baseline до правки):**

- `tools/spatial-v3/check-temporal-docs.mjs` (`temporal-v4:check-docs`): temporal-утверждения в
  `temporal_world_and_interruptible_activities.md`, `time_system.txt`, `base_turn_orchestration.txt`,
  `movement_locations_regions.txt`, `interface_ux.md`;
- `tools/spatial-v3/check-p01.mjs` … `check-p04.mjs` (`spatial-v3:check-p0N`) — фразы в NPC-контрактах, temporal,
  movement, time, formulas, orchestration, world_generation, interface_ux; `check-p02` на 21bd0938 уже падает;
- sha256-пины исторических baseline: `data/contracts/spatial-v3/p05-reviewed-baseline.json` и
  `docs/migration/spatial-v3/normative-freeze.json` (17 документов корпуса и ADR-001).

Если правка задевает закреплённую фразу — меняйте фразу и проверку в одном PR только когда это и есть цель
задачи, с Contract Auditor; иначе сохраните формулировку.
