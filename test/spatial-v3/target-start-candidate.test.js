import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { canonicalDigest, createRandomSource, deriveApprovedInitialEnvironment,
  materializeActorBaseAppearance } from '@rus/materialization';
import { compileApprovedActorAppearanceEntries } from '@rus/materialization';

const root = resolve(import.meta.dirname, '../..');
const path = 'data/world-catalogs/novgorod/live-world-runtime-v17/target-start-candidate.json';
const read = async (file) => JSON.parse(await readFile(resolve(root, file), 'utf8'));
const rows = (table) => read(`data/world-catalogs/novgorod/spatial-v3/datasets/${table}.json`);
const exact = (values, ref) => {
  const selected = values.filter(({ id, version }) => id === ref.id && version === ref.version);
  assert.equal(selected.length, 1, `exact reference ${ref.id}@${ref.version}`);
  return selected[0];
};

test('target start sources remain exact and candidate has no operational authority', async () => {
  const candidate = await read(path);
  assert.equal(candidate.status, 'pending_independent_data_approval');
  for (const field of ['approved', 'import_authorized', 'activation_authorized']) {
    assert.equal(candidate[field], false);
  }
  assert.equal(candidate.approval_request.approval_attestation, null);
  assert.equal(candidate.new_game_stage_bindings.item_runtime_pin, null);
  assert.equal(candidate.new_game_stage_bindings.actor_runtime_pin, null);
  assert.equal(candidate.runtime_readiness.typed_gate, 'SPATIAL_V3_TARGET_START_BINDING_REQUIRED');
  const { world_pin: world, player_inputs: player, initial_perception_rule: perception } = candidate;
  const pins = [...candidate.source_catalogs,
    { path: world.manifest_path, sha256: world.manifest_sha256 },
    { path: candidate.expansion_binding.manifest_path, sha256: candidate.expansion_binding.manifest_sha256 },
    { path: player.body_profile_transfer.source_path, sha256: player.body_profile_transfer.source_sha256 },
    { path: player.equipment.candidate_path, sha256: player.equipment.candidate_sha256 },
    perception.placement_candidate];
  for (const pin of pins) {
    const bytes = await readFile(resolve(root, pin.path));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), pin.sha256, pin.path);
  }
  assert.doesNotMatch(candidate.scenario_id, /lower_dvina/u);
  assert.equal(candidate.initial_placement.travel_time, null);
});

test('target start closes the approved G4 entry, canonical G5, template and actual endpoint', async () => {
  const candidate = await read(path);
  const placement = candidate.initial_placement;
  const nodeRows = await rows('spatial_v3_nodes');
  assert.equal(exact(nodeRows, placement.g4_ref).spatial_level, 'G4');
  assert.equal(exact(nodeRows, placement.canonical_g5_ref).spatial_level, 'G5');
  const entry = exact(await rows('spatial_v3_g4_entry_endpoint_bindings'), placement.entry_binding_ref);
  assert.equal(entry.status, 'approved');
  assert.equal(entry.g4_id, placement.g4_ref.id);
  assert.equal(entry.g4_version, placement.g4_ref.version);
  assert.equal(entry.canonical_g5_id, placement.canonical_g5_ref.id);
  assert.equal(entry.canonical_g5_version, placement.canonical_g5_ref.version);
  const profile = exact(await rows('spatial_v3_scene_materialization_profiles'), placement.scene_materialization_profile_ref);
  assert.equal(profile.source_entity_id, placement.canonical_g5_ref.id);
  const sceneCandidates = (await rows('spatial_v3_scene_materialization_candidates'))
    .filter((row) => row.profile_id === profile.id && row.profile_version === profile.version);
  assert.equal(sceneCandidates.length, 1);
  assert.equal(sceneCandidates[0].scene_template_id, placement.scene_template_ref.id);
  assert.equal(sceneCandidates[0].scene_template_version, placement.scene_template_ref.version);
  const scene = exact(await rows('spatial_v3_scene_templates'), placement.scene_template_ref);
  const rule = candidate.initial_perception_rule;
  assert.equal(rule.scene_template_ref.canonical_digest, scene.canonical_digest);
  assert.deepEqual(rule.canonical_g5_ref, placement.canonical_g5_ref);
  assert.deepEqual(rule.g4_ref, placement.g4_ref);
  const endpoints = (await rows('spatial_v3_scene_endpoint_slots')).filter((row) =>
    row.scene_template_id === scene.id && row.scene_template_version === scene.version
    && row.slot_key === placement.scene_endpoint_slot_key);
  assert.equal(endpoints.length, 1);
  assert.equal(endpoints[0].required_position_slot_key, rule.required_position_slot_key);
  assert.equal(endpoints[0].required_position_instance_ordinal, rule.required_position_instance_ordinal);
  const positions = (await rows('spatial_v3_scene_position_templates')).filter((row) =>
    row.scene_template_id === scene.id && row.scene_template_version === scene.version
    && row.position_slot_key === rule.required_position_slot_key);
  assert.equal(positions.length, 1);
  assert.ok(positions[0].instance_count > rule.required_position_instance_ordinal);
  assert.equal(positions[0].g6_scene_slot_key, rule.g6_scene_slot_key);
  const natural = await read(rule.placement_candidate.path);
  const naturalPlacement = exact(natural.placements, rule.placement_candidate.placement_ref);
  assert.equal(naturalPlacement.g4_ref.id, placement.g4_ref.id);
  assert.deepEqual(naturalPlacement.scene_template_ref, rule.scene_template_ref);
  assert.equal(naturalPlacement.source_endpoint_slot_key, rule.source_endpoint_slot_key);
});

