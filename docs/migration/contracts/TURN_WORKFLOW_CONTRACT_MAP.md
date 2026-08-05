# Turn workflow contract map

| Block | Input | Output | Semantic owner |
|---|---|---|---|
| normalize_intent | raw player input | `player_turn_input` | structural code only |
| load_context | requested state blocks | `retrieved_turn_state` | state reader adapter |
| available_actions | committed state + command registry | `turn_available_action_set` | registered code handlers |
| resolve_mode | raw input + available registered actions | `turn_mode_resolution` | exact code path or active player step admission |
| turn_step_request | root/remaining intent + player-safe working projection | `turn_step_request_v1` | code-owned projector + `@rus/turn` |
| turn_step_plan | immutable step request | strict `turn_step_plan_v1` | `turn_step_planner`; one optional structural repair |
| player_conversation_plan | `player_conversation_input_v1` + player-safe context | strict `player_conversation_contribution_plan_v1` | `@rus/turn` conversation boundary + injected semantic model |
| npc_conversation_boundary | committed statement + per-NPC perception + new `npc_decision_signal_v1` records | at most one `npc_decision_boundary_v1` per NPC/same-time batch | common `@rus/npc-runtime` signal validation and aggregation |
| npc_conversation_plan | conversation boundary + subjective NPC context | strict `conversation_contribution_plan_v1` or typed action/combat handoff | `@rus/turn` boundary/replay validation + injected semantic model |
| npc_autonomous_plan | autonomous boundary + NPC-safe context | strict `npc_step_plan_v1`, then approved schedule/domain owner | `@rus/turn` boundary/replay validation + injected autonomous model |
| turn_step_execution | validated direct/check/domain step | updated working projection + fragments | code-owned execution registry and domain owners |
| turn_step_draft | ordered applied steps | `party_turn_step_operation_batch_v1` + commit trace | `@rus/turn`; no partial commit |
| revalidate_context | exact command/semantic draft + fresh committed state | `revalidated_turn_state` | state reader + command registry |
| availability | command + retrieved facts | `turn_availability_decision` | registered code handler |
| checks | approved check requests | `turn_check_results` | code RNG formula |
| consequence | registered command + facts + checks | `turn_consequence_package` | registered code handler |
| time_update | approved duration + clock | `turn_time_update` | time domain formula |
| body_update | approved body effect + committed state | `turn_body_update` | body-state owner |
| hidden_update | approved consequence | `turn_hidden_update` | code projection |
| visible_projection | facts + approved changes | `visible_context_package` | code-owned projector + security gate |
| persistence_plan | approved artifacts + command handler | sealed `party_turn_write_plan` | code planner with logical target allowlist |
| commit | in-process code-owned write plan | `turn_commit_result` | party-store physical mapping + idempotency |
| persisted_visible_projection | commit identity | committed visible context | persisted-visible reader |
| narration | persisted visible package only | `turn_narration_result` | narrator + audit |
| screen_projection | visible context + prose | public read model | presentation projection |

## Forbidden shortcuts

- raw player text → direct state mutation;
- unregistered or regex-only command selection;
- LLM-generated consequence/change set/physical write target;
- bounded option synthesis as fallback for unknown/free-form player input;
- bounded selector fallback from revision-14 conversation;
- second player semantic planner or scenario-local step loop;
- partial commit of internal semantic steps;
- stale, expired or unsigned bounded option;
- narrator access to hidden state;
- DB commit before visible/narration gates;
- provider or SQL call from `@rus/turn`.

Revision-14 conversation and the Phase-7 autonomous NPC path are active semantic modes covered by this map. Phase 7 runs «Отдых у огня» for 30 minutes, creates Жданко's autonomous boundary at +25 and resolves one approved 5-minute schedule action through code-owned temporal, persistence and visibility owners. Combat resolution remains proposed; bounded selection remains available only for genuinely closed choices and explicitly pinned historical revisions.

Deterministic autonomous updates use the same commit boundary: a code-owned rule produces `party_change_set_v2`, the repository checks the base state version and atomically persists the change set, update trace, new snapshot and incremented party version. Phase-7 semantic autonomous action is separately admitted through `npc_action_decision_request_v1` and cannot bypass that boundary.
