import test from 'node:test';
import assert from 'node:assert/strict';
import { readSpatialV3ExpansionContext } from
  '../src/infrastructure/postgres/spatial-v3-expansion-context.js';
import { createSpatialV3ExpansionContextReader } from
  '../src/infrastructure/postgres/spatial-v3-expansion-context.js';
import { createSpatialV3ExpansionRuntime } from '../src/runtime/spatial-v3-expansion-runtime.js';
import { readDestinationDirectionalExits } from '../src/composition/production-spatial-v3.js';

const current = { world_revision_id: 'revision', world_catalog_digest: 'catalog',
  position: { template_slot_key: 'place', template_instance_ordinal: 0 },
  site: { parent_g4_id: 'g4' },
  baseline: { scene_template_ref: { entity_id: 'scene', authoring_version: '1' } } };
const release = { world_revision_id: 'revision', world_catalog_digest: 'catalog' };

test('expansion context reader uses a supplied transaction without opening another', async () => {
  const queries = [];
  let poolConnects = 0; let releases = 0;
  const emptyState = { ledgers: [], sites: [], chains: [], frontiers: [], reservations: [], bindings: [],
    scene_baselines: [], g6_instances: [], scene_positions: [], site_connections: [], endpoint_bindings: [] };
  const transaction = { async query(sql) {
    queries.push(sql);
    return { rows: sql.includes('WITH sites AS') ? [emptyState] : [{ ...current,
      positions: [], movement_edges: [] }] };
  }, release() { releases += 1; } };
  const reader = createSpatialV3ExpansionContextReader({
    partyPool: { async connect() { poolConnects += 1; throw new Error('must reuse caller transaction'); } },
    release,
    worldBaseReader: {
      async readPinnedSceneTemplateClosure() { return { ok: true, value: { endpoint_slots: [] } }; },
      async readG4ExpansionBinding() { return { ok: true, value: {
        g4: { id: 'g4', version: 1 }, profile: { id: 'profile', version: 1 } } }; },
      async readPinnedG4ExpansionClosure() { return { ok: true, value: { slots: [],
        directional_exits: [], entry_endpoint_bindings: [] } }; }
    }
  });
  const result = await reader({ partyId: 'party', actorId: 'actor', transaction });
  assert.equal(result.partyId, 'party');
  assert.ok(queries.length >= 3, 'all mutable context reads use the supplied client');
  assert.equal(queries.some((sql) => /^BEGIN\b|^COMMIT\b|^ROLLBACK\b/u.test(sql)), false);
  assert.equal(poolConnects, 0);
  assert.equal(releases, 0);
});

for (const role of ['arrival', 'departure', 'both']) {
  test(`${role} endpoint requires expansion closure for disclosed exits`, async () => {
    let bindingReads = 0;
    const worldBaseReader = {
      readPinnedSceneTemplateClosure: async () => ({ ok: true, value: { endpoint_slots: [{
        endpoint_role: role, required_position_slot_key: 'place', required_position_instance_ordinal: 0
      }] } }),
      readG4ExpansionBinding: async () => { bindingReads += 1; return { ok: true, value: {} }; },
      readPinnedG4ExpansionClosure: async () => ({ ok: false, error: 'missing closure' })
    };
    const readContext = () => readSpatialV3ExpansionContext({
      transaction: { query: async () => ({ rows: [current] }) }, worldBaseReader, release,
      partyId: 'party', actorId: 'actor' });
    const runtime = createSpatialV3ExpansionRuntime({ readContext });
    await assert.rejects(runtime.listExpansionOptions({ partyId: 'party', actorId: 'actor',
      state: { position: { position_id: 'position' } } }), (error) =>
      error.code === 'LIVE_WORLD_EXPANSION_CONTEXT_GAP'
        && error.details.reason === 'approved_g4_expansion_closure_required');
    assert.equal(bindingReads, 1);
  });
}

test('commit recheck without prepared context reads approved directional exits only', async () => {
  const calls = [];
  const exits = [{ id: 'exit', version: 1 }];
  const worldBaseReader = {
    readG4ExpansionBinding: async (input) => { calls.push('binding');
      assert.deepEqual(input, { g4_id: 'g4', world_revision_id: 'revision' });
      return { ok: true, value: { g4: { id: 'g4' } } }; },
    readApprovedG4DirectionalExits: async () => { calls.push('exits');
      return { ok: true, value: exits }; },
    readPinnedG4ExpansionClosure: async () => { throw new Error('full closure must not be read'); }
  };
  assert.deepEqual(await readDestinationDirectionalExits({
    current: { destination_g4_id: 'g4' }, worldBaseReader, worldRevisionId: 'revision' }), exits);
  assert.deepEqual(calls, ['binding', 'exits']);
});

test('a canonical place carries the approved connections of its own G5; a generated one carries none', async () => {
  const connections = [{ binding: { id: 'b1' }, profile: { id: 'prof' } }];
  const asked = [];
  const worldBaseReader = {
    readPinnedSceneTemplateClosure: async () => ({ ok: true, value: { endpoint_slots: [{
      endpoint_role: 'departure', required_position_slot_key: 'place', required_position_instance_ordinal: 0 }] } }),
    readG4ExpansionBinding: async () => ({ ok: true, value: { g4: { id: 'g4', version: 1 }, profile: { id: 'p' } } }),
    readPinnedG4ExpansionClosure: async () => ({ ok: true, value: { slots: [] } }),
    readApprovedCanonicalG5Connections: async (input) => { asked.push(input); return { ok: true, value: connections, gaps: [{ binding_id: 'bad', reason: 'canonical_connection_profile_unusable' }] }; }
  };
  const emptyState = { ledgers: [], sites: [], chains: [], frontiers: [], reservations: [], bindings: [],
    scene_baselines: [], g6_instances: [], scene_positions: [], site_connections: [], endpoint_bindings: [] };
  const read = (site) => readSpatialV3ExpansionContext({ worldBaseReader, release, partyId: 'party', actorId: 'actor',
    transaction: { query: async (sql) => ({ rows: [sql.includes('WITH sites AS') ? emptyState : { ...current, site }] }) } });
  const canonical = await read({ parent_g4_id: 'g4', origin: 'canonical',
    canonical_g5_ref: { entity_id: 'g5a', authoring_version: '1' } });
  assert.deepEqual(canonical.canonical_connections, connections);
  assert.deepEqual(canonical.canonical_connection_gaps.map((gap) => gap.binding_id), ['bad'],
    'a binding without a usable profile is a diagnostic gap; it does not stop the place');
  assert.deepEqual(asked, [{ g4: { id: 'g4', version: 1 }, canonical_g5: { id: 'g5a', version: 1 } }]);
  assert.deepEqual((await read({ parent_g4_id: 'g4', origin: 'generated' })).canonical_connections, []);
  worldBaseReader.readApprovedCanonicalG5Connections = async () => ({ ok: false, error: 'gap' });
  await assert.rejects(read({ parent_g4_id: 'g4', origin: 'canonical',
    canonical_g5_ref: { entity_id: 'g5a', authoring_version: '1' } }),
  (error) => error.details.reason === 'approved_canonical_connections_required');
});
