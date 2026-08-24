import assert from 'node:assert/strict';
import test from 'node:test';
import { createTracePhase6TemporalAdvance } from
  '../src/runtime/lower-dvina-trace-phase-6-effects.js';
import { REBIND_BOUNDARY, boundary, contracts,
  planTracePhase6SynchronizedCarry, profile, state } from
  './lower-dvina-trace-phase-6-fixtures.js';

test('Phase 6 terminal carry uses one root attempt, exact assembly and committed carrier snapshots', () => {
  const result = planTracePhase6SynchronizedCarry({ state: state(), contracts, inputDigest: 'input' });
  assert.equal(result.execution_after.status, 'completed');
  assert.equal(result.exact_elapsed.numerator, '20');
  assert.equal(result.root_clock_write_count, 1);
  assert.equal(result.traversal.interval_result.result_kind,
    'segment_completed');
  assert.equal(result.traversal.interval_result.actual_time_numerator, '20');
  assert.equal(result.internal_rebinding.route_progress_ppm, 500000);
  assert.equal(result.internal_rebinding.player_decision_required, false);
  assert.equal(result.internal_rebinding.replacement_carrier_id, 'background_fisher_2');
  assert.equal(result.internal_rebinding.effect_occurred_at.whole_minutes,
    '110');
  assert.deepEqual(result.attempt.processed_boundary_ids,
    [REBIND_BOUNDARY.boundary_id]);
  assert.deepEqual([result.assembly_snapshot.net_item_id, result.assembly_snapshot.poles_item_id], ['net', 'poles']);
  const eremey = result.carrier_inventory_snapshots.find(
    ({ actor_id: id }) => id === 'eremey_fisher'
  );
  assert.equal(eremey.total_mass_grams, 1300);
  assert.equal(eremey.load_category, null);
  assert.equal(eremey.at_load_limit, null);
  assert.equal(eremey.load_evaluation,
    'not_evaluated_without_approved_strength');
  assert.equal(eremey.hands_used_before_activity, 1);
  assert.equal(eremey.hands_free_before_activity, 1);
  assert.equal(eremey.required_free_external_hands, 1);
  assert.equal(eremey.activity_grip_hands, 1);
  assert.equal(eremey.hands_used_with_activity, 2);
  assert.deepEqual(eremey.item_ids, ['rope', 'vessel']);
  assert.equal(eremey.item_ids.includes('net'), false);
  const player = result.carrier_inventory_snapshots.find(
    ({ actor_id: id }) => id === 'mikula'
  );
  assert.equal(player.strength, 9);
  assert.equal(player.load_category, 'light');
  assert.equal(player.load_evaluation,
    'evaluated_from_approved_player_strength');
  const start = result.inventory_admission_checkpoints.find(
    ({ checkpoint }) => checkpoint === 'activity_start'
  );
  const rebind = result.inventory_admission_checkpoints.find(
    ({ checkpoint }) => checkpoint === 'exact_internal_rebind'
  );
  assert.equal(start.required_free_external_hands, 1);
  assert.equal(rebind.cumulative_elapsed_minutes, 10);
  assert.deepEqual(rebind.active_carrier_ids, [
    'eremey_fisher', 'ratsha_storehouse_helper', 'background_fisher_2'
  ]);
});

test('Phase 6 accepts prepared Rev24 first-entry camp target and rejects duplicates', () => {
  const value = state();
  const [camp] = value.prepared_scenes;
  value.prepared_scenes = [];
  value.first_entry_preparation = { spatial_v3: { target: { status: 'prepared' } }, scene: camp };
  assert.equal(planTracePhase6SynchronizedCarry({
    state: value, contracts, inputDigest: 'rev24-first-entry'
  }).execution_after.status, 'completed');
  const duplicate = state();
  duplicate.prepared_scenes.push(structuredClone(duplicate.prepared_scenes[0]));
  assert.throws(() => planTracePhase6SynchronizedCarry({
    state: duplicate, contracts, inputDigest: 'duplicate-camp'
  }), { code: 'TRACE_PHASE_6_TERMINAL_POSITION_GAP' });
});

