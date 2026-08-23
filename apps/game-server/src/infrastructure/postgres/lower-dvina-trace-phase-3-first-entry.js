import { resolveSpatialV3FirstEntryLifecycle } from '@rus/turn';
import { fail } from './lower-dvina-trace-phase-3-commit-support.js';
import { routeMovement } from './lower-dvina-trace-phase-3-state.js';

const FIRST_ENTRY_COMMAND = 'lower_dvina_trace.follow_path_to_fishing_camp';

export function resolveFirstEntry({
  partyId, state, factual, phase3Contracts, changeSetId, scenarioRevision
}) {
  if (scenarioRevision !== 24 || !routeMovement(factual)
      || factual.mode_resolution?.command_id !== FIRST_ENTRY_COMMAND) {
    return null;
  }
  const prepared = state.first_entry_preparation;
  const spatial = prepared?.spatial_v3;
  const target = spatial?.target;
  const scene = prepared?.scene;
  if (!spatial?.source || !target || !scene) {
    fail('TRACE_PHASE_3_FIRST_ENTRY_PREPARATION_MISSING');
  }
  const movement = factual.consequence.movement;
  if (prepared.binding?.route_command_id
        !== FIRST_ENTRY_COMMAND
      || prepared.binding.route_ref !== phase3Contracts.route.route_id
      || movement.route_ref !== phase3Contracts.route.route_id
      || phase3Contracts.sourceEndpoint.endpoint_id
        !== spatial.source.endpoint_ref.endpoint_id
      || phase3Contracts.destinationEndpoint.endpoint_id
        !== target.endpoint_ref.endpoint_id
      || movement.destination.location_ref
        !== prepared.binding.destination.location_profile_ref
      || target.g4_id !== prepared.binding.destination.g4_node_ref) {
    fail('TRACE_PHASE_3_FIRST_ENTRY_ROUTE_MISMATCH');
  }
  const member = {
    baseline_disposition: 'create',
    g4_id: target.g4_id,
    preparation_snapshot_id: spatial.preparation_snapshot_id,
    preparation_member_ordinal: spatial.preparation_member_ordinal,
    preparation_snapshot_digest: spatial.preparation_snapshot_digest,
    preparation_member_digest: spatial.preparation_member_digest,
    route_plan_id: spatial.route_plan_id,
    route_plan_digest: spatial.route_plan_digest,
    route_plan_execution_id: spatial.route_plan_execution_id,
    preparation_claim_id: spatial.preparation_claim_id,
    scene_baseline_id: target.scene_baseline_id,
    g5_site_id: target.g5_site_id,
    g6_instance_id: target.g6_instance_id,
    position_id: target.position_id
  };
  const lifecycle = resolveSpatialV3FirstEntryLifecycle({
    party_id: partyId,
    change_set_id: changeSetId,
    approved_transition: {
      status: 'approved',
      from_g4_id: spatial.source.g4_id,
      to_g4_id: target.g4_id,
      relation_ref: phase3Contracts.route.route_id,
      route_plan_id: spatial.route_plan_id,
      route_plan_digest: spatial.route_plan_digest,
      route_plan_execution_id: spatial.route_plan_execution_id
    },
    destination: {
      status: target.status === 'prepared' ? 'prepared' : 'unprepared',
      g4_id: target.g4_id
    },
    ...(target.status === 'prepared' ? {} : { preparation: {
      snapshot_id: spatial.preparation_snapshot_id,
      snapshot_digest: spatial.preparation_snapshot_digest,
      member,
      claim: write('preparation_claims', spatial.preparation_claim_id, 1, {
        id: spatial.preparation_claim_id,
        preparation_snapshot_id: spatial.preparation_snapshot_id,
        preparation_member_ordinal: spatial.preparation_member_ordinal,
        route_plan_execution_id: spatial.route_plan_execution_id,
        claim_status: 'reserved',
        state_version: 1,
        terminal_change_set_id: null
      }),
      journey_location: write('party_journey_locations',
        spatial.journey_location_id, 1, {
          id: spatial.journey_location_id,
          party_id: partyId,
          owner_kind: 'actor',
          owner_id: state.actor_id,
          location_kind: 'scene',
          scene_position_id: spatial.source.position_id,
          transit_anchor_id: null,
          travel_state_id: null,
          state_version: 1,
          updated_change_set_id: changeSetId
        }),
      physical_writes: firstEntryPhysicalWrites({
        partyId, target, scene, changeSetId
      })
    } })
  });
  if (!lifecycle.ok) {
    fail('TRACE_PHASE_3_FIRST_ENTRY_LIFECYCLE_REJECTED', lifecycle.error);
  }
  return lifecycle.extension;
}

function firstEntryPhysicalWrites({ partyId, target, scene, changeSetId }) {
  const templateRef = dbRef('scene_template',
    scene.node.template_id ?? target.scene_template_ref.entity_ref.entity_id);
  return [
    write('party_g5_sites', target.g5_site_id, null, {
      id: target.g5_site_id, party_id: partyId, origin: 'generated',
      parent_g4_id: target.g4_id,
      generated_template_ref: dbRef('location_profile',
        scene.location_profile_ref),
      expansion_slot_ref: dbRef('expansion_slot', scene.node.slot_key),
      source_frontier_id: `prepared-frontier:${target.g5_site_id}`,
      generation_ordinal: 0, status: 'active', state_version: 1,
      created_change_set_id: changeSetId, updated_change_set_id: changeSetId
    }),
    write('party_scene_baselines', target.scene_baseline_id, null, {
      id: target.scene_baseline_id, party_id: partyId, host_kind: 'g5_site',
      host_id: target.g5_site_id, source_kind: 'generated_template',
      scene_template_ref: templateRef,
      materialization_trace_id: target.canonical_digest,
      materializer_version: target.materializer_version,
      catalog_digest: target.catalog_digest, status: 'active', state_version: 1,
      created_change_set_id: changeSetId, updated_change_set_id: changeSetId
    }),
    write('party_g6_instances', target.g6_instance_id, null, {
      id: target.g6_instance_id, party_id: partyId,
      scene_baseline_id: target.scene_baseline_id,
      source_scene_template_ref: templateRef, scene_slot_key: scene.anchor.slot_key,
      host_kind: 'g5_site', host_id: target.g5_site_id,
      physical_class_id: 'open', primary_scene_role_id: scene.anchor.state.zone_ref,
      vertical_context_id: 'surface', overhead_cover_id: 'none',
      intra_g6_visibility_mode: 'default_clear',
      default_visibility_distance_band: 'near', acoustic_uniformity: 'uniform',
      status: 'active', state_version: 1, created_change_set_id: changeSetId,
      updated_change_set_id: changeSetId
    }),
    write('scene_position_nodes', target.position_id, null, {
      id: target.position_id, party_id: partyId,
      g6_instance_id: target.g6_instance_id, position_type_id: 'scene_position',
      template_slot_key: scene.anchor.state.zone_ref, template_instance_ordinal: 0,
      capacity: Math.max(1, scene.anchor.npc_capacity),
      access_class_id: scene.anchor.state.access_policy_ref, status: 'active',
      state_version: 1, created_change_set_id: changeSetId,
      updated_change_set_id: changeSetId
    })
  ];
}

function write(targetTable, id, stateVersion, record) {
  return {
    target_schema: 'party_runtime', target_table: targetTable, id,
    ...(stateVersion == null ? {} : { state_version: stateVersion }), record
  };
}

function dbRef(entityKind, entityId) {
  return {
    entity_ref: { entity_kind: entityKind, entity_id: entityId },
    authoring_version: '1'
  };
}