test('target initial time uses the existing approved environment owner and compatible summer clothing', async () => {
  const candidate = await read(path);
  const input = candidate.initial_environment_inputs;
  const temporal = 'data/world-catalogs/novgorod/temporal-v4/datasets';
  const record = async (family, ref) => {
    const found = (await read(`${temporal}/${family}.json`)).filter((row) =>
      row.record_id === ref.id && Number(row.version) === ref.version);
    assert.equal(found.length, 1);
    return found[0];
  };
  const environment = deriveApprovedInitialEnvironment({
    calendar_record: await record('calendar_daylight_light_profiles', input.calendar_record_ref),
    weather_record: await record('weather_transition_profiles_processes', input.weather_record_ref),
    calendar_date: input.calendar_date, local_minute_of_day: input.local_minute_of_day,
    random: { nextUint32: () => 0 }
  });
  assert.equal(environment.season, 'summer');
  assert.equal(environment.light_state, 'daylight');
  assert.equal(input.game_timestamp.whole_minutes, String((31 + 28 + 31 + 30 + 31 + 30) * 1440 + 480));
  const equipment = candidate.player_inputs.equipment;
  const clothing = (await read(equipment.candidate_path)).clothing_profiles
    .find(({ id }) => id === equipment.candidate_profile_id);
  assert.equal(clothing.id, equipment.candidate_profile_id);
  const variant = clothing.variants.find(({ id }) => id === equipment.candidate_variant_id);
  assert.ok(variant.seasons.includes(environment.season));
  assert.ok(variant.sex_categories.includes(candidate.player_inputs.sex_category));
  assert.ok(variant.age_categories.includes(candidate.player_inputs.age_category));
  assert.ok(clothing.allowed_role_refs.includes(candidate.player_inputs.role_ref));
  assert.ok(clothing.allowed_occupation_refs.includes(candidate.player_inputs.occupation_ref));
});

