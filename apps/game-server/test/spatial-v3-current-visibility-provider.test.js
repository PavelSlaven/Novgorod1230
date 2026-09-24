import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSpatialV3CurrentVisibilityProvider } from
  '../src/infrastructure/postgres/spatial-v3-current-visibility-provider.js';
import { approvedNaturalStableCover } from
  '../src/infrastructure/postgres/g4-natural-perception-reader.js';
import { readCurrentTargetConditions } from
  '../src/infrastructure/postgres/spatial-v3-current-visibility-inputs.js';

const label = JSON.parse(readFileSync(new URL(
  '../../../data/world-catalogs/novgorod/m2c-exit-labels/candidate.json', import.meta.url))).labels[0];
const localLabel = JSON.parse(readFileSync(new URL(
  '../../../data/world-catalogs/novgorod/m2c-local-edge-labels/candidate.json', import.meta.url))).labels[0];
const naturalProfiles = JSON.parse(readFileSync(new URL(
  '../../../data/world-catalogs/novgorod/m2c-natural/candidate.json', import.meta.url))).natural_profiles;
const g4 = label.g4_ref.id;
function fixture({ mode = 'default_clear', modifiers = [] } = {}) {
  const scene = { world_revision_id: label.world_revision_id,
    location: { party_id: 'party', owner_id: 'actor', scene_position_id: 'a' },
    site: { parent_g4_id: g4 }, baseline: { id: 'baseline' },
    positions: [{ id: 'a', g6_instance_id: 'g6' }, { id: 'b', g6_instance_id: 'g6' }],
    g6: [{ id: 'g6', intra_g6_visibility_mode: mode }], visibility_links: [],
    movement_edges: [{ id: 'edge', from_position_id: 'a', to_position_id: 'b',
      source_scene_template_ref: { entity_id: localLabel.scene_template_ref.id,
        authoring_version: localLabel.scene_template_ref.version },
      source_edge_slot_key: localLabel.edge_slot_key }],
    placements: [{ entity_kind: 'npc', entity_id: 'one', position_node_id: 'b' },
      { entity_kind: 'npc', entity_id: 'two', position_node_id: 'b' }],
    modifier_set: { complete: true, rows: modifiers } };
  const natural = { observer: { position_id: 'a', visual_capability: 'clear' },
    scene: { baseline_id: 'baseline', g4_ref: { id: g4 }, portals: {} },
    ambient_visibility: { g6_instance_id: 'g6', lighting: 'clear', weather: 'clear',
      stable_cover: 'clear' } };
  const queries = [];
  const pool = { async connect() { return { async query(sql) { queries.push(sql); }, release() {} }; } };
  const provider = createSpatialV3CurrentVisibilityProvider({ pool,
    readScene: async () => scene, readNatural: async () => natural,
    readTargetConditions: readCurrentTargetConditions,
    readEntityExterior: async ({ placement }) => ({ visible_clothing: placement.entity_id }),
    readPlayerKnowledge: async ({ placement }) => placement.entity_id === 'one'
      ? { display_name: 'Known person' } : null });
  return { scene, natural, provider, queries };
}