test('Phase 6 pauses at the earliest external temporal boundary and persists partial progress', () => {
  const value = state(); value.temporal_boundary_candidates.push(boundary('weather-change', 5 + 100), boundary('later', 115));
  const result = planTracePhase6SynchronizedCarry({ state: value, contracts, inputDigest: 'input' });
  assert.equal(result.exact_elapsed.numerator, '5');
  assert.equal(result.progress_after_ppm, 250000);
  assert.equal(result.execution_after.status, 'paused');
  assert.equal(result.traversal.interval_result.result_kind,
    'paused_in_transit');
  assert.deepEqual(result.attempt.external_boundary_refs, ['weather-change']);
  assert.equal(result.terminal_group_position, null);
  assert.deepEqual(result.body_effects_by_subject, []);
  assert.deepEqual(result.inventory_admission_checkpoints.map(
    ({ checkpoint }) => checkpoint
  ), ['activity_start']);
});

test('Phase 6 resolves the complete canonical same-time earliest batch', async () => {
  const value = state();
  value.temporal_boundary_candidates.push(
    boundary('same-time-b', 105),
    boundary('same-time-a', 105),
    boundary('later', 115)
  );
  const intent = planTracePhase6SynchronizedCarry({
    state: value, contracts, inputDigest: 'same-time'
  });
  assert.deepEqual(intent.attempt.external_boundary_refs,
    ['same-time-a', 'same-time-b']);
  assert.equal(intent.exact_elapsed.numerator, '5');
  assert.equal(intent.progress_after_ppm, 250000);
  const temporal = await createTracePhase6TemporalAdvance({
    fallback: () => assert.fail('Phase 6 temporal owner was bypassed')
  })({
    consequence: { phase6_kind: 'synchronized_carry', carry: {
      intent, traversal: intent.traversal
    } },
    relevant_state: value
  });
  assert.equal(temporal.nearest_boundary, null);
  assert.deepEqual(temporal.boundary_trace.processed_boundary_ids,
    ['same-time-a', 'same-time-b']);
  assert.deepEqual(temporal.boundary_trace.deferred_to_source_owner_ids,
    []);
  assert.equal(temporal.boundary_trace.root_clock_write_count, 1);
  assert.equal(temporal.clock_after.whole_minutes, '105');
});

test('Phase 6 leaves a current-timestamp boundary batch to its source owner', () => {
  const value = state();
  value.temporal_boundary_candidates.push(
    boundary('current-b', 100), boundary('current-a', 100)
  );
  assert.throws(() => planTracePhase6SynchronizedCarry({
    state: value, contracts, inputDigest: 'current-boundary'
  }), { code: 'TRACE_PHASE_6_EXTERNAL_BOUNDARY_PENDING' });
});

test('Phase 6 resume retains execution identity and crosses the deterministic 10-minute rebind once', () => {
  const value = state();
  const interrupted = state();
  interrupted.temporal_boundary_candidates.push(boundary('pause', 105));
  const partial = planTracePhase6SynchronizedCarry({
    state: interrupted, contracts, inputDigest: 'partial'
  });
  value.phase6_carry_execution = partial.execution_after;
  const result = planTracePhase6SynchronizedCarry({ state: value, contracts, inputDigest: 'input' });
  assert.equal(result.execution_id,
    `activity:${value.party_id}:trace-phase6:carry`);
  assert.equal(result.resume, true);
  assert.equal(result.exact_elapsed.numerator, '15');
  assert.equal(result.cumulative_elapsed_after.numerator, '20');
  assert.equal(result.internal_rebinding.applied_in_this_attempt, true);
  assert.equal(result.internal_rebinding.elapsed_minutes, 10);
  assert.equal(result.internal_rebinding.route_progress_ppm, 500000);
  assert.deepEqual(result.player_decision_boundaries, []);
  assert.equal(result.execution_after.status, 'completed');
  assert.equal(result.traversal.ids.execution_id,
    partial.traversal.ids.execution_id);
  assert.equal(result.traversal.interval_result.interval_ordinal, 1);
  assert.deepEqual(result.inventory_admission_checkpoints.map(
    ({ checkpoint }) => checkpoint
  ), ['activity_resume', 'exact_internal_rebind']);
});

