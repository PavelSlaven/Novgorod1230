import assert from 'node:assert/strict';
import test from 'node:test';
import { createSpatialV3ExpansionContextReader } from
  '../src/infrastructure/postgres/spatial-v3-expansion-context.js';
import { createSpatialV3ExpansionRuntime } from '../src/runtime/spatial-v3-expansion-runtime.js';
import { createSpatialV3LocalSceneRuntime } from '../src/runtime/spatial-v3-local-scene-runtime.js';
import { createTraceExpansionCommands } from '../src/runtime/lower-dvina-trace-expansion-commands.js';

// D102 test input: SQL rows and approved/disclosed facts only. The production
// context reader, repository, selection runtime and command/local owners are real.
function productionFixture({ origin = 'canonical', reverse = false, localPath = false,
  arrivalApproach = false } = {}) {
  const identity = { partyId: 'party', actorId: 'actor' };
  const release = { world_revision_id: 'revision', world_catalog_digest: 'catalog' };
  const g4 = { id: 'g4', version: 4, world_revision_id: release.world_revision_id };
  const arrival = { id: 'arrival-position', g6_instance_id: 'g6',
    template_slot_key: 'arrival', template_instance_ordinal: 0 };
  const departure = { id: 'departure-position', g6_instance_id: 'g6',
    template_slot_key: 'departure', template_instance_ordinal: 0 };
  const focus = { id: 'focus-position', g6_instance_id: 'g6',
    template_slot_key: 'focus', template_instance_ordinal: 0 };
  const source = arrivalApproach ? focus : arrival;
  const positions = arrivalApproach ? [focus, arrival, departure] : [arrival, departure];
  const site = { id: 'site', parent_g4_id: g4.id, origin,
    canonical_g5_ref: origin === 'canonical' ? { entity_id: 'g5a', authoring_version: '1' } : null };
  const state = { party_id: identity.partyId, actor_id: identity.actorId,
    party_state: { state_version: 4 }, position: { position_id: source.id, g5_anchor_id: site.id },
    journey_location: { id: 'journey', scene_position_id: source.id, state_version: 1 } };
  const current = { ...release, location: state.journey_location, position: source, site,
    baseline: { id: 'baseline', scene_template_ref: { entity_id: 'scene', authoring_version: '1' } } };
  const scene = { endpoint_slots: [
    { slot_key: 'in', endpoint_role: 'arrival', required_position_slot_key: 'arrival',
      required_position_instance_ordinal: 0 },
    { slot_key: 'out', endpoint_role: 'departure', required_position_slot_key: 'departure',
      required_position_instance_ordinal: 0 }] };
  const edges = arrivalApproach ? [{ id: 'local-edge', from_position_id: focus.id,
    to_position_id: arrival.id, status: 'active' }] : localPath ? [{ id: 'local-edge',
    from_position_id: arrival.id, to_position_id: departure.id, status: 'active' }] : [];
  const binding = { id: reverse ? 'binding-reverse' : 'binding-forward', version: 3,
    status: 'approved', parent_g4_id: g4.id, parent_g4_version: g4.version,
    from_canonical_g5_id: 'g5a', from_canonical_g5_version: 1,
    to_canonical_g5_id: 'g5b', to_canonical_g5_version: 1,
    from_scene_endpoint_slot_key: reverse ? 'in' : 'out',
    to_scene_endpoint_slot_key: reverse ? 'out' : 'in',
    line_name: 'бродом', line_discriminator: null, base_minutes: 12 };
  const profile = { id: 'line-profile', version: 1, status: 'approved',
    profile_scope: 'site_connection', cost_kind: 'time', action_units: null, base_minutes: 12 };
  const exit = { id: 'exit-local', version: 1, direction_context_id: 'direction',
    g4_id: g4.id, g4_version: g4.version, status: 'approved' };
  const closure = { slots: [{ id: 'frontier-slot', version: 1,
    directional_exit_id: exit.id, directional_exit_version: exit.version }], directional_exits: [exit] };
  const snapshot = { ledgers: [], sites: [site], reservations: [], scene_baselines: [],
    g6_instances: [], scene_positions: positions, portals: [], movement_edges: edges,
    visibility_modifiers: [], visibility_links: [], acoustic_profiles: [], acoustic_edges: [],
    placements: [], journey_locations: [state.journey_location],
    chains: [{ id: 'chain', terminal_ordinal: 0 }],
    frontiers: [{ id: 'frontier', source_g5_site_id: site.id,
      slot_ref: { entity_id: 'frontier-slot', authoring_version: '1' }, continuation_ordinal: 0,
      continuation_chain_id: 'chain', status: 'consumed', resolved_site_connection_id: 'frontier-connection' }],
    bindings: [{ frontier_id: 'frontier', position_id: departure.id, status: 'inactive' }],
    site_connections: [{ id: 'frontier-connection', from_site_id: site.id, status: 'active' }],
    endpoint_bindings: [{ site_connection_id: 'frontier-connection', endpoint_role: 'from',
      position_id: departure.id, status: 'active' }] };
  const localRows = edges.map((edge) => ({ journey_location_id: state.journey_location.id,
    journey_state_version: 1, scene_baseline_id: current.baseline.id, site_id: site.id,
    edge_id: edge.id, reverse_edge_id: 'local-edge-reverse', from_position_ref: edge.from_position_id,
    to_position_ref: edge.to_position_id, destination_slot_key: arrivalApproach ? 'arrival' : 'departure',
    cost_kind: 'action',
    action_units: 1, base_minutes: null, edge_capacity: 1, edge_state_version: 1,
    reverse_edge_state_version: 1, source_node_state_version: 1, destination_node_state_version: 1,
    destination_capacity: 2, destination_occupancy: 0 }));
  const reads = [];
  const writes = [];
  const query = async (sql, args) => {
    if (/^(BEGIN|COMMIT|ROLLBACK)\b/u.test(sql)) return { rows: [] };
    assert.match(sql, /^(SELECT|WITH)\b/u, 'operation discovery only reads committed state');
    if (sql.startsWith('SELECT party.world_revision_id')) return { rows: [structuredClone(current)] };
    if (sql.includes('AS positions') && sql.includes('AS movement_edges')) {
      return { rows: [{ positions, movement_edges: edges }] };
    }
    if (sql.startsWith('WITH sites AS')) return { rows: [structuredClone(snapshot)] };
    if (sql.startsWith('SELECT l.id AS journey_location_id')) {
      assert.deepEqual(args.slice(0, 2), [identity.partyId, identity.actorId]);
      return { rows: structuredClone(localRows.filter((row) => row.from_position_ref === args[2])) };
    }
    assert.fail('unexpected SQL in production reader fixture');
  };
  const worldBaseReader = {
    readPinnedSceneTemplateClosure: async () => ({ ok: true, value: scene }),
    readG4ExpansionBinding: async () => ({ ok: true, value: { g4, profile: { id: 'expansion-profile', version: 1 } } }),
    readPinnedG4ExpansionClosure: async () => ({ ok: true, value: closure }),
    readApprovedCanonicalG5Connections: async (input) => {
      reads.push('canonical');
      assert.deepEqual(input, { g4, canonical_g5: { id: 'g5a', version: 1 } });
      return { ok: true, value: [{ binding, profile }], gaps: [] };
    }
  };
  const runtime = createSpatialV3ExpansionRuntime({
    readContext: createSpatialV3ExpansionContextReader({ release, worldBaseReader,
      partyPool: { connect: async () => ({ query, release() {} }) } }),
    readConnectionDisclosure: async ({ connections }) => connections.map(({ binding: row }) => ({
      connection_binding_id: row.id, knowledge_state: 'visible' })),
    readExitDisclosure: async () => { reads.push('frontier-disclosure'); return [{
      directional_exit_id: exit.id, directional_exit_version: exit.version,
      direction_context_id: exit.direction_context_id, knowledge_state: 'visible', display_label: 'вдоль реки' }]; },
    generatedExpansionAdapter: {
      prepareExpansion: async () => { writes.push('frontier'); assert.fail('discovery must not prepare topology'); },
      prepareCanonicalConnection: async () => { writes.push('canonical'); assert.fail('discovery must not prepare topology'); }
    },
    prepareSiteTraversal: async () => { writes.push('traversal'); assert.fail('discovery must not move the actor'); }
  });
  const localRuntime = createSpatialV3LocalSceneRuntime({ pool: { query },
    readLocalEdgeDisclosure: async () => edges.map((edge) => ({ edge_id: edge.id,
      display_label: 'Дальше', destination_status: 'open' })) });
  return { identity, runtime, localRuntime, state, reads, writes,
    commands: () => createTraceExpansionCommands({ state, requestId: 'request', inputDigest: 'digest',
      spatialExpansionRuntime: runtime, spatialLocalSceneRuntime: localRuntime }) };
}

