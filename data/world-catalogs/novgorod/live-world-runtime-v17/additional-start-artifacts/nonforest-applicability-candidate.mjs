import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../../../..');
const base = 'data/world-catalogs/novgorod/live-world-runtime-v17';
const dir = `${base}/additional-start-artifacts`;
const output = `${dir}/nonforest-applicability-candidate-v1.json`;
const read = (path) => readFile(resolve(root, path));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pin = async (path) => ({ path, sha256: sha256(await read(path)) });
const json = async (path) => JSON.parse(await read(path));

const forestTransferPath = `${base}/player-transfer-candidate.json`;
const forestApprovalPath = 'data/world-catalogs/novgorod/m2c-expansion-repin-data-approval.json';
const bodyPath = 'data/world-catalogs/novgorod/first-playable-v1/catalog.json';
const attributesPath = 'data/world-catalogs/novgorod/procedural-scene-v2/actor-base-attributes-v1/candidate.json';
const attributesApprovalPath = 'data/world-catalogs/novgorod/procedural-scene-v2/actor-base-attributes-v1/authoring-approval-attestation.json';
const clothingPath = 'data/world-catalogs/novgorod/m2c-npc/runtime-bindings.json';
const clothingApprovalPath = 'data/world-catalogs/novgorod/m2c-sol-data-approval.json';
const ids = [
  'novgorod_riverbank_approach_v1',
  'novgorod_reed_backwater_entrance_v1',
  'novgorod_zaostrovye_settlement_approach_v1'
];

