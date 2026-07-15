# First-session candidate revision 004

This directory is the single working area for all results produced in the current chat for G1 `gn_nov_g1_xp017_yp026`.

## Mandatory working rule for this chat

All work from this chat must remain inside the existing pull request:

- PR: `#6`
- branch: `agent/first-session-npc-chain`
- base: `main`

Creating another pull request for any continuation of this chat is prohibited.

This README is the mandatory cumulative work log. It must be updated in the same PR whenever new files, data, decisions, validations, gaps or integration requirements are added. It is the primary explanation of:

1. what was done;
2. why it was done;
3. which source and normative constraints were applied;
4. which files were created or changed;
5. what remains blocked;
6. where and how the result must be integrated;
7. which checks and critic audits were actually run.

A task from this chat is not considered documented until this README contains its result and integration path.

## Overall objective

Prepare one first-session vertical slice for the already authored G1 cell without creating the player character until the final ordered step.

Target sequence:

```text
1230
→ late summer
→ open water
→ one selected G1
→ one selected start G4
→ one start G5
→ NPC materialization
→ item/container/property/resource materialization
→ environment state
→ player character generation as the final step
→ save/reload
→ one full turn
```

## Ordered scope

The work is performed in this order:

1. fix one start G4;
2. close the complete NPC materialization chain;
3. close item, container, property and resource profiles and rules;
4. fix weather, light, water state, current, wind, hazards and route modifiers;
5. prepare the player-character start profile only after the world-side layers are complete;
6. validate import, readback, runtime visibility and the first-session vertical slice.

## Step 1 — selected start G4

Selected G4:

`gn_nov_g4_xp017_yp026_r2_sheltered_landing_terrace_high_platform`

Reason for selection:

- ranked first in the existing candidate;
- low-complexity protected dry landing;
- two safe exits;
- no mandatory boat, guide, horse, sled or pre-existing local-route knowledge;
- suitable for the first vertical slice because it minimizes unrelated prerequisites.

Source file in this revision:

- `01-start/selected-start-g4.json`

Integration target:

- start-node selection input for new-game Stage 9;
- G4 input for materialization Stages 13–16;
- exact `graph_node_id` for `g4_npc_materialization_rules`, item/container rules and environment bindings.

## Step 2 — NPC chain audit

Required chain:

```text
G4 rule
→ regional archetype/profile set
→ social role / occupation / legal status
→ demographic / name / appearance
→ clothing / equipment
→ knowledge / behavior
→ activity / schedule / relationship
→ region_npc_profile_sets
→ g4_npc_materialization_rules
```

Current source rule:

`npc_rules_river_users_v1`

Audit result:

The rule does not resolve to a legal materialization chain. It supplies role and occupation identifiers but leaves required candidate sets unresolved. The current repository does not provide confirmed approved source rows and readback for the complete dependent chain.

Confirmed missing or unverified dependencies:

- `region_npc_archetypes`;
- `region_demographic_profiles`;
- `region_name_pools` and entries;
- `region_appearance_profiles`;
- `region_clothing_profiles`;
- `region_equipment_profiles` and entries;
- `region_knowledge_profiles`;
- `region_behavior_profiles`;
- `region_activity_profiles`;
- `region_schedule_profiles`;
- `region_relationship_profiles`;
- `region_npc_profile_sets`;
- final `g4_npc_materialization_rules` binding for the selected G4.

Normative consequence:

The NPC candidate set is a hard data gap. It must not be filled with fallback values, invented IDs or LLM repair. NPC materialization remains blocked until approved, version-pinned and applicable catalog rows exist and pass import/readback.

Files documenting this result:

- `02-npc/npc-chain-readiness.json`;
- `02-npc/required-npc-catalog-records.json`;
- `05-validation/first-session-data-gap-report.json`.

Integration target after the gap is closed:

- normalized rows in the corresponding `world_base` tables;
- one or more approved `region_npc_profile_sets`;
- one approved `g4_npc_materialization_rules` row for the selected G4;
- Stage 15 candidate bundle and deterministic materialization trace.

## Later-layer findings already recorded

The selected start also exposes later gaps:

- `item_binding_landing_portable_v1` does not apply to `g5_shelter_rest_v1`;
- no property binding applies to `g5_shelter_rest_v1`;
- no resource binding applies to `g5_shelter_rest_v1`.

These findings belong to the next ordered step and have not yet been repaired.

## Files currently in this revision

- `00-governance/revision-metadata.json` — revision status, scope and activation prohibition;
- `01-start/selected-start-g4.json` — exact start G4 selection and rationale;
- `02-npc/npc-chain-readiness.json` — NPC chain readiness result;
- `02-npc/required-npc-catalog-records.json` — normalized dependency contract;
- `05-validation/first-session-data-gap-report.json` — hard-block report;
- `candidate-manifest.json` — package inventory and validation notes;
- `README.md` — cumulative work log and integration guide.

## Integration policy

Nothing in this directory is production-active merely because it exists in the repository.

Before activation, the complete candidate must pass:

1. source and duplicate/conflict checks;
2. structural validation against current DDL;
3. controlled import into `world_base`;
4. readback confirming every referenced approved row;
5. candidate resolution for the selected G4;
6. deterministic Stage 13–16 execution;
7. atomic write-plan validation;
8. new-game E2E, save/reload and first-turn checks;
9. mandatory critic audit where required.

## Checks actually performed so far

- canonical `main` and mandatory normative documents were read;
- the immutable revision 003 candidate was inspected;
- the selected start G4 and NPC rule were compared with the materialization v2 DDL;
- JSON files in this revision were structurally parsed successfully before publication;
- GitHub diff for the branch was inspected.

Not performed yet:

- production import;
- database readback;
- runtime candidate resolution;
- Stage 13–16 execution;
- new-game E2E;
- save/reload;
- first turn;
- full test suite;
- critic audit for future semantic data changes.

## Current status

```text
single_chat_pr = #6
new_pr_creation = prohibited
readme_work_log = mandatory
selected_start_g4 = fixed
npc_chain = hard_blocked
item_property_resource_layer = pending
environment_layer = pending
player_character_profile = deferred_until_final_step
importable = false
activation_allowed = false
```

## Next action

Continue in PR `#6` by resolving the first approved source layer required by the NPC chain. Every subsequent result must update this README with the created records, rationale, integration target, checks and remaining gaps.
