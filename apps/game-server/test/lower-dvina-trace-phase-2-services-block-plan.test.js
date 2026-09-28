import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeededRandomSource } from '@rus/checks-rng';
import { fixture } from './lower-dvina-trace-phase-2-fixture.js';
import { loadLowerDvinaTraceMaterializationBundle } from
  '../src/internal/lower-dvina-trace-phase-1a.js';
import { loadLowerDvinaTracePhase2Bundle } from
  '../src/internal/lower-dvina-trace-phase-2-bundle.js';
import { resolveTracePhase2Contracts } from
  '../src/runtime/lower-dvina-trace-phase-2-contracts.js';
import { buildLowerDvinaTracePhase2Services } from
  '../src/runtime/lower-dvina-trace-phase-2-services.js';

const operation = { op: 'request_movement', actor_ref: 'actor', target_ref: 'edge:one',
  movement_kind: 'local', description: 'Проход 1 (проход занят)' };

async function turnStepBlockPlan(stateOverride = {}) {
  const scenarioBundle = await loadLowerDvinaTraceMaterializationBundle();
  const f = fixture({ scenarioBundle, materializationBundle: scenarioBundle });
  Object.assign(f.state, stateOverride);
  const phase2Bundle = await loadLowerDvinaTracePhase2Bundle({
    scenarioDefinitionRevision: f.state.scenario_definition_revision
      ?? scenarioBundle.scenario_definition?.revision
  });
  const contracts = resolveTracePhase2Contracts({
    state: f.state, bundle: scenarioBundle, phase2Bundle
  });
  const services = buildLowerDvinaTracePhase2Services({
    partyId: f.state.party_id, requestId: 'req:block-plan', idempotencyKey: 'idem:block-plan',
    inputDigest: 'd'.repeat(64), issuedAt: '2026-09-28T00:00:00.000Z',
    scenarioId: f.state.scenario_id, state: f.state, contracts, registry: {},
    repository: { async commitPhase2Turn() { return { ok: true }; },
      async loadPhase2State() { return f.state; } },
    semanticResolver: async () => ({}), turnStepModel: null,
    locationProfiles: scenarioBundle.location_topology_set.location_profiles,
    scenePresentation: scenarioBundle.scene_presentation ?? null,
    randomSource: createSeededRandomSource('block-plan'),
    narrator: { async run() { return { status: 'approved', pass: true }; } },
    decisionSecret: 's'
  });
  return services.turnStepBlockPlan;
}

function requestWithGrounding(grounding) {
  return { step_index: 1, player_safe_state: { available_domain_operation_grounding: grounding } };
}

test('destination_occupied is accepted when the referenced option is marked occupied in the snapshot',
  async () => {
    const blockPlan = await turnStepBlockPlan();
    const plan = { resolution: 'domain_request', reason_code: 'destination_occupied',
      operations: [operation] };
    const request = requestWithGrounding([{ operation,
      semantic_scope: { destination_status: 'occupied' } }]);
    assert.equal(blockPlan({ plan, request }), true);
  });

test('destination_occupied is rejected when the referenced option is actually open',
  async () => {
    const blockPlan = await turnStepBlockPlan();
    const plan = { resolution: 'domain_request', reason_code: 'destination_occupied',
      operations: [operation] };
    const request = requestWithGrounding([{ operation,
      semantic_scope: { destination_status: 'open' } }]);
    assert.equal(blockPlan({ plan, request }), false);
  });

test('destination_occupied is rejected when the snapshot has no matching grounding at all',
  async () => {
    const blockPlan = await turnStepBlockPlan();
    const plan = { resolution: 'domain_request', reason_code: 'destination_occupied',
      operations: [operation] };
    assert.equal(blockPlan({ plan, request: requestWithGrounding([]) }), false);
    assert.equal(blockPlan({ plan, request: { step_index: 1 } }), false);
  });

test('destination_occupied is rejected for a different operation than the grounded occupied one',
  async () => {
    const blockPlan = await turnStepBlockPlan();
    const plan = { resolution: 'domain_request', reason_code: 'destination_occupied',
      operations: [{ ...operation, target_ref: 'edge:two' }] };
    const request = requestWithGrounding([{ operation,
      semantic_scope: { destination_status: 'occupied' } }]);
    assert.equal(blockPlan({ plan, request }), false);
  });

test('the model reason_code never decides: an occupied grounded operation is blocked under any reason_code (F5)',
  async () => {
    const blockPlan = await turnStepBlockPlan();
    const request = requestWithGrounding([{ operation,
      semantic_scope: { destination_status: 'occupied' } }]);
    for (const reason_code of ['visible_movement', 'destination_occupied', undefined, 'anything']) {
      const plan = { resolution: 'domain_request', reason_code, operations: [operation] };
      assert.equal(blockPlan({ plan, request }), true, String(reason_code));
    }
  });

test('an open grounded operation is never blocked, even when the model says destination_occupied (F5)',
  async () => {
    const blockPlan = await turnStepBlockPlan();
    const plan = { resolution: 'domain_request', reason_code: 'destination_occupied',
      operations: [operation] };
    const request = requestWithGrounding([{ operation,
      semantic_scope: { destination_status: 'open' } }]);
    assert.equal(blockPlan({ plan, request }), false);
  });

test('an occupied grounded operation is blocked when it is one of several planned operations (F5)',
  async () => {
    const blockPlan = await turnStepBlockPlan();
    const other = { ...operation, target_ref: 'edge:two' };
    const plan = { resolution: 'domain_request', operations: [other, operation] };
    const request = requestWithGrounding([{ operation,
      semantic_scope: { destination_status: 'occupied' } }]);
    assert.equal(blockPlan({ plan, request }), true);
  });

test('a structurally blocked actor gets the refusal for a not_achieved direct plan under any reason_code (F5)',
  async () => {
    const blockedState = { combat_sessions: [{ status: 'active', participant_states: [{
      actor_ref: { entity_kind: 'player_character', entity_id: 'actor:blocked' },
      combat_status: 'restrained' }] }], actor_id: 'actor:blocked' };
    const blockPlan = await turnStepBlockPlan(blockedState);
    const plan = { resolution: 'direct', goal_result: 'not_achieved', operations: [] };
    for (const reason_code of ['actor_movement_blocked', 'model_wording', undefined]) {
      assert.equal(blockPlan({ plan: { ...plan, reason_code }, request: { step_index: 1 } }), true,
        String(reason_code));
    }
    assert.equal(blockPlan({ plan: { ...plan, goal_result: 'achieved' }, request: { step_index: 1 } }), false);
    const free = await turnStepBlockPlan();
    assert.equal(free({ plan, request: { step_index: 1 } }), false, 'movement is not blocked');
  });
