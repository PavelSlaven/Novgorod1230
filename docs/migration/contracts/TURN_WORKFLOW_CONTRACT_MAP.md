# Turn workflow contract map

| Block | Input | Output | Semantic owner |
|---|---|---|---|
| normalize_intent | raw player input | `player_turn_input` | structural code only |
| resolve_mode | player input + routing context + command registry | `turn_mode_resolution` | registered code handler; bounded LLM choice only if ambiguous |
| load_context | requested state blocks | `retrieved_turn_state` | state reader adapter |
| availability | command + retrieved facts | `turn_availability_decision` | registered code handler |
| checks | approved check requests | `turn_check_results` | code RNG formula |
| consequence | registered command + facts + checks | `turn_consequence_package` | registered code handler |
| time_update | approved duration + clock | `turn_time_update` | time domain formula |
| hidden_update | approved consequence | `turn_hidden_update` | code projection |
| visible_projection | facts + approved changes | `visible_context_package` | semantic projector + security gate |
| narration | visible package only | `turn_narration_result` | narrator + audit |
| persistence_plan | approved artifacts + command handler | sealed `party_turn_write_plan` | code planner with logical target allowlist |
| commit | in-process code-owned write plan | `turn_commit_result` | party-store physical mapping + idempotency |
| screen_projection | visible context + prose | public read model | presentation projection |

## Forbidden shortcuts

- raw player text → direct state mutation;
- unregistered or regex-only command selection;
- LLM-generated consequence/change set/physical write target;
- stale, expired or unsigned bounded option;
- narrator access to hidden state;
- DB commit before visible/narration gates;
- provider or SQL call from `@rus/turn`.

Autonomous updates use the same boundary: a code-owned rule produces `party_change_set_v2`, the repository checks the base state version and atomically persists the change set, update trace, new snapshot and incremented party version.
