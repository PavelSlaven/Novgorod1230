import assert from 'node:assert/strict';
import test from 'node:test';
import { addElapsedTime } from '@rus/time-events-history';
import { canonicalDigest } from '@rus/materialization';
import {
  loadLowerDvinaTraceMaterializationBundle
} from '../src/internal/lower-dvina-trace-phase-1a.js';
import {
  resolveTracePhase5Contracts
} from '../src/runtime/lower-dvina-trace-phase-5-contracts.js';
import {
  createTracePhase5Command,
  phase5PreconditionsSatisfied
} from '../src/runtime/lower-dvina-trace-phase-5-command.js';
import {
  planTracePhase5TreatmentSlice
} from '../src/runtime/lower-dvina-trace-phase-5-activity.js';
import {
  createTracePhase5BodyEffect,
  createTracePhase5TemporalAdvance
} from '../src/runtime/lower-dvina-trace-phase-5-effects.js';
import { nextPhase5State } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-5-state.js';

const bundle = await loadLowerDvinaTraceMaterializationBundle({
  scenarioDefinitionRevision: 11
});
const initial = state();
const contracts = resolveTracePhase5Contracts({ state: initial, bundle });

test('Phase 5 admits treatment only from the exact safe committed state', () => {
  assert.equal(phase5PreconditionsSatisfied(initial, contracts), true);
  for (const mutate of [
    (value) => { value.player_response_boundary = { status: 'required' }; },
    (value) => { value.ratsha_surrendered = false; },
    (value) => { actor(value, 'ratsha_storehouse_helper')
      .machine_state.surrender_state = 'unknown'; },
    (value) => { actor(value, 'eremey_fisher').anchor_id = 'camp-anchor'; },
    (value) => { bandage(value).condition_state = 'applied_bandage'; },
    (value) => { actor(value, 'onisim_boatman')
      .machine_state.body_condition.state = 'stabilized_unable_to_walk'; }
  ]) {
    const changed = structuredClone(initial);
    mutate(changed);
    assert.equal(phase5PreconditionsSatisfied(changed, contracts), false);
  }
});

test('Phase 5 rejects a missing committed participating-fisher binding without fallback', () => {
  const changed = structuredClone(initial);
  delete changed.promise_instances[0].witness_slot_bindings
    .trace_ld_v1_audience_slot_participating_fisher;
  assert.throws(() => resolveTracePhase5Contracts({
    state: changed, bundle
  }), { code: 'TRACE_PHASE_5_PARTICIPATING_FISHER_MISSING' });
});

test('Phase 5 advances all 25 minutes in one command and requests one check', () => {
  const command = createTracePhase5Command({
    contracts, inputDigest: 'a'.repeat(64)
  });
  const admitted = command.availability({ committed_state: initial });
  assert.equal(admitted.can_attempt, true);
  assert.equal(admitted.treatment_consent.elapsed_minutes, 0);
  assert.equal(admitted.treatment_consent.option_id, 'accept_first_aid');
  assert.equal(admitted.check_requests.length, 1);
  const slice = admitted.treatment_slice;
  assert.equal(slice.slice_minutes, 25);
  assert.deepEqual(slice.completed_stages.map(({ duration_minutes: value }) =>
    value), [5, 10, 10]);
  const check = checkResult(true);
  const consequence = command.consequence({
    retrievedState: initial, availability: admitted,
    checks: { results: [check] }
  });
  assert.equal(consequence.treatment.check_result, check);
  assert.equal(consequence.treatment.outcome_fact,
    'onisim_stabilized_unable_to_walk');
  assert.equal(slice.attempt.resource_consumptions.length, 4);
  assert.deepEqual(consequence.treatment.completed_stage_ids, [
    'prepare_cloth_and_expose_injury',
    'support_and_position_injured_leg',
    'apply_bandage_and_reassess'
  ]);
  assert.equal(Number(slice.activity_execution.progress.current.numerator), 25);
});

