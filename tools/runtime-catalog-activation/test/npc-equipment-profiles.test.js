import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { generateNpcEquipmentProfiles,
  validateNpcEquipmentProfileCandidate } from
  '../../../scripts/generate-npc-equipment-profiles.mjs';

const root = new URL('../../../', import.meta.url).pathname.replace(/^\/(.:)/u,
  '$1');
const output =
  'data/world-catalogs/novgorod/procedural-scene-v2/npc-equipment-v1';
const v5 = 'data/knowledge-source/imports/item-container-120-v5/candidate';

test('NPC equipment candidate and request are byte-stable and non-executable',
  async () => {
    const first = await generateNpcEquipmentProfiles(root);
    const second = await generateNpcEquipmentProfiles(root);
    assert.deepEqual(first, second);
    assert.equal(await readFile(`${root}/${output}/candidate.json`, 'utf8'),
      `${JSON.stringify(first.candidate, null, 2)}\n`);
    assert.equal(await readFile(`${root}/${output}/approval-request.json`, 'utf8'),
      `${JSON.stringify(first.approvalRequest, null, 2)}\n`);
    for (const value of [first.candidate, first.approvalRequest]) {
      assert.equal(value.import_authorized, false);
      assert.equal(value.activation_authorized, false);
      assert.equal(value.activation_request, null);
    }
    assert.equal(first.candidate.runtime_instances_created, false);
    assert.equal(first.candidate.authoring_approval,
      'pending_independent_review');
    assert.doesNotMatch(JSON.stringify(first.candidate),
      /"(?:display_name|name|personality)"\s*:/u);
  });

test('two levels preserve exact clothing, mechanics and property basis',
  async () => {
    const { candidate } = await generateNpcEquipmentProfiles(root);
    assert.deepEqual(candidate.profile_levels,
      ['social_basic_clothing', 'occupation_equipment']);
    const clothing = candidate.social_clothing_profiles[0];
    assert.deepEqual(clothing.required_slots,
      ['base_garment', 'outer_garment']);
    assert.deepEqual(clothing.applicability.sex, ['male']);
    assert.deepEqual(clothing.entries.map(({ item_template_ref: id }) => id), [
      'item_tpl_nov_linen_shirt_v1',
      'item_tpl_nov_wool_outer_garment_v1'
    ]);
    assert.ok(clothing.entries.every((entry) =>
      entry.effective_status === 'approved_by_exact_promotion'
        && entry.quantity_profile_ref && entry.inventory_profile_ref
        && entry.source_binding_refs.length === 4));
    assert.equal(clothing.property_basis.assignment_at_authoring, false);
    assert.deepEqual(clothing.property_basis.access_policy,
      { version: 1, mode: 'explicit_owner_holder_controller',
        context_domain: 'household_personal' });
    assert.ok(clothing.typed_gaps.some(({ code, status }) =>
      code === 'FOOTWEAR_SLOT_NOT_ACTIVE' && status === 'not_applicable'));
    assert.ok(clothing.entries.every(({ item_template_ref: id }) =>
      !clothing.excluded_expensive_or_status_items.includes(id)));
  });

test('fisher gets one activity-bound tool; boatman stays bounded', async () => {
  const { candidate } = await generateNpcEquipmentProfiles(root);
  const fisher = candidate.occupation_equipment_profiles.find(({ applicability }) =>
    applicability.occupation_ref === 'nov_occ_fisher');
  assert.equal(fisher.tools.length, 1);
  assert.equal(fisher.tools[0].item_template_ref,
    'item_tpl_nov_fishing_net_v1');
  assert.equal(fisher.tools[0].activity_profile_ref,
    'activity_assist_fishing_net_v1');
  assert.equal(fisher.tools[0].activity_support.completion_model,
    'fixed_exact');
  assert.equal(fisher.containers.length, 1);
  assert.equal(fisher.containers[0].compatibility, 'allowed');
  assert.equal(fisher.containers[0].count, null);
  const boatman = candidate.occupation_equipment_profiles.find(
    ({ applicability }) => applicability.occupation_ref === 'nov_occ_boatman');
  assert.deepEqual(boatman.tools.map(({ item_template_ref: id }) => id),
    ['item_tpl_nov_rope_v1']);
  assert.equal(boatman.tools[0].activity_profile_ref, null);
  assert.equal(boatman.containers.length, 0);
  assert.ok(boatman.typed_gaps.some(({ code, status }) =>
    code === 'BOATMAN_CONTAINER_COMPATIBILITY_NOT_APPLICABLE'
      && status === 'not_applicable'));
});

test('display-title changes cannot affect profile selection', async () => {
  const path = `${v5}/tables/item_templates.json`;
  const templates = await readJson(path);
  const baseline = await generateNpcEquipmentProfiles(root);
  const renamed = templates.map((row) => ({ ...row,
    title: `renamed:${row.id}` }));
  assert.deepEqual(await generateNpcEquipmentProfiles(root, { [path]: renamed }),
    baseline);
});

