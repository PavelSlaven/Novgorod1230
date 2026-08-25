# Stage 15 — npc-placement

Stage 15 materializes NPC instances from approved regional profile sets and G4
rules, completes canonical appearance in stable slot/instance order and
publishes candidate→instance mapping for Stage 16. After passing code
materialization, N1 may fill only profile-declared missing `display_name` or
`visible_descriptor` fields in `ordinary_semantic`; exact instance coverage,
plain bounded text and no overwrite are required. It cannot create NPCs or
change formal facets, appearance, equipment, schedule, mechanics, knowledge,
capacity or placement. No declared gap means no resolver call. Final
validation rejects every new NPC without complete `actor_base_appearance_v1`.
