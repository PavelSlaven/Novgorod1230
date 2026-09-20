import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { digestValue } from
  '../tools/world-catalog-workflow/src/digest.js';

const OUTPUT_ROOT =
  'data/world-catalogs/novgorod/procedural-scene-v2/npc-equipment-v1';
const V5_ROOT = 'data/knowledge-source/imports/item-container-120-v5/candidate';
const APPROVAL_ROOT =
  'docs/implementation/item-container-120-approval-audit/evidence';
const TARGET_REVISION =
  'world_revision_novgorod_1230_item_container_approved_001';
const REQUIRED_SOURCE_SCOPES = Object.freeze([
  'construction', 'historical_presence', 'material', 'physical_parameter'
]);
const ACTIVE_CLOTHING_SLOTS = Object.freeze([
  'base_garment', 'outer_garment', 'headwear'
]);
const USED_V5_TABLES = Object.freeze([
  'item_templates', 'item_template_inventory_profiles',
  'item_template_quantity_profiles', 'item_profile_sets',
  'item_profile_entries', 'item_template_category_bindings',
  'item_template_source_bindings', 'property_profiles',
  'property_profile_rules', 'container_templates',
  'container_template_inventory_profiles', 'container_template_facet_bindings',
  'container_content_category_relations', 'container_template_source_bindings'
]);

