import { createRuntimeInstanceMechanicsSnapshot } from '@rus/items-property';
import { canonicalDigest } from '@rus/materialization';
import {
  prepareLowerDvinaTraceTurnStepPersistence
} from '../src/infrastructure/postgres/lower-dvina-trace-turn-step-persistence.js';
import {
  buildLowerDvinaTraceTurnStepRootWrites
} from '../src/infrastructure/postgres/lower-dvina-trace-turn-step-state.js';

const DIRECT_SCHEMA =
  'rus.lower_dvina_trace_turn_step_direct_operation.v1';

export function prepare({
  state,
  operations,
  factual: factualValue = factual(),
  canonical = false,
  commitEnvelope = null,
  ambientPortionProfileRef = null
}) {
  const writePlan = {
    turn_id: 'turn:p:1',
    base_state_version: 3,
    command_trace: {
      decision_protocol: 'turn_step_plan_v1',
      step_traces: [{ step: 1 }]
    },
    write_targets: [{
      target: 'party_turn_step_operations',
      value: {
        version: 1,
        schema: 'party_turn_step_operation_batch_v1',
        root_turn_id: 'turn:p:1',
        committed_state_version: 3,
        operations
      }
    }]
  };
  if (canonical || commitEnvelope) {
    writePlan.turn_step_commit = commitEnvelope
      ?? canonicalEnvelope(factualValue);
  }
  return prepareLowerDvinaTraceTurnStepPersistence({
    partyId: 'p', writePlan, state, snapshot: structuredClone(state),
    factual: canonical || commitEnvelope ? null : factualValue,
    changeSetId: 'change-1', idemId: 'idem-1',
    turnStepAmbientPortionProfileRef: ambientPortionProfileRef
  });
}
export function conditionState() {
  const state = baseState();
  Object.assign(state.party_state, {
    session_state_version: 2, clock_state_version: 2, body_state_version: 2
  });
  state.body_state.active_conditions = [{
    storage_condition_id: 'condition-storage-1', id: 'bruise', status: 'active',
    state_version: 4, condition_outcome: 'persists',
    condition_profile_ref: { id: 'bruise' }
  }];
  return state;
}
export function rootWrites(state, snapshot, proposal) {
  return buildLowerDvinaTraceTurnStepRootWrites({
    partyId: 'p', state, snapshot: { body_state: snapshot },
    envelope: {
      player_input: { request_id: 'request-1' },
      root_turn_id: 'turn:p:1',
      body_update: { applied: true, proposal,
        state_after: structuredClone(snapshot) },
      time_update: { clock_after: state.clock },
      consequence: {}
    },
    nextVersion: 4, turnNumber: 4, changeSetId: 'change-1', idemId: 'idem-1',
    pendingScreen: {}, clockChanged: false
  });
}

export function baseState() {
  return {
    party_id: 'p',
    actor_id: 'actor-1',
    party_state: { state_version: 3, turn_number: 3 },
    player_profile: { attributes: { strength: { value: 10 } } },
    body_state: { health: 100, satiety: 90, energy: 80,
      active_conditions: [] },
    clock: {
      whole_minutes: '10', subminute_numerator: '0',
      subminute_denominator: '1'
    },
    position: { location_ref: 'shore', g5_anchor_id: 'anchor-shore' },
    items: [{
      item_id: 'authored-item', template_id: 'template-1',
      profile_id: 'profile-1', category_id: 'category-1', quantity: 1,
      inventory_profile: authoredProfile(),
      placement: { anchor_id: 'anchor-shore' }
    }],
    containers: [],
    container_placements: [], container_profiles: [],
    container_compatibility: [],
    npcs: [],
    knowledge: [{ fact_id: 'shore', knowledge_state: 'known' }],
    last_turn: { visible_package: { package_id: 'visible-1' } }
  };
}
export function authoredProof(item) {
  const identity = {
    item_id: item.item_id ?? item.instance_id,
    template_id: item.template_id,
    profile_id: item.profile_id ?? null
  };
  return {
    ...identity,
    source_digest: canonicalDigest({
      ...identity,
      placement: item.placement ?? null,
      ownership: item.ownership ?? null,
      mechanics: item.inventory_profile
        ?? item.state?.inventory_profile_snapshot ?? null
    })
  };
}

