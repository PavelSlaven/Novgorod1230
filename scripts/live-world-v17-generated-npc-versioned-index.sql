DROP INDEX world_base.spatial_v3_g4_npc_composition_active_generated;
CREATE UNIQUE INDEX spatial_v3_g4_npc_composition_active_generated
  ON world_base.spatial_v3_g4_npc_composition_bindings(
    world_revision_id, g4_id, g4_version, generation_template_id, generation_template_version
  ) WHERE status = 'approved' AND generation_template_id IS NOT NULL;
