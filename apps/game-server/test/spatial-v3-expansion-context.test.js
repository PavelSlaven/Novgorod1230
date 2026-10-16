import test from 'node:test';
import assert from 'node:assert/strict';
import { readSpatialV3ExpansionContext } from
  '../src/infrastructure/postgres/spatial-v3-expansion-context.js';
import { createSpatialV3ExpansionRuntime } from '../src/runtime/spatial-v3-expansion-runtime.js';
import { readDestinationDirectionalExits } from '../src/composition/production-spatial-v3.js';

const current = { world_revision_id: 'revision', world_catalog_digest: 'catalog',
  position: { template_slot_key: 'place', template_instance_ordinal: 0 },
  site: { parent_g4_id: 'g4' },
  baseline: { scene_template_ref: { entity_id: 'scene', authoring_version: '1' } } };
const release = { world_revision_id: 'revision', world_catalog_digest: 'catalog' };

for (const [role, readsClosure] of [['arrival', false], ['departure', true], ['both', true]]) {
  test(`${role} endpoint ${readsClosure ? 'requires' : 'skips'} expansion closure`, async () => {
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
    if (readsClosure) {
      await assert.rejects(readContext(), (error) =>
        error.code === 'LIVE_WORLD_EXPANSION_CONTEXT_GAP'
          && error.details.reason === 'approved_g4_expansion_closure_required');
      assert.equal(bindingReads, 1);
    } else {
      const runtime = createSpatialV3ExpansionRuntime({ readContext });
      assert.deepEqual(await runtime.listExpansionOptions({ partyId: 'party', actorId: 'actor' }), []);
      assert.equal(bindingReads, 0);
    }
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

test('in-transit expansion fails closed with the persisted traversal identity instead of pretending the actor has a scene position', async () => {
  const queries = [];
  const worldBaseReader = { readPinnedSceneTemplateClosure: async () => ({ ok: true, value: {} }),
    readG4ExpansionBinding: async () => ({ ok: true, value: {} }) };
  await assert.rejects(readSpatialV3ExpansionContext({
    worldBaseReader, release, partyId: 'party', actorId: 'actor',
    transaction: { query: async (sql) => {
      queries.push(sql);
      return queries.length === 1 ? { rows: [] } : { rows: [{
        journey_location_id: 'journey', location_kind: 'in_transit',
        travel_state_id: 'travel', travel_status: 'paused_in_transit',
        segment_progress_ppm: 400_000, mirrored: false,
        next_interval_ordinal: 2, execution_id: 'execution',
        execution_status: 'active', active_travel_state_id: 'travel',
        departure_endpoint_snapshot: { resolved_position_id: 'departure' },
        arrival_endpoint_snapshot: { resolved_position_id: 'arrival' },
        traversal_snapshot: { physical_segment_ref: { segment_ref: {
          segment_kind: 'site_connection', segment_id: 'connection' } } }
      }] };
    } }
  }), (error) => error.code === 'LIVE_WORLD_EXPANSION_CONTEXT_GAP'
    && error.details.reason === 'in_transit_selected_traversal_owner_missing'
    && error.details.cause.travel_state_id === 'travel'
    && error.details.cause.execution_id === 'execution'
    && error.details.cause.departure_position_id === 'departure'
    && error.details.cause.arrival_position_id === 'arrival'
    && error.details.cause.connection_id === 'connection');
  assert.match(queries[1], /traveller_travel_states/u);
  assert.match(queries[1], /party_route_plan_steps/u);
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
