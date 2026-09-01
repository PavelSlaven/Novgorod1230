import { resolveSpatialV3FirstEntryLifecycle } from '@rus/turn';
import { fail } from './lower-dvina-trace-phase-3-commit-support.js';
import { routeMovement } from './lower-dvina-trace-phase-3-state.js';

const FIRST_ENTRY_COMMAND = 'lower_dvina_trace.follow_path_to_fishing_camp';

export function resolveFirstEntry({
  partyId, state, factual, phase3Contracts, changeSetId, scenarioRevision,
  memberOrdinal = 0
}) {
  const additionalMember = memberOrdinal > 0;
  if (!(additionalMember ? [26, 27, 28].includes(scenarioRevision)
    : [24, 25, 26, 27, 28].includes(scenarioRevision)) || !routeMovement(factual)) {
    return null;
  }
  const prepared = state.first_entry_preparation;
  const memberPreparation = memberOrdinal === 0 ? prepared
    : prepared?.members?.[memberOrdinal];
  const spatial = memberOrdinal === 0 ? prepared?.spatial_v3
    : state.first_entry_spatial_v3?.members?.[memberOrdinal - 1]
      ?? prepared?.spatial_v3?.members?.[memberOrdinal - 1];
  const target = spatial?.target;
  const scene = memberPreparation?.scene;
  const command = additionalMember
    ? memberPreparation?.binding?.route_command_id : FIRST_ENTRY_COMMAND;
  if (factual.mode_resolution?.command_id !== command) return null;
  const source = spatial?.source ?? { g4_id: state.position?.g4_id,
    position_id: state.journey_location?.scene_position_id };
  if (!target || !scene || (additionalMember
    && (!source?.g4_id || !source?.position_id))) {
    fail('TRACE_PHASE_3_FIRST_ENTRY_PREPARATION_MISSING');
  }
  const movement = factual.consequence.movement;
  if ((additionalMember && memberPreparation.binding?.route_command_id
        !== command)
      || memberPreparation.binding.route_ref !== phase3Contracts.route.route_id
      || movement.route_ref !== phase3Contracts.route.route_id
      || phase3Contracts.sourceEndpoint.endpoint_id
        !== spatial.source.endpoint_ref.endpoint_id
      || phase3Contracts.destinationEndpoint.endpoint_id
        !== target.endpoint_ref.endpoint_id
      || movement.destination.location_ref
        !== memberPreparation.binding.destination.location_profile_ref
      || (memberPreparation.binding.destination.g4_node_ref != null
        && target.g4_id !== memberPreparation.binding.destination.g4_node_ref)) {
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
      from_g4_id: source.g4_id,
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
        state.journey_location?.id ?? spatial.journey_location_id,
        state.journey_location?.state_version ?? 1, {
          id: state.journey_location?.id ?? spatial.journey_location_id,
          party_id: partyId,
          owner_kind: 'actor',
          owner_id: state.actor_id,
          location_kind: 'scene',
          scene_position_id: source.position_id,
          transit_anchor_id: null,
          travel_state_id: null,
          state_version: 1,
          updated_change_set_id: changeSetId
        }),
      physical_writes: firstEntryPhysicalWrites({ partyId, target, changeSetId })
    } })
  });
  if (!lifecycle.ok) {
    fail('TRACE_PHASE_3_FIRST_ENTRY_LIFECYCLE_REJECTED', lifecycle.error);
  }
  return lifecycle.extension;
}

function firstEntryPhysicalWrites({ partyId, target, changeSetId }) {
  const baseStatic = target.base_static_template;
  if (!baseStatic?.scene_template_ref || !baseStatic?.g6 || !baseStatic?.position
      || !target.canonical_g5_ref || !target.materialization_trace_id) {
    fail('TRACE_PHASE_3_FIRST_ENTRY_PREPARATION_MISSING');
  }
  const templateRef = baseStatic.scene_template_ref;
  return [
    write('party_g5_sites', target.g5_site_id, null, {
      id: target.g5_site_id, party_id: partyId, origin: 'canonical',
      parent_g4_id: target.g4_id,
      canonical_g5_ref: target.canonical_g5_ref,
      generated_template_ref: null, expansion_slot_ref: null,
      source_frontier_id: null, generation_ordinal: null,
      status: 'active', state_version: 1,
      created_change_set_id: changeSetId, updated_change_set_id: changeSetId
    }),
    write('party_scene_baselines', target.scene_baseline_id, null, {
      id: target.scene_baseline_id, party_id: partyId, host_kind: 'g5_site',
      host_id: target.g5_site_id, source_kind: 'canonical_template',
      scene_template_ref: templateRef,
      materialization_trace_id: target.materialization_trace_id,
      materializer_version: target.materializer_version,
      catalog_digest: target.catalog_digest, status: 'active', state_version: 1,
      created_change_set_id: changeSetId, updated_change_set_id: changeSetId
    }),
    write('party_g6_instances', target.g6_instance_id, null, {
      id: target.g6_instance_id, party_id: partyId,
      scene_baseline_id: target.scene_baseline_id,
      ...baseStatic.g6,
      host_kind: 'g5_site', host_id: target.g5_site_id,
      status: 'active', state_version: 1, created_change_set_id: changeSetId,
      updated_change_set_id: changeSetId
    }),
    write('scene_position_nodes', target.position_id, null, {
      id: target.position_id, party_id: partyId,
      g6_instance_id: target.g6_instance_id, ...baseStatic.position,
      template_instance_ordinal: 0, status: 'active',
      state_version: 1, created_change_set_id: changeSetId,
      updated_change_set_id: changeSetId
    }),
    ...target.s1_physical_writes.map((row) => write(row.target_table, row.id, null, {
      ...row.record, party_id: partyId, created_change_set_id: changeSetId,
      updated_change_set_id: changeSetId
    }))
  ];
}

function write(targetTable, id, stateVersion, record) {
  return {
    target_schema: 'party_runtime', target_table: targetTable, id,
    ...(stateVersion == null ? {} : { state_version: stateVersion }), record
  };
}