export async function generateNpcEquipmentProfiles(rootDir, overrides = {}) {
  const root = resolve(rootDir);
  const load = async (relative) => overrides[relative]
    ?? JSON.parse(await readFile(resolve(root, relative), 'utf8'));
  const text = async (relative) => overrides[relative]
    ?? readFile(resolve(root, relative), 'utf8');
  const table = (name) => `${V5_ROOT}/tables/${name}.json`;
  const [authoring, manifest, approval, promotion, itemTemplates,
    itemInventory, itemQuantity, itemProfiles, itemEntries, itemCategories,
    itemSources, propertyProfiles, propertyRules, containerTemplates,
    containerInventory, containerFacets, containerRelations, containerSources,
    rolesText, occupationsText, roleMapText, positionsText, classesText,
    activityCatalog] = await Promise.all([
      load(`${OUTPUT_ROOT}/authoring-rows.json`), load(`${V5_ROOT}/manifest.json`),
      load(`${APPROVAL_ROOT}/FINAL_APPROVAL_ATTESTATION.json`),
      load(`${APPROVAL_ROOT}/STAGE3C_PROMOTION_RESULT.json`),
      load(table('item_templates')), load(table('item_template_inventory_profiles')),
      load(table('item_template_quantity_profiles')), load(table('item_profile_sets')),
      load(table('item_profile_entries')), load(table('item_template_category_bindings')),
      load(table('item_template_source_bindings')), load(table('property_profiles')),
      load(table('property_profile_rules')), load(table('container_templates')),
      load(table('container_template_inventory_profiles')),
      load(table('container_template_facet_bindings')),
      load(table('container_content_category_relations')),
      load(table('container_template_source_bindings')),
      text('data/novgorod-region/novgorod_social_roles_v1_enriched.tsv'),
      text('data/novgorod-region/novgorod_occupations_v1_enriched.tsv'),
      text('data/world-base-seeds/novgorod_role_position_map_v1.csv'),
      text('data/world-base-seeds/social_position_archetypes_v1.csv'),
      text('data/world-base-seeds/social_classes_v1.csv'),
      load('data/world-catalogs/novgorod/first-playable-v1/catalog.json')
    ]);
  validatePromotion(manifest, approval, promotion);
  await validateDatasetDigests(root, manifest, overrides);
  const sources = { itemTemplates, itemInventory, itemQuantity, itemProfiles,
    itemEntries, itemCategories, itemSources, propertyProfiles, propertyRules,
    containerTemplates, containerInventory, containerFacets, containerRelations,
    containerSources };
  const roles = parseDelimited(rolesText, '\t');
  const occupations = parseDelimited(occupationsText, '\t');
  const roleMap = parseDelimited(roleMapText, ',');
  const positions = parseDelimited(positionsText, ',');
  const classes = parseDelimited(classesText, ',');
  const roleEvidence = (id) => resolveRole(id,
    { roles, roleMap, positions, classes });

  const socialClothingProfiles = authoring.social_clothing_profiles.map((row) => {
    const roleEvidenceRows = row.role_refs.map(roleEvidence);
    if (roleEvidenceRows.some(({ social_class_ref: socialClass,
      legal_status_ref: legal }) => socialClass !== row.social_class_ref
        || legal !== row.legal_status_ref)) fail('NPC_EQUIPMENT_SOCIAL_SOURCE_MISMATCH',
      row.profile_id);
    const propertyBasis = resolveProperty(row, sources);
    return {
      level: 'social_basic_clothing', profile_id: row.profile_id,
      applicability: {
        role_refs: [...row.role_refs].sort(),
        social_class_ref: row.social_class_ref,
        legal_status_ref: row.legal_status_ref,
        status_band: row.status_band,
        sex: [...row.sex_applicability],
        body_stage: [...row.body_stage_applicability],
        seasons: [...row.season_applicability]
      },
      required_slots: [...row.required_slots],
      property_basis: propertyBasis,
      role_evidence: roleEvidenceRows,
      entries: row.entries.map((entry) => ({
        ...resolveItem(entry, sources), equipment_slot: entry.equipment_slot,
        applicable_seasons: [...entry.applicable_seasons],
        required_seasons: [...entry.required_seasons]
      })),
      excluded_expensive_or_status_items:
        [...row.excluded_expensive_or_status_items],
      typed_gaps: structuredClone(row.typed_gaps)
    };
  });

  const occupationEquipmentProfiles = authoring.occupation_equipment_profiles
    .map((row) => {
      const role = roleEvidence(row.role_ref);
      const occupation = exact(occupations, row.occupation_ref, 'occupation_id',
        'NPC_EQUIPMENT_OCCUPATION');
      if (occupation.status !== 'approved'
          || occupation.mapping_review_status !== 'accepted_with_caution'
          || occupation.occupation_archetype_id !== row.occupation_archetype_ref
          || !splitList(occupation.allowed_social_role_ids).includes(row.role_ref))
        fail('NPC_EQUIPMENT_OCCUPATION_NOT_APPROVED', row.occupation_ref);
      const propertyBasis = resolveProperty(row, sources);
      return {
        level: 'occupation_equipment', profile_id: row.profile_id,
        applicability: { occupation_ref: row.occupation_ref,
          occupation_archetype_ref: row.occupation_archetype_ref,
          role_ref: row.role_ref },
        occupation_evidence: {
          owner: 'approved_occupations', id: occupation.occupation_id,
          status: occupation.status,
          mapping_review_status: occupation.mapping_review_status,
          typical_tools_source_field: 'typical_tools',
          typical_containers_source_field: 'typical_containers'
        },
        role_evidence: role,
        property_basis: propertyBasis,
        tools: row.tools.map((tool) => {
          const item = resolveItem(tool, sources);
          const activity = tool.activity_profile_ref == null ? null
            : exact(activityCatalog.activity_profiles, tool.activity_profile_ref,
              'activity_profile_id', 'NPC_EQUIPMENT_ACTIVITY');
          if (activity && (activity.applicability?.occupation_context
              !== row.occupation_archetype_ref
              || activity.applicability?.required_participant_role !== row.role_ref))
            fail('NPC_EQUIPMENT_TOOL_ACTIVITY_MISMATCH', tool.item_template_ref);
          return { ...item, semantics: tool.semantics,
            activity_profile_ref: tool.activity_profile_ref,
            activity_support: activity == null ? null : {
              category: activity.category,
              completion_model: activity.completion_model,
              fixed_duration_minutes: activity.fixed_duration_minutes
            } };
        }),
        containers: row.containers.map((container) =>
          resolveContainer(container, sources)),
        typed_gaps: structuredClone(row.typed_gaps)
      };
    });

  const payload = {
    schema: 'rus.npc_equipment_profile_candidate.v1',
    candidate_id: 'novgorod_npc_equipment_profiles_candidate_001',
    version: 1,
    status: 'candidate_approval_pending',
    authoring_approval: 'pending_independent_review',
    import_authorized: false,
    activation_authorized: false,
    activation_request: null,
    runtime_instances_created: false,
    profile_levels: ['social_basic_clothing', 'occupation_equipment'],
    provenance: {
      authoring_ref: `${authoring.authoring_id}@${authoring.version}`,
      authoring_digest: digest(authoring),
      v5_bundle_id: manifest.bundle_id,
      v5_candidate_digest: manifest.candidate_digest,
      v5_approval_request_digest: approval.request_digest,
      v5_target_revision_id: promotion.target_revision_id,
      v5_target_catalog_digest: promotion.target_catalog_digest,
      source_paths: [
        'data/novgorod-region/novgorod_social_roles_v1_enriched.tsv',
        'data/novgorod-region/novgorod_occupations_v1_enriched.tsv',
        'data/world-base-seeds/novgorod_role_position_map_v1.csv',
        'data/world-base-seeds/social_position_archetypes_v1.csv',
        'data/world-base-seeds/social_classes_v1.csv',
        `${V5_ROOT}/manifest.json`,
        `${APPROVAL_ROOT}/FINAL_APPROVAL_ATTESTATION.json`,
        `${APPROVAL_ROOT}/STAGE3C_PROMOTION_RESULT.json`,
        'data/world-catalogs/novgorod/first-playable-v1/catalog.json'
      ]
    },
    limits: {
      profile_is_authoring_handoff_only: true,
      creates_item_or_container_instances: false,
      assigns_owner_holder_or_controller: false,
      exact_property_basis_required_at_materialization: true,
      no_display_name_matching: true,
      no_npc_specific_profile: true,
      no_personality_or_name_fields: true
    },
    social_clothing_profiles: socialClothingProfiles,
    occupation_equipment_profiles: occupationEquipmentProfiles
  };
  validateNpcEquipmentProfileCandidate(payload);
  const candidate = { ...payload, candidate_digest: digest(payload) };
  const requestPayload = {
    schema: 'rus.npc_equipment_profile_approval_request.v1',
    request_id: 'novgorod_npc_equipment_profiles_review_001',
    decision_requested: 'review_npc_equipment_profile_candidate',
    authoring_approval: 'pending_independent_review',
    import_authorized: false,
    activation_authorized: false,
    activation_request: null,
    candidate_ref: `${candidate.candidate_id}@${candidate.version}`,
    candidate_digest: candidate.candidate_digest,
    profile_ids: [...socialClothingProfiles, ...occupationEquipmentProfiles]
      .map(({ profile_id: id }) => id).sort()
  };
  return { candidate, approvalRequest: { ...requestPayload,
    request_digest: digest(requestPayload) } };
}