test('missing tool, ambiguity and source mismatch fail closed', async () => {
  const authoringPath = `${output}/authoring-rows.json`;
  const authoring = await readJson(authoringPath);
  const missing = structuredClone(authoring);
  missing.occupation_equipment_profiles[0].tools = [];
  await assert.rejects(() => generateNpcEquipmentProfiles(root,
    { [authoringPath]: missing }),
  { code: 'NPC_EQUIPMENT_OCCUPATION_TOOL_MISSING' });

  const quantityPath = `${v5}/tables/item_template_quantity_profiles.json`;
  const quantities = await readJson(quantityPath);
  const target = quantities.find(({ item_template_id: id }) =>
    id === 'item_tpl_nov_fishing_net_v1');
  await assert.rejects(() => generateNpcEquipmentProfiles(root,
    { [quantityPath]: [...quantities, { ...target, id: `${target.id}_copy` }] }),
  { code: 'NPC_EQUIPMENT_ITEM_QUANTITY_AMBIGUOUS' });

  const sourcePath = `${v5}/tables/item_template_source_bindings.json`;
  const bindings = await readJson(sourcePath);
  const changed = structuredClone(bindings);
  changed.find(({ item_template_id: id }) =>
    id === 'item_tpl_nov_fishing_net_v1').item_template_id =
      'item_tpl_nov_fish_trap_v1';
  await assert.rejects(() => generateNpcEquipmentProfiles(root,
    { [sourcePath]: changed }),
  { code: 'NPC_EQUIPMENT_SOURCE_MISMATCH' });
});

test('validator rejects unsupported activity and expensive clothing', async () => {
  const { candidate } = await generateNpcEquipmentProfiles(root);
  const unsupported = structuredClone(candidate);
  const requiredTool = unsupported.occupation_equipment_profiles[0].tools[0];
  requiredTool.activity_support = null;
  assert.throws(() => validateNpcEquipmentProfileCandidate(unsupported),
    { code: 'NPC_EQUIPMENT_TOOL_ACTIVITY_UNSUPPORTED' });
  const expensive = structuredClone(candidate);
  expensive.social_clothing_profiles[0].entries[0].item_template_ref =
    'item_tpl_nov_boots_v1';
  assert.throws(() => validateNpcEquipmentProfileCandidate(expensive),
    { code: 'NPC_EQUIPMENT_STATUS_ITEM_FORBIDDEN' });
});

test('pending source rows are excluded', async () => {
  const path = 'data/novgorod-region/novgorod_occupations_v1_enriched.tsv';
  const text = await readFile(`${root}/${path}`, 'utf8');
  const changed = text.replace(/(nov_occ_fisher\t[^\r\n]*\t)approved(\t)/u,
    '$1pending$2');
  assert.notEqual(changed, text);
  await assert.rejects(() => generateNpcEquipmentProfiles(root,
    { [path]: changed }), { code: 'NPC_EQUIPMENT_OCCUPATION_NOT_APPROVED' });
});

test('unseen equivalent occupation uses same generic resolver', async () => {
  const authoringPath = `${output}/authoring-rows.json`;
  const rolePath = 'data/novgorod-region/novgorod_social_roles_v1_enriched.tsv';
  const occupationPath =
    'data/novgorod-region/novgorod_occupations_v1_enriched.tsv';
  const roleMapPath =
    'data/world-base-seeds/novgorod_role_position_map_v1.csv';
  const [authoring, roleText, occupationText, roleMapText] = await Promise.all([
    readJson(authoringPath), readFile(`${root}/${rolePath}`, 'utf8'),
    readFile(`${root}/${occupationPath}`, 'utf8'),
    readFile(`${root}/${roleMapPath}`, 'utf8')
  ]);
  const unseen = structuredClone(authoring.occupation_equipment_profiles[1]);
  unseen.profile_id = 'unseen_transport_equivalent_v1';
  unseen.role_ref = 'nov_role_unseen_transport';
  unseen.occupation_ref = 'nov_occ_unseen_transport';
  authoring.occupation_equipment_profiles.push(unseen);
  const clonedRole = line(roleText, 'nov_role_boatman\t')
    .replaceAll('nov_role_boatman', unseen.role_ref);
  const clonedOccupation = line(occupationText, 'nov_occ_boatman\t')
    .replaceAll('nov_occ_boatman', unseen.occupation_ref)
    .replaceAll('nov_role_boatman', unseen.role_ref);
  const clonedMap = line(roleMapText, 'nov_role_boatman,')
    .replaceAll('nov_role_boatman', unseen.role_ref);
  const { candidate } = await generateNpcEquipmentProfiles(root, {
    [authoringPath]: authoring,
    [rolePath]: `${roleText.trimEnd()}\n${clonedRole}\n`,
    [occupationPath]: `${occupationText.trimEnd()}\n${clonedOccupation}\n`,
    [roleMapPath]: `${roleMapText.trimEnd()}\n${clonedMap}\n`
  });
  assert.ok(candidate.occupation_equipment_profiles.some(({ profile_id: id }) =>
    id === unseen.profile_id));
});

function line(text, prefix) {
  const value = text.split(/\r?\n/u).find((row) => row.startsWith(prefix));
  assert.ok(value, `missing fixture row ${prefix}`);
  return value;
}

async function readJson(relative) {
  return JSON.parse(await readFile(`${root}/${relative}`, 'utf8'));
}
