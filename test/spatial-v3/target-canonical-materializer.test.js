import assert from 'node:assert/strict';
import test from 'node:test';
import { materializeAuthoredStartPartyInstance } from '@rus/materialization';
import { targetCanonicalStartFixture } from './target-canonical-start-fixture.js';
import { loadTargetAuthoredStartProfile } from '../../apps/game-server/src/internal/live-world-authored-starts.js';

test('canonical target materializer uses approved player and NPC source shapes deterministically', async () => {
  const input = await targetCanonicalStartFixture();
  let count = 0;
  for (let ordinal = 0; ordinal < 12; ordinal += 1) {
    const request = { ...input, idempotency_key: `target-start-${ordinal}` };
    const first = materializeAuthoredStartPartyInstance(request);
    assert.deepEqual(materializeAuthoredStartPartyInstance(request), first);
    assert.equal(first.immediate.player.dossier.identity.name, 'Микула');
    assert.equal(first.immediate.player.attribute_generation_gate, 'active');
    assert.equal(first.immediate.environment_snapshot.season, 'summer');
    assert.equal(first.immediate.items.filter((row) => row.owner_character_id === first.immediate.player.instance_id).length, 3);
    assert.equal(first.initial_spatial_v3.canonical_scene_proposal.rows.filter((row) =>
      row.target_table === 'scene_position_nodes').length,
    input.world_base_reference_snapshot.scene_template_closures[0].position_slots.reduce((sum, row) => sum + row.instance_count, 0));
    assert.equal(first.initial_spatial_v3.s1_topology, undefined);
    for (const npc of first.immediate.npcs) {
      count += 1;
      assert.equal(npc.routine_state.status, 'active');
      assert.ok(npc.position_id);
      assert.equal(npc.attribute_generation_gate, 'active');
    }
  }
  assert.ok(count > 0, 'approved nonzero composition must run through the actual NPC/Stage16 owners');
});

test('target canonical dependencies reject absent or stale exact pins before generating a party', async () => {
  const fixture = await targetCanonicalStartFixture();
  for (const mutate of [
    (input) => { input.scenario_manifest_digest = '0'.repeat(64); },
    (input) => { input.domain_catalog_pin.compatible_world_catalog_digest = '0'.repeat(64); },
    (input) => { input.actor_base_attributes_runtime_profile.catalog_revision_id = 'historical'; },
    (input) => { input.canonical_npc_closure.canonical_g5_ref.id = 'other'; },
    (input) => { input.approved_actor_temporal_bundle.world_pin.world_revision_id = 'other'; },
    (input) => { delete input.calendar_profile; },
    (input) => { delete input.canonical_acoustic_rows; }
  ]) {
    const input = structuredClone(fixture); mutate(input);
    assert.throws(() => materializeAuthoredStartPartyInstance(input), (error) => error.code?.startsWith('CANONICAL_START_'));
  }
  await assert.rejects(loadTargetAuthoredStartProfile({ worldBaseReferenceSnapshot: fixture.world_base_reference_snapshot,
    domainCatalog: { ...fixture.domain_catalog, pin: { ...fixture.domain_catalog_pin, catalog_revision_id: 'historical' } } }),
  { code: 'SPATIAL_V3_TARGET_START_RUNTIME_PIN_REQUIRED' });
});