export function factual({ elapsed = 10, activities = [], activityOrders = null,
  bodyPayload: body = null } = {}) {
  const hiddenUpdate = body == null ? {} : {
    turn_step_body_event: structuredClone(body)
  };
  const componentProposals = body == null ? [] : [{
    schema: 'rus.body_state.fixed_approved_effect_proposal.v1',
    profile_ref: body.body_effect_ref,
    profile_pin: structuredClone(body.profile_pin),
    selected_context: structuredClone(body.selected_context),
    exact_deltas: structuredClone(body.exact_deltas),
    condition_transitions: [],
    selection_policy: body.selection_policy,
    rng_consumption: body.rng_consumption
  }];
  let activityMinute = 10;
  const activityResolutions = activities.map((activity, index) => {
    const start = activityMinute;
    activityMinute += activity.duration_minutes;
    return activityResolution(activity, activityOrders?.[index] ?? index,
      String(start), String(activityMinute));
  });
  const semanticMinutes = activities.reduce((sum, activity) =>
    sum + activity.duration_minutes, 0);
  return {
    player_input: {
      idempotency_key: 'idem-key', request_id: 'request-1', raw_text: 'ход'
    },
    mode_resolution: {
      decision_trace: {
        decision_protocol: 'turn_step_plan_v1', step_traces: [{ step: 1 }]
      }
    },
    consequence: {
      duration_minutes: elapsed,
      hidden_update: structuredClone(hiddenUpdate),
      state_changes: activities.map((activity) => ({
        kind: 'semantic_activity',
        activity_id: activity.activity_id,
        profile_ref: activity.profile_ref,
        profile_pin: profilePin(),
        duration_class: activity.duration_class,
        effort: activity.effort,
        body_effect_profile_ref:
          `body:${activity.duration_class}:${activity.effort}`,
        body_effect_context: {
          kind: 'semantic_activity',
          duration_class: activity.duration_class,
          effort: activity.effort
        }
      }))
    },
    hidden_update: hiddenUpdate,
    time_update: {
      clock_before: {
        whole_minutes: '10', subminute_numerator: '0',
        subminute_denominator: '1'
      },
      clock_after: {
        whole_minutes: String(10 + elapsed), subminute_numerator: '0',
        subminute_denominator: '1'
      },
      exact_elapsed: { exact_minutes: {
        numerator: String(elapsed), denominator: '1'
      } },
      semantic_activity_elapsed: { exact_minutes: {
        numerator: String(semanticMinutes), denominator: '1'
      } },
      semantic_activity_resolutions: activityResolutions
    },
    body_update: body == null ? {
      owner: '@rus/body-state', applied: false, proposal: null,
      state_after: null
    } : {
      owner: '@rus/body-state', applied: true,
      proposal: {
        schema: 'rus.body_state.composite_fixed_effect_proposal.v1',
        profile_ref: 'body:composite',
        profile_pin: profilePin(),
        component_proposals: componentProposals,
        exact_deltas: structuredClone(body.exact_deltas),
        selection_policy: 'ordered_committed_step_components',
        rng_consumption: 'forbidden'
      },
      state_after: structuredClone(body.state_after)
    }
  };
}

export function direct(operationKind, operationId, payload) {
  return {
    target: operationKind === 'apply_body_event'
      ? 'party_state' : 'party_items',
    value: {
      version: 1,
      schema: DIRECT_SCHEMA,
      operation_id: operationId,
      root_turn_id: 'turn:p:1',
      step_index: 1,
      operation_kind: operationKind,
      payload
    }
  };
}