test('Phase 5 one-command completion releases Onisim, spends water and applies the exact splint resources', () => {
  const command = createTracePhase5Command({
    contracts, inputDigest: '9'.repeat(64)
  });
  const admitted = command.availability({ committed_state: initial });
  const consequence = command.consequence({
    retrievedState: initial,
    availability: admitted,
    checks: { results: [checkResult(true)] }
  });
  const next = nextPhase5State({
    state: initial,
    factual: factual(consequence, plus(initial.clock, 25)),
    nextVersion: 13,
    turnNumber: 5,
    inputDigest: '9'.repeat(64),
    changeSetId: 'phase5-change',
    contracts
  });
  const onisim = actor(next, 'onisim_boatman');
  const eremey = actor(next, 'eremey_fisher');
  assert.deepEqual({
    holder: onisim.machine_state.binding_item.holder_npc_id,
    controller: onisim.machine_state.binding_item.controller_npc_id,
    position: onisim.machine_state.binding_item.physical_position,
    access: onisim.machine_state.binding_item.accessibility,
    use: onisim.machine_state.binding_item.use_state
  }, {
    holder: eremey.instance_id,
    controller: eremey.instance_id,
    position: 'external_load',
    access: 'secured_not_available_to_ratsha',
    use: 'coiled_ready_for_reuse'
  });
  assert.equal(resource(next, contracts.ids.water).state.use_state,
    'empty_after_onisim_drink');
  assert.equal(resource(next, contracts.ids.water).state
    .water_portions_remaining, 0);
  assert.equal(resource(next, contracts.ids.net).state.use_state,
    'temporary_leg_splint_support');
  assert.equal(resource(next, contracts.ids.poles).state.use_state,
    'temporary_leg_splint_frame');
  assert.equal(resource(next, contracts.ids.net).ownership.owner_npc_id,
    eremey.instance_id);
  assert.equal(resource(next, contracts.ids.poles).ownership.owner_npc_id,
    actor(next, 'background_fisher_1').instance_id);
});

test('Phase 5 preserves partial progress at an external boundary and resumes only the remainder', () => {
  const interruptedState = structuredClone(initial);
  interruptedState.temporal_boundary_candidates = [candidate({
    partyId: interruptedState.party_id,
    scheduledAt: plus(interruptedState.clock, 2)
  })];
  const interrupted = planTracePhase5TreatmentSlice({
    state: interruptedState, contracts, inputDigest: 'b'.repeat(64)
  });
  assert.equal(interrupted.interrupted, true);
  assert.equal(interrupted.slice_minutes, 2);
  assert.equal(interrupted.progress_after, 2);
  assert.equal(interrupted.activity_execution.status, 'paused');
  assert.deepEqual(interrupted.processed_boundary_ids, []);
  assert.deepEqual(interrupted.encountered_boundary_candidates
    .map(({ boundary_id: id }) => id), ['external-boundary']);

  const resumedState = afterSlice(interruptedState, interrupted);
  resumedState.temporal_boundary_candidates = [];
  const resumed = planTracePhase5TreatmentSlice({
    state: resumedState, contracts, inputDigest: 'c'.repeat(64)
  });
  assert.equal(resumed.resume_result.ok, true);
  assert.equal(resumed.slice_minutes, 23);
  assert.equal(resumed.progress_before, 2);
  assert.equal(resumed.progress_after, 25);
  assert.equal(resumed.stage_completed, true);
  assert.equal(resumed.final, true);
});

test('Phase 5 preserves an exact stage-end boundary and waits for its source owner', () => {
  const boundaryState = structuredClone(initial);
  boundaryState.temporal_boundary_candidates = [candidate({
    partyId: boundaryState.party_id,
    scheduledAt: plus(boundaryState.clock, 5)
  })];
  const stopped = planTracePhase5TreatmentSlice({
    state: boundaryState, contracts, inputDigest: 'd'.repeat(64)
  });
  assert.equal(stopped.interrupted, true);
  assert.equal(stopped.stage_completed, true);
  assert.equal(stopped.progress_after, 5);
  assert.equal(stopped.activity_execution.status, 'paused');
  assert.deepEqual(stopped.activity_boundary_candidate.causal_parent_refs, [{
    entity_kind: 'temporal_boundary_candidate',
    entity_id: 'external-boundary'
  }]);
  const pending = afterSlice(boundaryState, stopped);
  pending.temporal_boundary_candidates = [candidate({
    partyId: pending.party_id, scheduledAt: pending.clock
  })];
  assert.throws(() => planTracePhase5TreatmentSlice({
    state: pending, contracts, inputDigest: 'e'.repeat(64)
  }), { code: 'TRACE_PHASE_5_EXTERNAL_BOUNDARY_PENDING' });
  pending.temporal_boundary_candidates = [];
  const resumed = planTracePhase5TreatmentSlice({
    state: pending, contracts, inputDigest: 'f'.repeat(64)
  });
  assert.equal(resumed.progress_before, 5);
  assert.equal(resumed.slice_minutes, 20);
  assert.equal(resumed.final, true);
});

