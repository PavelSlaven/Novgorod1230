import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ACTOR_ITEM_PHYSICAL_POSITIONS } from
  '../packages/items-property/src/index.js';
import { computeCanonicalRecordDigest } from
  '../packages/runtime-catalog/src/canonical-records.js';
import { validateProceduralFinalCandidatePack } from
  './generate-procedural-final-candidate-pack.mjs';

const OUTPUT =
  'data/world-catalogs/novgorod/procedural-scene-v2/functional-allocation-v1';
const FUNCTIONAL =
  'data/world-catalogs/novgorod/procedural-scene-v2/functional-mapping-v1/candidate.json';
const EQUIPMENT =
  'data/world-catalogs/novgorod/procedural-scene-v2/npc-equipment-v1/candidate.json';
const V5 = 'data/knowledge-source/imports/item-container-120-v5/candidate/tables';
const FINAL =
  'data/world-catalogs/novgorod/procedural-scene-v2/final-candidate-pack-v1/candidate.json';

export async function generateProceduralFunctionalAllocations(rootDir,
  overrides = {}) {
  const root = resolve(rootDir);
  const load = async (path) => overrides[path]
    ?? JSON.parse(await readFile(resolve(root, path), 'utf8'));
  const [functional, equipment, finalPack] =
    await Promise.all([
    load(FUNCTIONAL), load(EQUIPMENT), load(FINAL)
  ]);
  if (functional.candidate_digest !==
      'aac8ef388fee279d653832de033ce9b23c85fb371c159eb828e97b56080b0588'
      || equipment.candidate_digest !==
      '0464092cfebd2873054363ae961c024a3155f1a9d9cdd654b6bc2361924c2181')
    fail('FUNCTIONAL_ALLOCATION_SOURCE_MISMATCH');
  validateProceduralFinalCandidatePack(finalPack);
  const toolGroup = functional.mappings.find(({ mapping_id: id }) =>
    id === 'fishing_tool_group_v1');
  const materialGroup = functional.mappings.find(({ mapping_id: id }) =>
    id === 'fishing_work_material_group_v1');
  const workZone = functional.mappings.find(({ mapping_id: id }) =>
    id === 'fishing_work_zone_place_group_v1');
  const fisher = equipment.occupation_equipment_profiles.find(
    ({ profile_id: id }) => id === 'novgorod_fishing_water_equipment_v1');
  const activityTool = fisher.tools.find(({ activity_profile_ref: ref }) =>
    ref === 'activity_assist_fishing_net_v1');
  const tool = exact(toolGroup.candidates, activityTool.item_template_ref);
  const material = [...materialGroup.candidates].sort((left, right) =>
    left.item_template_ref.localeCompare(right.item_template_ref))[0];
  const approved = (table, predicate) => approvedRecord(finalPack, table,
    predicate);
  const propertyProfile = approved('property_profiles', ({ id }) =>
    id === 'property_personal_possession_v1');
  const propertyRule = approved('property_profile_rules', ({ id }) =>
    id === 'rule_property_personal_possession_v1');
  const bindMechanics = (source) => ({ ...source,
    inventory: approved('item_template_inventory_profiles',
      ({ item_template_id: id }) => id === source.item_template_ref),
    quantity: approved('item_template_quantity_profiles',
      ({ item_template_id: id }) => id === source.item_template_ref) });
  const policy = {
    policy_id: 'fishing_present_actor_functional_allocation_v1',
    family_candidate_ref: 'novgorod_inland_fishing_worksite_v3@1',
    applicability: {
      function_ref: 'fishing_worksite',
      occupation_ref: 'nov_occ_fisher',
      role_ref: 'nov_role_fisher',
      activity_profile_ref: 'activity_assist_fishing_net_v1',
      actor_presence: 'present_committed_scene',
      actor_kinds: ['npc', 'player_character'],
      stable_unique_actor_instance_id_required: true
    },
    selection_cardinality: 'deterministic_one_from_nonempty',
    ambiguity_policy: 'lowest_unique_stable_actor_instance_id',
    actor_selection: 'lowest_stable_actor_instance_id',
    actor_selection_reason:
      'Deterministic order-independent selection among equally applicable actors.',
    allocations: [allocation('tool', bindMechanics(tool)),
      allocation('work_material', bindMechanics(material))],
    property_basis: {
      profile: propertyProfile.canonical_fields,
      profile_record_digest: propertyProfile.record_digest,
      rule: propertyRule.canonical_fields,
      rule_record_digest: propertyRule.record_digest,
      owner_ref: 'selected_actor_instance',
      holder_ref: 'selected_actor_instance',
      controller_ref: 'selected_actor_instance',
      access_policy: 'actor_controlled',
      assignment_at_materialization: true
    },
    placement: {
      mode: 'actor_held_physical_position',
      allowed_physical_positions: ACTOR_ITEM_PHYSICAL_POSITIONS.filter(
        (value) => ['hands', 'external'].includes(value)),
      required_function_layer: 'work_zone',
      required_position_state: 'committed',
      work_zone_role: 'causal_scene_basis_only',
      garment_slot_authorized: false
    },
    scene_binding: {
      family_candidate_ref: 'novgorod_inland_fishing_worksite_v3@1',
      function_ref: 'fishing_worksite',
      work_zone_mapping_id: workZone.mapping_id,
      work_zone_mapping_digest: digest(workZone)
    },
    creation: {
      reuse_before_create: true, create_quantity: 1,
      cross_layer_reuse_authorized: false,
      deterministic_identity:
        'policy_id+actor_instance_id+layer+item_template_ref',
      idempotency_key_same_as_identity: true
    },
    causal_basis: {
      authoring_package_digest: finalPack.candidate_digest,
      mapping_candidate_digest: functional.candidate_digest,
      property_record_ids: [propertyProfile.canonical_fields.id,
        propertyRule.canonical_fields.id],
      property_record_digests: [propertyProfile.record_digest,
        propertyRule.record_digest],
      actor_scene_package_refs_required: true
    },
    creation_authority: {
      authority_kind: 'actor_allocation_policy_after_independent_attestation',
      status: 'pending_independent_attestation',
      functional_mapping_ids: [toolGroup.mapping_id, materialGroup.mapping_id],
      activity_profile_ref: 'activity_assist_fishing_net_v1',
      v5_record_digests: [propertyProfile.record_digest,
        propertyRule.record_digest]
    },
    limits: {
      site_or_unowned_item_authorized: false,
      household_basis_authorized: false,
      resource_node_authorized: false,
      stock_creation_authorized: false,
      quantity_creation_authorized: true
    }
  };
  const payload = {
    schema: 'rus.procedural_functional_allocation_candidate.v1',
    candidate_id: 'novgorod_procedural_functional_allocation_candidate_001',
    version: 1, status: 'candidate_approval_pending',
    authoring_scope: 'functional_actor_allocation_only',
    source_candidate_digests: {
      functional_mapping: functional.candidate_digest,
      npc_equipment: equipment.candidate_digest,
      final_assert_existing_catalog: finalPack.candidate_digest,
      final_import_approval_attestation:
        finalPack.independent_attestation.attestation_digest
    },
    policies: [policy],
    unaffected_families: ['novgorod_drying_storage_workspace_v3@1',
      'novgorod_natural_shore_v3@1'],
    typed_gap_reconciliation: {
      resolved_only_after_runtime_inventory_owner_success: [
        'FUNCTIONAL_TOOL_MAPPING_MISSING',
        'FUNCTIONAL_WORK_MATERIAL_MAPPING_MISSING'
      ],
      authoring_gaps: ['FUNCTIONAL_PROPERTY_BASIS_INVALID',
        'FUNCTIONAL_SOURCE_REF_INVALID'],
      actor_resolution_gaps: ['FUNCTIONAL_ACTOR_SOURCE_BASIS_MISSING',
        'FUNCTIONAL_ACTOR_ID_AMBIGUOUS'],
      placement_gaps: ['FUNCTIONAL_PLACEMENT_INVALID'],
      runtime_inventory_owner_gaps: [
        'FUNCTIONAL_RUNTIME_INVENTORY_OWNER_VALIDATION_PENDING',
        'FUNCTIONAL_REUSE_PROJECTION_INVALID',
        'FUNCTIONAL_CROSS_LAYER_REUSE_INVALID'],
      always_remaining: ['FUNCTIONAL_CONTAINER_MAPPING_MISSING']
    },
    import_authorized: false, runtime_authorized: false,
    activation_authorized: false, activation_request: null
  };
  const candidate = { ...payload, candidate_digest: digest(payload) };
  const requestPayload = {
    schema: 'rus.procedural_functional_allocation_approval_request.v1',
    decision_requested: 'review_functional_actor_allocation_authoring',
    candidate_digest: candidate.candidate_digest,
    authoring_scope: candidate.authoring_scope,
    import_authorized: false, runtime_authorized: false,
    activation_authorized: false
  };
  return { candidate, approvalRequest: { ...requestPayload,
    request_digest: digest(requestPayload) } };
}

