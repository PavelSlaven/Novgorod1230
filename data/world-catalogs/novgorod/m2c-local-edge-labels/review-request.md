# Independent M2c local edge label data review

Review as `gpt-6-sol` with reasoning `high`. Return `PASS` or `FAIL` with exact findings. Do not edit the candidate or self-approve.

Exact candidate: `data/world-catalogs/novgorod/m2c-local-edge-labels/candidate.json`, SHA-256 `c00d22382507c1bfc74c88e8b3469439360bf4577208b254872f0dd382538590`.

Exact source: `data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_scene_movement_edge_templates.json`, SHA-256 `d6d987f3fe2748f48300d9bf9a285afe8f98619d77677329fbbcd12f6e69a91e`.

Check one to one coverage of all 68 directed `internal_passage` template edges across 17 scene templates by exact `scene_template_id`, version and `edge_slot_key`. Check every `Проход N` is only an editorial choice ordinal among edges leaving the same authored position. Check source references and the applicability claim that a per-party generated edge inherits only the exact template edge label.

Reject destination names, compass bearings, distances, hidden topology, physical ordering, implied safety, visibility, knowledge or movement permission. Current authoritative visible or known exit projection must admit the exit before presenting a label. The candidate is pending approval and does not authorize import, runtime use or release activation. Decide data applicability only.