export function validateNpcEquipmentProfileCandidate(candidate) {
  if (candidate?.status !== 'candidate_approval_pending'
      || candidate.authoring_approval !== 'pending_independent_review'
      || candidate.import_authorized !== false
      || candidate.activation_authorized !== false
      || candidate.activation_request !== null
      || candidate.runtime_instances_created !== false)
    fail('NPC_EQUIPMENT_CANDIDATE_BOUNDARY_INVALID');
  if (JSON.stringify(candidate).match(/"(?:display_name|name|personality)"\s*:/u))
    fail('NPC_EQUIPMENT_PERSON_SPECIFIC_FIELD_FORBIDDEN');
  const profileIds = new Set();
  for (const profile of [...candidate.social_clothing_profiles,
    ...candidate.occupation_equipment_profiles]) {
    if (profileIds.has(profile.profile_id))
      fail('NPC_EQUIPMENT_PROFILE_DUPLICATE', profile.profile_id);
    profileIds.add(profile.profile_id);
    const itemIds = new Set();
    for (const entry of [...(profile.entries ?? []), ...(profile.tools ?? [])]) {
      if (entry.effective_status !== 'approved_by_exact_promotion'
          || entry.source_row_status !== 'draft')
        fail('NPC_EQUIPMENT_UNAPPROVED_ITEM', entry.item_template_ref);
      if (itemIds.has(entry.item_template_ref))
        fail('NPC_EQUIPMENT_ITEM_DUPLICATE', entry.item_template_ref);
      itemIds.add(entry.item_template_ref);
      if (new Set(entry.source_binding_refs).size !== entry.source_binding_refs.length)
        fail('NPC_EQUIPMENT_SOURCE_DUPLICATE', entry.item_template_ref);
      if (!sameSet(entry.source_scopes, REQUIRED_SOURCE_SCOPES))
        fail('NPC_EQUIPMENT_SOURCE_COVERAGE_INVALID', entry.item_template_ref);
    }
  }
  for (const profile of candidate.social_clothing_profiles) {
    if (profile.level !== 'social_basic_clothing'
        || profile.applicability.sex.length === 0
        || profile.applicability.body_stage.length === 0)
      fail('NPC_EQUIPMENT_BODY_APPLICABILITY_INVALID', profile.profile_id);
    if (!sameSet(profile.required_slots,
      profile.entries.map(({ equipment_slot: slot }) => slot)))
      fail('NPC_EQUIPMENT_SLOT_COVERAGE_INVALID', profile.profile_id);
    if (profile.entries.some(({ equipment_slot: slot }) =>
      !ACTIVE_CLOTHING_SLOTS.includes(slot)))
      fail('NPC_EQUIPMENT_SLOT_NOT_ACTIVE', profile.profile_id);
    for (const entry of profile.entries) {
      if (!sameSet(entry.applicable_seasons, profile.applicability.seasons)
          || !entry.required_seasons.every((season) =>
            entry.applicable_seasons.includes(season)))
        fail('NPC_EQUIPMENT_SEASON_COVERAGE_INVALID', entry.item_template_ref);
    }
    if (profile.entries.some(({ item_template_ref: id }) =>
      profile.excluded_expensive_or_status_items.includes(id)))
      fail('NPC_EQUIPMENT_STATUS_ITEM_FORBIDDEN', profile.profile_id);
  }
  for (const profile of candidate.occupation_equipment_profiles) {
    if (profile.level !== 'occupation_equipment'
        || profile.tools.length === 0)
      fail('NPC_EQUIPMENT_OCCUPATION_TOOL_MISSING', profile.profile_id);
    for (const tool of profile.tools)
      if (tool.semantics === 'required_for_bound_activity'
          && (!tool.activity_profile_ref || !tool.activity_support))
        fail('NPC_EQUIPMENT_TOOL_ACTIVITY_UNSUPPORTED', tool.item_template_ref);
    for (const container of profile.containers)
      if (container.compatibility !== 'allowed'
          || container.effective_status !== 'approved_by_exact_promotion')
        fail('NPC_EQUIPMENT_CONTAINER_COMPATIBILITY_INVALID',
          container.container_template_ref);
  }
  return candidate;
}

