import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSpatialV3CurrentVisibilityProvider } from
  '../src/infrastructure/postgres/spatial-v3-current-visibility-provider.js';
import { approvedNaturalStableCover } from
  '../src/infrastructure/postgres/g4-natural-perception-reader.js';
import { readCurrentTargetConditions } from
  '../src/infrastructure/postgres/spatial-v3-current-visibility-inputs.js';
import { withPhase2CurrentLocalEdges } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-current-visible.js';

const label = JSON.parse(readFileSync(new URL(
  '../../../data/world-catalogs/novgorod/m2c-exit-labels/candidate.json', import.meta.url))).labels[0];
const localLabel = JSON.parse(readFileSync(new URL(
  '../../../data/world-catalogs/novgorod/m2c-local-edge-labels/candidate.json', import.meta.url))).labels[0];
const naturalProfiles = JSON.parse(readFileSync(new URL(
  '../../../data/world-catalogs/novgorod/m2c-natural/candidate.json', import.meta.url))).natural_profiles;
const g4 = label.g4_ref.id;
function fixture({ mode = 'default_clear', modifiers = [], worldBaseReader } = {}) {
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
    worldBaseReader,
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

test('current snapshot discloses the mechanically repinned version 2 edge label', async () => {
  const { scene, provider } = fixture();
  scene.movement_edges[0].source_scene_template_ref.authoring_version = 2;
  const disclosed = await provider.readLocalEdgeDisclosure({ partyId: 'party', actorId: 'actor',
    state: { party_id: 'party', actor_id: 'actor', journey_location: { scene_position_id: 'a' } } });
  assert.deepEqual(disclosed, [{ edge_id: 'edge', display_label: localLabel.display_label }]);
});

test('P12 pine arrival discloses its approved G4 exit before local topology exists', async () => {
  const start = JSON.parse(readFileSync(new URL(
    '../../../data/world-catalogs/novgorod/live-world-runtime-v17/target-start-candidate.json',
    import.meta.url)));
  const rows = JSON.parse(readFileSync(new URL(
    '../../../data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_g4_directional_exits.json',
    import.meta.url)));
  const expected = rows.filter((row) => row.g4_id === start.initial_placement.g4_ref.id
    && row.exit_canonical_g5_id === start.initial_placement.canonical_g5_ref.id);
  assert.equal(expected.length, 1);
  const worldBaseReader = {
    async readG4ExpansionBinding() { return { ok: true, value: { id: 'approved-pine-binding' } }; },
    async readPinnedG4ExpansionClosure() { return { ok: true, value: {
      directional_exits: rows.filter((row) => row.g4_id === start.initial_placement.g4_ref.id) } }; }
  };
  const { provider, scene, natural } = fixture({ worldBaseReader });
  scene.world_revision_id = start.world_pin.world_revision_id;
  scene.site = { id: 'pine-site', parent_g4_id: start.initial_placement.g4_ref.id,
    canonical_g5_ref: { entity_id: start.initial_placement.canonical_g5_ref.id } };
  scene.movement_edges = [];
  natural.scene.g4_ref.id = start.initial_placement.g4_ref.id;
  natural.ambient_visibility.stable_cover = 'partial';
  const disclosed = await provider.readCurrentExitDisclosure({ partyId: 'party', actorId: 'actor' });
  const approved = JSON.parse(readFileSync(new URL(
    '../../../data/world-catalogs/novgorod/m2c-exit-labels/candidate.json', import.meta.url)))
    .labels.find((row) => row.directional_exit_ref.id === expected[0].id);
  assert.deepEqual(disclosed.map(({ directional_exit_id, display_label }) =>
    ({ directional_exit_id, display_label })), [{
    directional_exit_id: expected[0].id, display_label: approved.display_label }]);
  const state = { party_id: 'party', actor_id: 'actor', journey_location: {
    scene_position_id: 'a' }, current_visible_context: {
    version: 1, schema: 'visible_context_package', visible_scene: 'Лес',
    visible_changes: [], sensory_details: [], visible_npc: [], visible_objects: [],
    known_context: [], uncertainties: [], allowed_tensions: [], do_not_imply: [] } };
  const current = await withPhase2CurrentLocalEdges(state,
    provider.readLocalEdgeDisclosure, provider.readCurrentExitDisclosure);
  assert.deepEqual(current.current_visible_context.visible_objects, [{
    entity_ref: { entity_kind: 'g4_directional_exit', entity_id: expected[0].id },
    display_label: approved.display_label, recognition: 'known' }]);
});

test('current approved local edge reaches the turn visible context', async () => {
  const { provider, scene } = fixture();
  const state = { party_id: 'party', actor_id: 'actor',
    journey_location: { scene_position_id: 'a' }, current_visible_context: {
      version: 1, schema: 'visible_context_package', visible_scene: 'Лес',
      visible_changes: [], sensory_details: [], visible_npc: [],
      visible_objects: [], known_context: [], uncertainties: [],
      allowed_tensions: [], do_not_imply: [] } };
  const current = await withPhase2CurrentLocalEdges(state,
    provider.readLocalEdgeDisclosure);
  assert.deepEqual(current.current_visible_context.visible_objects, [{
    entity_ref: { entity_kind: 'scene_movement_edge', entity_id: 'edge' },
    display_label: localLabel.display_label, recognition: 'known' }]);
  scene.movement_edges = [];
  const changed = await withPhase2CurrentLocalEdges(current,
    provider.readLocalEdgeDisclosure);
  assert.deepEqual(changed.current_visible_context.visible_objects, []);
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