test('D4 production reader offers a reciprocal arrival-source line without a path to departure', async () => {
  const fixture = productionFixture({ reverse: true });
  const before = structuredClone(fixture.state);
  const commands = await fixture.commands();
  assert.deepEqual(commands.map((command) => command.command_id), [
    'live_world.follow_canonical_connection:binding-reverse'
  ], 'the exact arrival source is a route operation despite the unreachable departure slot');
  assert.deepEqual(commands[0].semantic_binding.operation_dto, { op: 'request_movement', actor_ref: 'actor',
    target_ref: 'binding-reverse', movement_kind: 'route', route_ref: 'binding-reverse', description: 'бродом' });
  assert.equal(commands[0].label, 'бродом');
  assert.ok(fixture.reads.includes('canonical'), 'the production reader loaded the approved reciprocal binding');
  assert.ok(!fixture.reads.includes('frontier-disclosure'), 'the arrival role still excludes frontier crossing');
  assert.deepEqual(fixture.writes, []);
  assert.deepEqual(fixture.state, before);
});

test('a generated frontier without a local path to departure stays unavailable through the production reader', async () => {
  const fixture = productionFixture({ origin: 'generated' });
  const before = structuredClone(fixture.state);
  assert.deepEqual(await fixture.runtime.listExpansionOptions(fixture.identity), []);
  assert.deepEqual(await fixture.commands(), []);
  await assert.rejects(fixture.runtime.prepareExpansion({ ...fixture.identity, directionalExitId: 'exit-local' }),
    (error) => error.code === 'LIVE_WORLD_EXPANSION_DATA_GAP'
      && error.details.reason === 'selected_exit_unavailable');
  assert.deepEqual(fixture.reads, [], 'unreachable frontier does not disclose or load canonical connections');
  assert.deepEqual(fixture.writes, []);
  assert.deepEqual(fixture.state, before);
});

