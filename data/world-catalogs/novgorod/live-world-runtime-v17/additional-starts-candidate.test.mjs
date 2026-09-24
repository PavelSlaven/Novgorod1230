import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { buildManifest } from '../../../../scripts/generate-target-starts-manifest-v1.mjs';
import { buildStartArtifacts } from '../../../../scripts/generate-additional-start-artifacts-v1.mjs';
import { TRACE_SKILL_IDS } from '../../../../packages/new-game/src/stages/stage-11-player-character/trace-policy.js';
import { loadTargetAuthoredStartProfile } from '../../../../apps/game-server/src/internal/live-world-authored-starts.js';

const root = resolve(import.meta.dirname, '../../../..');
const candidatePath = 'data/world-catalogs/novgorod/live-world-runtime-v17/additional-starts-candidate.json';
const manifestPath = 'data/world-catalogs/novgorod/live-world-runtime-v17/target-starts-manifest.v1.candidate.json';
const bytes = (path) => readFile(resolve(root, path));
const json = async (path) => JSON.parse(await bytes(path));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const exact = (rows, ref, idKey = 'id', versionKey = 'version') => {
  const matches = rows.filter((row) => row[idKey] === ref.id && row[versionKey] === ref.version);
  assert.equal(matches.length, 1, `exact ${ref.id}@${ref.version}`);
  return matches[0];
};

test('inactive manifest pins the original and six additional starts', async () => {
  const manifest = await json(manifestPath);
  assert.deepEqual(manifest, await buildManifest());
  assert.equal(manifest.status, 'candidate');
  assert.equal(manifest.activation_authorized, false);
  assert.equal(manifest.starts.length, 7);
  assert.equal(new Set(manifest.starts.map((start) => start.scenario_id)).size, 7);
  assert.equal(manifest.starts[0].scenario_id, 'novgorod_pine_ridge_approach_v1');
});

test('nonforest starts require both exact independently approved scopes', async () => {
  const manifest = await json(manifestPath);
  for (const artifacts of manifest.starts.filter(({ scenario_id }) =>
    ['novgorod_riverbank_approach_v1', 'novgorod_reed_backwater_entrance_v1',
      'novgorod_zaostrovye_settlement_approach_v1'].includes(scenario_id))) {
    await assert.rejects(loadTargetAuthoredStartProfile({ rootDir: root, artifacts }),
      { code: 'SPATIAL_V3_TARGET_START_RUNTIME_PIN_REQUIRED' });
  }
});

