# Канонический индекс контрактов Novgorod1230

**Статус:** active documentation/navigation index  
**Репозиторий:** `PavelSlaven/Novgorod1230`  
**Каноническое merged state:** ветка `main`  
**Аудит индекса:** 2026-09-02, `main` HEAD `4cb58cdd1ee1ef636df0437b650bffe50f0936`

Этот файл отвечает только за навигацию, статусы и порядок применения документов. Он не создаёт новую gameplay semantics и не заменяет профильные контракты, schemas, active bindings, код или tests.

## 1. Обязательный порядок чтения

Для любой задачи:

1. прочитать root [`AGENTS.md`](../../../../AGENTS.md);
2. прочитать этот индекс;
3. прочитать applicable nested `AGENTS.md`;
4. прочитать relevant `MODULE.md`;
5. установить active release, profile, manifest, binding и schema затронутой области;
6. прочитать applicable active contracts;
7. сверить production code, callers, tests и CI;
8. читать proposed/target/migration/reference документы только в их заявленном статусе.

Для вопроса «что уже смержено сейчас» source of truth — `main`. Для текущей PR-задачи рабочим состоянием является exact checkout ветки, но несмёрженный diff не становится общей production-нормой.

Файл, имя которого содержит `contract`, `standard`, `policy` или `target`, не получает статус автоматически. Статус определяется одновременно:

- явным normative header документа;
- завершённым versioned cutover;
- active release/profile/manifest/binding;
- согласованными schemas, code и tests.

## 2. Статусы

| Статус | Значение |
|---|---|
| `GOVERNING` | стабильная продуктовая и административная норма; высший уровень — root `AGENTS.md` |
| `ACTIVE` | действующий норматив текущей production-семантики в заявленной области |
| `ACTIVE SPECIALIZATION` | действующий более узкий норматив; имеет приоритет над общим документом только в своём scope |
| `PROPOSED / UMBRELLA TARGET` | целевое предложение; не описывает production само по себе |
| `MIGRATION / ROLLBACK` | источник для миграции, rollback или исторической интерпретации; не production fallback |
| `REFERENCE / DOMAIN GUIDE` | полезная справка; сама по себе не доказывает active behavior |
| `SUPERSEDED / REDIRECT` | совместимый filename, направляющий к актуальному владельцу |
| `UNDECLARED` | файл не имеет достаточно ясного status header; Contract Auditor обязан установить его роль по active owner/binding до использования как нормы |

При конфликте применяется наиболее высокий и наиболее узкий applicable источник. Proposed, migration, reference и undeclared документы не могут отменять governing/active contract.

## 3. Governing source

| Документ | Статус | Scope |
|---|---|---|
| [`AGENTS.md`](../../../../AGENTS.md) | `GOVERNING` | продуктовая конституция, process rules, owner boundaries, persistence, simplicity, audit discipline |

`Novgorod1230_project_instruction_full.md` отсутствует в repository `main`; отдельную копию в репозиторий добавлять не следует. Для вопроса о текущем merged implementation state source of truth остаётся `main`. Если администратор явно передал внешнюю project instruction в текущей задаче, она является governing task input на продуктовом/reviewer уровне: при конфликте с repository state нужно явно разделить current production и требуемое/целевое поведение, а не молча подменять одно другим. Такая внешняя инструкция не становится частью merged repository state, пока соответствующие изменения не приняты в GitHub.

## 3.1. Module contracts and public schemas

Все module-level contracts перечислены в generated [`MODULE_INDEX.md`](../../../../MODULE_INDEX.md). Этот generated файл используется только для навигации; точный owner и public boundary задаёт соответствующий `MODULE.md`, а physical schema — canonical DDL/schema source затронутой области.

Contract Auditor не копирует весь generated module index сюда и не редактирует его вручную. Он выбирает relevant `MODULE.md` по `MODULE_INDEX.md`, затем сверяет public exports, schemas, callers и tests.

## 4. Explicit active contracts

