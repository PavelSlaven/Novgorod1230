# Stage 15 — npc-placement

Code-only Stage 15 materializes NPC instances from approved regional profile
sets and G4 rules, completes canonical appearance in stable slot/instance order
after existing choices and publishes candidate→instance mapping for Stage 16.
Final validation rejects every new NPC without complete
`actor_base_appearance_v1`. The `materialize` port is a code service; LLM is
limited to audit and cannot repair or create NPC state.

`attachApprovedProceduralNpc` is the bounded Stage 15 handoff for an already
code-materialized approved procedural NPC. It appends the stable NPC and
Temporal environment to the existing party result, preserves appearance RNG
choices, and forwards only exact active equipment rows to Stage 16.
