import { createHash } from 'node:crypto';
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
const TARGET_CATALOG_DIGEST =
  'a24fe55497a8aca018fa28a43ab1f54e26e2f30a5c74931ed2570ab69bc07a87';
const V5_CANDIDATE_DIGEST =
  'e3bddda4b31cdbb91d430254db5e6f2d34a8d9d0a08e5f7e4c1e1d6cb9832a24';
const V5_APPROVAL_REQUEST_DIGEST =
  '046344b570789b008da8685d0dad3824512d529f9c161a122ecdc59e3cb73771';
const V5_APPROVAL_ATTESTATION_DIGEST =
  '67baf3e92a2aacde2566a60c13e5a3a2410e3544549f096684d473d8588f18f8';
const APPEARANCE_PATH =
  'data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v6/actor-appearance-carry-forward-v1/candidate.json';
const APPEARANCE_SHA256 =
  '1dffc2cd2d80576146090daaaf0cf2b0cab436d761b4309de75949f87b9f3533';
const TEMPORAL_APPROVAL_PATH =
  'data/world-catalogs/novgorod/temporal-v4/approvals/weather_transition_profiles_processes.json';
const TEMPORAL_DATASET_PATH =
  'data/world-catalogs/novgorod/temporal-v4/datasets/weather_transition_profiles_processes.json';