function resolveItem(row, sources) {
  const template = exact(sources.itemTemplates, row.item_template_ref, 'id',
    'NPC_EQUIPMENT_ITEM_TEMPLATE');
  const inventory = exact(sources.itemInventory, row.item_template_ref,
    'item_template_id', 'NPC_EQUIPMENT_ITEM_INVENTORY');
  const quantity = exact(sources.itemQuantity, row.item_template_ref,
    'item_template_id', 'NPC_EQUIPMENT_ITEM_QUANTITY');
  const profile = exact(sources.itemProfiles, row.source_profile_ref, 'id',
    'NPC_EQUIPMENT_ITEM_PROFILE');
  const profileEntry = exact(sources.itemEntries,
    `${row.source_profile_ref}:${row.item_template_ref}`,
    (value) => `${value.profile_id}:${value.item_template_id}`,
    'NPC_EQUIPMENT_ITEM_PROFILE_ENTRY');
  const objectCategory = exact(sources.itemCategories,
    `${row.item_template_ref}:object_type`,
    (value) => `${value.item_template_id}:${value.binding_kind}`,
    'NPC_EQUIPMENT_ITEM_CATEGORY');
  const sourceBindings = sources.itemSources.filter(({ item_template_id: id }) =>
    id === row.item_template_ref).sort((a, b) => a.id.localeCompare(b.id));
  if (sourceBindings.some(({ item_template_id: id }) => id !== template.id)
      || !sameSet(sourceBindings.map(({ claim_scope: scope }) => scope),
        REQUIRED_SOURCE_SCOPES))
    fail('NPC_EQUIPMENT_SOURCE_MISMATCH', row.item_template_ref);
  return {
    item_template_ref: template.id,
    object_category_ref: objectCategory.category_id,
    source_profile_ref: profile.id,
    source_profile_entry_ref: profileEntry.id,
    source_slot_key: profileEntry.slot_key,
    source_entry_required: profileEntry.required,
    source_selection_weight: profileEntry.weight,
    source_quantity_bounds: { min: profileEntry.min_quantity,
      max: profileEntry.max_quantity },
    inventory_profile_ref: inventory.id,
    inventory_mechanics: { mass_grams: inventory.mass_grams,
      carry_form: inventory.carry_form,
      external_hand_cost: inventory.external_hand_cost },
    quantity_profile_ref: quantity.id,
    quantity_mechanics: { quantity_unit_ref: quantity.quantity_unit_id,
      quantity_dimension: quantity.quantity_dimension,
      minimum_quantity: quantity.minimum_quantity,
      maximum_quantity: quantity.maximum_quantity,
      default_quantity_policy: structuredClone(quantity.default_quantity_policy),
      mass_grams_per_unit: quantity.mass_grams_per_unit,
      stackable: quantity.stackable,
      partial_consumption_allowed: quantity.partial_consumption_allowed },
    source_binding_refs: sourceBindings.map(({ id }) => id),
    source_refs: [...new Set(sourceBindings.map(({ source_id: id }) => id))]
      .sort(),
    source_scopes: sourceBindings.map(({ claim_scope: scope }) => scope).sort(),
    source_row_status: template.status,
    effective_status: 'approved_by_exact_promotion'
  };
}