test('Phase 6 emits Mikula body effect when a pause first crosses rebind', () => {
  const interrupted = state();
  interrupted.temporal_boundary_candidates.push(boundary('pause-after', 112));
  const partial = planTracePhase6SynchronizedCarry({
    state: interrupted, contracts, inputDigest: 'pause-after-rebind'
  });
  assert.equal(partial.execution_after.status, 'paused');
  assert.equal(partial.cumulative_elapsed_after.numerator, '12');
  assert.equal(partial.internal_rebinding.applied_in_this_attempt, true);
  assert.equal(partial.internal_rebinding.effect_occurred_at.whole_minutes,
    '110');
  assert.deepEqual(partial.body_effects_by_subject.map(
    ({ subject_ref: subject }) => subject
  ), ['player_clerk']);

  const resumed = state();
  resumed.phase6_carry_execution = partial.execution_after;
  resumed.body_state = { health: 79, energy: 35, satiety: 57,
    active_conditions: [] };
  const terminal = planTracePhase6SynchronizedCarry({
    state: resumed, contracts, inputDigest: 'resume-after-rebind'
  });
  assert.equal(terminal.execution_after.status, 'completed');
  assert.equal(terminal.internal_rebinding.applied_in_this_attempt, false);
  assert.equal(terminal.body_effects_by_subject.some(
    ({ subject_ref: subject }) => subject === 'player_clerk'), false);
});

