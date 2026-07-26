import { ref } from '../../../runtime/first-playable/shared.js';
import { row } from './plan-shared.js';

const RECEIVING_G4 =
  'g4v3__gn_nov_g3_xp017_yp025_lower_dvina_reach';
const RECEIVING_G5 =
  'cg5v3__gn_nov_g4_xp017_yp025_navigation_corridor';
const SOURCE_G4 =
  'g4v3__gn_nov_g3_xp017_yp026_r2_south_entry_reach';
const SOURCE_G5 =
  'cg5v3__gn_nov_g4_xp017_yp026_r2_south_entry_reach_upstream_approach';

export function boundarySceneMaterializationWrites({
  previousState,
  state,
  changeSet
}) {
  if (state.receiving_materialized
      && !previousState.receiving_materialized) {
    return sceneWrites({
      partyId: state.party_id,
      state,
      changeSet,
      suffix: 'yp025-navigation',
      g4Id: RECEIVING_G4,
      g5Id: RECEIVING_G5,
      g5Version: 1,
      templateId: 'stfv3__g5_water_navigation_v1',
      templateVersion: 2,
      physicalClassId: 'spatial.g6.water'
    });
  }
  if (state.source_boundary_materialized
      && !previousState.source_boundary_materialized) {
    return sceneWrites({
      partyId: state.party_id,
      state,
      changeSet,
      suffix: 'yp026-south-entry',
      g4Id: SOURCE_G4,
      g5Id: SOURCE_G5,
      g5Version: 3,
      templateId: 'stfv3__g5_route_approach_v1',
      templateVersion: 2,
      physicalClassId: 'spatial.g6.outdoor'
    });
  }
  return null;
}

function sceneWrites({
  partyId,
  state,
  changeSet,
  suffix,
  g4Id,
  g5Id,
  g5Version,
  templateId,
  templateVersion,
  physicalClassId
}) {
  const siteId = `site:${partyId}:${suffix}`;
  const baselineId = `baseline:${partyId}:${suffix}`;
  const g6Id = `g6:${partyId}:${suffix}`;
  const templateRef = ref(
    'scene_template',
    templateId,
    templateVersion
  );
  const inserts = [
    row('party_g5_sites', siteId, {
      id: siteId,
      party_id: partyId,
      origin: 'canonical',
      parent_g4_id: g4Id,
      canonical_g5_ref: ref('canonical_g5', g5Id, g5Version),
      status: 'active',
      state_version: 1,
      created_change_set_id: changeSet,
      updated_change_set_id: changeSet
    }),
    row('party_scene_baselines', baselineId, {
      id: baselineId,
      party_id: partyId,
      host_kind: 'g5_site',
      host_id: siteId,
      source_kind: 'canonical_template',
      scene_template_ref: templateRef,
      materialization_trace_id: `run:${partyId}:baseline`,
      materializer_version: 'first-playable-materializer@1',
      catalog_digest: state.exact_pins.pins.find(
        ({ kind }) => kind === 'release'
      ).world_catalog_digest,
      status: 'active',
      state_version: 1,
      created_change_set_id: changeSet,
      updated_change_set_id: changeSet
    }),
    row('party_g6_instances', g6Id, {
      id: g6Id,
      party_id: partyId,
      scene_baseline_id: baselineId,
      source_scene_template_ref: templateRef,
      scene_slot_key: 'main',
      host_kind: 'g5_site',
      host_id: siteId,
      physical_class_id: physicalClassId,
      primary_scene_role_id: 'scene.main',
      vertical_context_id: 'level',
      overhead_cover_id: 'open_sky',
      intra_g6_visibility_mode: 'default_clear',
      default_visibility_distance_band: 'local',
      acoustic_uniformity: 'uniform',
      status: 'active',
      state_version: 1,
      created_change_set_id: changeSet,
      updated_change_set_id: changeSet
    })
  ];
  for (const slot of ['arrival', 'focus', 'departure']) {
    const positionId = `position:${partyId}:${suffix}:${slot}`;
    inserts.push(row('scene_position_nodes', positionId, {
      id: positionId,
      party_id: partyId,
      g6_instance_id: g6Id,
      position_type_id: 'passage',
      template_slot_key: slot,
      template_instance_ordinal: 0,
      capacity: 1,
      access_class_id: 'default',
      status: 'active',
      state_version: 1,
      created_change_set_id: changeSet,
      updated_change_set_id: changeSet
    }));
  }
  return { inserts, updates: [], appends: [], deletes: [] };
}
