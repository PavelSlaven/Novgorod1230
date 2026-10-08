import assert from 'node:assert/strict';
import test from 'node:test';
import { materializeAuthoredStartPartyInstance } from '@rus/materialization';
import { targetCanonicalStartFixture } from './target-canonical-start-fixture.js';
import { approvedNpcIdentityCatalog } from '../helpers/npc-identity-catalog.js';
import { loadTargetAuthoredStartProfile } from '../../apps/game-server/src/internal/live-world-authored-starts.js';
import { lowerDvinaTraceVisibleSceneItems } from '../../apps/game-server/src/runtime/lower-dvina-trace-visible-scene-items.js';
import { projectTurnStepModelRequest } from '../../apps/game-server/src/runtime/lower-dvina-trace-turn-step-model-projection.js';

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

test('canonical target clothing labels survive visible-item and turn-step projection', async () => {
  const fixture = await targetCanonicalStartFixture();
  const start = materializeAuthoredStartPartyInstance(fixture).immediate;
  const actorId = start.player.instance_id;
  const clothing = start.items.filter((item) =>
    item.owner_character_id === actorId);
  const itemLabels = Object.fromEntries(fixture.domain_catalog.records_by_table
    .item_templates.map((template) => [template.id, template.title]));
  const committedItems = clothing.map((item) => ({ ...item,
    item_id: item.instance_id,
    name: item.state?.display_name,
    placement: { holder_character_id: item.holder_character_id,
      physical_position: item.physical_position }
  }));
  const visible = lowerDvinaTraceVisibleSceneItems(committedItems, {}, actorId,
    itemLabels);
  const projected = projectTurnStepModelRequest({ player_safe_state: {
    items: committedItems,
    current_visible_context: { visible_objects: visible.map((row) =>
      row.visibleObject) }
  } }).request.player_safe_state;

  assert.equal(clothing.length, 3);
  assert.deepEqual(projected.items.map((item) => item.name).sort(),
    ['нижняя рубаха', 'низкая кожаная обувь', 'штаны'].sort());
  assert.deepEqual(projected.current_visible_context.visible_objects
    .map((item) => item.display_label).sort(),
  ['нижняя рубаха', 'низкая кожаная обувь', 'штаны'].sort());
  assert.equal(projected.current_visible_context.visible_objects.some((item) =>
    item.label_gap?.code === 'player_safe_item_label_required'), false);
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

test('canonical start NPC get pool names and a seeded character from the approved identity data', async () => {
  const input = await targetCanonicalStartFixture();
  input.approved_actor_temporal_bundle = { ...input.approved_actor_temporal_bundle,
    npc_identity: await approvedNpcIdentityCatalog() };
  const boundContexts = new Set(input.approved_actor_temporal_bundle.npc_identity.name_bindings.map((row) => row.regional_context_id));
  const pool = new Set(input.approved_actor_temporal_bundle.npc_identity.name_entries.map((row) => row.name_form));
  const seen = { named: 0, unnamed: 0 };
  for (let ordinal = 0; ordinal < 30; ordinal += 1) {
    const request = { ...input, idempotency_key: `target-identity-${ordinal}` };
    const first = materializeAuthoredStartPartyInstance(request);
    assert.deepEqual(materializeAuthoredStartPartyInstance(request).immediate.npcs.map((npc) => npc.identity_state),
      first.immediate.npcs.map((npc) => npc.identity_state), 'same request, same names');
    for (const npc of first.immediate.npcs) {
      const context = npc.semantic_state.source_binding.regional_context_ref.id;
      if (boundContexts.has(context)) {
        seen.named += 1;
        assert.ok(pool.has(npc.identity_state.canonical_name), npc.identity_state.canonical_name);
        const character = npc.semantic_state.character;
        assert.equal(character.value_refs.length, 2);
        assert.ok(character.goals_ru.length >= 1 && character.goals_ru.length <= 2);
        assert.equal(typeof character.fear_ru, 'string');
      } else {
        seen.unnamed += 1;
        assert.equal(npc.identity_state.canonical_name, null);
      }
    }
  }
  assert.ok(seen.named > 0, 'at least one Novgorod-land NPC is named');
});