test('Phase 6 orders a same-time physical hazard before carrier rebinding', async () => {
  const initial = state();
  const reaction = boundary('carrier-reaction', 110, 'reaction_decision');
  reaction.rule_ref = boundary('replacement-hazard', 110).rule_ref;
  reaction.policy_ref = boundary('replacement-hazard', 110).policy_ref;
  reaction.causal_parent_refs = [{
    entity_kind: 'temporal_boundary_candidate',
    entity_id: 'replacement-hazard'
  }];
  const seenByReaction = [];
  const sourceOwner = (candidate, { projection }) => {
    if (candidate.boundary_id === 'replacement-hazard') {
      const phase6State = structuredClone(projection.phase6_state);
      const changed = phase6State.npcs.find(
        ({ participant_slot_ref: id }) => id === 'background_fisher_2'
      );
      changed.anchor_id = 'hazard-separated-anchor';
      return { disposition: 'execute', proposals: [{
        proposal_id: 'hazard-separated-replacement',
        write_target: 'replacement-access',
        write_set: { appends: [], inserts: [], deletes: [], updates: [{
          target_table: 'party_npcs', id: changed.instance_id,
          record: { party_id: phase6State.party_id,
            npc_id: changed.instance_id, anchor_id: changed.anchor_id }
        }] }
      }], state_projection: { ...projection, phase6_state: phase6State },
      follow_up_candidates: [reaction] };
    }
    seenByReaction.push([...projection.active_carrier_ids]);
    return { disposition: 'execute', proposals: [{
      proposal_id: 'carrier-reaction-observed',
      write_target: 'npc-reaction'
    }], state_projection: projection, follow_up_candidates: [] };
  };
  initial.temporal_boundary_candidates.push(
    boundary('replacement-hazard', 110, 'physical_hazard_access')
  );
  const paused = planTracePhase6SynchronizedCarry({
    state: initial, contracts, inputDigest: 'same-time-rebind-hazard',
    resolveExternalBoundary: sourceOwner
  });
  assert.equal(paused.exact_elapsed.numerator, '10');
  assert.equal(paused.progress_after_ppm, 500000);
  assert.equal(paused.internal_rebinding.applied_in_this_attempt, false);
  assert.equal(paused.internal_rebinding.body_effect_due_in_this_attempt, true);
  assert.equal(paused.execution_after.internal_rebinding_applied, false);
  assert.deepEqual(paused.attempt.temporal_boundary_refs, [
    'replacement-hazard', REBIND_BOUNDARY.boundary_id, 'carrier-reaction'
  ]);
  assert.deepEqual(paused.attempt.external_boundary_refs,
    ['replacement-hazard', 'carrier-reaction']);
  assert.deepEqual(paused.attempt.processed_boundary_ids, [
    'replacement-hazard', REBIND_BOUNDARY.boundary_id, 'carrier-reaction'
  ]);
  assert.deepEqual(seenByReaction, [[
    'mikula', 'eremey_fisher', 'ratsha_storehouse_helper'
  ]]);
  const afterHazard = state();
  afterHazard.clock = boundary('clock-after-hazard', 110).scheduled_at;
  afterHazard.phase6_carry_execution = paused.execution_after;
  afterHazard.body_state = { health: 79, energy: 35, satiety: 57,
    active_conditions: [] };
  afterHazard.body_effect_history = [{
    effect_ref: 'carrier10',
    activity_attempt_id: paused.execution_id,
    occurred_at: paused.internal_rebinding.effect_occurred_at
  }];
  afterHazard.npcs.find(({ participant_slot_ref: id }) =>
    id === 'background_fisher_2').anchor_id = 'hazard-separated-anchor';
  assert.throws(() => planTracePhase6SynchronizedCarry({
    state: afterHazard, contracts, inputDigest: 'after-hazard-recheck'
  }), { code: 'TRACE_PHASE_6_PARTICIPANT_NOT_COLOCATED' });
  assert.equal(afterHazard.phase6_carry_execution.progress_ppm, 500000);
  assert.equal(afterHazard.phase6_carry_execution.internal_rebinding_applied,
    false);

  const invalidAssembly = structuredClone(afterHazard);
  invalidAssembly.npcs.find(({ participant_slot_ref: id }) =>
    id === 'background_fisher_2').anchor_id = 'shed-anchor';
  invalidAssembly.items.find(({ item_id: id }) => id === 'net')
    .state.use_state = 'lost_during_hazard';
  assert.throws(() => planTracePhase6SynchronizedCarry({
    state: invalidAssembly, contracts, inputDigest: 'hazard-resource-recheck'
  }), { code: 'TRACE_PHASE_6_ASSEMBLY_RESOURCE_STATE_INVALID' });

  const admitted = structuredClone(afterHazard);
  admitted.npcs.find(({ participant_slot_ref: id }) =>
    id === 'background_fisher_2').anchor_id = 'shed-anchor';
  const resumed = planTracePhase6SynchronizedCarry({
    state: admitted, contracts, inputDigest: 'hazard-admitted-rebind'
  });
  assert.equal(resumed.internal_rebinding.applied_in_this_attempt, true);
  assert.equal(resumed.internal_rebinding.body_effect_due_in_this_attempt,
    false);
  assert.deepEqual(resumed.attempt.processed_boundary_ids,
    [REBIND_BOUNDARY.boundary_id]);
});

test('Phase 6 applies rebinding when same-time hazard preserves admission', () => {
  const initial = state();
  const reaction = boundary('admitted-reaction', 110, 'reaction_decision');
  reaction.rule_ref = boundary('admitted-hazard', 110).rule_ref;
  reaction.policy_ref = boundary('admitted-hazard', 110).policy_ref;
  reaction.causal_parent_refs = [{
    entity_kind: 'temporal_boundary_candidate',
    entity_id: 'admitted-hazard'
  }];
  const observed = [];
  initial.temporal_boundary_candidates.push(
    boundary('admitted-hazard', 110, 'physical_hazard_access')
  );
  const result = planTracePhase6SynchronizedCarry({
    state: initial,
    contracts,
    inputDigest: 'same-time-rebind-admitted',
    resolveExternalBoundary(candidate, { projection }) {
      if (candidate.boundary_id === 'admitted-hazard') return {
        disposition: 'execute', proposals: [{ proposal_id: 'hazard-ok',
          write_target: 'replacement-access' }],
        state_projection: projection, follow_up_candidates: [reaction]
      };
      observed.push([...projection.active_carrier_ids]);
      return { disposition: 'execute', proposals: [{ proposal_id: 'reaction',
        write_target: 'npc-reaction' }], state_projection: projection,
      follow_up_candidates: [] };
    }
  });

  assert.equal(result.internal_rebinding.applied_in_this_attempt, true);
  assert.deepEqual(observed, [[
    'eremey_fisher', 'ratsha_storehouse_helper', 'background_fisher_2'
  ]]);
});

