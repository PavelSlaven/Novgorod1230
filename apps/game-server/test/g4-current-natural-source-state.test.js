import assert from 'node:assert/strict';
import test from 'node:test';
import { approvedNaturalPerceptionFixture } from './g4-natural-perception-fixture.js';
import { readCurrentNaturalSourceState } from
  '../src/infrastructure/postgres/g4-current-natural-source-state.js';
import { resolveG4NaturalPerceptionConditions } from '../src/runtime/g4-natural-perception-conditions.js';
import { prepareG4NaturalScenePerceptionInput, projectG4NaturalPerception } from
  '../src/runtime/g4-natural-perception.js';

async function fixture(canonical = true, profileId) {
  const approved = await approvedNaturalPerceptionFixture({ canonical, profileId });
  const { input, placement, naturalProfile, sceneClosure } = approved;
  const scene = input.currentFacts.scene;
  const sourcePosition = scene.positions.find((row) =>
    row.template_slot_key === placement.required_position_slot_key
    && row.template_instance_ordinal === placement.required_position_instance_ordinal);
  const snapshot = { site: { id: 'site', state_version: 2 },
    baseline: { id: 'baseline', state_version: 2 },
    location: { party_id: 'party:1', owner_id: 'player:1',
      scene_position_id: sourcePosition.id, state_version: 2 },
    positions: scene.positions, g6: scene.g6, visibility_links: [], acoustic_edges: [], portals: [] };
  let modifiers = [];
  const transaction = { async query(sql) {
    if (sql.includes('visibility_modifiers')) return { rows: modifiers };
    if (sql.includes('party_actor_body_states')) return { rowCount: 1,
      rows: [{ state_version: 3 }] };
    if (sql.includes('party_actor_active_conditions')) return { rows: [] };
    if (sql.includes('party_combat_sessions')) return { rows: [] };
    throw new Error(`Unexpected query: ${sql}`);
  } };
  const args = { transaction, partyId: 'party:1', actorId: 'player:1', snapshot,
    sceneClosure, naturalProfile, verifiedCatalog: input.verifiedCatalog, pin: input.pin,
    readCurrentEnvironment: async () => input.currentFacts.current_environment };
  return { args, setModifiers: (rows) => { modifiers = rows; }, placement, sourcePosition };
}

test('post-turn canonical dry G5 reads current environment, placement and body', async () => {
  const { args, placement, sourcePosition } = await fixture();
  const source = await readCurrentNaturalSourceState(args);
  assert.equal(source.position_id, sourcePosition.id);
  assert.equal(source.visual_capability, 'clear');
  assert.equal(source.hearing_capability, 'clear');
  assert.equal(source.canonical_initial_state, undefined);
  assert.equal(source.source_state_pins.body[0].version_pin.state_version, 3);
  assert.deepEqual(source.source_observations.map((row) => row.layer), placement.visual_layers);
  assert.ok(source.source_observations.every((row) => row.source_position_id === sourcePosition.id
    && row.stable_cover === 'partial' && row.dynamic_occlusion === 'clear'
    && row.concealment === 'clear'));
});

test('generated dry G5 uses the same current source owner', async () => {
  const { args } = await fixture();
  args.snapshot.site.origin = 'generated';
  const source = await readCurrentNaturalSourceState(args);
  assert.ok(source.source_observations.length > 0);
  assert.equal(source.canonical_initial_state, undefined);
});

test('current source rejects nonempty visibility modifiers', async () => {
  const dry = await fixture();
  dry.setModifiers([{ id: 'remote-smoke', state_version: 2, affected_scope_ref: {
    spatial_kind: 'scene_position', spatial_id: 'remote-position' } }]);
  assert.ok((await readCurrentNaturalSourceState(dry.args)).source_observations.length > 0);
  dry.setModifiers([{ id: 'smoke', state_version: 2, affected_scope_ref: {
    spatial_kind: 'scene_position', spatial_id: dry.sourcePosition.id } }]);
  await assert.rejects(readCurrentNaturalSourceState(dry.args), (error) =>
    error.code === 'NATURAL_SCENE_PERCEPTION_DATA_GAP'
    && error.details.reason === 'visibility_modifier_effect_policy_required');
});

test('floodplain water sound gap preserves admitted visual perception', async () => {
  const profileId = 'm2c_natural_g4_floodplain_ridge_route';
  const wet = await fixture(false, profileId);
  assert.ok(wet.placement.acoustic_layers.length > 0);
  const source = await readCurrentNaturalSourceState(wet.args);
  const acoustic = source.source_observations.filter((row) => wet.placement.acoustic_layers.includes(row.layer));
  assert.ok(acoustic.every((row) => row.data_gap === 'current_water_source_state_required'
    && row.source_state == null));
  const conditions = resolveG4NaturalPerceptionConditions({
    ...wet.args, current: source });
  const admissions = conditions.layer_admissions;
  assert.ok(admissions.some((row) => wet.placement.visual_layers.includes(row.layer)
    && row.source_state === 'present'));
  assert.ok(admissions.every((row) => !wet.placement.acoustic_layers.includes(row.layer)
    || row.data_gap === 'current_water_source_state_required'));
  const approved = await approvedNaturalPerceptionFixture({ canonical: false, profileId });
  const currentFacts = { ...approved.input.currentFacts, layer_admissions: admissions };
  const input = prepareG4NaturalScenePerceptionInput({ ...approved.input, currentFacts });
  assert.ok(input.observations.some((row) => row.data_gap === 'current_water_source_state_required'
    && row.active == null));
  const result = projectG4NaturalPerception({ input, partyId: source.party_id,
    actorId: source.actor_id, positionId: input.observer.position_id });
  assert.ok(result.ok);
  assert.ok(result.perceived_facts.some((row) => row.channel === 'visual'));
  assert.ok(result.perceived_facts.every((row) => row.channel !== 'acoustic'));
});