test('Phase 5 fails closed before a same-time terminal source boundary', () => {
  const finalState = structuredClone(initial);
  finalState.temporal_boundary_candidates = [candidate({
    partyId: finalState.party_id,
    scheduledAt: plus(finalState.clock, 15)
  })];
  const paused = planTracePhase5TreatmentSlice({
    state: finalState, contracts, inputDigest: '1'.repeat(64)
  });
  const pending = afterSlice(finalState, paused);
  pending.temporal_boundary_candidates = [candidate({
    partyId: pending.party_id,
    scheduledAt: plus(pending.clock, 10)
  })];
  assert.throws(() => planTracePhase5TreatmentSlice({
    state: pending, contracts, inputDigest: '2'.repeat(64)
  }), { code: 'TRACE_PHASE_5_SAME_TIME_TERMINAL_BOUNDARY_UNRESOLVED' });
});

test('Phase 5 time and body owners apply one clock write and exact condition-only outcomes', async () => {
  const temporal = createTracePhase5TemporalAdvance({
    phase4Advance: async () => { throw new Error('unexpected fallback'); }
  });
  const consequence = {
    phase5_kind: 'onisim_treatment', duration_minutes: 25,
    treatment: {
      progress_before: 0, progress_after: 25, interrupted: false,
      encountered_boundary_candidates: [],
      processed_boundary_ids: []
    }
  };
  const advanced = await temporal({
    consequence, clock_before: initial.clock,
    relevant_state: { temporal_boundary_candidates: [] }
  });
  assert.equal(advanced.clock_after.whole_minutes, '25');
  assert.equal(advanced.boundary_trace.root_clock_write_count, 1);
  assert.deepEqual(advanced.boundary_trace.processed_boundary_ids, []);

  const body = createTracePhase5BodyEffect({
    phase2BodyEffect: { apply() { throw new Error('unexpected fallback'); } },
    contracts
  });
  for (const outcome of ['success', 'failure']) {
    const profile = contracts.bodyEffect.outcome_effects[outcome];
    const result = body.apply({
      committed_state: { body_state: {} },
      consequence: {
        phase5_kind: 'onisim_treatment',
        body_effect_ref: contracts.ids.bodyEffect,
        treatment: { final: true, body_outcome: profile }
      }
    });
    assert.equal(result.applied, true);
    assert.deepEqual(result.proposal.exact_deltas,
      { health: 0, satiety: 0, energy: 0 });
    assert.equal(result.proposal.condition_transitions[0].to,
      outcome === 'success'
        ? 'stabilized_unable_to_walk' : 'injured_unable_to_walk');
  }
});

