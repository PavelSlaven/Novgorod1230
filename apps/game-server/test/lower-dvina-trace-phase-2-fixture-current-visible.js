export function fixturePhase2CurrentVisibleContext(environmentFacts) {
  return {
    version: 1,
    schema: 'visible_context_package',
    visible_scene: 'trace_ld_v1_loc_wreck_shore',
    visible_changes: [],
    sensory_details: structuredClone(environmentFacts),
    visible_npc: [],
    visible_objects: [],
    known_context: [],
    uncertainties: [],
    allowed_tensions: [],
    do_not_imply: []
  };
}

export function fixturePhase2VisibleState(instance, scenarioBundle) {
  return {
    clock: instance.immediate.timestamp,
    clock_weather_light: {
      clock: instance.immediate.timestamp,
      weather: {},
      light: {}
    },
    environment_snapshot: instance.immediate.environment_snapshot,
    current_visible_context: fixturePhase2CurrentVisibleContext(
      instance.immediate.environment_snapshot.facts
    ),
    world_identity: {
      world_revision_id:
        scenarioBundle.location_topology_set.spatial_source_ref
          .world_revision_id,
      world_catalog_digest:
        scenarioBundle.location_topology_set.spatial_source_ref
          .world_revision_catalog_digest
    }
  };
}
