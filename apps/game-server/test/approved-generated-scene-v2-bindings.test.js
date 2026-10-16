import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { deriveApprovedGeneratedSceneV2Bindings } from
  '../src/infrastructure/postgres/approved-generated-scene-v2-bindings.js';
import { buildFirstEntryNaturalCapabilities } from
  '../src/infrastructure/postgres/ordinary-materialization-first-entry-natural.js';

const root = 'data/world-catalogs/novgorod/';
const read = (path) => readFile(`${root}${path}`, 'utf8');

test('approved generated template and scene successors preserve exact natural family bindings', async () => {
  const approval = JSON.parse(await read('live-world-runtime-v17/capacity-v2-start-successors/data-approval.json'));
  const sceneTemplateBytes = await read('m2c-scene-movement-edges/open-capacity-v2-import/spatial_v3_scene_templates.json');
  const materializationProfileBytes = await read('m2c-scene-movement-edges/open-capacity-v2-import/spatial_v3_scene_materialization_profiles.json');
  const options = { capacityApproval: approval, sceneTemplateBytes, materializationProfileBytes };
  const items = JSON.parse(await read('m2c-items/candidate.json'));
  const property = JSON.parse(await read('m2c-items/property-context-candidate.json'));
  const id = 'm2c_g5_forest__forest_resource_use__pine_ridge';
  const binding = { g5_id: 'generated-site', world_revision_id: items.target.world_revision_id,
    g4_id: 'g4v3__gn_nov_g3_xp017_yp026_r2_dry_pine_ridge', g4_version: 1,
    g5_generation_template_id: id, g5_generation_template_version: 2,
    scene_template_id: 'stfv3__g5_route_approach_v1', scene_template_version: 2,
    g6_slot_key: 'main', position_slot_key: 'focus' };
  await assert.rejects(buildFirstEntryNaturalCapabilities({ authoring: items, binding,
    readProperty: async () => { throw new Error('unexpected property read'); } }),
  (error) => error.code === 'ORDINARY_NATURAL_FIRST_ENTRY_BINDING_INVALID');
  for (const [candidate, key] of [[items, 'family_profiles'], [property, 'family_bindings']]) {
    const derived = deriveApprovedGeneratedSceneV2Bindings(candidate, options);
    const families = derived[key].filter((row) =>
      (row.exact_match ?? row).g5_generation_template_id === id);
    assert.deepEqual(families.map((row) => (row.exact_match ?? row).g5_generation_template_version), [1, 2]);
    assert.deepEqual((families[1].exact_match ?? families[1]).scene_template_refs,
      ['stfv3__g5_route_approach_v1@2']);
  }
  const proposal = { target_site_id: binding.g5_id, inserts: [
    { target_table: 'party_g5_sites', id: binding.g5_id, record: {
      id: binding.g5_id, party_id: 'party', origin: 'generated', status: 'active',
      parent_g4_id: binding.g4_id, generated_template_ref: { entity_id: id, authoring_version: '2' } } },
    { target_table: 'party_scene_baselines', id: 'baseline', record: {
      party_id: 'party', host_kind: 'g5_site', host_id: binding.g5_id, status: 'active' } },
    { target_table: 'party_g6_instances', id: 'g6', record: { id: 'g6', party_id: 'party',
      host_kind: 'g5_site', host_id: binding.g5_id, status: 'active', scene_baseline_id: 'baseline',
      scene_slot_key: 'main', source_scene_template_ref: {
        entity_id: binding.scene_template_id, authoring_version: '2' } } },
    { target_table: 'scene_position_nodes', id: 'position', record: { party_id: 'party',
      g6_instance_id: 'g6', status: 'active', template_slot_key: 'focus' } }
  ] };
  const capabilities = await buildFirstEntryNaturalCapabilities({
    authoring: deriveApprovedGeneratedSceneV2Bindings(items, options), binding,
    readProperty: async () => ({ lookup_state: 'complete', explicit_rule: null }),
    transaction: { query: async () => ({ rows: [{ world_revision_id: binding.world_revision_id }] }) },
    partyId: 'party', scope: { entity_kind: 'g6', entity_id: 'g6' }, positionRef: 'position',
    profile: { execution: { candidate_context: { normalizer_version: 'v1' } },
      context_refs: {}, policy_refs: { ordinary_presence_policy_ref: 'presence' } },
    spatialProposal: proposal });
  assert.equal(capabilities.length, items.family_profiles.find((row) =>
    row.exact_match.g5_generation_template_id === id).natural_finite_source_profile_refs.length);
});