function state() {
  const clock = timestamp('0');
  return {
    party_id: 'phase-5-party', actor_id: 'mikula',
    party_state: {
      state_version: 12, turn_number: 4, session_state_version: 5,
      clock_state_version: 5, body_state_version: 1
    },
    clock,
    clock_weather_light: { clock, weather: {}, light: {} },
    position: {
      location_ref: 'trace_ld_v1_loc_old_drying_shed',
      g5_anchor_id: 'shed-anchor'
    },
    player_response_boundary: null,
    ratsha_surrendered: true,
    temporal_boundary_candidates: [],
    materialization_trace: { run_id: 'phase-5-run' },
    prepared_scenes: [{
      location_profile_ref: 'trace_ld_v1_loc_old_drying_shed',
      anchor: { instance_id: 'shed-anchor' }
    }],
    promise_instances: [{
      witness_actor_ids: ['eremey', 'fisher'],
      witness_slot_bindings: {
        eremey_fisher: 'eremey',
        trace_ld_v1_audience_slot_participating_fisher: 'fisher'
      }
    }],
    sealed_selections: [{
      selection_kind: 'audience',
      records: [{
        selected_id: 'background_fisher_2',
        record_digest: canonicalDigest(
          bundle.knowledge_lie_memory_rules.audience_candidate_slots[0]
        )
      }]
    }],
    knowledge: [{
      fact_id: 'ratsha_surrender_without_further_harm_committed'
    }],
    npcs: [
      npc('ratsha_storehouse_helper', 'ratsha', {
        surrender_state: 'surrendered_without_further_harm',
        restraint_state: 'not_restrained'
      }),
      npc('onisim_boatman', 'onisim', {
        body_condition: {
          condition_profile_ref: 'trace_ld_v1_condition_onisim_injury',
          state: 'injured_unable_to_walk'
        },
        binding_item: {
          item_template_ref: 'trace_ld_v1_item_ratsha_binding_rope',
          owner_ref: null,
          holder_npc_id: 'onisim',
          controller_npc_id: 'ratsha',
          use_state: 'binding_onisim'
        }
      }),
      npc('eremey_fisher', 'eremey', {}),
      npc('background_fisher_1', 'fisher-owner', {}),
      npc('background_fisher_2', 'fisher', {})
    ],
    items: [{
      item_id: 'ratsha-knife', template_id: 'trace_ld_v1_item_ratsha_knife',
      condition_state: 'serviceable',
      placement: { holder_npc_id: 'fisher', physical_position: 'hands' },
      ownership: { owner_npc_id: 'ratsha', controller_npc_id: 'fisher' },
      state: { property_state: {
        accessibility: 'secured_not_available_to_ratsha'
      } }
    }, {
      item_id: 'bandage', template_id: 'trace_ld_v1_item_bandage_cloth',
      condition_state: 'clean_serviceable', quantity: 1,
      placement: { holder_npc_id: 'eremey', physical_position: 'worn_quick' },
      ownership: {
        ownership_id: 'bandage-ownership', owner_npc_id: 'eremey',
        controller_npc_id: 'eremey'
      },
      state: {
        accessibility: 'quick', use_state: null,
        inventory_profile_snapshot: {
          inventory_profile_id: 'trace_ld_v1_inventory_profile_bandage_cloth',
          item_template_ref: 'trace_ld_v1_item_bandage_cloth',
          mass_grams: 100, carry_form: 'compact', external_hand_cost: 0
        }
      }
    }, resourceItem({
      id: 'net', template: 'trace_ld_v1_item_fishing_net',
      profile: 'trace_ld_v1_inventory_profile_fishing_net_group_load',
      category: 'fishing_net', owner: 'eremey', holder: 'fisher',
      inventoryProfile: groupLoadProfile(
        'trace_ld_v1_inventory_profile_fishing_net_group_load',
        'trace_ld_v1_item_fishing_net'
      )
    }), resourceItem({
      id: 'poles', template: 'trace_ld_v1_item_carry_poles',
      profile: 'trace_ld_v1_inventory_profile_carry_poles_group_load',
      category: 'carry_poles', owner: 'fisher-owner', holder: 'fisher',
      inventoryProfile: groupLoadProfile(
        'trace_ld_v1_inventory_profile_carry_poles_group_load',
        'trace_ld_v1_item_carry_poles'
      )
    }), resourceItem({
      id: 'water',
      template: 'trace_ld_v1_item_eremey_drinking_water_vessel',
      profile: 'trace_ld_v1_item_eremey_drinking_water_vessel',
      category: 'filled_drinking_water_vessel', owner: 'eremey',
      holder: 'eremey', position: 'worn_quick',
      use: 'one_patient_drink_available', portions: 1
    })]
  };
}