const REQUIRED_SOURCE_SCOPES = Object.freeze([
  'construction', 'historical_presence', 'material', 'physical_parameter'
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
  const [authoring, manifest, approvalRequest, approval, promotion, itemTemplates,
    itemInventory, itemQuantity, itemProfiles, itemEntries, itemCategories,
    itemSources, propertyProfiles, propertyRules, containerTemplates,
    containerInventory, containerFacets, containerRelations, containerSources,
    rolesText, occupationsText, roleMapText, positionsText, classesText,
    activityCatalog, appearanceCandidate, temporalApproval, temporalDataset] =
    await Promise.all([
      load(`${OUTPUT_ROOT}/authoring-rows.json`), load(`${V5_ROOT}/manifest.json`),
      load(`${APPROVAL_ROOT}/FINAL_APPROVAL_REQUEST.json`),
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
      load('data/world-catalogs/novgorod/first-playable-v1/catalog.json'),
      load(APPEARANCE_PATH), load(TEMPORAL_APPROVAL_PATH),
      load(TEMPORAL_DATASET_PATH)
    ]);
  await validatePromotion(root, manifest, approvalRequest, approval, promotion,
    overrides);
  await validateDatasetDigests(root, manifest, overrides);
  const temporal = await validateTemporalSeasons(root, temporalApproval,
    temporalDataset, overrides);
  if (!Object.hasOwn(overrides, APPEARANCE_PATH)
      && await fileDigest(resolve(root, APPEARANCE_PATH)) !== APPEARANCE_SHA256)
    fail('NPC_EQUIPMENT_SLOT_AUTHORITY_FILE_DRIFT');
  const slotAuthority = validateEquipmentSlotAuthority(appearanceCandidate);
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
    for (const season of row.season_applicability)
      if (!temporal.seasons.includes(season))
        fail('NPC_EQUIPMENT_SEASON_NOT_APPROVED', season);
    const resolvedEntries = [];
    const pendingEntries = [];
    for (const entry of row.entries) {
      const item = resolveItem(entry, sources);
      const binding = resolveEquipmentSlotBinding(entry, slotAuthority);
      const projected = { ...item,
        equipment_slot_category_ref: entry.equipment_slot_category_ref,
        equipment_slot_binding_ref: binding?.binding_ref ?? null,
        normalized_equipment_slot: binding?.normalized_slot ?? null,
        applicable_seasons: [...entry.applicable_seasons],
        required_seasons: [...entry.required_seasons] };
      if (binding) resolvedEntries.push(projected);
      else pendingEntries.push(projected);
    }
    const slotGap = slotAuthority.dependency_status === 'approved' ? [] : [{
      code: 'EQUIPMENT_SLOT_AUTHORITY_REAUDIT_PENDING',
      status: 'typed_data_gap',
      source_ref: APPEARANCE_PATH,
      source_status: slotAuthority.source_status,
      resolved_category_refs: resolvedEntries.map(
        ({ equipment_slot_category_ref: ref }) => ref),
      unresolved_category_refs: pendingEntries.map(
        ({ equipment_slot_category_ref: ref }) => ref)
    }];
    return {
      level: 'social_basic_clothing', profile_id: row.profile_id,
      profile_status: slotGap.length === 0 ? 'resolved' : 'dependency_pending',
      executable: false,
      applicability: {
        role_refs: [...row.role_refs].sort(),
        social_class_ref: row.social_class_ref,
        legal_status_ref: row.legal_status_ref,
        status_band: row.status_band,
        sex: [...row.sex_applicability],
        body_stage: [...row.body_stage_applicability],
        seasons: [...row.season_applicability]
      },
      required_equipment_slot_category_refs:
        [...row.required_equipment_slot_category_refs],
      property_basis: propertyBasis,
      role_evidence: roleEvidenceRows,
      slot_authority: structuredClone(slotAuthority.provenance),
      entries: resolvedEntries,
      pending_entries: pendingEntries,
      excluded_expensive_or_status_items:
        [...row.excluded_expensive_or_status_items],
      typed_gaps: [...slotGap, ...structuredClone(row.typed_gaps)]
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
      v5_approval_attestation_digest: V5_APPROVAL_ATTESTATION_DIGEST,
      v5_target_revision_id: promotion.target_revision_id,
      v5_target_catalog_digest: promotion.target_catalog_digest,
      equipment_slot_authority: structuredClone(slotAuthority.provenance),
      temporal_season_authority: temporal.provenance,
      source_paths: [
        'data/novgorod-region/novgorod_social_roles_v1_enriched.tsv',
        'data/novgorod-region/novgorod_occupations_v1_enriched.tsv',
        'data/world-base-seeds/novgorod_role_position_map_v1.csv',
        'data/world-base-seeds/social_position_archetypes_v1.csv',
        'data/world-base-seeds/social_classes_v1.csv',
        `${V5_ROOT}/manifest.json`,
        `${APPROVAL_ROOT}/FINAL_APPROVAL_REQUEST.json`,
        `${APPROVAL_ROOT}/FINAL_APPROVAL_ATTESTATION.json`,
        `${APPROVAL_ROOT}/STAGE3C_PROMOTION_RESULT.json`,
        APPEARANCE_PATH,
        TEMPORAL_APPROVAL_PATH,
        TEMPORAL_DATASET_PATH,
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
    for (const entry of [...(profile.entries ?? []),
      ...(profile.pending_entries ?? []), ...(profile.tools ?? [])]) {
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
    const allEntries = [...profile.entries, ...profile.pending_entries];
    if (!sameSet(profile.required_equipment_slot_category_refs,
      allEntries.map(({ equipment_slot_category_ref: ref }) => ref)))
      fail('NPC_EQUIPMENT_SLOT_COVERAGE_INVALID', profile.profile_id);
    const hasPendingGap = profile.typed_gaps.some(({ code }) =>
      code === 'EQUIPMENT_SLOT_AUTHORITY_REAUDIT_PENDING');
    if (profile.profile_status === 'resolved') {
      if (hasPendingGap || profile.pending_entries.length > 0
          || profile.entries.some((entry) => !entry.equipment_slot_binding_ref
            || !entry.normalized_equipment_slot))
        fail('NPC_EQUIPMENT_SLOT_AUTHORITY_INVALID', profile.profile_id);
    } else if (profile.profile_status === 'dependency_pending') {
      if (!hasPendingGap || profile.executable !== false
          || allEntries.length === 0
          || profile.entries.some((entry) => !entry.equipment_slot_binding_ref
            || !entry.normalized_equipment_slot)
          || profile.pending_entries.some((entry) =>
            entry.equipment_slot_binding_ref || entry.normalized_equipment_slot))
        fail('NPC_EQUIPMENT_SLOT_GAP_INVALID', profile.profile_id);
    } else fail('NPC_EQUIPMENT_SLOT_GAP_INVALID', profile.profile_id);
    for (const entry of allEntries) {
      if (!sameSet(entry.applicable_seasons, profile.applicability.seasons)
          || !entry.required_seasons.every((season) =>
            entry.applicable_seasons.includes(season)))
        fail('NPC_EQUIPMENT_SEASON_COVERAGE_INVALID', entry.item_template_ref);
    }
    if (allEntries.some(({ item_template_ref: id }) =>
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
  for (const sourceRow of [template, inventory, quantity, profile,
    objectCategory]) requirePromotedDraft(sourceRow, row.item_template_ref);
  const sourceBindings = sources.itemSources.filter(({ item_template_id: id }) =>
    id === row.item_template_ref).sort((a, b) => a.id.localeCompare(b.id));
  if (sourceBindings.some((binding) => {
    requirePromotedDraft(binding, row.item_template_ref);
    return binding.item_template_id !== template.id;
  })
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
  for (const sourceRow of [template, inventory, form, relation, ...bindings])
    requirePromotedDraft(sourceRow, row.container_template_ref);
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
  requirePromotedDraft(profile, row.property_profile_ref);
  requirePromotedDraft(rule, row.property_rule_ref);
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

function validateEquipmentSlotAuthority(candidate) {
  const provenance = {
    source_path: APPEARANCE_PATH,
    source_sha256: APPEARANCE_SHA256,
    schema: candidate.schema,
    candidate_id: candidate.candidate_id,
    source_projection_sha256: candidate.source_projection_sha256,
    candidate_rows_sha256: candidate.candidate_rows_sha256,
    target_world_revision_id: candidate.target?.world_revision_id,
    target_catalog_digest: candidate.target?.catalog_digest,
    source_status: candidate.status,
    approval_status: candidate.approval_status,
    authoring_approved: candidate.authoring_approved === true,
    authoring_attestation_digest: candidate.authoring_attestation
      ? digestValue(candidate.authoring_attestation) : null,
    import_activation: candidate.import_activation,
    runtime_status: candidate.runtime_status
  };
  if (candidate.schema !== 'rus.actor_appearance_carry_forward_candidate.v1'
      || candidate.target?.world_revision_id !==
        'novgorod_spatial_v3_production_v6_candidate_001'
      || candidate.target?.catalog_digest !==
        '6e6cd611042ff86229c73409816893ea4e983c01722dd4699bac346acfb846ad'
      || candidate.source_projection_sha256 !==
        '0a65cfaacca68e75e6756ef62062a844e62d09a2c45d390471157cae27fa0286'
      || candidate.candidate_rows_sha256 !==
        'cfdd5d0688bcde4fd9445e194e2fe327c36138578d860c36e2b146f249aac9b3')
    fail('NPC_EQUIPMENT_SLOT_AUTHORITY_DRIFT');
  const categories = candidate.candidate_rows?.universal_categories;
  const bindings = candidate.candidate_rows?.item_template_category_bindings;
  const bindingRowsAvailable = Array.isArray(categories)
    && Array.isArray(bindings);
  const attestation = candidate.authoring_attestation;
  const independentlyApproved = candidate.authoring_approved === true
    && candidate.approval_status === 'authoring_approved'
    && attestation?.subject_commit === 'd068df5b'
    && attestation.scope === 'authoring_only'
    && attestation.status === 'approved'
    && attestation.source_projection_sha256 === candidate.source_projection_sha256
    && attestation.candidate_rows_sha256 === candidate.candidate_rows_sha256
    && attestation.equipment_bindings?.row_count === 20
    && sameSet(attestation.equipment_bindings.equipment_slot_category_refs,
      ['garment.equipment_slot.base_garment',
        'garment.equipment_slot.outer_garment'])
    && attestation.import_activation === false
    && attestation.runtime_selectable === false
    && attestation.runtime_import_rows === 0;
  if (candidate.authoring_approved === true && !independentlyApproved)
    fail('NPC_EQUIPMENT_SLOT_AUTHORITY_ATTESTATION_INVALID');
  return { dependency_status: independentlyApproved ? 'approved' : 'pending',
    source_status: candidate.approval_status,
    binding_rows_available: bindingRowsAvailable,
    categories: bindingRowsAvailable ? categories : [],
    bindings: bindingRowsAvailable ? bindings : [],
    provenance };
}

export function resolveEquipmentSlotBinding(entry, authority) {
  if (!authority.binding_rows_available) return null;
  const category = exact(authority.categories,
    entry.equipment_slot_category_ref, 'id', 'NPC_EQUIPMENT_SLOT_CATEGORY');
  const binding = exact(authority.bindings,
    `${entry.item_template_ref}:${entry.equipment_slot_category_ref}`,
    (row) => `${row.item_template_id}:${row.category_id}`,
    'NPC_EQUIPMENT_SLOT_BINDING');
  if (category.status !== 'approved' || category.facet !== 'equipment_slot'
      || category.domain !== 'garment_visual_semantics'
      || category.stable_code !== category.id
      || binding.status !== 'approved' || binding.binding_kind !== 'equipment_slot')
    fail('NPC_EQUIPMENT_SLOT_BINDING_NOT_APPROVED', entry.item_template_ref);
  const prefix = 'garment.equipment_slot.';
  if (!category.id.startsWith(prefix) || category.id.length === prefix.length)
    fail('NPC_EQUIPMENT_SLOT_CATEGORY_INVALID', category.id);
  return { binding_ref: binding.id,
    normalized_slot: category.id.slice(prefix.length) };
}

async function validateTemporalSeasons(root, approval, dataset, overrides) {
  const artifact = approval.artifacts?.dataset;
  if (approval.status !== 'approved'
      || approval.family_id !== 'weather_transition_profiles_processes'
      || approval.record_ids?.length !== 1 || approval.data_gaps?.length !== 0
      || artifact?.path !== TEMPORAL_DATASET_PATH)
    fail('NPC_EQUIPMENT_TEMPORAL_APPROVAL_INVALID');
  if (!Object.hasOwn(overrides, TEMPORAL_DATASET_PATH)
      && await fileDigest(resolve(root, TEMPORAL_DATASET_PATH)) !== artifact.sha256)
    fail('NPC_EQUIPMENT_TEMPORAL_DATASET_DRIFT');
  const record = exact(dataset,
    'record:weather_transition_profiles_processes:novgorod_weather_v2',
    'record_id', 'NPC_EQUIPMENT_TEMPORAL_RECORD');
  if (record.status !== 'approved' || record.family_id !== approval.family_id
      || record.version !== approval.record_version)
    fail('NPC_EQUIPMENT_TEMPORAL_RECORD_NOT_APPROVED');
  const seasons = Object.keys(
    record.payload?.region_season_applicability?.calendar_seasons ?? {}).sort();
  if (!sameSet(seasons, ['autumn', 'spring', 'summer', 'winter']))
    fail('NPC_EQUIPMENT_TEMPORAL_SEASONS_INVALID');
  return { seasons, provenance: { approval_path: TEMPORAL_APPROVAL_PATH,
    dataset_path: TEMPORAL_DATASET_PATH, dataset_sha256: artifact.sha256,
    approval_status: approval.status, record_id: record.record_id,
    record_version: record.version, seasons } };
}

async function validatePromotion(root, manifest, approvalRequest, approval,
  promotion, overrides) {
  const requestPayload = structuredClone(approvalRequest);
  delete requestPayload.request_digest;
  const attestationDigest = digestValue(approval);
  if (manifest.candidate_digest !== V5_CANDIDATE_DIGEST
      || approvalRequest.request_digest !== V5_APPROVAL_REQUEST_DIGEST
      || digestValue(requestPayload) !== V5_APPROVAL_REQUEST_DIGEST
      || approval.request_digest !== V5_APPROVAL_REQUEST_DIGEST
      || approval.candidate_digest !== V5_CANDIDATE_DIGEST
      || attestationDigest !== V5_APPROVAL_ATTESTATION_DIGEST
      || promotion.approval_request_digest !== V5_APPROVAL_REQUEST_DIGEST
      || promotion.approval_attestation_digest !== attestationDigest
      || approval.decision !== 'approve_all_120'
      || approval.activation_authorized !== false
      || promotion.candidate_digest !== V5_CANDIDATE_DIGEST
      || promotion.target_revision_id !== TARGET_REVISION
      || promotion.target_catalog_digest !== TARGET_CATALOG_DIGEST
      || promotion.first_apply?.target_revision_status !== 'approved'
      || promotion.first_apply?.all_dataset_readbacks_passed !== true
      || promotion.first_apply?.approved_item_template_count !== 102
      || promotion.first_apply?.approved_container_template_count !== 18
      || promotion.activation_performed !== false
      || promotion.existing_parties_rematerialized !== false)
    fail('NPC_EQUIPMENT_V5_PROMOTION_INVALID');
  if (!Object.hasOwn(overrides,
    `${APPROVAL_ROOT}/FINAL_APPROVAL_ATTESTATION.json`)
      && digestValue(JSON.parse(await readFile(resolve(root,
        `${APPROVAL_ROOT}/FINAL_APPROVAL_ATTESTATION.json`), 'utf8')))
        !== V5_APPROVAL_ATTESTATION_DIGEST)
    fail('NPC_EQUIPMENT_V5_ATTESTATION_DRIFT');
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

function requirePromotedDraft(row, detail) {
  if (row?.status !== 'draft')
    fail('NPC_EQUIPMENT_V5_SOURCE_STATUS_INVALID', detail);
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
async function fileDigest(path) { return createHash('sha256')
  .update(await readFile(path)).digest('hex'); }
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