test('current snapshot admits committed identities, edges and approved exit label only', async () => {
  const { provider, queries } = fixture();
  const observations = await provider.readEntityObservations({ partyId: 'party', actorId: 'actor' });
  assert.deepEqual(observations.map((row) => row.display_name), ['Known person', undefined]);
  assert.deepEqual(observations.map((row) => row.visibility), ['clear', 'clear']);
  assert.deepEqual(await provider.readVisibleLocalEdgeRefs({ partyId: 'party', actorId: 'actor',
    state: { party_id: 'party', actor_id: 'actor', journey_location: { scene_position_id: 'a' } } }), ['edge']);
  assert.deepEqual(await provider.readLocalEdgeDisclosure({ partyId: 'party', actorId: 'actor',
    state: { party_id: 'party', actor_id: 'actor', journey_location: { scene_position_id: 'a' } } }),
  [{ edge_id: 'edge', display_label: localLabel.display_label }]);
  const exit = { id: label.directional_exit_ref.id, version: label.directional_exit_ref.version,
    canonical_digest: label.directional_exit_ref.canonical_digest,
    direction_context_id: label.direction_context_ref.id };
  assert.deepEqual(await provider.readExitDisclosure({ partyId: 'party', actorId: 'actor',
    position: { id: 'a' }, site: { parent_g4_id: g4 }, directional_exits: [exit] }),
  [{ directional_exit_id: exit.id, directional_exit_version: exit.version,
    direction_context_id: exit.direction_context_id, knowledge_state: 'visible',
    display_label: label.display_label }]);
  assert.equal(queries.filter((sql) => sql.startsWith('BEGIN')).length, 4);
});

test('explicit geometry hides unlinked targets; modifiers and missing ambient fail closed', async () => {
  const explicit = fixture({ mode: 'explicit' });
  assert.deepEqual(await explicit.provider.readEntityObservations({ partyId: 'party', actorId: 'actor' }), []);
  explicit.scene.visibility_links.push({ from_position_id: 'a', to_position_id: 'b', quality: 'partial', portal_entity_id: null });
  assert.deepEqual((await explicit.provider.readEntityObservations({ partyId: 'party', actorId: 'actor' }))
    .map((row) => row.visibility), ['partial', 'partial']);
  const modified = fixture({ modifiers: [{ modifier_kind: 'smoke' }] });
  await assert.rejects(modified.provider.readEntityObservations({ partyId: 'party', actorId: 'actor' }),
    (error) => error.details?.reason === 'visibility_modifier_effect_policy_required');
  const unpinned = fixture(); unpinned.natural.ambient_visibility = null;
  await assert.rejects(unpinned.provider.readEntityObservations({ partyId: 'party', actorId: 'actor' }),
    (error) => error.details?.reason === 'entity_lighting_policy_required');
});

test('supplied transaction remains caller-owned and stable cover follows approved landscape', async () => {
  const { provider, queries } = fixture();
  const transaction = { async query(sql) { queries.push(sql); } };
  const rows = await provider.readEntityObservations({ transaction,
    partyId: 'party', actorId: 'actor' });
  assert.equal(rows[0].display_label, 'Known person');
  assert.equal(rows[1].display_label, 'человек');
  assert.equal(queries.length, 0);
  const marsh = naturalProfiles.find((row) => row.template_refs.landscape_template_id === 'lt_freshwater_marsh');
  const forest = naturalProfiles.find((row) => row.template_refs.landscape_template_id === 'lt_temperate_coniferous_forest');
  assert.equal(approvedNaturalStableCover(marsh), 'clear');
  assert.equal(approvedNaturalStableCover(forest), 'partial');
  assert.throws(() => approvedNaturalStableCover({ ...marsh, profile_id: 'unknown' }),
  (error) => error.details?.reason === 'approved_natural_stable_cover_required');
});

test('local movement recheck uses commit transaction and current source position', async () => {
  const { provider, scene, natural, queries } = fixture();
  const transaction = { async query(sql) { queries.push(sql); } };
  const input = { transaction, partyId: 'party', actorId: 'actor',
    positionId: 'a', edgeId: 'edge' };
  assert.deepEqual(await provider.recheckLocalMovementVisibility(input), { ok: true });
  assert.deepEqual(await provider.recheckLocalMovementVisibility({ ...input,
    edgeId: 'another' }), { ok: false });
  scene.location.scene_position_id = 'b';
  natural.observer.position_id = 'b';
  assert.deepEqual(await provider.recheckLocalMovementVisibility(input), { ok: false });
  assert.deepEqual(await provider.recheckLocalMovementVisibility({ ...input,
    transaction: null }), { ok: false });
  assert.deepEqual(queries, []);
});
