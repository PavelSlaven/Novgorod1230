import assert from 'node:assert/strict';
import test from 'node:test';
import { correctOrdinaryDiscoveryScope } from
  '../src/runtime/lower-dvina-trace-turn-step-plan-corrections.js';

test('ordinary search uses the committed location instead of a scene position', () => {
  const plan = discovery('search');
  const corrected = correctOrdinaryDiscoveryScope({ plan, input: request() });
  assert.deepEqual(corrected.operations[0].target_refs, ['location:camp']);
  assert.deepEqual(plan.operations[0].target_refs, ['position:camp']);
});

test('spatial look keeps its exact semantic position target', () => {
  const plan = discovery('look');
  assert.equal(correctOrdinaryDiscoveryScope({ plan, input: request() }), plan);
});

function discovery(discovery_kind) {
  return { resolution: 'domain_request', operations: [{
    op: 'request_discovery', discovery_kind, actor_ref: 'actor:player',
    target_refs: ['position:camp'], query: 'осматриваю место'
  }] };
}

function request() {
  return { player_safe_state: {
    position: { position_id: 'position:camp', location_ref: 'location:camp' },
    spatial_semantic: { semantic_grounding_available: true,
      position_ref: 'position:camp' },
    ordinary_resolution: { discovery_available: true }
  } };
}