function resourceItem({ id, template, profile, category, owner, holder,
  position = 'external_load', use = 'carried_for_group_use', portions,
  inventoryProfile = null }) {
  return {
    item_id: id, template_id: template, profile_id: profile,
    category_id: category, quantity: 1, condition_state: 'serviceable',
    legal_status: 'owned',
    placement: {
      anchor_id: null, container_id: null, holder_npc_id: holder,
      holder_character_id: null, physical_position: position,
      equipment_slot_category_id: null
    },
    ownership: {
      ownership_id: `ownership:${id}`, owner_npc_id: owner,
      owner_character_id: null, owner_external_ref: null, owner_party: false,
      controller_npc_id: holder, controller_character_id: null,
      claim_state: 'established'
    },
    state: {
      accessibility: 'quick', use_state: use,
      ...(portions == null ? {} : { water_portions_remaining: portions }),
      ...(inventoryProfile == null ? {} : {
        inventory_profile_snapshot: inventoryProfile
      })
    }
  };
}

function groupLoadProfile(inventoryProfileId, itemTemplateRef) {
  return {
    inventory_profile_id: inventoryProfileId,
    item_template_ref: itemTemplateRef,
    mass_grams: 2500,
    carry_form: 'long',
    external_hand_cost: 1,
    status: 'approved'
  };
}

function npc(slot, id, machineState) {
  return {
    participant_slot_ref: slot, instance_id: id, anchor_id: 'shed-anchor',
    machine_state: { current_activity_execution_id: null, ...machineState },
    semantic_state: {}
  };
}

function afterSlice(current, slice, consent = null) {
  return {
    ...structuredClone(current),
    clock: structuredClone(slice.attempt.ended_at),
    phase5_treatment: {
      activity_execution: structuredClone(slice.activity_execution),
      consent_decision: structuredClone(consent
        ?? current.phase5_treatment?.consent_decision
        ?? { option_id: 'accept_first_aid' })
    }
  };
}

function actor(value, slot) {
  return value.npcs.find(({ participant_slot_ref: ref }) => ref === slot);
}

function bandage(value) {
  return value.items.find(
    ({ template_id: id }) => id === 'trace_ld_v1_item_bandage_cloth'
  );
}

function resource(value, templateId) {
  return value.items.find(({ template_id: id }) => id === templateId);
}

function factual(consequence, clockAfter) {
  return {
    consequence,
    time_update: { clock_after: clockAfter },
    player_input: {
      request_id: 'phase5-request', idempotency_key: 'phase5-request',
      raw_text: 'Оказать Онисиму первую помощь.'
    },
    mode_resolution: {
      option_id: contracts.ids.option,
      decision_trace: { action_set_digest: 'a'.repeat(64) }
    }
  };
}

function timestamp(wholeMinutes) {
  return {
    whole_minutes: String(wholeMinutes), subminute_numerator: '0',
    subminute_denominator: '1'
  };
}

function plus(value, minutes) {
  return addElapsedTime(value, {
    exact_minutes: { numerator: String(minutes), denominator: '1' }
  });
}

function candidate({ partyId, scheduledAt }) {
  return {
    boundary_id: 'external-boundary', boundary_kind: 'exact_timer',
    scheduled_at: scheduledAt,
    source_ref: { entity_kind: 'timer', entity_id: 'external-timer' },
    primary_subject_ref: { entity_kind: 'npc', entity_id: 'ratsha' },
    subject_refs: [], scope_ref: { entity_kind: 'party', entity_id: partyId },
    rule_ref: {
      entity_ref: { entity_kind: 'event_rule', entity_id: 'external-rule' },
      authoring_version: 'v1'
    },
    policy_ref: {
      entity_ref: { entity_kind: 'event_policy', entity_id: 'external-policy' },
      authoring_version: 'v1'
    },
    preconditions_digest: 'a'.repeat(64),
    resolution_class: 'execution_outcome', interrupt_effect: 'background',
    visibility_policy_ref: {
      entity_ref: {
        entity_kind: 'visibility_policy', entity_id: 'visible-external'
      }, authoring_version: 'v1'
    },
    idempotency_key: 'external-boundary-idem', causal_parent_refs: []
  };
}

function checkResult(success) {
  return {
    check_id: contracts.ids.check, difficulty: 12, roll: success ? 12 : 1,
    modifiers: {
      attribute: 0, skill: 0, state: -1, item_or_evidence: 1,
      circumstance: 0, total: 0
    },
    outcome: { success }, audit: { source: 'test' }
  };
}