test('six exact starts have deterministic pins and scoped approvals', async () => {
  const candidate = await json(candidatePath);
  const manifest = await json(manifestPath);
  const { files, artifacts } = await buildStartArtifacts();
  assert.equal(files.size, 25); // Six starts, transfers, bases and approvals; one review candidate.
  for (const [path, expected] of files) assert.deepEqual(await bytes(path), expected, path);
  for (const artifact of artifacts) {
    const source = candidate.starts.find(({ scenario_id }) => scenario_id === artifact.scenario_id);
    const entry = manifest.starts.find(({ scenario_id }) => scenario_id === artifact.scenario_id);
    assert.equal(source.initial_placement.canonical_g5_ref.id, artifact.canonical_g5_ref.id);
    assert.deepEqual(entry, { binding_revision: candidate.starts.indexOf(source) + 2, ...artifact });
    for (const kind of ['start', 'transfer', 'basis', 'approval']) {
      if (!artifact[kind]) continue;
      assert.equal(sha256(await bytes(artifact[kind].path)), artifact[kind].sha256, `${artifact.scenario_id}:${kind}`);
    }
    const start = await json(artifact.start.path);
    const transfer = await json(artifact.transfer.path);
    assert.equal(start.initial_placement.canonical_g5_ref.id, source.initial_placement.canonical_g5_ref.id);
    assert.equal(start.initial_placement.scene_template_ref.id, source.initial_placement.scene_template_ref.id);
    assert.equal(Object.hasOwn(start, 'initial_perception_rule'), false);
    assert.equal(transfer.attribute_transfer.occupation_archetype_id,
      source.player_inputs.occupation_archetype_id);
    if (source.player_inputs.occupation_ref === 'nov_occ_forest_worker') {
      assert.ok(artifact.basis && artifact.approval);
      const basis = await json(artifact.basis.path);
      assert.equal(basis.skills.source_context,
        'data/novgorod-region/novgorod_occupations_v1_enriched.tsv#nov_occ_forest_worker');
      assert.equal(basis.target_start.player_transfer_sha256, artifact.transfer.sha256);
      const approval = await json(artifact.approval.path);
      assert.equal(approval.target_start_proposal_approval.candidate_sha256, artifact.start.sha256);
      assert.equal(approval.target_player_transfer_approval.candidate_sha256, artifact.transfer.sha256);
      assert.equal(approval.target_player_basis_approval.candidate_sha256, artifact.basis.sha256);
    } else {
      assert.ok(artifact.basis && artifact.approval);
      const approval = await json(artifact.approval.path);
      assert.equal(approval.target_player_basis_approval.candidate_sha256, artifact.basis.sha256);
      assert.equal(approval.decision, 'DERIVED_FROM_APPROVED_SCOPES');
      assert.equal(approval.target_player_transfer_approval.candidate_sha256, artifact.transfer.sha256);
      assert.equal(approval.target_start_proposal_approval.candidate_sha256, artifact.start.sha256);
      for (const key of ['basis_approval', 'applicability_approval']) {
        assert.equal(sha256(await bytes(approval[key].path)), approval[key].sha256);
      }
      assert.equal(transfer.requested_approval_scope[1].includes('forest_hunting'), false);
      assert.ok(transfer.requested_approval_scope[1].includes(source.player_inputs.occupation_archetype_id));
    }
  }
  const review = await json('data/world-catalogs/novgorod/live-world-runtime-v17/additional-start-artifacts/nonforest-basis-review-candidate.json');
  assert.equal(review.status, 'pending_independent_data_approval');
  assert.deepEqual(review.starts.map(({ scenario_id }) => scenario_id), candidate.starts
    .filter(({ player_inputs }) => player_inputs.occupation_ref !== 'nov_occ_forest_worker')
    .map(({ scenario_id }) => scenario_id));
  for (const start of review.starts) {
    assert.equal(sha256(await bytes(start.basis.path)), start.basis.sha256);
    const basis = await json(start.basis.path);
    assert.equal(basis.target_start.sha256, start.start.sha256);
    assert.equal(basis.target_start.player_transfer_sha256, start.transfer.sha256);
    assert.equal(basis.skills.source_context, `data/world-base-seeds/occupation_skill_defaults_v1.csv#${start.occupation_archetype_id}`);
    assert.equal(basis.skills.source_context_sha256, review.source_pins[0].sha256);
    assert.deepEqual(Object.keys(basis.skills.values), TRACE_SKILL_IDS);
    assert.deepEqual(Object.entries(basis.skills.values).filter(([, value]) => value.bonus > 0)
      .map(([skill, value]) => [skill, value.level, value.bonus]), [['survival', 'skilled', 2]]);
    assert.equal(basis.skills.values.riding.bonus, 0);
    assert.match(basis.skills.limits, /player_watercraft_skill_missing/);
    assert.equal(basis.approval_request.approval_attestation, null);
  }
});