function resolveContainer(row, sources) {
  const template = exact(sources.containerTemplates, row.container_template_ref,
    'id', 'NPC_EQUIPMENT_CONTAINER_TEMPLATE');
  const inventory = exact(sources.containerInventory,
    row.container_template_ref, 'container_template_id',
    'NPC_EQUIPMENT_CONTAINER_INVENTORY');
  const form = exact(sources.containerFacets,
    `${row.container_template_ref}:container_form`,
    (value) => `${value.container_template_id}:${value.facet}`,
    'NPC_EQUIPMENT_CONTAINER_FORM');
  const relation = exact(sources.containerRelations,
    row.compatibility_relation_ref, 'id',
    'NPC_EQUIPMENT_CONTAINER_COMPATIBILITY');
  const bindings = sources.containerSources.filter(
    ({ container_template_id: id }) => id === row.container_template_ref)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (relation.container_category_id !== form.category_id
      || !sameSet(bindings.map(({ claim_scope: scope }) => scope),
        REQUIRED_SOURCE_SCOPES))
    fail('NPC_EQUIPMENT_CONTAINER_SOURCE_MISMATCH', row.container_template_ref);
  return { container_template_ref: template.id,
    container_form_ref: form.category_id,
    compatibility_relation_ref: relation.id,
    content_category_ref: relation.content_category_id,
    compatibility: relation.compatibility,
    semantics: row.semantics,
    inventory_profile_ref: inventory.id,
    inventory_mechanics: { mass_grams: inventory.mass_grams,
      carry_form: inventory.carry_form,
      external_hand_cost: inventory.external_hand_cost,
      inventory_role: inventory.inventory_role },
    count: null,
    source_binding_refs: bindings.map(({ id }) => id),
    source_refs: [...new Set(bindings.map(({ source_id: id }) => id))].sort(),
    source_row_status: template.status,
    effective_status: 'approved_by_exact_promotion' };
}

function resolveProperty(row, sources) {
  const profile = exact(sources.propertyProfiles, row.property_profile_ref, 'id',
    'NPC_EQUIPMENT_PROPERTY_PROFILE');
  const rule = exact(sources.propertyRules, row.property_rule_ref, 'id',
    'NPC_EQUIPMENT_PROPERTY_RULE');
  if (rule.property_profile_id !== profile.id)
    fail('NPC_EQUIPMENT_PROPERTY_SOURCE_MISMATCH', row.profile_id);
  return { property_profile_ref: profile.id, property_rule_ref: rule.id,
    owner_kind: rule.owner_kind, holder_kind: rule.holder_kind,
    controller_kind: rule.controller_kind,
    access_policy: structuredClone(rule.access_policy),
    claim_conditions: structuredClone(rule.claim_conditions),
    assignment_at_authoring: false,
    effective_status: 'approved_by_exact_promotion' };
}

