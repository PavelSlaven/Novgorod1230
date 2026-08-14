export function fixturePhase2VisibleState(instance, scenarioBundle) {
  return {
    clock: instance.immediate.timestamp,
    clock_weather_light: {
      clock: instance.immediate.timestamp,
      weather: {},
      light: {}
    },
    environment_snapshot: instance.immediate.environment_snapshot,
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