export async function buildCandidate() {
  const [forest, forestApproval, body, attributes, attributesApproval, clothing, clothingApproval] = await Promise.all([
    json(forestTransferPath), json(forestApprovalPath), json(bodyPath), json(attributesPath),
    json(attributesApprovalPath), json(clothingPath), json(clothingApprovalPath)
  ]);
  assert.equal(forestApproval.target_player_transfer_approval.candidate_sha256, (await pin(forestTransferPath)).sha256);
  assert.equal(attributesApproval.approved_scope.profile_id, forest.attribute_transfer.profile_ref.id);
  assert.equal(attributes.profile_digest, forest.attribute_transfer.profile_ref.digest);
  assert.equal(attributesApproval.profile_digest, attributes.profile_digest);
  assert.ok(attributesApproval.approved_scope.occupation_archetype_ids.includes('fishing_water'));
  assert.ok(attributesApproval.approved_scope.occupation_archetype_ids.includes('transport_guiding'));
  assert.equal(clothingApproval.npc_runtime_raw_approval?.candidate_sha256, (await pin(clothingPath)).sha256);
  const bodyProfile = body.character_candidate_sets.player_boatman.body_profile_candidates[0];
  assert.equal(bodyProfile.profile_id, forest.body_transfer.profile_id);
  assert.deepEqual(bodyProfile.metrics, forest.body_transfer.metrics);
  assert.deepEqual(bodyProfile.active_conditions, forest.body_transfer.active_conditions);
  const profile = clothing.clothing_profiles.find((item) => item.id === forest.clothing_transfer.source_profile_id);
  assert.ok(profile);
  const variant = profile.variants.find((item) => item.id === forest.clothing_transfer.source_variant_id);
  assert.ok(variant);
  const sourcePins = await Promise.all([
    forestTransferPath, forestApprovalPath, bodyPath, attributesPath, attributesApprovalPath,
    clothingPath, clothingApprovalPath, `${dir}/nonforest-basis-data-approval.json`
  ].map(pin));
  const starts = [];
  for (const id of ids) {
    const startPath = `${dir}/${id}.start.json`;
    const transferPath = `${dir}/${id}.transfer.json`;
    const [start, transfer] = await Promise.all([json(startPath), json(transferPath)]);
    assert.equal(transfer.target_start.sha256, (await pin(startPath)).sha256);
    assert.equal(start.scenario_id, id);
    assert.equal(start.world_pin.world_revision_id, profile.world_revision_id);
    assert.equal(start.initial_environment_inputs.calendar_date.month, 7);
    assert.equal(transfer.applicability.scenario_id, id);
    assert.equal(start.player_inputs.role_ref, transfer.applicability.role_ref);
    assert.equal(start.player_inputs.occupation_ref, transfer.applicability.occupation_ref);
    assert.equal(start.player_inputs.sex_category, transfer.applicability.sex_category);
    assert.equal(start.player_inputs.age_category, transfer.applicability.age_category);
    assert.equal(transfer.applicability.sex_category, forest.applicability.sex_category);
    assert.equal(transfer.applicability.age_category, forest.applicability.age_category);
    assert.ok(profile.allowed_role_refs.includes(transfer.applicability.role_ref));
    assert.ok(profile.allowed_occupation_refs.includes(transfer.applicability.occupation_ref));
    const npc = clothing.profiles.find((item) => item.role_ref === transfer.applicability.role_ref &&
      item.occupation_ref === transfer.applicability.occupation_ref);
    assert.ok(npc);
    assert.ok(npc.required_clothing_variant_requirements.some((item) =>
      item.variant_ref === variant.id && item.seasons.includes(transfer.applicability.season) &&
      item.sex_categories.includes(transfer.applicability.sex_category) &&
      item.age_categories.includes(transfer.applicability.age_category)));
    assert.ok(variant.seasons.includes(transfer.applicability.season));
    assert.ok(variant.sex_categories.includes(transfer.applicability.sex_category));
    assert.ok(variant.age_categories.includes(transfer.applicability.age_category));
    assert.ok(attributesApproval.approved_scope.occupation_archetype_ids.includes(transfer.attribute_transfer.occupation_archetype_id));
    assert.ok(attributes.profile.occupation_archetype_priorities.some((item) =>
      item.occupation_archetype_id === transfer.attribute_transfer.occupation_archetype_id));
    assert.deepEqual(transfer.body_transfer, forest.body_transfer);
    assert.deepEqual({ ...transfer.attribute_transfer, occupation_archetype_id: 'forest_hunting' }, forest.attribute_transfer);
    assert.deepEqual(transfer.clothing_transfer, forest.clothing_transfer);
    assert.deepEqual(variant.equipment_templates.map(({ item_template_ref, item_profile_entry_ref,
      quantity_profile_ref, inventory_profile_ref, visual_profile_ref, equipment_slot_category_id }) => ({
      item_template_ref, item_profile_entry_ref, quantity_profile_ref, inventory_profile_ref,
      visual_profile_ref, equipment_slot_category_id
    })), transfer.clothing_transfer.equipment_entries);
    starts.push({ scenario_id: id, role_ref: transfer.applicability.role_ref,
      occupation_ref: transfer.applicability.occupation_ref,
      occupation_archetype_id: transfer.attribute_transfer.occupation_archetype_id,
      start: await pin(startPath), transfer: await pin(transferPath),
      applicability: {
        sex_category: transfer.applicability.sex_category,
        age_category: transfer.applicability.age_category,
        season: transfer.applicability.season,
        body_transfer: transfer.body_transfer,
        attribute_transfer: transfer.attribute_transfer,
        clothing_transfer: transfer.clothing_transfer
      } });
  }
  return Buffer.from(`${JSON.stringify({
    schema: 'rus.m2c_additional_start_nonforest_applicability_candidate.v1',
    version: 1,
    status: 'pending_independent_data_approval',
    review_scope: 'One independent Sol high data review for exact new-player body, attribute and clothing applicability in all three starts.',
    source_pins: sourcePins,
    source_evidence: {
      body_profile_pointer: '/character_candidate_sets/player_boatman/body_profile_candidates/0',
      body_profile: bodyProfile,
      attribute_profile_ref: forest.attribute_transfer.profile_ref,
      approved_occupation_archetypes: ['fishing_water', 'transport_guiding'],
      clothing_profile_id: profile.id,
      clothing_variant_id: variant.id,
      clothing_variant: variant
    },
    starts,
    exclusions: 'No skill, watercraft, boat, fishing equipment, NPC instance, old-save mutation, runtime import or activation approval.',
    import_authorized: false,
    activation_authorized: false
  }, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const bytes = await buildCandidate();
  if (process.argv.includes('--check')) assert.deepEqual(await read(output), bytes);
  else await writeFile(resolve(root, output), bytes);
}
