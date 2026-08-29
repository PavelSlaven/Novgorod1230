import assert from 'node:assert/strict';
import test from 'node:test';
import {
  prepareLowerDvinaTraceTurnStepPersistence
} from '../src/infrastructure/postgres/lower-dvina-trace-turn-step-persistence.js';
import {
  buildLowerDvinaTraceTurnStepRootWrites,
  turnStepTransitionedConditionIds
} from '../src/infrastructure/postgres/lower-dvina-trace-turn-step-state.js';
import { commitPhase2BodyState } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-state.js';
import { turnStepCurrentVersion } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-commit-plan.js';
import {
  baseState,
  canonicalEnvelope,
  conditionState,
  factual,
  rootWrites
} from './lower-dvina-trace-turn-step-persistence-fixture.js';

test('turn-step ignores stale condition outcomes without current transitions', () => {
  const state = conditionState();
  const proposal = { condition_transitions: [], component_proposals: [{
    condition_transitions: []
  }] };
  const snapshot = commitPhase2BodyState({
    before: state.body_state,
    proposed: structuredClone(state.body_state),
    transitionedConditionIds: turnStepTransitionedConditionIds(
      state.body_state, proposal)
  });
  const writes = rootWrites(state, snapshot, proposal);
  assert.equal(snapshot.active_conditions[0].state_version, 4);
  assert.equal(writes.updates.some(({ target_table: table }) =>
    table === 'party_actor_active_conditions'), false);
});

test('turn-step writes and versions only conditions transitioned now', () => {
  const state = conditionState();
  const proposal = {
    condition_transitions: [{ from: 'bruise', to: 'treated',
      outcome: 'treated' }],
    component_proposals: [{ condition_transitions: [{
      from: 'treated', to: 'healed', outcome: 'healed'
    }] }]
  };
  const proposed = structuredClone(state.body_state);
  proposed.active_conditions[0].id = 'healed';
  const snapshot = commitPhase2BodyState({
    before: state.body_state,
    proposed,
    transitionedConditionIds: turnStepTransitionedConditionIds(
      state.body_state, proposal)
  });
  const writes = rootWrites(state, snapshot, proposal);
  const conditions = writes.updates.filter(({ target_table: table }) =>
    table === 'party_actor_active_conditions');
  assert.equal(snapshot.active_conditions[0].state_version, 5);
  assert.deepEqual(conditions, [{
    target_table: 'party_actor_active_conditions',
    id: 'player_character:actor-1:condition-storage-1',
    record: {
      party_id: 'p', actor_kind: 'player_character', actor_id: 'actor-1',
      condition_id: 'condition-storage-1', condition_profile_ref: { id: 'bruise' },
      status: 'active', terminal_change_set_id: null
    }
  }]);
  assert.equal(turnStepCurrentVersion(state, conditions[0]), 4);
});

test('domain-only rev13 persistence keeps the exact envelope while rev12 stays unchanged',
  () => {
    const state = baseState();
    const domainFactual = factual({ elapsed: 0 });
    domainFactual.body_update.state_after = structuredClone(state.body_state);
    const envelope = canonicalEnvelope(domainFactual);
    envelope.mode_resolution.decision_trace.selected_option_id =
      'registered-domain-option';
    const rev13 = prepareLowerDvinaTraceTurnStepPersistence({
      partyId: 'p', state, snapshot: structuredClone(state),
      factual: domainFactual, changeSetId: 'change-1', idemId: 'idem-1',
      writePlan: {
        turn_id: 'turn:p:1', base_state_version: 3,
        command_trace: structuredClone(envelope.mode_resolution.decision_trace),
        write_targets: [], turn_step_commit: envelope
      }
    });
    assert.deepEqual(rev13.snapshot.last_turn.turn_step_commit, envelope);
    assert.equal(rev13.snapshot.last_turn.turn_step_idempotency_record_id,
      'idem-1');

    const rev12 = prepareLowerDvinaTraceTurnStepPersistence({
      partyId: 'p', state, snapshot: structuredClone(state),
      factual: factual(), changeSetId: 'change-1', idemId: 'idem-1',
      writePlan: {
        turn_id: 'turn:p:1', base_state_version: 3,
        command_trace: { decision_protocol: 'code_exact_fast_path_v1' },
        write_targets: []
      }
    });
    assert.deepEqual(rev12.snapshot, state);
  });

test('delegated domain no-batch accepts exact nonzero clock and body arithmetic',
  () => {
    const state = baseState();
    const domainFactual = factual({ elapsed: 8 });
    domainFactual.body_update = {
      owner: '@rus/body-state', applied: true,
      proposal: { exact_deltas: { health: 0, satiety: -1, energy: -2 } },
      state_after: { ...structuredClone(state.body_state),
        satiety: 89, energy: 78 }
    };
    const envelope = canonicalEnvelope(domainFactual);
    const result = prepareLowerDvinaTraceTurnStepPersistence({
      partyId: 'p', state, snapshot: structuredClone(state),
      factual: domainFactual, changeSetId: 'change-1', idemId: 'idem-1',
      writePlan: {
        turn_id: 'turn:p:1', base_state_version: 3,
        command_trace: structuredClone(envelope.mode_resolution.decision_trace),
        write_targets: [{ target: 'party_state', value: domainFactual }],
        turn_step_commit: envelope
      }
    });

    assert.deepEqual(result.snapshot.last_turn.turn_step_commit, envelope);
    assert.deepEqual(result.writes,
      { inserts: [], updates: [], appends: [], deletes: [] });
  });

test('delegated domain no-batch rejects factual envelope divergence', () => {
  const state = baseState();
  const domainFactual = factual({ elapsed: 0 });
  domainFactual.body_update.state_after = structuredClone(state.body_state);
  const cases = [
    ['consequence', (envelope) => {
      envelope.consequence.state_changes = [{ kind: 'forged_change' }];
    }],
    ['hidden update', (envelope) => {
      envelope.hidden_update = { forged_hidden_state: true };
    }]
  ];
  for (const [name, tamper] of cases) {
    const envelope = canonicalEnvelope(domainFactual);
    envelope.mode_resolution.decision_trace.selected_option_id =
      'registered-domain-option';
    tamper(envelope);
    assert.throws(() => prepareLowerDvinaTraceTurnStepPersistence({
      partyId: 'p', state, snapshot: structuredClone(state),
      factual: domainFactual, changeSetId: 'change-1', idemId: 'idem-1',
      writePlan: {
        turn_id: 'turn:p:1', base_state_version: 3,
        command_trace: structuredClone(envelope.mode_resolution.decision_trace),
        write_targets: [{ target: 'party_state', value: domainFactual }],
        turn_step_commit: envelope
      }
    }), { code: 'TRACE_TURN_STEP_DIRECT_COMMIT_CONTRACT_GAP' }, name);
  }
});