test('explicit player transfer matches the approved source metrics, attribute profile and clothing entries', async () => {
  const transfer = await read('data/world-catalogs/novgorod/live-world-runtime-v17/player-transfer-candidate.json');
  for (const source of [transfer.body_transfer, transfer.attribute_transfer, transfer.clothing_transfer]) {
    assert.equal(createHash('sha256').update(await readFile(resolve(root, source.source_path))).digest('hex'), source.source_sha256);
  }
  assert.equal(createHash('sha256').update(await readFile(resolve(root, transfer.target_start.path))).digest('hex'), transfer.target_start.sha256);
  const body = (await read(transfer.body_transfer.source_path)).character_candidate_sets.player_boatman.body_profile_candidates[0];
  assert.equal(body.profile_id, transfer.body_transfer.profile_id);
  assert.deepEqual(body.metrics, transfer.body_transfer.metrics);
  assert.deepEqual(body.active_conditions, transfer.body_transfer.active_conditions);
  const attributes = (await read(transfer.attribute_transfer.source_path)).profile;
  assert.equal(canonicalDigest(attributes), transfer.attribute_transfer.profile_ref.digest);
  assert.ok(attributes.occupation_archetype_priorities.some((row) =>
    row.occupation_archetype_id === transfer.attribute_transfer.occupation_archetype_id));
  const clothing = (await read(transfer.clothing_transfer.source_path)).clothing_profiles
    .find(({ id }) => id === transfer.clothing_transfer.source_profile_id);
  const variant = clothing.variants.find(({ id }) => id === transfer.clothing_transfer.source_variant_id);
  assert.equal(transfer.clothing_transfer.equipment_entries.length, variant.equipment_templates.length);
  for (const entry of transfer.clothing_transfer.equipment_entries) {
    const source = variant.equipment_templates.find((row) => row.item_template_ref === entry.item_template_ref);
    for (const [key, value] of Object.entries(entry)) assert.equal(source[key], value, key);
  }
  const approval = await read(transfer.clothing_transfer.source_approval_path);
  assert.equal(approval.decision, 'APPROVE_DATA_ONLY');
  assert.equal(approval[transfer.clothing_transfer.source_approval_scope].candidate_sha256,
    transfer.clothing_transfer.source_sha256);
  assert.equal(transfer.applicability.actor_kind, 'player_character');
  assert.equal(transfer.approved, false);
  assert.equal(transfer.activation_authorized, false);
});

test('player basis pins source appearance sets and completes an adult male through the existing owner', async () => {
  const basis = await read('data/world-catalogs/novgorod/live-world-runtime-v17/player-basis-candidate.json');
  const sources = {};
  for (const pin of basis.appearance.source_tables) {
    const path = `${basis.appearance.source_directory}/${pin.table}.json`;
    const bytes = await readFile(resolve(root, path));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), pin.sha256);
    sources[pin.table] = JSON.parse(bytes);
  }
  const entries = compileApprovedActorAppearanceEntries({ records: sources,
    demographic_profile_ref: basis.appearance.demographic_profile_ref,
    appearance_profile_ref: basis.appearance.appearance_profile_ref });
  const actor = materializeActorBaseAppearance({ identity: basis.appearance.identity_intent,
    approved_entries: entries, random: createRandomSource({ seed: 73 }), choice_key_prefix: 'player:player' });
  assert.equal(actor.identity.sex_category, 'male');
  assert.equal(actor.identity.age_category, 'adult');
  assert.ok(actor.identity.appearance.hair.color);
  assert.ok(actor.identity.appearance.eyes.color);
  const sourceLanguage = (await read(basis.language.source_path))
    .character_candidate_sets.player_boatman.language_profile_candidates[0];
  for (const [key, value] of Object.entries(sourceLanguage)) assert.deepEqual(basis.language[key], value);
  assert.equal(Object.keys(basis.skills.values).length, 12);
  assert.ok(Object.values(basis.skills.values).every((value) =>
    value.bonus === 1 ? value.level === 'familiar' && value.basis
      : value.bonus === 0 && value.level === 'no_experience' && value.absence_basis));
  assert.equal(basis.activation_authorized, false);
  sources.universal_categories.find((row) => row.id === 'actor.sex_category.male').stable_code = 'invented';
  assert.throws(() => compileApprovedActorAppearanceEntries({ records: sources,
    demographic_profile_ref: basis.appearance.demographic_profile_ref,
    appearance_profile_ref: basis.appearance.appearance_profile_ref }),
  { code: 'ACTOR_APPEARANCE_SOURCE_DATA_GAP' });
});
