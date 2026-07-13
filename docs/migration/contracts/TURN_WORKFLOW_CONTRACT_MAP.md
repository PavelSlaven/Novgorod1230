# Turn workflow contract map

| Block | Input | Output | Semantic owner |
|---|---|---|---|
| normalize_intent | raw player input | `player_turn_input` | structural code only |
| resolve_mode | player input + routing context | `turn_mode_resolution` | semantic resolver/LLM |
| load_context | requested state blocks | `retrieved_turn_state` | state reader adapter |
| availability | mode + retrieved facts | `turn_availability_decision` | semantic resolver/LLM |
| checks | approved check requests | `turn_check_results` | code RNG formula |
| consequence | facts + checks | `turn_consequence_package` | semantic resolver/LLM |
| time_update | approved duration + clock | `turn_time_update` | time domain formula |
| hidden_update | approved consequence | `turn_hidden_update` | semantic updater/LLM or approved passthrough |
| visible_projection | facts + approved changes | `visible_context_package` | semantic projector + security gate |
| narration | visible package only | `turn_narration_result` | narrator + audit |
| persistence_plan | approved artifacts | `party_turn_write_plan` | write-plan resolver |
| commit | approved write plan | `turn_commit_result` | party-store adapter |
| screen_projection | visible context + prose | public read model | presentation projection |

## Forbidden shortcuts

- raw player text → direct state mutation;
- regex mode selection in production workflow;
- code-generated world consequence;
- narrator access to hidden state;
- DB commit before visible/narration gates;
- provider or SQL call from `@rus/turn`.