export function resolveProceduralFunctionalAllocations({ policy, actors,
  persistedPositions, existingItems = [], scenePackage,
  ...forbiddenSummary }) {
  if (Object.keys(forbiddenSummary).length > 0)
    fail('FUNCTIONAL_CALLER_MECHANICS_SUMMARY_FORBIDDEN');
  if (!scenePackage?.scene_package_id || !scenePackage.scene_package_digest
      || scenePackage.family_candidate_ref !==
        policy.scene_binding.family_candidate_ref
      || scenePackage.function_ref !== policy.scene_binding.function_ref
      || scenePackage.work_zone_mapping_id !==
        policy.scene_binding.work_zone_mapping_id
      || scenePackage.work_zone_mapping_digest !==
        policy.scene_binding.work_zone_mapping_digest)
    fail('FUNCTIONAL_SCENE_PACKAGE_MISMATCH');
  const ids = actors.map(({ actor_instance_id: id }) => id);
  if (ids.some((id) => typeof id !== 'string' || !id)
      || new Set(ids).size !== ids.length) fail('FUNCTIONAL_ACTOR_ID_AMBIGUOUS');
  const matches = actors.filter((actor) =>
    policy.applicability.actor_kinds.includes(actor.actor_kind)
    && actor.presence_state === 'present_committed_scene'
    && actor.occupation_ref === policy.applicability.occupation_ref
    && actor.role_ref === policy.applicability.role_ref
    && actor.activity_profile_refs?.includes(
      policy.applicability.activity_profile_ref)
    && actor.scene_package_id === scenePackage.scene_package_id
    && actor.scene_package_digest === scenePackage.scene_package_digest)
    .sort((left, right) => left.actor_instance_id.localeCompare(
      right.actor_instance_id));
  if (matches.length === 0) fail('FUNCTIONAL_ACTOR_SOURCE_BASIS_MISSING');
  const actor = matches[0];
  const positions = persistedPositions.filter(({ function_layer: layer,
    state, actor_instance_id: actorId, scene_package_id: packageId,
    scene_package_digest: packageDigest,
    work_zone_mapping_id: mappingId }) => layer ===
      policy.placement.required_function_layer
      && state === policy.placement.required_position_state
      && actorId === actor.actor_instance_id
      && packageId === scenePackage.scene_package_id
      && packageDigest === scenePackage.scene_package_digest
      && mappingId ===
        policy.scene_binding.work_zone_mapping_id);
  if (positions.length !== 1) fail('FUNCTIONAL_PLACEMENT_INVALID');
  const position = positions[0];
  const existingIds = existingItems.map(({ item_instance_id: id }) => id);
  if (existingIds.some((id) => !id)
      || new Set(existingIds).size !== existingIds.length)
    fail('FUNCTIONAL_CROSS_LAYER_REUSE_INVALID');
  const used = new Set();
  const allocations = policy.allocations.map((entry) => {
    const existing = existingItems.filter((item) =>
      item.actor_instance_id === actor.actor_instance_id
      && item.item_template_ref === entry.item_template_ref
      && !used.has(item.item_instance_id))
      .sort((left, right) => left.item_instance_id.localeCompare(
        right.item_instance_id))[0];
    if (existing && (existing.state !== 'committed'
        || existing.owner_id !== actor.actor_instance_id
        || existing.holder_id !== actor.actor_instance_id
        || existing.controller_id !== actor.actor_instance_id
        || !policy.placement.allowed_physical_positions.includes(
          existing.physical_position)
        || existing.quantity !== 1
        || existing.inventory_profile_ref !== entry.inventory_profile_ref
        || existing.quantity_profile_ref !== entry.quantity_profile_ref
        || existing.profile_entry_ref !== entry.profile_entry_ref
        || existing.source_binding_refs_digest !==
          digest(entry.source_binding_refs)))
      fail('FUNCTIONAL_REUSE_PROJECTION_INVALID');
    if (existing) used.add(existing.item_instance_id);
    const physicalPosition = entry.external_hand_cost > 0 ? 'hands' : 'external';
    const identity = `${policy.policy_id}:${actor.actor_instance_id}:`
      + `${entry.layer}:${entry.item_template_ref}`;
    const holderFields = actor.actor_kind === 'npc'
      ? { owner_npc_id: actor.actor_instance_id,
        holder_npc_id: actor.actor_instance_id,
        controller_npc_id: actor.actor_instance_id }
      : { owner_character_id: actor.actor_instance_id,
        holder_character_id: actor.actor_instance_id,
        controller_character_id: actor.actor_instance_id };
    return Object.freeze({ allocation_id: identity,
      idempotency_key: identity, disposition: existing ? 'reuse' : 'create',
      item_instance_id: existing?.item_instance_id ?? `item:${identity}`,
      layer: entry.layer, actor_instance_id: actor.actor_instance_id,
      actor_kind: actor.actor_kind, ...holderFields,
      owner_id: actor.actor_instance_id, holder_id: actor.actor_instance_id,
      controller_id: actor.actor_instance_id,
      access_policy: 'actor_controlled', physical_position: physicalPosition,
      work_zone_position_id: position.position_id, quantity: 1,
      ...structuredClone(entry) });
  });
  if (new Set(allocations.map(({ item_instance_id: id }) => id)).size
      !== allocations.length) fail('FUNCTIONAL_CROSS_LAYER_REUSE_INVALID');
  return Object.freeze({ schema: 'rus.p16.actor_item_allocation_plan.v1',
    actor_instance_id: actor.actor_instance_id,
    validation_owner: {
      module: '@rus/items-property',
      functions: ['validateInventoryTopology', 'calculateInventoryMass',
        'calculateHandsState', 'resolveInventoryLoad'],
      input: 'persisted_full_actor_inventory_snapshot'
    },
    topology_requirements: {
      allowed_physical_positions: [...policy.placement.allowed_physical_positions],
      exact_owner_holder_controller: true,
      quantity: 1, reject_overloaded: true
    },
    causal_scene_binding: { scene_package_id: scenePackage.scene_package_id,
      scene_package_digest: scenePackage.scene_package_digest,
      ...structuredClone(policy.scene_binding) },
    allocations: Object.freeze(allocations),
    readiness: 'pending_runtime_inventory_owner_validation',
    pending_gap: 'FUNCTIONAL_RUNTIME_INVENTORY_OWNER_VALIDATION_PENDING' });
}

