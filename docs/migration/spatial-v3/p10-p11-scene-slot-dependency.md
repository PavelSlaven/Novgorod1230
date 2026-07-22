# P10 → P11 scene endpoint-slot dependency

`world_route_endpoint_binding.scene_endpoint_slot_key` is authored in P10, but its existence and role/profile compatibility are owned by P11-S03 (`Scene materialization profiles/templates`): that step creates the approved scene materialization profile, G6/position slots and endpoint slots.

P10 therefore validates the non-cyclic route endpoint facts available in schema 13: directed role, exact route point role, directional exit and canonical G5/G4 containment. It records `scene_endpoint_slot_key` unchanged and does not create a duplicate slot registry or infer a profile. P11 must add the exact FK/validator and P12 readiness must require one exact slot match. Until then any attempted P10-only scene-slot resolution is a typed `scene_endpoint_slot_missing` / `scene_endpoint_slot_ambiguous` dependency gap, never a fallback.

Sources: implementation plan P10-S03 and P11-S03; target standard `world_route_endpoint_binding` invariant on approved scene materialization profile.