| Документ | Статус | Основной scope / примечание |
|---|---|---|
| [`code_driven_world_materialization_architecture.md`](code_driven_world_materialization_architecture.md) | `ACTIVE` | общий code/LLM/materialization boundary; Spatial v3 специализирует spatial production details |
| [`spatial_v3_target_code_driven_world_materialization_architecture.md`](spatial_v3_target_code_driven_world_materialization_architecture.md) | `ACTIVE SPECIALIZATION` | active Spatial v3 production materialization; слово `target` в filename сохранено для compatibility |
| [`spatial_architecture_standard_g0_g6.md`](spatial_architecture_standard_g0_g6.md) | `ACTIVE` | canonical Spatial G0–G6, topology, movement, scene and perception boundaries |
| [`spatial_v3_target_map_g0_g4_workflow.txt`](spatial_v3_target_map_g0_g4_workflow.txt) | `ACTIVE SPECIALIZATION` | active G0–G5 authoring workflow; compatibility filename |
| [`spatial_v3_target_read_only_database_and_graph_architecture.md`](spatial_v3_target_read_only_database_and_graph_architecture.md) | `ACTIVE SPECIALIZATION` | active read-only world-base / party-runtime graph boundary |
| [`spatial_v3_target_world_base_materialization_table_requirements.md`](spatial_v3_target_world_base_materialization_table_requirements.md) | `ACTIVE SPECIALIZATION` | active Spatial v3 table-purpose contract; DDL remains physical truth |
| [`world_base_materialization_table_requirements.md`](world_base_materialization_table_requirements.md) | `ACTIVE` with scoped migration sections | general authoring/readiness semantics; v3 specialization owns current production table-purpose details |
| [`turn_step_llm_contract.md`](turn_step_llm_contract.md) | `ACTIVE` | sole player semantic turn-step boundary, operation contracts and LLM authority |
| [`items_and_property.txt`](items_and_property.txt) | `ACTIVE` | item/container/property/access/mechanics and currently activated ordinary profiles |
| [`temporal_world_and_interruptible_activities.md`](temporal_world_and_interruptible_activities.md) | `ACTIVE` | exact time, activities, temporal boundaries, autonomous advancement |
| [`npc_autonomous_decision_contract.md`](npc_autonomous_decision_contract.md) | `ACTIVE` | NPC subjective context, decision boundary, persistence and common mechanics |
| [`npc_conversation_mode_contract.md`](npc_conversation_mode_contract.md) | `ACTIVE` | conversation, speech, listeners, multi-NPC social flow and exact committed utterance |
| [`npc_combat_and_trigger_contract.md`](npc_combat_and_trigger_contract.md) | `ACTIVE` | combat trigger/session integration and NPC decisions |
| [`combat_system.md`](combat_system.md) | `ACTIVE DOMAIN NORM` | persisted combat session and exchange behavior for current active revision |

Active status applies only to the scope stated by each header and active profile. Exact schema/operation names must be verified against current code and tests.

## 5. Explicit non-production, migration and supporting contracts

| Документ | Статус | Правило применения |
|---|---|---|
| [`world_knowledge_platform_implementation_contract.md`](world_knowledge_platform_implementation_contract.md) | `ACTIVE` | Норматив реализованной WK production-v1 PR92 (`4.13.0-world-knowledge.1`); runtime wiring spatial-v3 production v15 — `validated_candidate_not_active`, activation определяется actual release/binding, а не этим индексом. Pilot pack остаётся `reviewed/not_active`, optional stages — target до отдельной активации |
| [`semantic_world_actions_materialization_and_processes_contract.md`](semantic_world_actions_materialization_and_processes_contract.md) | `PROPOSED UMBRELLA TARGET` | не active как единый контракт; активированные profile semantics берутся из их actual cutover/bindings/active contracts/code/tests, а не из старого umbrella snapshot |
| [`universal_category_classification_policy.md`](universal_category_classification_policy.md) | `PROPOSED` | не доказывает наличие DDL, profiles, validators или runtime capability |
| [`universal_category_classification_references.md`](universal_category_classification_references.md) | `REFERENCE FOR PROPOSED POLICY` | источники/обоснования proposed classification policy |
| [`read_only_database_and_graph_architecture.md`](read_only_database_and_graph_architecture.md) | `MIGRATION / ROLLBACK` | materialization v2; active owner — Spatial v3 specialization |
| [`map_g0_g4_workflow.txt`](map_g0_g4_workflow.txt) | `MIGRATION / ROLLBACK` | прежний G0–G4 workflow; active owner — Spatial v3 compatibility workflow |
| [`spatial_v3_target_code_driven_world_materialization_architecture.md`](spatial_v3_target_code_driven_world_materialization_architecture.md) | `ACTIVE`, not proposed | explicit exception to filename heuristics |
| [`spatial_v3_target_map_g0_g4_workflow.txt`](spatial_v3_target_map_g0_g4_workflow.txt) | `ACTIVE`, not proposed | explicit exception to filename heuristics |
| [`spatial_v3_target_read_only_database_and_graph_architecture.md`](spatial_v3_target_read_only_database_and_graph_architecture.md) | `ACTIVE`, not proposed | explicit exception to filename heuristics |
| [`spatial_v3_target_world_base_materialization_table_requirements.md`](spatial_v3_target_world_base_materialization_table_requirements.md) | `ACTIVE`, not proposed | explicit exception to filename heuristics |

