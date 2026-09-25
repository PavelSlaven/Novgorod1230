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
