# First-session candidate revision 004

This directory records the first ordered preparation step for G1 `gn_nov_g1_xp017_yp026`.

## Scope of this revision

1. Select one start G4 for the first vertical slice.
2. Audit the complete NPC materialization chain for that G4.
3. Record exact hard gaps and the required normalized catalog records.

Player-character profiles, item/container/property/resource completion and environment completion are intentionally deferred to later ordered steps.

## Selected start

`gn_nov_g4_xp017_yp026_r2_sheltered_landing_terrace_high_platform`

The source candidate ranks it first and describes it as a low-complexity protected dry landing with two safe exits and no mandatory boat, guide, horse, sled or pre-existing local-route knowledge.

## NPC result

`npc_rules_river_users_v1` does not currently resolve to a legal materialization chain. It supplies role and occupation IDs but leaves archetype, name-pool, language, knowledge and equipment candidate sets empty. The normalized DDL additionally requires demographic, appearance, clothing, behavior, activity, schedule and relationship records before a `region_npc_profile_sets` row and a `g4_npc_materialization_rules` row can be approved.

Therefore this revision is `prepared_not_importable` and must hard-block NPC materialization.

## Canonical-source dependency

The current repository does not contain the canonical source rows from `Desktop/Русь 13 ВЕК/БАЗА`. New IDs must not be invented before the existing approved records and digests are available for duplicate/conflict checks.

## Later findings

The selected start also exposes later-layer gaps:

- `item_binding_landing_portable_v1` does not apply to `g5_shelter_rest_v1`;
- no property binding applies to `g5_shelter_rest_v1`;
- no resource binding applies to `g5_shelter_rest_v1`.

These are recorded now but are not repaired in the NPC-only step.

## Status

```text
selected_start_g4 = fixed
npc_chain = hard_blocked
importable = false
activation_allowed = false
```