## 6. Compatibility navigation and superseded audit rules

World Knowledge ranking (§§58–60 действующего контракта) сохраняет приоритет
hard constraints, exact focus и requested predicates; внутри этих уровней
query relevance предшествует context specificity и qualifiers. Это порядок
bounded retrieval, не изменение applicability, actor access или authority.

World Knowledge §35.1 закрепляет production authoring approval: независимый
per-claim verdict связан с точными claim/localization/evidence inputs.
Владелец проверки — internal compiler `@rus/world-catalog-workflow`;
runtime World Knowledge получает только `verification_ref`, без ledger.
§98.1 требует отдельной category cartography и независимого поиска missing
families по location/materialization потребностям, не по числу claims/cells.

World Knowledge §0.1 разделяет статическое наполнение и последующую
gameplay-testing фазу. §112.12 задаёт target Gameplay Gap Auditor, trace
requirements, классификацию, lifecycle и saturation; наличие internal
development tooling не активирует testing и не делает saturation gate
критерием статической готовности.

World Knowledge §0.2 разрешает честно отмеченную игровую реконструкцию из
аналогий и здравого смысла. §35.1 использует тот же независимый approval для
source accuracy либо plausibility; точное свидетельство 1230 года для каждой
ordinary-детали не требуется. `editorial_reconstruction` — редакторское
основание, не внешний научный источник. Runtime owners и exact state неизменны.

| Документ | Статус после этого index cutover | Replacement |
|---|---|---|
| [`README.md`](README.md) | `REDIRECT` | root `AGENTS.md` + this index |
| [`llm_documentation_navigation.md`](llm_documentation_navigation.md) | `SUPERSEDED / REDIRECT` | this index |
| [`code_critic_invocation_rule.txt`](code_critic_invocation_rule.txt) | `SUPERSEDED / REDIRECT` | root `AGENTS.md` §25.1 + this index |
| [`.github/Правило вызова агента-критика.txt`](../../../../.github/Правило%20вызова%20агента-критика.txt) | `SUPERSEDED / REDIRECT` | root `AGENTS.md` §25.1 + this index |

The obsolete rule “critic after every code change” does not apply. Independent read-only audit is mandatory for elevated-risk changes; an ordinary local fix does not require a separate critic when its boundaries are proven unchanged.

World Knowledge §0.4 adds an open place-first authoring need-map:
environment envelopes, linked approved premises, explicit gaps and
place-by-conditions reconstruction checks. It does not create location
presence, an object whitelist, a materializer or gameplay activation.
Structural map validation is not evidence of environmental completeness.

World Knowledge §0.5 adds an open military-first factual need-map and static
75 rotating + 25 blind-free probe method. It does not define combat mechanics,
a military scenario whitelist, force state, equipment presence or gameplay
activation; separate WK-only reconstruction exposes missing premises.

## 7. Domain guides and legacy/supporting documents

