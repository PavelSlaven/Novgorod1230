# Stage 15 — npc-placement

Code-only Stage 15 materializes NPC instances from approved regional profile
sets and G4 rules, completes canonical appearance in stable slot/instance order
after existing choices and publishes candidate→instance mapping for Stage 16.
Final validation rejects every new NPC without complete
`actor_base_appearance_v1`. The `materialize` port is a code service; LLM is
limited to audit and cannot repair or create NPC state.
