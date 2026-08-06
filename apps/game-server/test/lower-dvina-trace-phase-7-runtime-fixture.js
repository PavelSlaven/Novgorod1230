import { createTemporalAdvanceOwner } from '@rus/turn/temporal-advance';
import { createTracePhase7FireRestCommand } from
  '../src/runtime/lower-dvina-trace-phase-7-command.js';
import { lowerDvinaTracePhase7TemporalEffectRegistrations } from
  '../src/runtime/lower-dvina-trace-phase-7-temporal-effect-owner.js';

const digest = 'a'.repeat(64);

export function phase7Command({ state, contracts, model }) {
  return createTracePhase7FireRestCommand({
    contracts,
    inputDigest: digest,
    npcAutonomousModel: model,
    semanticActivityScheduleOwner: {
      resolve({ activity }) {
        const profile = contracts.semanticActivityProfiles.find((candidate) =>
          candidate.duration_class === activity.duration_class
            && candidate.effort === activity.effort);
        return {
          profile_ref: profile.profile_ref,
          profile_pin: structuredClone(profile.profile_pin),
          duration_class: profile.duration_class,
          effort: profile.effort,
          duration_minutes: profile.duration_minutes
        };
      }
    },
    temporalAdvanceOwner: createTemporalAdvanceOwner({
      effect_registrations:
        lowerDvinaTracePhase7TemporalEffectRegistrations()
    }),
    revalidateStateVersion: async () => state.party_state.state_version
  });
}

export function phase7CommittedState() {
  return {
    schema: 'rus.lower_dvina_trace_turn_snapshot.v2',
    party_id: 'phase7-party',
    actor_id: 'mikula',
    party_state: {
      state_version: 7,
      session_state_version: 8,
      clock_state_version: 7,
      body_state_version: 4,
      turn_number: 7
    },
    opening_identity: { opening_screen_digest: 'opening-digest' },
    world_identity: {
      world_revision_id: 'world-revision',
      world_catalog_digest: 'world-digest'
    },
    clock: {
      whole_minutes: '100', subminute_numerator: '0',
      subminute_denominator: '1'
    },
    clock_weather_light: { clock: {
      whole_minutes: '100', subminute_numerator: '0',
      subminute_denominator: '1'
    } },
    position: {
      location_ref: 'trace_ld_v1_loc_fishing_camp',
      zone_ref: 'working_camp', g4_id: 'camp-g4',
      g5_node_id: 'camp-node', g5_anchor_id: 'camp-anchor'
    },
    phase6_carry_execution: { status: 'completed' },
    body_state: {
      health: 70, energy: 30, satiety: 40,
      active_conditions: [
        condition('wet-clothing', 'wet'),
        condition('shivering', 'strong_shivering'),
        condition('headache', 'headache'),
        condition('bruise', 'shoulder_bruise')
      ]
    },
    body_effect_history: [],
    knowledge: [],
    items: [],
    containers: [{
      container_id: 'road-bag-1',
      template_id: 'trace_ld_v1_container_road_bag',
      holder_npc_id: 'zhdanko-1', state_version: 1,
      state: {
        location_ref: 'trace_ld_v1_loc_storehouse',
        zone_ref: 'storehouse_inside', controller_npc_id: 'zhdanko-1'
      }
    }],
    npcs: [{
      participant_slot_ref: 'onisim_boatman',
      instance_id: 'onisim-1', anchor_id: 'camp-anchor',
      machine_state: { spatial_zone_ref: 'fire_rest_area' }
    }, {
      participant_slot_ref: 'zhdanko_storehouse_controller',
      instance_id: 'zhdanko-1', anchor_id: 'storehouse-anchor',
      machine_state: {
        status: 'waiting', location_ref: 'trace_ld_v1_loc_storehouse',
        spatial_zone_ref: 'storehouse_inside'
      }
    }],
    temporal_boundary_candidates: [],
    npc_decision_signals: [],
    consumed_npc_decision_signal_ids: [],
    npc_semantic_decision_refs: []
  };
}

export function phase7PlayerInput(state, suffix = 'move') {
  return {
    party_id: state.party_id,
    request_id: `phase7-${suffix}-request`,
    idempotency_key: `phase7-${suffix}-idem`,
    raw_text: 'Отдохнуть у огня полчаса и подсушить одежду'
  };
}

function condition(storageId, id) {
  return {
    storage_condition_id: storageId, id, status: 'active', state_version: 1,
    condition_profile_ref: { entity_id: storageId, state: id }
  };
}
