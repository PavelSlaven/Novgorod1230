import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLowerDvinaTracePhase7Commit } from '../src/infrastructure/postgres/lower-dvina-trace-phase-7-commit.js';
import { createTracePhase7BodyEffect } from '../src/runtime/lower-dvina-trace-phase-7-effects.js';
import { approvedPhase7Contracts as approvedContracts, phase7AutonomousPlan as autonomousPlan, phase7ItemPlan as itemPlan } from './lower-dvina-trace-phase-7-contract-fixture.js';
import { phase7Command as commandFor, phase7CommittedState as committedState, phase7PlayerInput as playerInput } from './lower-dvina-trace-phase-7-runtime-fixture.js';

const digest = 'a'.repeat(64);
test('Phase 7 P16 persists the approved wait schedule history', async () => {
  const state = committedState();
  const contracts = approvedContracts(state);
  const consequence = await commandFor({
    state,
    contracts,
    model: async (request) => autonomousPlan(request, 'wait'),
  }).consequence({
    retrievedState: state,
    playerInput: playerInput(state, 'persist-wait'),
  });
  const timeUpdate = {
    clock_before: state.clock,
    clock_after: consequence.phase7.schedule_execution.clock_after,
    exact_elapsed: { exact_minutes: { numerator: '30', denominator: '1' } },
  };
  const bodyUpdate = createTracePhase7BodyEffect({
    contracts,
    fallback: {
      apply() {
        throw new Error('unexpected fallback');
      },
    },
  }).apply({ committed_state: state, consequence, time_update: timeUpdate });
  const committed = await buildLowerDvinaTracePhase7Commit({
    partyId: state.party_id,
    factual: factualTurn(state, consequence, timeUpdate, bodyUpdate),
    state,
    inputDigest: digest,
    visibleContext: visibleContext(),
    phase7Contracts: contracts,
  });
  const plan = committed.plan;
  const snapshot = rows(plan, 'party_state_snapshots')[0].record.state_payload;
  const zhdanko = snapshot.npcs.find(({ participant_slot_ref: slot }) => slot === 'zhdanko_storehouse_controller');
  const attempt = rows(plan, 'party_timed_activity_attempts')[0].record;
  assert.equal(rows(plan, 'party_npcs').length, 1);
  assert.equal(rows(plan, 'party_containers').length, 0);
  assert.equal(zhdanko.machine_state.status, 'waiting');
  assert.equal(zhdanko.machine_state.npc_schedule_history.length, 1);
  assert.equal(zhdanko.machine_state.last_schedule_execution.schedule_option_id, 'wait');
  assert.equal(attempt.trace.npc_schedule_result.schedule_option_id, 'wait');
  assert.deepEqual(attempt.trace.npc_schedule_result, snapshot.phase7_fire_rest.schedule_result);
});
test('Phase 7 P16 persists an item-owner concealment without movement', async () => {
  const state = committedState();
  const contracts = approvedContracts(state);
  const consequence = await commandFor({
    state,
    contracts,
    model: async (request) => itemPlan(request),
  }).consequence({
    retrievedState: state,
    playerInput: playerInput(state, 'persist-conceal'),
  });
  const timeUpdate = {
    clock_before: state.clock,
    clock_after: consequence.phase7.schedule_execution.clock_after,
    exact_elapsed: { exact_minutes: { numerator: '30', denominator: '1' } },
  };
  const bodyUpdate = createTracePhase7BodyEffect({
    contracts,
    fallback: {
      apply() {
        throw new Error('unexpected fallback');
      },
    },
  }).apply({ committed_state: state, consequence, time_update: timeUpdate });
  const committed = await buildLowerDvinaTracePhase7Commit({
    partyId: state.party_id,
    factual: factualTurn(state, consequence, timeUpdate, bodyUpdate),
    state,
    inputDigest: digest,
    visibleContext: visibleContext(),
    phase7Contracts: contracts,
  });
  const snapshot = rows(committed.plan, 'party_state_snapshots')[0].record.state_payload;
  assert.equal(snapshot.containers[0].state.visibility_state, 'concealed_requires_search');
  assert.equal(snapshot.containers[0].state.zone_ref, 'storehouse_inside');
  assert.equal(snapshot.npcs[1].machine_state.spatial_zone_ref, 'storehouse_inside');
});

function factualTurn(state, consequence, timeUpdate, bodyUpdate) {
  return {
    player_input: playerInput(state, 'persist'),
    mode_resolution: {
      option_id: 'rest_by_fire_and_dry_clothing',
      turn_id: consequence.phase7.autonomous.request.root_turn_id,
      decision_trace: {
        state_version: state.party_state.state_version,
        action_set_digest: 'action-set',
      },
    },
    consequence,
    time_update: timeUpdate,
    body_update: bodyUpdate,
  };
}
function visibleContext() {
  return {
    visible_scene: '\u0423 \u043A\u043E\u0441\u0442\u0440\u0430 \u043F\u0440\u043E\u0448\u043B\u043E \u043F\u043E\u043B\u0447\u0430\u0441\u0430.',
    visible_changes: ['elapsed_30_minutes'],
    sensory_details: ['\u041E\u0434\u0435\u0436\u0434\u0430 \u043D\u0435\u043C\u043D\u043E\u0433\u043E \u043F\u043E\u0434\u0441\u043E\u0445\u043B\u0430.'],
    visible_npc: [],
    visible_objects: [],
    known_context: ['\u041E\u0434\u0435\u0436\u0434\u0430 \u0432\u0441\u0451 \u0435\u0449\u0451 \u0441\u044B\u0440\u043E\u0432\u0430\u0442\u0430.'],
    uncertainties: [],
  };
}
function rows(plan, table) {
  return [...plan.inserts, ...plan.updates, ...plan.appends].filter(({ target_table: id }) => id === table);
}
function phase7ReadPool(plan, snapshot) {
  const one = (table) => rows(plan, table)[0]?.record;
  return {
    async query(sql) {
      let resultRows;
      if (sql.includes('party_timed_activity_executions')) {
        resultRows = [one('party_timed_activity_executions')];
      } else if (sql.includes('party_timed_activity_attempts')) {
        resultRows = [one('party_timed_activity_attempts')];
      } else if (sql.includes('party_npc_decision_traces')) {
        resultRows = [one('party_npc_decision_traces')];
      } else if (sql.includes('party_npcs')) {
        const persisted = one('party_npcs');
        const npc = snapshot.npcs.find(({ instance_id: id }) => id === persisted.npc_id);
        resultRows = [{ ...npc, ...persisted }];
      } else if (sql.includes('party_containers')) {
        const persisted = one('party_containers');
        const container = snapshot.containers.find(({ container_id: id }) => id === persisted.container_id);
        resultRows = [{ ...container, ...persisted }];
      } else if (sql.includes('party_actor_active_conditions')) {
        resultRows = snapshot.body_state.active_conditions
          .map((condition) => ({
            condition_id: condition.storage_condition_id,
            condition_profile_ref: condition.condition_profile_ref,
            status: condition.status,
            state_version: condition.state_version,
          }))
          .sort((left, right) => left.condition_id.localeCompare(right.condition_id));
      } else if (sql.includes('party_body_temporal_history')) {
        resultRows = [one('party_body_temporal_history')];
      } else {
        throw new Error(`Unexpected Phase 7 read query: ${sql}`);
      }
      return { rowCount: resultRows.length, rows: resultRows };
    },
  };
}