export function mechanics(operationRef, mass = 300, quantity = 1) {
  return createRuntimeInstanceMechanicsSnapshot({
    schema: 'rus.items.runtime_instance_mechanics_snapshot.v1',
    version: 1,
    provenance: {
      source_kind: 'ordinary_direct_action_result',
      root_turn_id: 'turn:p:1',
      step_index: 1,
      operation_ref: operationRef,
      origin_kind: 'ambient_ordinary',
      source_refs: ['shore']
    },
    mechanics: {
      mass_grams: mass,
      external_hand_cost: 1,
      carry_form: 'compact',
      packing_slot_cost: 1,
      quantity: { value: quantity, unit: 'handful' },
      container: null
    }
  });
}

export function semanticActivity({ id = 'activity-1', duration = 5,
  durationClass = 'brief' } = {}) {
  return {
    target: 'party_events',
    value: {
      version: 1,
      schema: 'rus.lower_dvina_trace_turn_step_semantic_activity.v1',
      activity_id: id,
      root_turn_id: 'turn:p:1',
      step_index: 1,
      profile_ref: `approved:${durationClass}-light`,
      duration_class: durationClass,
      duration_minutes: duration,
      effort: 'light'
    }
  };
}

export function activityResolution(activity, fragmentOrder, start, end) {
  const timestamp = (whole) => ({ whole_minutes: whole,
    subminute_numerator: '0', subminute_denominator: '1' });
  const exact = { exact_minutes: {
    numerator: String(activity.duration_minutes), denominator: '1'
  } };
  return {
    version: 1,
    schema: 'turn_semantic_activity_resolution_v1',
    activity_id: activity.activity_id,
    root_turn_id: activity.root_turn_id,
    step_index: activity.step_index,
    fragment_order: fragmentOrder,
    profile_ref: activity.profile_ref,
    profile_pin: profilePin(),
    duration_class: activity.duration_class,
    effort: activity.effort,
    body_effect_profile_ref:
      `body:${activity.duration_class}:${activity.effort}`,
    execution: { status: 'completed', execution_scope: 'standalone',
      original_duration: exact, started_at: timestamp(start),
      ended_at: timestamp(end) },
    attempt: { attempt_ordinal: 0, planned_time: exact,
      actual_time: exact, result_kind: 'completed',
      started_at: timestamp(start), ended_at: timestamp(end) }
  };
}

export function bodyPayload() {
  return {
    body_effect_ref: 'body:impact:minor',
    profile_pin: profilePin(),
    selected_context: {
      kind: 'direct_body_event', mechanism: 'impact', severity: 'minor',
      body_part_ref: 'left_arm'
    },
    exact_deltas: { health: -1, satiety: 0, energy: 0 },
    state_after: { health: 99, satiety: 90, energy: 80 },
    selection_policy: 'fixed_approved_effect',
    rng_consumption: 'forbidden'
  };
}

export function profilePin() {
  return { artifact_id: 'turn-step-owner-profiles', revision: 1,
    digest: '1'.repeat(64) };
}

export function authoredProfile() {
  return { mass_grams: 100, external_hand_cost: 0, carry_form: 'compact',
    packing_slot_cost: 1, packing_bundle_size: 1 };
}

export function canonicalEnvelope(legacy) {
  return {
    version: 1,
    schema: 'turn_step_commit_envelope_v1',
    party_id: 'p',
    root_turn_id: 'turn:p:1',
    base_state_version: 3,
    player_input: structuredClone(legacy.player_input),
    mode_resolution: structuredClone(legacy.mode_resolution),
    checks: [],
    consequence: structuredClone(legacy.consequence),
    time_update: structuredClone(legacy.time_update),
    body_update: structuredClone(legacy.body_update),
    hidden_update: structuredClone(legacy.hidden_update),
    visible_context: {},
    loop_trace: {
      version: 1,
      schema: 'turn_step_commit_trace_v1',
      root_turn_id: 'turn:p:1',
      request_id: legacy.player_input.request_id,
      committed_state_version: 3,
      status: 'resolved',
      stop_reason: 'completed',
      working_revision: 1,
      next_step_index: 2,
      remaining_intent: null,
      completed_steps: [],
      step_traces: [],
      check_results: [],
      clarification: null
    }
  };
}