The following files remain discoverable but do not establish active production behavior by filename alone. Before treating one as normative, Contract Auditor must find an explicit header, active binding or import from the applicable active owner.

| Документ | Default treatment until verified | Topic |
|---|---|---|
| [`base_turn_orchestration.txt`](base_turn_orchestration.txt) | `UNDECLARED / DOMAIN GUIDE` | legacy/general turn orchestration |
| [`character_inventory_equipment.txt`](character_inventory_equipment.txt) | `UNDECLARED / DOMAIN GUIDE` | character inventory/equipment |
| [`character_parameters.txt`](character_parameters.txt) | `UNDECLARED / DOMAIN GUIDE` | character parameters |
| [`development_rules.txt`](development_rules.txt) | `REFERENCE`; cannot override `AGENTS.md` | legacy development rules |
| [`formulas.md`](formulas.md) | `UNDECLARED / DOMAIN GUIDE` | formulas and mechanics |
| [`g1_g5_generation_rules.txt`](g1_g5_generation_rules.txt) | `UNDECLARED / DOMAIN GUIDE` | generation rules |
| [`historical_events_and_figures.txt`](historical_events_and_figures.txt) | `REFERENCE / KNOWLEDGE GUIDE` | historical figures/events boundary |
| [`information_sources_llm_prompts.md`](information_sources_llm_prompts.md) | `UNDECLARED / DOMAIN GUIDE` | information-source prompts |
| [`interface_ux.md`](interface_ux.md) | `UNDECLARED / DOMAIN GUIDE` | player-facing interface/UX |
| [`llm_agent_prompt_templates.md`](llm_agent_prompt_templates.md) | `REFERENCE / TEMPLATE` | agent prompt templates |
| [`movement_locations_regions.txt`](movement_locations_regions.txt) | `UNDECLARED / DOMAIN GUIDE` | movement/locations/regions |
| [`new_game_start_pipeline.txt`](new_game_start_pipeline.txt) | `UNDECLARED / DOMAIN GUIDE` | new-game start pipeline |
| [`npc_generation_profiles.txt`](npc_generation_profiles.txt) | `UNDECLARED / DOMAIN GUIDE` | NPC generation profiles |
| [`npc_inventory_item_marks.txt`](npc_inventory_item_marks.txt) | `UNDECLARED / DOMAIN GUIDE` | NPC inventory and marks |
| [`player_character_generation.txt`](player_character_generation.txt) | `UNDECLARED / DOMAIN GUIDE` | player character generation |
| [`time_system.txt`](time_system.txt) | `REFERENCE / LEGACY` | older time-system description; active temporal contract has priority |
| [`weapons_and_armor.txt`](weapons_and_armor.txt) | `UNDECLARED / DOMAIN GUIDE` | weapons/armor |
| [`world_generation_and_turns.txt`](world_generation_and_turns.txt) | `UNDECLARED / DOMAIN GUIDE` | world generation and turns |
| [`world_regions.txt`](world_regions.txt) | `REFERENCE / DOMAIN GUIDE` | world regions |

An undeclared guide may still be relevant, but it must not silently override an explicit active contract, schema or current owner.

## 8. Contract Auditor

Обязательность Contract Auditor, его read-only роль, mandatory triggers, always-read source set, формат `CONTRACT AUDIT FINDING` и blocking criteria определяются единственным governing owner — root `AGENTS.md`, §25.1. Этот индекс не дублирует эти правила; он дополняет их только навигацией и domain scope matrix.

### 8.1. Scope matrix