test('production reader keeps forward-line and frontier operations along an offered local path', async () => {
  const fixture = productionFixture({ localPath: true });
  const before = structuredClone(fixture.state);
  const commands = await fixture.commands();
  assert.deepEqual(commands.map((command) => [command.command_id, command.label]), [
    ['live_world.follow_directional_exit:exit-local', 'вдоль реки'],
    ['live_world.follow_canonical_connection:binding-forward', 'бродом']
  ]);
  assert.deepEqual(commands.map((command) => command.semantic_binding.operation_dto), [
    { op: 'request_movement', actor_ref: 'actor', target_ref: 'exit-local', movement_kind: 'route',
      route_ref: 'exit-local', description: 'вдоль реки' },
    { op: 'request_movement', actor_ref: 'actor', target_ref: 'binding-forward', movement_kind: 'route',
      route_ref: 'binding-forward', description: 'бродом' }
  ]);
  for (const command of commands) {
    assert.equal(await command.attemptRefusal({ committed_state: fixture.state }), null,
      'the first hidden hop remains admitted by the production local-scene owner');
  }
  assert.deepEqual(fixture.writes, []);
  assert.deepEqual(fixture.state, before);
});

test('D4 production reader offers a hidden local approach to an exact reciprocal arrival source', async () => {
  const fixture = productionFixture({ reverse: true, arrivalApproach: true });
  const before = structuredClone(fixture.state);
  assert.deepEqual((await fixture.localRuntime.listLocalOptions({ ...fixture.identity,
    state: fixture.state })).map(({ edge_id }) => edge_id), ['local-edge'],
  'the actual local-scene owner offers the focus-to-arrival first hop');
  assert.deepEqual(await fixture.runtime.listExpansionOptions(fixture.identity), [],
    'focus has no path to a departure endpoint for frontier crossing');
  const commands = await fixture.commands();
  assert.deepEqual(commands.map((command) => [command.command_id, command.label]), [
    ['live_world.follow_canonical_connection:binding-reverse', 'бродом']
  ], 'the offered focus-to-arrival hop reaches the reciprocal source without a departure path');
  assert.deepEqual(commands[0].semantic_binding.operation_dto, { op: 'request_movement', actor_ref: 'actor',
    target_ref: 'binding-reverse', movement_kind: 'route', route_ref: 'binding-reverse', description: 'бродом' });
  assert.equal(await commands[0].attemptRefusal({ committed_state: fixture.state }), null,
    'the production local-scene owner admits the first hidden hop');
  assert.deepEqual(await fixture.runtime.listConnectionApproachOptions({ ...fixture.identity,
    firstStepEdgeIds: ['local-edge'] }), [{ kind: 'approach', connection_binding_id: 'binding-reverse',
    edge_id: 'local-edge', ordered_local_edge_path: [{ edge_id: 'local-edge',
      from_position_id: 'focus-position', to_position_id: 'arrival-position' }], display_label: 'бродом' }]);
  assert.deepEqual(await fixture.runtime.listConnectionApproachOptions({ ...fixture.identity,
    firstStepEdgeIds: ['unoffered-edge'] }), [], 'raw topology cannot replace an offered first hop');
  assert.ok(fixture.reads.includes('canonical'));
  assert.ok(!fixture.reads.includes('frontier-disclosure'), 'an arrival approach does not admit a frontier');
  assert.deepEqual(fixture.writes, []);
  assert.deepEqual(fixture.state, before);
});
