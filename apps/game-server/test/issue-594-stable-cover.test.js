import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { approvedNaturalStableCover } from
  '../src/infrastructure/postgres/g4-natural-perception-reader.js';
import { readCurrentTargetConditions } from
  '../src/infrastructure/postgres/spatial-v3-current-visibility-inputs.js';
import { visibleCurrentTargets } from '../src/runtime/spatial-v3-current-visibility.js';
import { createSpatialV3CurrentVisibilityProvider } from
  '../src/infrastructure/postgres/spatial-v3-current-visibility-provider.js';

const profiles = JSON.parse(readFileSync(new URL(
  '../../../data/world-catalogs/novgorod/m2c-natural/candidate.json', import.meta.url))).natural_profiles;

function fixture({ cover = 'clear', mode = 'default_clear', samePosition = false,
  partialLink = false, weather = 'clear' } = {}) {
  const npcPosition = samePosition ? 'observer' : 'other';
  const scene = {
    location: { party_id: 'party', owner_id: 'actor', scene_position_id: 'observer' },
    baseline: { id: 'baseline' },
    positions: [{ id: 'observer', g6_instance_id: 'g6' }, { id: 'other', g6_instance_id: 'g6' }],
    g6: [{ id: 'g6', intra_g6_visibility_mode: mode, default_visibility_distance_band: 'short' }],
    placements: [{ entity_kind: 'npc', entity_id: 'stranger', position_node_id: npcPosition }],
    visibility_links: partialLink ? [{ from_position_id: 'observer', to_position_id: npcPosition,
      quality: 'partial', portal_entity_id: null }] : [],
    modifier_set: { complete: true, rows: [] },
  };
  const natural = {
    observer: { position_id: 'observer', visual_capability: 'clear' },
    scene: { baseline_id: 'baseline', portals: {} },
    ambient_visibility: { g6_instance_id: 'g6', lighting: 'clear', weather, stable_cover: cover },
  };
  const target = { target_id: 'npc:stranger', entity_id: 'stranger', entity_kind: 'npc',
    position_id: npcPosition };
  return { scene, natural, target };
}

async function resolveTarget({ scene, natural, target }) {
  const current = await readCurrentTargetConditions({ partyId: 'party', actorId: 'actor',
    scene, natural, target });
  return visibleCurrentTargets({ observer_position_id: scene.location.scene_position_id,
    observer_visual_capability: natural.observer.visual_capability,
    positions: scene.positions, g6: scene.g6, visibility_links: scene.visibility_links,
    portals: natural.scene.portals, modifier_set: scene.modifier_set,
    targets: [{ ...target, lighting: natural.ambient_visibility.lighting,
      weather: natural.ambient_visibility.weather, ...current }] });
}

// Task #594 requests clear direct sight; Spatial §6.7/§7.1 retains actual occluders.
for (const [landscape, samePosition] of [
  ['lt_temperate_coniferous_forest', false],
  ['lt_low_alluvial_riverbank', true],
]) {
  test(`ожидаемо красный, issue #594: ${landscape} cover does not hide a close unobstructed NPC`, async () => {
    const profile = profiles.find((row) => row.template_refs.landscape_template_id === landscape);
    assert.ok(profile, 'Approved natural profile required before visibility assertion');
    const input = fixture({ cover: approvedNaturalStableCover(profile), samePosition });
    assert.equal(input.scene.g6[0].intra_g6_visibility_mode, 'default_clear');
    assert.equal(input.scene.visibility_links.length, 0);
    assert.equal(input.scene.modifier_set.rows.length, 0);
    assert.equal(input.natural.ambient_visibility.lighting, 'clear');
    assert.equal(input.natural.ambient_visibility.weather, 'clear');
    assert.equal(input.natural.observer.visual_capability, 'clear');
    assert.deepEqual(await resolveTarget(input), [{ target_id: 'npc:stranger', visibility: 'clear' }],
      'issue #594: landscape openness is not an observer-to-NPC occluder in a default_clear G6');
  });
}

test('issue #594 control: an explicit partially obstructed sightline remains partial', async () => {
  // An actual stable occluder belongs to the pair-specific link, not ambient landscape openness.
  const input = fixture({ mode: 'explicit', partialLink: true });
  assert.equal(input.natural.ambient_visibility.stable_cover, 'clear');
  assert.deepEqual(await resolveTarget(input), [{ target_id: 'npc:stranger', visibility: 'partial' }]);
});

test('issue #594 control: poor weather still limits an unobstructed close NPC', async () => {
  assert.deepEqual(await resolveTarget(fixture({ weather: 'partial' })),
    [{ target_id: 'npc:stranger', visibility: 'partial' }]);
});

test('issue #594 control: clear sight admits exterior without granting an unknown name', async () => {
  const { scene, natural } = fixture();
  const exterior = { appearance: { hair: { color: 'dark_brown' } } };
  const transaction = { async query() { throw new Error('Fixture must not query a database'); } };
  const provider = createSpatialV3CurrentVisibilityProvider({
    pool: { async connect() { throw new Error('Caller supplies transaction'); } },
    readScene: async () => scene, readNatural: async () => natural,
    readTargetConditions: readCurrentTargetConditions,
    readEntityExterior: async () => exterior, readPlayerKnowledge: async () => null,
  });
  const rows = await provider.readEntityObservations({ transaction, partyId: 'party', actorId: 'actor' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].visibility, 'clear');
  assert.deepEqual(rows[0].exterior, exterior);
  assert.equal(rows[0].display_label, 'человек');
  assert.equal(Object.hasOwn(rows[0], 'display_name'), false);
});
