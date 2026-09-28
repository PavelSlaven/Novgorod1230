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

async function turnStepBlockPlan() {
  const scenarioBundle = await loadLowerDvinaTraceMaterializationBundle();
  const f = fixture({ scenarioBundle, materializationBundle: scenarioBundle });
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

test('a genuinely occupied edge selected without the destination_occupied reason falls through to consequence()',
  async () => {
    // Race: the model picked it as an ordinary movement (reason_code unrelated); blockPlan
    // must not intercept - the existing 409 SPATIAL_V3_LOCAL_EDGE_OCCUPIED stays the safety net
    // (covered end-to-end in spatial-v3-local-scene-movement.test.js).
    const blockPlan = await turnStepBlockPlan();
    const plan = { resolution: 'domain_request', reason_code: 'visible_movement',
      operations: [operation] };
    const request = requestWithGrounding([{ operation,
      semantic_scope: { destination_status: 'occupied' } }]);
    assert.equal(blockPlan({ plan, request }), false);
  });
