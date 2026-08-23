import assert from 'node:assert/strict';
import test from 'node:test';
import { projectLowerDvinaTraceS1Capability } from
  '../src/runtime/releases/lower-dvina-trace-s1-production.js';
import { createLowerDvinaTraceS1ProductionResolverFactory } from
  '../src/runtime/releases/lower-dvina-trace-s1-production.js';

test('exhausted S1 envelope exposes no resolver marker or model path', async () => {
  let reads = 0; let modelCalls = 0;
  const playerSafeState = projectLowerDvinaTraceS1Capability({
    playerSafeState: { visible_objects: [] }, resolverAvailable: true,
    committedState: { position: { position_id: 'position:s1' },
      spatial_semantic: [{ status: 'committed', envelope_ref: 'envelope:s1',
        capacity_total: 1, consumed_count: 1,
        envelope: { position_ref: 'position:s1' }, resolutions: [] }] }
  });
  assert.equal(playerSafeState.spatial_semantic, undefined);
  const request = s1Request();
  request.request.player_safe_state = playerSafeState;
  const resolver = createLowerDvinaTraceS1ProductionResolverFactory({
    pool: { query: async () => { reads += 1; return { rowCount: 0, rows: [] }; } },
    spatialSemanticModel: async () => { modelCalls += 1; }
  })({ partyId: 'party:s1' });
  await assert.rejects(() => resolver(request), { code: 'TRACE_S1_SCOPE_INVALID' });
  assert.equal(reads, 1, 'replay lookup remains read-only');
  assert.equal(modelCalls, 0);
});

test('S1 local movement reuses committed visible detail without model', async () => {
  let modelCalls = 0;
  const committed = { request_id: 'request:s1', local_ref: 's1-local:request:s1',
    envelope_ref: 'envelope:s1', position_ref: 'position:s1', root_turn_id: 'turn:s1',
    step_index: 1, semantics: { kind: 'ordinary_structure', name: 'Загородка',
      description: 'Плетёная загородка.', semantic_requirements: ['interior_space'] },
    formal_spatial_refs: { schema: 'rus.s1_formal_spatial_refs.v1',
      status: 'materialized', structural_variant: 'open_one_space',
      local_ref: 's1-local:request:s1', placement_ref: 'ordinary_structure:s1-local:request:s1',
      g6_instance_ref: 'g6:inside', position_ref: 'position:inside', portal_ref: null,
      movement_edge_refs: ['edge:out', 'edge:into'],
      visibility_link_refs: ['visible:into', 'visible:out'] } };
  const resolver = localMovementResolver({ committed, model: () => { modelCalls += 1; },
    edge: { rowCount: 1, rows: [{ id: 'edge:into' }] } });
  const request = s1Request({ requestId: 'request:move', operation: {
    op: 'request_movement', actor_ref: 'actor:s1', movement_kind: 'local',
    target_ref: committed.local_ref } });
  request.request.player_safe_state.visible_objects = [{ entity_ref: {
    entity_kind: 'spatial_local_reference', entity_id: committed.local_ref },
  display_label: 'Загородка', recognition: 'recognized', visible_status: 'замечен' }];
  const planned = await resolver(request);
  assert.equal(modelCalls, 0);
  assert.deepEqual(planned.consequence_fragment.position_transition, {
    owner: '@rus/movement-routes', actor_id: 'actor:s1', local_ref: committed.local_ref,
    from_position_ref: 'position:s1', to_position_ref: 'position:inside',
    movement_edge_ref: 'edge:into' });
  const reverse = s1Request({ requestId: 'request:exit', position: 'position:inside', operation: {
    op: 'request_movement', actor_ref: 'actor:s1', movement_kind: 'local',
    target_ref: committed.local_ref } });
  reverse.request.player_safe_state.visible_objects = structuredClone(
    request.request.player_safe_state.visible_objects);
  const exited = await localMovementResolver({ committed,
    edge: { rowCount: 1, rows: [{ id: 'edge:out' }] } })(reverse);
  assert.deepEqual(exited.consequence_fragment.position_transition, {
    owner: '@rus/movement-routes', actor_id: 'actor:s1', local_ref: committed.local_ref,
    from_position_ref: 'position:inside', to_position_ref: 'position:s1',
    movement_edge_ref: 'edge:out' });
  for (const edge of [{ rowCount: 0, rows: [] }, { rowCount: 2,
    rows: [{ id: 'edge:into' }, { id: 'edge:out' }] }, { rowCount: 1,
    rows: [{ id: 'edge:forged' }] }]) {
    await assert.rejects(() => localMovementResolver({ committed, edge })(request),
      { code: 'S1_SPATIAL_MOVEMENT_EDGE_INVALID' });
  }
  await assert.rejects(() => localMovementResolver({ committed,
    edge: { rowCount: 0, rows: [] } })(reverse),
  { code: 'S1_SPATIAL_MOVEMENT_EDGE_INVALID' });
  const foreign = structuredClone(request);
  foreign.committed_state.position.position_id = 'position:foreign';
  await assert.rejects(() => resolver(foreign), { code: 'TRACE_S1_SCOPE_INVALID' });
  const invisible = structuredClone(request);
  invisible.request.player_safe_state.visible_objects = [];
  await assert.rejects(() => resolver(invisible), { code: 'TRACE_S1_SCOPE_INVALID' });
});

function localMovementResolver({ committed, edge, model = () => {} }) {
  return createLowerDvinaTraceS1ProductionResolverFactory({ pool: { query: async (sql) =>
    sql.includes('scene_movement_edges') ? edge : { rowCount: 1, rows: [committed] }
  }, spatialSemanticModel: async () => model() })({ partyId: 'party:s1' });
}
function s1Request({ target = 'position:s1', position = 'position:s1', requestId = 'request:s1',
  discoveryKind = 'look', operation = undefined } = {}) {
  return { schema: 'turn_step_spatial_semantic_remainder_request_v1',
    operation: operation ?? { op: 'request_discovery', discovery_kind: discoveryKind,
      actor_ref: 'actor:s1', target_refs: [target] }, request: {
      request_id: requestId, root_turn_id: 'turn:s1', step_index: 1,
      committed_state_version: 4, player_safe_state: {
        spatial_semantic: { semantic_grounding_available: true,
          position_ref: 'position:s1' }, visible_objects: [] } },
    actor: { actor_id: 'actor:s1' }, working_projection: {},
    committed_state: { party_state: { turn_number: 4 },
      position: { position_id: position } } };
}