test('Phase 6 rejects a source projection without its exact NPC write', () => {
  const value = state();
  value.temporal_boundary_candidates.push(
    boundary('unmapped-hazard', 110, 'physical_hazard_access')
  );
  assert.throws(() => planTracePhase6SynchronizedCarry({
    state: value, contracts, inputDigest: 'unmapped-hazard',
    resolveExternalBoundary(_candidate, { projection }) {
      const changed = structuredClone(projection);
      changed.phase6_state.npcs.find(({ participant_slot_ref: id }) =>
        id === 'background_fisher_2').anchor_id = 'unmapped-anchor';
      return { disposition: 'execute', proposals: [],
        state_projection: changed, follow_up_candidates: [] };
    }
  }), { code: 'TRACE_PHASE_6_TEMPORAL_SOURCE_PROJECTION_WRITE_GAP' });
});

test('Phase 6 inventory admission fails closed for a carried item without an approved profile', () => {
  const value = state();
  delete value.items.find(({ item_id: id }) => id === 'rope')
    .inventory_profile;
  assert.throws(() => planTracePhase6SynchronizedCarry({
    state: value, contracts, inputDigest: 'missing-profile'
  }), { code: 'TRACE_PHASE_6_CARRIER_INVENTORY_INVALID' });
});

test('Phase 6 assembly requires exactly one committed net and pole set', () => {
  for (const templateId of [
    'trace_ld_v1_item_fishing_net',
    'trace_ld_v1_item_carry_poles'
  ]) {
    const value = state();
    const source = value.items.find(
      ({ template_id: id }) => id === templateId
    );
    value.items.push({
      ...structuredClone(source),
      item_id: `${source.item_id}-duplicate`
    });
    assert.throws(() => planTracePhase6SynchronizedCarry({
      state: value, contracts, inputDigest: `duplicate:${templateId}`
    }), { code: 'TRACE_PHASE_6_ASSEMBLY_RESOURCE_GAP' });
  }
});

test('Phase 6 checks replacement inventory only at the exact rebind checkpoint', () => {
  const value = state();
  value.items.push({
    template_id: 'replacement-tool', item_id: 'replacement-tool',
    quantity: 1,
    placement: {
      holder_npc_id: 'background_fisher_2',
      physical_position: 'external_load'
    }
  });
  value.temporal_boundary_candidates.push(boundary('pause', 105));
  const partial = planTracePhase6SynchronizedCarry({
    state: value, contracts, inputDigest: 'before-rebind'
  });
  assert.equal(partial.execution_after.progress_ppm, 250000);

  const resumed = state();
  resumed.items.push(structuredClone(
    value.items.find(({ item_id: id }) => id === 'replacement-tool')
  ));
  resumed.phase6_carry_execution = partial.execution_after;
  assert.throws(() => planTracePhase6SynchronizedCarry({
    state: resumed, contracts, inputDigest: 'at-rebind'
  }), { code: 'TRACE_PHASE_6_CARRIER_INVENTORY_INVALID' });
});

test('Phase 6 treats committed load and the one-free-hand requirement as hard gates', () => {
  const overloaded = state();
  overloaded.items.push({
    template_id: 'player-bundle', item_id: 'player-bundle', quantity: 1,
    placement: {
      holder_character_id: 'mikula', physical_position: 'worn'
    },
    inventory_profile: profile(
      'player-bundle-profile', 'player-bundle', 54001, 'compact', 0
    )
  });
  assert.throws(() => planTracePhase6SynchronizedCarry({
    state: overloaded, contracts, inputDigest: 'overloaded'
  }), { code: 'TRACE_PHASE_6_CARRIER_INVENTORY_INVALID' });

  const noFreeHand = state();
  noFreeHand.items.push({
    template_id: 'ratsha-tool', item_id: 'ratsha-tool', quantity: 1,
    placement: {
      holder_npc_id: 'ratsha_storehouse_helper',
      physical_position: 'external_load'
    },
    inventory_profile: profile(
      'ratsha-tool-profile', 'ratsha-tool', 500, 'long', 2
    )
  });
  assert.throws(() => planTracePhase6SynchronizedCarry({
    state: noFreeHand, contracts, inputDigest: 'no-free-hand'
  }), { code: 'TRACE_PHASE_6_CARRIER_INVENTORY_INVALID' });
});