| Scope | Mandatory contract set |
|---|---|
| Player semantic action / LLM | `turn_step_llm_contract.md`, relevant operation schemas, `@rus/turn` MODULE, affected domain contract |
| Authored materialization | `code_driven_world_materialization_architecture.md`, Spatial v3 specialization, world-base requirements, affected item/NPC/spatial contract |
| Ordinary items/resources/containers | `items_and_property.txt`, `turn_step_llm_contract.md`, active ordinary profile/bindings, materialization/spatial/persistence owners; umbrella contract remains target/reference unless explicitly promoted |
| Spatial/map | `spatial_architecture_standard_g0_g6.md` + four active Spatial v3 specializations + active world-catalog manifest/bindings |
| NPC agency | `npc_autonomous_decision_contract.md`, `turn_step_llm_contract.md`, temporal/perception owners |
| Conversation | NPC autonomous + `npc_conversation_mode_contract.md` + speech/perception/time contracts |
| Combat | `npc_combat_and_trigger_contract.md`, `combat_system.md`, NPC autonomous, items/body/time owners |
| Time/activities/processes | `temporal_world_and_interruptible_activities.md`, relevant time/world-process MODULEs, persistence contract/schema |
| DB/persistence | DDL/generated schema reference, party-store/game-server MODULEs, transaction/idempotency/replay tests; read-only v3 specialization where applicable |
| Historical/knowledge grounding | active source policy/catalog bindings, visibility/knowledge owner, authoritative-vs-actor-knowledge boundary |
| Narration/UI | player-safe projection contract, exact committed speech contract, interface/narration owner and tests |

## 9. Audited conflict register

### C-001 — absent `Novgorod1230_project_instruction_full.md`

**Observed:** exact filename is absent from `main`; an administrator may still supply it externally as current task instruction.  
**Resolution:** do not add a duplicate to the repository. For merged/current implementation state use `main`, root `AGENTS.md`, active contracts, code and tests. An explicitly supplied administrator project instruction remains governing task input for product/reviewer intent; if it conflicts with repository state, report the conflict and distinguish current production from target instead of silently overriding either side.

### C-002 — old navigation claimed precedence over root instructions

**Observed:** `llm_documentation_navigation.md` and `DOCUMENTS/README.md` carried an older reading order and could imply that a domain document outranked root `AGENTS.md`.  
**Resolution:** root `AGENTS.md` → this index → nested `AGENTS.md` → `MODULE.md` → active profile/contract/schema → code/tests. Compatibility files redirect here.

### C-003 — critic required after every code change

**Observed:** two legacy critic-rule files mandated a critic for every behavior/code change.  
**Conflict:** root `AGENTS.md` requires independent audit for elevated-risk work and explicitly says ordinary local fixes do not require a separate critic.  
**Resolution:** root `AGENTS.md` §25.1 wins; legacy files redirect to that single governing audit rule and this index supplies only contract status/navigation/scope-matrix data.

### C-004 — `target` filename interpreted as proposed

**Observed:** four Spatial v3 files retain `target` in their filenames but their headers state that versioned production activation completed.  
**Resolution:** they are active specializations. Filename heuristics are forbidden.

### C-005 — proposed umbrella snapshot versus later profile cutovers

**Observed:** `semantic_world_actions_materialization_and_processes_contract.md` remains a proposed umbrella snapshot checked against `main` on 2026-08-16, while later `main` contains active profile-specific rules and implementation.  
**Resolution:** the umbrella never becomes production merely because some ideas were implemented. Current behavior comes from root `AGENTS.md`, active profile contracts/bindings, code and tests. Use the umbrella only as target/history unless explicitly promoted.

### C-006 — generic world-base norm versus active v3 table specialization

**Observed:** `world_base_materialization_table_requirements.md` is active for general authoring/readiness semantics but states that the v3 target specialization owns production table-purpose semantics; older v2 portions remain migration/rollback.  
**Resolution:** use the generic document for shared authoring principles and the v3 specialization for current production table-purpose details. DDL/generated schema remain physical truth.

### C-007 — authored candidate closure versus active ordinary paths

**Observed:** the general materialization contract remains fail-closed for authored/significant/hidden/informational candidates, while active item/turn profiles add separately gated ordinary paths.  
**Resolution:** ordinary paths do not repair an empty authored candidate set. Apply the active ordinary profile through its own request/admission/persistence contract; preserve authored fail-closed semantics.

## 10. Maintenance rule

Any PR that creates, promotes, renames, moves, supersedes or materially changes a normative contract must update this index in the same PR. A behavioral contract change also requires the checks prescribed by root `AGENTS.md`; the index itself is never evidence that code, schema or tests were updated.