function resolveRole(id, { roles, roleMap, positions, classes }) {
  const role = exact(roles, id, 'role_id', 'NPC_EQUIPMENT_ROLE');
  const mapping = exact(roleMap, id, 'source_role_id', 'NPC_EQUIPMENT_ROLE_MAP');
  const position = exact(positions, mapping.social_position_archetype_id, 'id',
    'NPC_EQUIPMENT_SOCIAL_POSITION');
  const socialClass = exact(classes, position.social_class_id, 'id',
    'NPC_EQUIPMENT_SOCIAL_CLASS');
  if (role.status !== 'approved' || role.mapping_review_status !== 'approved'
      || mapping.review_status !== 'approved' || position.status !== 'approved'
      || socialClass.status !== 'approved') fail('NPC_EQUIPMENT_ROLE_NOT_APPROVED', id);
  return { owner: 'approved_social_roles', id,
    role_archetype_ref: role.role_archetype_id,
    social_position_ref: position.id,
    social_class_ref: socialClass.id,
    legal_status_ref: role.legal_status_archetype_id,
    source_status: role.status, mapping_review_status: role.mapping_review_status };
}

function validatePromotion(manifest, approval, promotion) {
  if (manifest.candidate_digest !== approval.candidate_digest
      || approval.decision !== 'approve_all_120'
      || approval.activation_authorized !== false
      || promotion.candidate_digest !== manifest.candidate_digest
      || promotion.target_revision_id !== TARGET_REVISION
      || promotion.first_apply?.approved_item_template_count !== 102
      || promotion.first_apply?.approved_container_template_count !== 18
      || promotion.activation_performed !== false)
    fail('NPC_EQUIPMENT_V5_PROMOTION_INVALID');
}

async function validateDatasetDigests(root, manifest, overrides) {
  for (const dataset of manifest.datasets.filter(({ table }) =>
    USED_V5_TABLES.includes(table))) {
    const relative = `${V5_ROOT}/${dataset.path}`;
    if (Object.hasOwn(overrides, relative)) continue;
    const actual = digestValue(JSON.parse(await readFile(resolve(root,
      relative), 'utf8')));
    if (actual !== dataset.sha256) fail('NPC_EQUIPMENT_V5_DATASET_DRIFT',
      dataset.table);
  }
}

function exact(rows, expected, key, code) {
  const read = typeof key === 'function' ? key : (row) => row[key];
  const matches = rows.filter((row) => read(row) === expected);
  if (matches.length !== 1) fail(matches.length === 0 ? `${code}_MISSING`
    : `${code}_AMBIGUOUS`, expected);
  return matches[0];
}

function parseDelimited(input, delimiter) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') { field += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) { row.push(field); field = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [headers, ...values] = rows;
  return values.map((columns) => Object.fromEntries(headers.map((header, index) =>
    [header.replace(/^\uFEFF/u, ''), columns[index] ?? ''])));
}

function splitList(value) { return String(value ?? '').split(';').map((part) =>
  part.trim()).filter(Boolean); }
function sameSet(left, right) { return left.length === right.length
  && [...left].sort().every((value, index) => value === [...right].sort()[index]); }
function digest(value) { return digestValue(value); }
function fail(code, detail = '') { const error = new Error(`${code}${detail
  ? `: ${detail}` : ''}`); error.code = code; throw error; }

async function main(argv) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const output = await generateNpcEquipmentProfiles(root);
  await mkdir(resolve(root, OUTPUT_ROOT), { recursive: true });
  await Promise.all([
    ['candidate.json', output.candidate],
    ['approval-request.json', output.approvalRequest]
  ].map(([name, value]) => writeFile(resolve(root, OUTPUT_ROOT, name),
    `${JSON.stringify(value, null, 2)}\n`)));
  if (argv.includes('--check')) process.stdout.write(
    `${output.candidate.candidate_digest}\n${output.approvalRequest.request_digest}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href)
  await main(process.argv.slice(2));
