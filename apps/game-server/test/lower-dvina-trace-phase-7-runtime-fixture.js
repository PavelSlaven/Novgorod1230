import {
  createTemporalAdvanceOwner,
  npcTemporalEffectRegistrations
} from '@rus/turn/temporal-advance';
import { createTracePhase7FireRestCommand } from
  '../src/runtime/lower-dvina-trace-phase-7-command.js';
import { lowerDvinaTracePhase7TemporalEffectRegistrations } from
  '../src/runtime/lower-dvina-trace-phase-7-temporal-effect-owner.js';
import { buildLowerDvinaTracePhase7Commit } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-7-commit.js';
import { createTracePhase7BodyEffect } from
  '../src/runtime/lower-dvina-trace-phase-7-effects.js';

const digest = 'a'.repeat(64);

export function phase7Command({
  state,
  contracts,
  model,
  genericCheckContextOwner = null,
  randomSource = null,
  revalidateStateVersion = async () => state.party_state.state_version,
  temporalAdvanceOwner = createTemporalAdvanceOwner({
    effect_registrations: [
      ...npcTemporalEffectRegistrations(),
      ...lowerDvinaTracePhase7TemporalEffectRegistrations()
    ]
  })
}) {
  const command = createTracePhase7FireRestCommand({
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
    genericCheckContextOwner,
    randomSource,
    temporalAdvanceOwner,
    revalidateStateVersion
  });
  return Object.freeze({
    ...command,
    consequence(input) {
      return command.consequence({
        ...input,
        rootTurnId:
          `turn:${state.party_id}:${state.party_state.turn_number + 1}`
      });
    }
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
      instance_id: 'zhdanko-1',
      profile_id: 'trace_ld_v1_npc_zhdanko',
      profile_level: 'key',
      anchor_id: 'storehouse-anchor',
      location_profile_ref: 'trace_ld_v1_loc_storehouse',
      zone_ref: 'storehouse_inside',
      role_ref: {
        id: 'nov_role_merchant_clerk',
        source: 'approved_scenario_profile'
      },
      identity_state: {
        canonical_name: 'Жданко',
        age_range: 'adult'
      },
      body_state: {
        summary: 'устал после работы',
        conditions: [{ condition_ref: 'tired' }]
      },
      check_body_state: {
        health: 100,
        satiety: 100,
        energy: 50,
        active_conditions: []
      },
      mood: { state: 'сосредоточен', intensity: 'moderate' },
      relationships: [{
        actor_ref: 'ratsha-1',
        relation: 'старший по работе'
      }],
      machine_state: {
        status: 'waiting',
        location_ref: 'trace_ld_v1_loc_storehouse',
        spatial_zone_ref: 'storehouse_inside',
        load_category: 'moderate',
        npc_schedule_history: [],
        last_schedule_execution: null
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

export async function persistPhase7Consequence({
  state,
  contracts,
  consequence
}) {
  const timeUpdate = {
    clock_before: state.clock,
    clock_after: consequence.phase7.schedule_temporal.result.clock_after,
    exact_elapsed: {
      exact_minutes: { numerator: '30', denominator: '1' }
    }
  };
  const bodyUpdate = createTracePhase7BodyEffect({
    contracts,
    fallback: { apply() { throw new Error('unexpected fallback'); } }
  }).apply({ committed_state: state, consequence, time_update: timeUpdate });
  const committed = await buildLowerDvinaTracePhase7Commit({
    partyId: state.party_id,
    factual: {
      player_input: phase7PlayerInput(state, 'persisted-replay'),
      mode_resolution: {
        option_id: 'rest_by_fire_and_dry_clothing',
        turn_id: consequence.phase7.autonomous.request.root_turn_id,
        decision_trace: {
          state_version: state.party_state.state_version,
          action_set_digest: 'action-set'
        }
      },
      consequence,
      time_update: timeUpdate,
      body_update: bodyUpdate
    },
    state,
    inputDigest: digest,
    visibleContext: {
      visible_scene: 'У костра прошло полчаса.',
      visible_changes: ['elapsed_30_minutes'],
      sensory_details: [],
      visible_npc: [],
      visible_objects: [],
      known_context: [],
      uncertainties: []
    },
    phase7Contracts: contracts
  });
  const snapshot = structuredClone([
    ...committed.plan.inserts,
    ...committed.plan.updates,
    ...committed.plan.appends
  ].find(
    ({ target_table: table }) => table === 'party_state_snapshots'
  ).record.state_payload);
  return { plan: committed.plan, snapshot };
}

function condition(storageId, id) {
  return {
    storage_condition_id: storageId, id, status: 'active', state_version: 1,
    condition_profile_ref: { entity_id: storageId, state: id }
  };
}
