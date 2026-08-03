import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTurnStepPreparedBodyUpdate,
  buildTurnStepPreparedEffectLedger,
  buildTurnStepPreparedTimeUpdate
} from '@rus/turn';
import { prepareTurnStepBodyHistory } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-body-history.js';
import { assertTurnStepBodyHistoryRows } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-body-read.js';

test('M1 body temporal write round-trips exact owner and causal bindings',
  async () => {
    const factual = bodyCommit();
    const prepared = prepareTurnStepBodyHistory({
      partyId: 'p', state: state(), factual,
      batch: { root_turn_id: 'turn:p:1' },
      changeSetId: 'change-1', idemId: 'idem-1'
    });
    const payload = restartPayload(prepared.snapshot, factual);
    await assert.doesNotReject(() => assertTurnStepBodyHistoryRows(
      pool([structuredClone(prepared.snapshot)]), payload, bodyRow()
    ));
    for (const tamper of [
      (row) => { row.effect_ref.component_effects[0].profile_ref = 'forged'; },
      (row) => { row.change_set_id = 'change-forged'; },
      (row) => { row.idempotency_record_id = 'idem-forged'; },
      (row) => { row.occurred_at_whole_minutes = '21'; },
      (row) => { row.subject_id = 'actor-forged'; }
    ]) {
      const row = structuredClone(prepared.snapshot);
      tamper(row);
      await assert.rejects(() => assertTurnStepBodyHistoryRows(
        pool([row]), payload, bodyRow()
      ), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
    }
  });

test('M1 body restart cross-binds envelope, snapshot and normalized row',
  async () => {
    const factual = bodyCommit();
    const prepared = prepareTurnStepBodyHistory({
      partyId: 'p', state: state(), factual,
      batch: { root_turn_id: 'turn:p:1' },
      changeSetId: 'change-1', idemId: 'idem-1'
    });
    const expected = restartPayload(prepared.snapshot, factual);
    const normalized = bodyRow();
    await assert.rejects(() => assertTurnStepBodyHistoryRows(
      pool([]), { ...expected, turn_step_body_history: [] }, normalized
    ), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
    const forgedSnapshot = structuredClone(expected);
    forgedSnapshot.body_state.health = 77;
    await assert.rejects(() => assertTurnStepBodyHistoryRows(
      pool([structuredClone(prepared.snapshot)]), forgedSnapshot, normalized
    ), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
    const forgedRow = { ...normalized, body_health: '77' };
    await assert.rejects(() => assertTurnStepBodyHistoryRows(
      pool([structuredClone(prepared.snapshot)]), expected, forgedRow
    ), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
    const forgedProfile = structuredClone(expected);
    forgedProfile.last_turn.turn_step_commit.body_update.proposal.profile_ref =
      'body:forged';
    await assert.rejects(() => assertTurnStepBodyHistoryRows(
      pool([structuredClone(prepared.snapshot)]), forgedProfile, normalized
    ), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  });

test('M1 body restart accepts prepared effects owned by the domain writer',
  async () => {
    const factual = preparedBodyCommit();
    const payload = restartPayload(null, factual);
    payload.turn_step_body_history = [];
    await assert.doesNotReject(() => assertTurnStepBodyHistoryRows(
      pool([]), payload, bodyRow()
    ));

    const tampered = structuredClone(payload);
    tampered.last_turn.turn_step_commit.body_update
      .prepared_effect_ledger_digest = 'b'.repeat(64);
    await assert.rejects(() => assertTurnStepBodyHistoryRows(
      pool([]), tampered, bodyRow()
    ), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });

    const missingLedger = structuredClone(payload);
    delete missingLedger.last_turn.turn_step_commit.time_update
      .prepared_effect_ledger;
    await assert.rejects(() => assertTurnStepBodyHistoryRows(
      pool([]), missingLedger, bodyRow()
    ), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  });

function preparedBodyCommit() {
  const before = { health: 100, satiety: 90, energy: 80 };
  const after = { health: 99, satiety: 90, energy: 80 };
  const clockBefore = { whole_minutes: '19',
    subminute_numerator: '0', subminute_denominator: '1' };
  const clockAfter = { whole_minutes: '20',
    subminute_numerator: '0', subminute_denominator: '1' };
  const ledger = buildTurnStepPreparedEffectLedger({
    rootTurnId: 'turn:p:1',
    committedStateVersion: 1,
    effects: [{
      effect: {
        step_index: 1,
        effect_kind: 'domain_command',
        owner_ref: 'test.domain-owner',
        operation_ref: 'test.operation',
        availability: {},
        consequence: { duration_minutes: 1 },
        time_update: {
          schema: 'turn_time_update',
          clock_before: clockBefore,
          clock_after: clockAfter,
          exact_elapsed: { exact_minutes: {
            numerator: '1', denominator: '1'
          } }
        },
        body_update: {
          schema: 'turn_body_update',
          applied: true,
          proposal: { profile_ref: 'test.body-effect' },
          state_after: after
        },
        body_state_before: before
      },
      working_projection_before: { clock: clockBefore },
      working_projection_after: { clock: clockAfter }
    }]
  });
  return {
    root_turn_id: 'turn:p:1',
    base_state_version: 1,
    consequence: {
      duration_minutes: 1,
      prepared_effect_ledger_digest: ledger.ledger_digest
    },
    body_update: buildTurnStepPreparedBodyUpdate(ledger),
    time_update: buildTurnStepPreparedTimeUpdate(ledger)
  };
}

function bodyCommit() {
  const profilePin = pin();
  const stateAfter = { health: 99, satiety: 90, energy: 80 };
  const component = {
    schema: 'rus.body_state.fixed_approved_effect_proposal.v1',
    profile_ref: 'body:impact:minor', profile_pin: profilePin,
    selected_context: { kind: 'direct_body_event', mechanism: 'impact',
      severity: 'minor', body_part_ref: 'left_arm' },
    exact_deltas: { health: -1, satiety: 0, energy: 0 },
    condition_transitions: [], state_after: stateAfter,
    selection_policy: 'fixed_approved_effect', rng_consumption: 'forbidden'
  };
  return {
    root_turn_id: 'turn:p:1',
    consequence: { body_effect_ref: 'body:composite', state_changes: [{
      kind: 'direct_body_event', operation_id: 'body-op',
      body_effect_profile_ref: component.profile_ref,
      profile_pin: profilePin,
      body_effect_context: component.selected_context
    }] },
    body_update: { applied: true, proposal: {
      schema: 'rus.body_state.composite_fixed_effect_proposal.v1',
      profile_ref: 'body:composite', profile_pin: profilePin,
      component_proposals: [component],
      exact_deltas: component.exact_deltas,
      selection_policy: 'ordered_committed_step_components',
      rng_consumption: 'forbidden'
    }, state_after: stateAfter },
    time_update: { clock_after: { whole_minutes: '20',
      subminute_numerator: '0', subminute_denominator: '1' } }
  };
}

function restartPayload(history, envelope) {
  return { party_id: 'p', actor_id: 'actor-1',
    party_state: { body_state_version: 2 },
    body_state: structuredClone(envelope.body_update.state_after),
    turn_step_body_history: [history],
    last_turn: {
      turn_step_commit: envelope,
      turn_step_idempotency_record_id: 'idem-1',
      visible_package: { change_set_id: 'change-1' }
    } };
}

function bodyRow() {
  return { body_state_version: '2', body_health: '99', body_energy: '80',
    body_satiety: '90', body_updated_change_set_id: 'change-1' };
}

function state() {
  return { actor_id: 'actor-1', party_state: { turn_number: 3 } };
}

function pin() {
  return { artifact_id: 'owner-profiles', revision: 1,
    digest: '1'.repeat(64) };
}

function pool(rows) {
  return { async query() { return { rows, rowCount: rows.length }; } };
}