function allocation(layer, source) {
  return { layer, selection_mode: 'deterministic_single_approved_candidate',
    item_template_ref: source.item_template_ref,
    profile_ref: source.profile_ref,
    profile_entry_ref: source.profile_entry_ref,
    quantity_profile_ref: source.quantity_profile_ref,
    inventory_profile_ref: source.inventory_profile_ref,
    object_category_ref: source.object_category_ref,
    min_quantity: source.min_quantity, max_quantity: source.max_quantity,
    source_binding_refs: [...source.source_binding_refs],
    source_refs: [...source.source_refs], committed_source_required: true,
    inventory_record_id: source.inventory.canonical_fields.id,
    inventory_record_digest: source.inventory.record_digest,
    quantity_record_id: source.quantity.canonical_fields.id,
    quantity_record_digest: source.quantity.record_digest,
    mass_grams: Number(source.inventory.canonical_fields.mass_grams),
    external_hand_cost:
      Number(source.inventory.canonical_fields.external_hand_cost) };
}
function approvedRecord(pack, table, predicate) {
  const operation = pack.record_operations_by_table.find(
    ({ table_name: name }) => name === table);
  const matches = operation?.records.filter(({ canonical_payload: payload }) =>
    predicate(payload.canonical_fields)) ?? [];
  if (matches.length !== 1 || matches[0].operation_kind !== 'assert_existing'
      || matches[0].canonical_payload.canonical_fields.status !== 'approved')
    fail(table.startsWith('property_') ? 'FUNCTIONAL_PROPERTY_BASIS_INVALID'
      : 'FUNCTIONAL_SOURCE_REF_INVALID');
  if (computeCanonicalRecordDigest(matches[0].canonical_payload)
      !== matches[0].record_digest)
    fail('FUNCTIONAL_SOURCE_REF_INVALID');
  return { canonical_fields:
    structuredClone(matches[0].canonical_payload.canonical_fields),
  record_digest: matches[0].record_digest };
}
function exact(rows, id) {
  const found = rows.filter(({ item_template_ref: ref }) => ref === id);
  if (found.length !== 1) fail('FUNCTIONAL_ALLOCATION_SOURCE_AMBIGUOUS');
  return found[0];
}
function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function fail(code) { throw Object.assign(new Error(code), { code }); }

async function main(argv) {
  const root = resolve(argv.find((arg) => !arg.startsWith('--')) ?? '.');
  const result = await generateProceduralFunctionalAllocations(root);
  const outputs = [['candidate.json', result.candidate],
    ['approval-request.json', result.approvalRequest]];
  if (argv.includes('--check')) {
    for (const [file, value] of outputs) if (await readFile(
      resolve(root, OUTPUT, file), 'utf8').catch(() => null)
        !== `${JSON.stringify(value, null, 2)}\n`) fail('GENERATED_STALE');
  } else {
    await mkdir(resolve(root, OUTPUT), { recursive: true });
    await Promise.all(outputs.map(([file, value]) => writeFile(
      resolve(root, OUTPUT, file), `${JSON.stringify(value, null, 2)}\n`)));
  }
  process.stdout.write(`${JSON.stringify({ pass: true,
    candidate_digest: result.candidate.candidate_digest,
    request_digest: result.approvalRequest.request_digest }, null, 2)}\n`);
}
if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main(process.argv.slice(2));
