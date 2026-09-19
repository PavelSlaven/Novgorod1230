import assert from 'node:assert/strict';
import test from 'node:test';
import { correctOrdinaryDiscoveryScope,
  correctVisibleNpcStatusObservation } from
  '../src/runtime/lower-dvina-trace-turn-step-plan-corrections.js';
import { projectLowerDvinaTraceTurnStepPlannerState } from
  '../src/runtime/lower-dvina-trace-phase-2-player-safe.js';
import { exactBackgroundNpcDiscoveryGrounding } from
  '../src/runtime/lower-dvina-trace-turn-step-grounding-audit.js';

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

test('eligible background NPC inspection reaches N1 instead of status correction', async () => {
  let calls = 0;
  const plan = { resolution: 'domain_request', operations: [{
    op: 'request_discovery', discovery_kind: 'inspect', actor_ref: 'actor:player',
    target_refs: ['npc:background'], query: 'осматриваю внешность'
  }] };
  const input = { remaining_intent: 'осматриваю внешность',
    player_safe_state: { background_npc_remainder: {
      eligible_npc_refs: ['npc:background'] }, current_visible_context: {
      visible_npc: [{ entity_ref: { entity_kind: 'npc',
        entity_id: 'npc:background' }, visible_status: 'работает' }]
    } } };
  assert.equal(await correctVisibleNpcStatusObservation({ plan, input,
    roleRunner: { run() { calls += 1; } } }), plan);
  assert.equal(calls, 0);
});

test('visible S1 local ref exposes one code-owned bidirectional movement operation', () => {
  const state = projectLowerDvinaTraceTurnStepPlannerState({
    actor_id: 'actor:player', visible_objects: [{
      entity_ref: { entity_kind: 'spatial_local_reference',
        entity_id: 'local:shelter' }, visible_status: 'внутри'
    }], current_visible_context: { visible_objects: [] }
  });
  assert.deepEqual(state.available_domain_operations, [{
    op: 'request_movement', actor_ref: 'actor:player',
    target_ref: 'local:shelter', movement_kind: 'local'
  }]);
});

test('exact eligible background inspection is code-grounded before model audit', () => {
  const operation = { op: 'request_discovery', discovery_kind: 'inspect',
    actor_ref: 'actor:player', target_refs: ['npc:background'],
    query: 'осматриваю внешность рыбака' };
  const request = { remaining_intent: operation.query, player_safe_state: {
    background_npc_remainder: { eligible_npc_refs: ['npc:background'] },
    current_visible_context: { visible_npc: [{ entity_ref: {
      entity_kind: 'npc', entity_id: 'npc:background' } }] }
  } };
  assert.equal(exactBackgroundNpcDiscoveryGrounding({ operation, request,
    plan: { interpretation: { grounded_attempt: operation.query,
      adaptation: 'literal' }, continuation: null, clarification: null,
    direct_result_kind: null } }), true);
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