test('Phase 6 requires every committed participant at the source anchor', () => {
  for (const slot of ['eremey_fisher', 'ratsha_storehouse_helper',
    'onisim_boatman', 'background_fisher_2']) {
    const value = state();
    value.npcs.find(({ participant_slot_ref: id }) => id === slot).anchor_id
      = 'different-anchor';
    assert.throws(() => planTracePhase6SynchronizedCarry({
      state: value, contracts, inputDigest: `anchor:${slot}`
    }), { code: 'TRACE_PHASE_6_PARTICIPANT_NOT_COLOCATED' });
  }
});

test('Phase 6 replacement is distinct and remains bound across resume', () => {
  const duplicate = state();
  duplicate.sealed_selections[0].records[0].selected_id = 'eremey_fisher';
  assert.throws(() => planTracePhase6SynchronizedCarry({
    state: duplicate, contracts, inputDigest: 'duplicate-replacement'
  }), { code: 'TRACE_PHASE_6_PARTICIPANT_BINDING_CONFLICT' });

  const interrupted = state();
  interrupted.temporal_boundary_candidates.push(boundary('pause', 105));
  const partial = planTracePhase6SynchronizedCarry({
    state: interrupted, contracts, inputDigest: 'bound-participants'
  });
  const resumed = state();
  resumed.phase6_carry_execution = partial.execution_after;
  resumed.sealed_selections[0].records[0].selected_id =
    'background_fisher_1';
  assert.throws(() => planTracePhase6SynchronizedCarry({
    state: resumed, contracts, inputDigest: 'changed-selection'
  }), { code: 'TRACE_PHASE_6_PERSISTED_PARTICIPANT_BINDING_MISMATCH' });
});

test('Phase 6 admits only the exact Phase 5 terminal assembly state', () => {
  const mutations = [
    (item) => { item.state.use_state = 'carried_for_group_use'; },
    (item) => { item.condition_state = 'damaged'; },
    (item) => { item.placement.holder_npc_id = 'eremey_fisher'; },
    (item) => { item.ownership.controller_npc_id = 'eremey_fisher'; },
    (item) => { item.ownership.owner_npc_id = 'ratsha_storehouse_helper'; }
  ];
  for (const [index, mutate] of mutations.entries()) {
    const value = state();
    mutate(value.items.find(({ item_id: id }) => id === 'net'));
    assert.throws(() => planTracePhase6SynchronizedCarry({
      state: value, contracts, inputDigest: `resource:${index}`
    }), { code: 'TRACE_PHASE_6_ASSEMBLY_RESOURCE_STATE_INVALID' });
  }
  const replaced = state();
  replaced.items.find(({ item_id: id }) => id === 'poles').item_id
    = 'replacement-poles';
  assert.throws(() => planTracePhase6SynchronizedCarry({
    state: replaced, contracts, inputDigest: 'replaced-item-id'
  }), { code: 'TRACE_PHASE_6_ASSEMBLY_RESOURCE_STATE_INVALID' });
});

test('Phase 6 revalidates terminal assembly state after interruption', () => {
  const interrupted = state();
  interrupted.temporal_boundary_candidates.push(boundary('pause', 105));
  const partial = planTracePhase6SynchronizedCarry({
    state: interrupted, contracts, inputDigest: 'resource-pause'
  });
  const resumed = state();
  resumed.phase6_carry_execution = partial.execution_after;
  resumed.items.find(({ item_id: id }) => id === 'net').state.use_state
    = 'tampered_after_pause';
  assert.throws(() => planTracePhase6SynchronizedCarry({
    state: resumed, contracts, inputDigest: 'resource-resume'
  }), { code: 'TRACE_PHASE_6_ASSEMBLY_RESOURCE_STATE_INVALID' });
});