test('six additional starts select exact approved spatial closure without operational authority', async () => {
  const candidate = await json(candidatePath);
  assert.equal(candidate.schema, 'rus.live_world_runtime.additional_starts_authoring_candidate.v1');
  assert.equal(candidate.status, 'pending_independent_data_approval');
  for (const field of ['approved', 'import_authorized', 'activation_authorized']) assert.equal(candidate[field], false);
  assert.equal(candidate.approval_request.approval_attestation, null);
  assert.equal(candidate.runtime_readiness.status, 'blocked');
  assert.equal(candidate.starts.length, 6);
  assert.equal(new Set(candidate.starts.map((start) => start.scenario_id)).size, 6);
  assert.deepEqual(candidate.starts.filter((start) => start.place_family).map((start) =>
    [start.place_family.kind, start.place_family.g3_class_id]), [
    ['economic_resource_site_approach', 'spatial.g3.resource_site'],
    ['human_settlement_approach', 'spatial.g3.settlement'],
    ['working_economic_space', 'spatial.g3.recurrent_site'],
    ['other_human_habitation_space', 'spatial.g3.recurrent_site']
  ]);

  for (const pin of candidate.source_pins) assert.equal(sha256(await bytes(pin.path)), pin.sha256, pin.path);
  const expansionPath = candidate.source_pins.find((pin) => pin.path.endsWith('/import-manifest.json')).path;
  const expansion = await json(expansionPath);
  const authoring = await json(candidate.source_pins.find((pin) => pin.path.endsWith('/authoring-evidence.json')).path);
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
    assert.ok(['canonical_g4_entry_initial_state', 'canonical_g5_initial_state'].includes(at.mode));
    assert.equal(at.placement_cause, 'authored_initial_state');
    assert.equal(at.travel_time, null);
    assert.equal('initial_perception_rule' in start, false);
    const g4 = exact(nodes, at.g4_ref);
    const g5 = exact(nodes, at.canonical_g5_ref);
    assert.equal(g4.spatial_level, 'G4');
    assert.equal(g5.spatial_level, 'G5');
    assert.equal(g4.status, 'approved');
    assert.equal(g5.status, 'approved');
    assert.equal(g4.world_revision_id, candidate.world_revision_id);
    assert.equal(g5.world_revision_id, candidate.world_revision_id);
    if (start.place_family) {
      const g3 = exact(nodes, start.place_family.g3_ref);
      assert.equal(g3.primary_class_id, start.place_family.g3_class_id);
      assert.equal(g3.status, 'approved');
      const g4Parent = exact(parents, at.g4_ref, 'child_id', 'child_version');
      assert.equal(g4Parent.parent_id, g3.id);
      assert.equal(g4Parent.parent_version, g3.version);
      if (at.mode === 'canonical_g4_entry_initial_state') {
        assert.equal(at.scene_template_ref.id, 'stfv3__g5_route_approach_v1');
      } else {
        assert.equal(start.place_family.land_use, 'recurrent_settlement_use');
        assert.ok(authoring.families.some((family) => family.family_id === 'm2c_g5_settlement_landscape__recurrent_settlement_use__vikhtuy_locality'
          && family.land_use === start.place_family.land_use));
        assert.equal(at.scene_template_ref.id, start.place_family.kind === 'working_economic_space'
          ? 'stfv3__g5_work_storage_social_v1' : 'stfv3__g5_habitation_v1');
      }
    }
    const parent = exact(parents, at.canonical_g5_ref, 'child_id', 'child_version');
    assert.equal(parent.parent_id, at.g4_ref.id);
    assert.equal(parent.parent_version, at.g4_ref.version);
    assert.equal(parent.world_revision_id, candidate.world_revision_id);
    if (at.mode === 'canonical_g4_entry_initial_state') {
      const entry = exact(entries, at.entry_binding_ref);
      assert.equal(entry.status, 'approved');
      assert.equal(entry.g4_id, at.g4_ref.id);
      assert.equal(entry.g4_version, at.g4_ref.version);
      assert.equal(entry.canonical_g5_id, at.canonical_g5_ref.id);
      assert.equal(entry.canonical_g5_version, at.canonical_g5_ref.version);
      assert.equal(entry.arrival_scene_endpoint_slot_key, at.scene_endpoint_slot_key);
    } else {
      assert.equal('entry_binding_ref' in at, false);
    }
    const expansionProfile = exact(expansionProfiles, start.expansion_profile_ref);
    assert.equal(expansionProfile.g4_id, at.g4_ref.id);
    assert.equal(expansionProfile.world_revision_id, candidate.world_revision_id);
    const sceneProfile = exact(sceneProfiles, at.scene_materialization_profile_ref);
    assert.equal(sceneProfile.source_entity_id, at.canonical_g5_ref.id);
    assert.equal(sceneProfile.source_kind, 'canonical_g5');
    assert.equal(sceneProfile.status, 'approved');
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
