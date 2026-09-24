import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../../../..');
const candidatePath = 'data/world-catalogs/novgorod/live-world-runtime-v17/additional-starts-candidate.json';
const bytes = (path) => readFile(resolve(root, path));
const json = async (path) => JSON.parse(await bytes(path));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const exact = (rows, ref, idKey = 'id', versionKey = 'version') => {
  const matches = rows.filter((row) => row[idKey] === ref.id && row[versionKey] === ref.version);
  assert.equal(matches.length, 1, `exact ${ref.id}@${ref.version}`);
  return matches[0];
};

test('four additional starts select exact approved spatial closure without operational authority', async () => {
  const candidate = await json(candidatePath);
  assert.equal(candidate.schema, 'rus.live_world_runtime.additional_starts_authoring_candidate.v1');
  assert.equal(candidate.status, 'pending_independent_data_approval');
  for (const field of ['approved', 'import_authorized', 'activation_authorized']) assert.equal(candidate[field], false);
  assert.equal(candidate.approval_request.approval_attestation, null);
  assert.equal(candidate.runtime_readiness.status, 'blocked');
  assert.equal(candidate.starts.length, 4);
  assert.equal(new Set(candidate.starts.map((start) => start.scenario_id)).size, 4);
  assert.deepEqual(candidate.starts.filter((start) => start.place_family).map((start) =>
    [start.place_family.kind, start.place_family.g3_class_id]), [
    ['economic_resource_site_approach', 'spatial.g3.resource_site'],
    ['human_settlement_approach', 'spatial.g3.settlement']
  ]);

  for (const pin of candidate.source_pins) assert.equal(sha256(await bytes(pin.path)), pin.sha256, pin.path);
  const expansionPath = candidate.source_pins.find((pin) => pin.path.endsWith('/import-manifest.json')).path;
  const expansion = await json(expansionPath);
  assert.equal(expansion.world_revision_id, candidate.world_revision_id);
  const dataset = async (table) => {
    const [entry] = expansion.datasets.filter((row) => row.table === table);
    assert.ok(entry, table);
    const data = await bytes(`${dirname(expansionPath).replaceAll('\\', '/')}/${entry.file}`);
    assert.equal(sha256(data), entry.sha256, table);
    return JSON.parse(data);
  };
  const [nodes, parents, entries, expansionProfiles, sceneProfiles, sceneCandidates,
    scenes, endpoints, positions, revisions] = await Promise.all([
    'spatial_v3_nodes', 'spatial_v3_node_parents', 'spatial_v3_g4_entry_endpoint_bindings',
    'spatial_v3_g4_expansion_profiles', 'spatial_v3_scene_materialization_profiles',
    'spatial_v3_scene_materialization_candidates', 'spatial_v3_scene_templates',
    'spatial_v3_scene_endpoint_slots', 'spatial_v3_scene_position_templates', 'spatial_v3_world_revisions'
  ].map(dataset));
  const revision = revisions.filter((row) => row.id === candidate.world_revision_id);
  assert.equal(revision.length, 1);
  assert.equal(revision[0].status, 'approved');
  assert.equal(revision[0].catalog_digest, candidate.world_catalog_digest);
  for (const [suffix, ref] of [
    ['/calendar_daylight_light_profiles.json', candidate.shared_initial_inputs.calendar_record_ref],
    ['/weather_transition_profiles_processes.json', candidate.shared_initial_inputs.weather_record_ref]
  ]) {
    const source = await json(candidate.source_pins.find((pin) => pin.path.endsWith(suffix)).path);
    assert.equal(source.filter((row) => row.record_id === ref.id && Number(row.version) === ref.version).length, 1);
  }
  const natural = await json(candidate.source_pins.find((pin) => pin.path.endsWith('/m2c-natural/candidate.json')).path);
  const placement = await json(candidate.source_pins.find((pin) => pin.path.endsWith('/m2c-natural-placement/candidate.json')).path);
  const roleRows = (await bytes(candidate.source_pins.find((pin) => pin.path.endsWith('social_roles_v1_enriched.tsv')).path)).toString('utf8').trim().split(/\r?\n/u);
  const occupationRows = (await bytes(candidate.source_pins.find((pin) => pin.path.endsWith('occupations_v1_enriched.tsv')).path)).toString('utf8').trim().split(/\r?\n/u);
  const sourceClothing = await json(candidate.source_pins.find((pin) => pin.path.endsWith('/m2c-npc/runtime-bindings.json')).path);
  const attributes = (await json(candidate.source_pins.find((pin) => pin.path.endsWith('/actor-base-attributes-v1/candidate.json')).path)).profile;
  assert.equal(attributes.profile_id, candidate.shared_initial_inputs.attribute_profile_ref.id);
  assert.equal(attributes.version, candidate.shared_initial_inputs.attribute_profile_ref.version);
  const sourcePlayer = (await json(candidate.source_pins.find((pin) => pin.path.endsWith('/first-playable-v1/catalog.json')).path)).character_candidate_sets.player_boatman;
  const sourceNames = sourcePlayer.name_candidates;
  const body = sourcePlayer.body_profile_candidates[0];
  assert.equal(body.profile_id, candidate.shared_initial_inputs.body_profile_ref.id);
  assert.deepEqual(body.active_conditions, []);
  const clothing = sourceClothing.clothing_profiles.find((row) => row.id === candidate.shared_initial_inputs.clothing_profile_ref.id);
  const variant = clothing.variants.find((row) => row.id === candidate.shared_initial_inputs.clothing_profile_ref.variant_id);
  assert.ok(variant.seasons.includes('summer'));

  for (const start of candidate.starts) {
    const at = start.initial_placement;
    assert.equal(start.public_metadata.available, false);
    assert.equal(start.authored_premise.historical_event_claim, false);
    assert.equal(start.authored_premise.new_historical_site_claim, false);
    assert.deepEqual(start.authored_premise.player_known_facts, []);
    assert.equal(at.mode, 'canonical_g4_entry_initial_state');
    assert.equal(at.placement_cause, 'authored_initial_state');
    assert.equal(at.travel_time, null);
    assert.equal('initial_perception_rule' in start, false);
    assert.equal(exact(nodes, at.g4_ref).spatial_level, 'G4');
    assert.equal(exact(nodes, at.canonical_g5_ref).spatial_level, 'G5');
    if (start.place_family) {
      const g3 = exact(nodes, start.place_family.g3_ref);
      assert.equal(g3.primary_class_id, start.place_family.g3_class_id);
      assert.equal(g3.status, 'approved');
      const g4Parent = exact(parents, at.g4_ref, 'child_id', 'child_version');
      assert.equal(g4Parent.parent_id, g3.id);
      assert.equal(g4Parent.parent_version, g3.version);
      assert.equal(at.scene_template_ref.id, 'stfv3__g5_route_approach_v1');
    }
    const parent = exact(parents, at.canonical_g5_ref, 'child_id', 'child_version');
    assert.equal(parent.parent_id, at.g4_ref.id);
    assert.equal(parent.parent_version, at.g4_ref.version);
    assert.equal(parent.world_revision_id, candidate.world_revision_id);
    const entry = exact(entries, at.entry_binding_ref);
    assert.equal(entry.status, 'approved');
    assert.equal(entry.g4_id, at.g4_ref.id);
    assert.equal(entry.g4_version, at.g4_ref.version);
    assert.equal(entry.canonical_g5_id, at.canonical_g5_ref.id);
    assert.equal(entry.canonical_g5_version, at.canonical_g5_ref.version);
    assert.equal(entry.arrival_scene_endpoint_slot_key, at.scene_endpoint_slot_key);
    const expansionProfile = exact(expansionProfiles, start.expansion_profile_ref);
    assert.equal(expansionProfile.g4_id, at.g4_ref.id);
    assert.equal(expansionProfile.world_revision_id, candidate.world_revision_id);
    const sceneProfile = exact(sceneProfiles, at.scene_materialization_profile_ref);
    assert.equal(sceneProfile.source_entity_id, at.canonical_g5_ref.id);
    const selectedScenes = sceneCandidates.filter((row) => row.profile_id === sceneProfile.id && row.profile_version === sceneProfile.version);
    assert.equal(selectedScenes.length, 1);
    assert.equal(selectedScenes[0].scene_template_id, at.scene_template_ref.id);
    assert.equal(selectedScenes[0].scene_template_version, at.scene_template_ref.version);
    exact(scenes, at.scene_template_ref);
    const endpoint = endpoints.filter((row) => row.scene_template_id === at.scene_template_ref.id
      && row.scene_template_version === at.scene_template_ref.version && row.slot_key === at.scene_endpoint_slot_key);
    assert.equal(endpoint.length, 1);
    assert.equal(endpoint[0].required_position_slot_key, at.position_slot_key);
    assert.equal(endpoint[0].required_position_instance_ordinal, at.position_instance_ordinal);
    const position = positions.filter((row) => row.scene_template_id === at.scene_template_ref.id
      && row.scene_template_version === at.scene_template_ref.version && row.position_slot_key === at.position_slot_key);
    assert.equal(position.length, 1);
    assert.ok(position[0].instance_count > at.position_instance_ordinal);
    const naturalProfile = natural.natural_profiles.filter((row) => row.profile_id === start.natural_profile_ref.id
      && row.profile_version === start.natural_profile_ref.version);
    assert.equal(naturalProfile.length, 1);
    assert.equal(naturalProfile[0].g4_ref.id, at.g4_ref.id);
    assert.equal(naturalProfile[0].template_refs.landscape_template_id, start.landscape_template_id);
    const naturalPlacement = exact(placement.placements, start.natural_placement_ref);
    assert.equal(naturalPlacement.g4_ref.id, at.g4_ref.id);
    assert.equal(naturalPlacement.natural_profile_ref.id, start.natural_profile_ref.id);
    assert.equal(naturalPlacement.scene_template_ref.id, at.scene_template_ref.id);
    assert.equal(naturalPlacement.source_endpoint_slot_key, at.scene_endpoint_slot_key);
    assert.equal(naturalPlacement.required_position_slot_key, at.position_slot_key);
    const { player_inputs: player } = start;
    const tsvRow = (lines, id) => {
      const matches = lines.slice(1).map((line) => line.split('\t')).filter((fields) => fields[0] === id);
      assert.equal(matches.length, 1, id);
      return Object.fromEntries(lines[0].split('\t').map((key, index) => [key, matches[0][index]]));
    };
    assert.equal(tsvRow(roleRows, player.role_ref).status, 'approved');
    const occupation = tsvRow(occupationRows, player.occupation_ref);
    assert.equal(occupation.status, 'approved');
    assert.ok(occupation.allowed_social_role_ids.split('; ').includes(player.role_ref));
    assert.ok(attributes.occupation_archetype_priorities.some((row) => row.occupation_archetype_id === player.occupation_archetype_id));
    assert.ok(clothing.allowed_role_refs.includes(player.role_ref));
    assert.ok(clothing.allowed_occupation_refs.includes(player.occupation_ref));
    assert.ok(variant.sex_categories.includes(player.sex_category));
    assert.ok(variant.age_categories.includes(player.age_category));
    assert.ok(sourceNames.some((row) => row.name_id === player.name.source_name_id && row.display_name === player.name.display_name));
  }
});
