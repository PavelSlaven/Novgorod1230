import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const OUTPUT =
  'data/world-catalogs/novgorod/procedural-scene-v2/functional-allocation-v1';
const FUNCTIONAL =
  'data/world-catalogs/novgorod/procedural-scene-v2/functional-mapping-v1/candidate.json';
const EQUIPMENT =
  'data/world-catalogs/novgorod/procedural-scene-v2/npc-equipment-v1/candidate.json';

export async function generateProceduralFunctionalAllocations(rootDir,
  overrides = {}) {
  const root = resolve(rootDir);
  const load = async (path) => overrides[path]
    ?? JSON.parse(await readFile(resolve(root, path), 'utf8'));
  const [functional, equipment] = await Promise.all([
    load(FUNCTIONAL), load(EQUIPMENT)
  ]);
  if (functional.candidate_digest !==
      'aac8ef388fee279d653832de033ce9b23c85fb371c159eb828e97b56080b0588'
      || equipment.candidate_digest !==
      '0464092cfebd2873054363ae961c024a3155f1a9d9cdd654b6bc2361924c2181')
    fail('FUNCTIONAL_ALLOCATION_SOURCE_MISMATCH');
  const toolGroup = functional.mappings.find(({ mapping_id: id }) =>
    id === 'fishing_tool_group_v1');
  const materialGroup = functional.mappings.find(({ mapping_id: id }) =>
    id === 'fishing_work_material_group_v1');
  const fisher = equipment.occupation_equipment_profiles.find(
    ({ profile_id: id }) => id === 'novgorod_fishing_water_equipment_v1');
  const activityTool = fisher.tools.find(({ activity_profile_ref: ref }) =>
    ref === 'activity_assist_fishing_net_v1');
  const tool = exact(toolGroup.candidates, activityTool.item_template_ref);
  const material = [...materialGroup.candidates].sort((left, right) =>
    left.item_template_ref.localeCompare(right.item_template_ref))[0];
  const policy = {
    policy_id: 'fishing_present_actor_functional_allocation_v1',
    family_candidate_ref: 'novgorod_inland_fishing_worksite_v3@1',
    applicability: {
      function_ref: 'fishing_worksite',
      occupation_ref: 'nov_occ_fisher',
      role_ref: 'nov_role_fisher',
      activity_profile_ref: 'activity_assist_fishing_net_v1',
      actor_presence: 'present_committed'
    },
    actor_selection: 'stable_actor_id_ascending',
    allocations: [allocation('tool', tool),
      allocation('work_material', material)],
    property_basis: {
      owner_ref: 'selected_actor', holder_ref: 'selected_actor',
      controller_ref: 'selected_actor', access_policy: 'actor_controlled'
    },
    placement: {
      mode: 'persisted_function_position',
      required_function_layer: 'work_zone',
      required_position_state: 'committed'
    },
    limits: {
      site_or_unowned_item_authorized: false,
      household_basis_authorized: false,
      resource_node_authorized: false,
      stock_creation_authorized: false,
      quantity_creation_authorized: false
    }
  };
  const payload = {
    schema: 'rus.procedural_functional_allocation_candidate.v1',
    candidate_id: 'novgorod_procedural_functional_allocation_candidate_001',
    version: 1, status: 'candidate_approval_pending',
    authoring_scope: 'functional_actor_allocation_only',
    source_candidate_digests: {
      functional_mapping: functional.candidate_digest,
      npc_equipment: equipment.candidate_digest
    },
    policies: [policy],
    unaffected_families: ['novgorod_drying_storage_workspace_v3@1',
      'novgorod_natural_shore_v3@1'],
    typed_gap_reconciliation: {
      resolved_when_policy_applicable: [
        'FUNCTIONAL_TOOL_MAPPING_MISSING',
        'FUNCTIONAL_WORK_MATERIAL_MAPPING_MISSING'
      ],
      remains_when_no_matching_actor: [
        'FUNCTIONAL_ACTOR_SOURCE_BASIS_MISSING'
      ],
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
  persistedPositions }) {
  const matches = actors.filter((actor) => actor.presence_state === 'committed'
    && actor.occupation_ref === policy.applicability.occupation_ref
    && actor.role_ref === policy.applicability.role_ref
    && actor.activity_profile_refs?.includes(
      policy.applicability.activity_profile_ref))
    .sort((left, right) => left.actor_id.localeCompare(right.actor_id));
  if (matches.length === 0) fail('FUNCTIONAL_ACTOR_SOURCE_BASIS_MISSING');
  const actor = matches[0];
  const position = persistedPositions.find(({ function_layer: layer,
    state, actor_id: actorId }) => layer ===
      policy.placement.required_function_layer
      && state === policy.placement.required_position_state
      && actorId === actor.actor_id);
  if (!position) fail('FUNCTIONAL_PERSISTED_POSITION_MISSING');
  return Object.freeze(policy.allocations.map((entry) => Object.freeze({
    allocation_id: `${policy.policy_id}:${actor.actor_id}:${entry.layer}`,
    layer: entry.layer, actor_id: actor.actor_id,
    owner_id: actor.actor_id, holder_id: actor.actor_id,
    controller_id: actor.actor_id, access_policy: 'actor_controlled',
    position_id: position.position_id,
    ...structuredClone(entry)
  })));
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
    source_refs: [...source.source_refs], committed_source_required: true };
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
