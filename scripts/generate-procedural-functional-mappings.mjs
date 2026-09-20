import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { digestValue } from
  '../tools/world-catalog-workflow/src/digest.js';

const OUTPUT_ROOT = 'data/world-catalogs/novgorod/procedural-scene-v2/functional-mapping-v1';
const V5_ROOT = 'data/knowledge-source/imports/item-container-120-v5/candidate';
const APPROVAL_ROOT = 'docs/implementation/item-container-120-approval-audit/evidence';
const EXPECTED = Object.freeze({
  bundle: 'novgorod_1230_item_container_v5_candidate_001',
  candidate: 'e3bddda4b31cdbb91d430254db5e6f2d34a8d9d0a08e5f7e4c1e1d6cb9832a24',
  request: '046344b570789b008da8685d0dad3824512d529f9c161a122ecdc59e3cb73771',
  targetRevision: 'world_revision_novgorod_1230_item_container_approved_001',
  targetCatalog: 'a24fe55497a8aca018fa28a43ab1f54e26e2f30a5c74931ed2570ab69bc07a87',
  overlay: '52702c0010adc3e3235fd6a6417a10b28f7627d428e65f9dd48e74c3fb19cda3'
});
const REQUIRED_SOURCE_SCOPES = Object.freeze([
  'construction', 'historical_presence', 'material', 'physical_parameter'
]);

export async function generateProceduralFunctionalMappings(rootDir,
  overrides = {}) {
  const root = resolve(rootDir);
  const load = async (relative) => overrides[relative]
    ?? json(resolve(root, relative));
  const [authoring, overlay, fishingAttestation, dryingAttestation,
    naturalAttestation, manifest, finalApproval, promotion, profileSets,
    profileEntries, templates, categoryBindings, quantityProfiles, inventoryProfiles,
    sourceBindings, occupationsText] = await Promise.all([
      load(`${OUTPUT_ROOT}/authoring-rows.json`),
      load('data/world-catalogs/novgorod/procedural-scene-v2/authoring-overlay.json'),
      load('data/world-catalogs/novgorod/procedural-scene-v2/inland-fishing-worksite-approval-attestation.json'),
      load('data/world-catalogs/novgorod/procedural-scene-v2/drying-storage-workspace-approval-attestation.json'),
      load('data/world-catalogs/novgorod/procedural-scene-v2/natural-shore-approval-attestation.json'),
      load(`${V5_ROOT}/manifest.json`),
      load(`${APPROVAL_ROOT}/FINAL_APPROVAL_ATTESTATION.json`),
      load(`${APPROVAL_ROOT}/STAGE3C_PROMOTION_RESULT.json`),
      load(`${V5_ROOT}/tables/item_profile_sets.json`),
      load(`${V5_ROOT}/tables/item_profile_entries.json`),
      load(`${V5_ROOT}/tables/item_templates.json`),
      load(`${V5_ROOT}/tables/item_template_category_bindings.json`),
      load(`${V5_ROOT}/tables/item_template_quantity_profiles.json`),
      load(`${V5_ROOT}/tables/item_template_inventory_profiles.json`),
      load(`${V5_ROOT}/tables/item_template_source_bindings.json`),
      overrides.occupationsText ?? readFile(resolve(root,
        'data/novgorod-region/novgorod_occupations_v1_enriched.tsv'), 'utf8')
    ]);
  validatePins({ authoring, overlay, manifest, finalApproval, promotion });
  await validateV5DatasetDigests(root, manifest, overrides);
  const attestations = new Map([fishingAttestation, dryingAttestation,
    naturalAttestation].map((row) => [row.candidate_ref, row]));
  const candidates = new Map(overlay.candidates.map((row) =>
    [`${row.candidate_id}@${row.version}`, row]));
  for (const [ref, attestation] of attestations) {
    const candidate = exactMap(candidates, ref, 'FUNCTIONAL_FAMILY_CANDIDATE');
    if (attestation.authoring_approved !== true
        || attestation.candidate_digest !== candidate.candidate_digest
          && attestation.rebound_candidate_digest !== candidate.candidate_digest)
      fail('FUNCTIONAL_FAMILY_ATTESTATION_INVALID', ref);
  }

  const rows = authoring.mapping_rows.map((row) => {
    validateEvidence(row, exactMap(candidates, row.family_candidate_ref,
      'FUNCTIONAL_FAMILY_CANDIDATE'));
    if (row.selection.kind === 'v5_profile_object_categories') return {
      mapping_id: row.mapping_id,
      family_candidate_ref: row.family_candidate_ref,
      variant_id: row.variant_id,
      layer: row.layer,
      required: row.required,
      semantics: row.semantics,
      selection_mode: row.selection.mode,
      candidates: selectV5Candidates(row.selection, { profileEntries,
        profileSets, templates, categoryBindings, quantityProfiles, inventoryProfiles,
        sourceBindings }),
      evidence: structuredClone(row.evidence)
    };
    const family = exactMap(candidates, row.family_candidate_ref,
      'FUNCTIONAL_FAMILY_CANDIDATE');
    if (row.selection.kind === 'approved_g6_place_function') {
      const slot = exact(family.spatial_closure_ref.g6_slots,
        row.selection.scene_slot_key, 'scene_slot_key', 'FUNCTIONAL_G6_SLOT');
      if (row.selection.item_or_container !== false)
        fail('FUNCTIONAL_STORAGE_MUST_BE_PLACE_FUNCTION', row.mapping_id);
      return { mapping_id: row.mapping_id,
        family_candidate_ref: row.family_candidate_ref,
        variant_id: row.variant_id, layer: row.layer, required: row.required,
        semantics: row.semantics, persistent: true,
        place_function_ref: {
          scene_template_id: family.spatial_closure_ref.scene_template_id,
          scene_template_version: family.spatial_closure_ref.scene_template_version,
          g5_id: family.spatial_closure_ref.g5_id,
          g5_version: family.spatial_closure_ref.g5_version,
          scene_slot_key: slot.scene_slot_key,
          physical_class_id: slot.physical_class_id,
          primary_scene_role_id: slot.primary_scene_role_id
        }, item_template_refs: [], container_template_refs: [],
        evidence: structuredClone(row.evidence) };
    }
    if (row.selection.kind === 'approved_candidate_semantics') {
      for (const id of row.selection.semantic_ids)
        if (!family.allowed_semantics.includes(id))
          fail('FUNCTIONAL_NATURAL_SEMANTIC_INVALID', id);
      return { mapping_id: row.mapping_id,
        family_candidate_ref: row.family_candidate_ref,
        variant_id: row.variant_id, layer: row.layer, required: row.required,
        semantics: row.semantics,
        typed_semantic_refs: [...row.selection.semantic_ids],
        local_taxon_authorized: false, local_resource_authorized: false,
        evidence: structuredClone(row.evidence) };
    }
    fail('FUNCTIONAL_SELECTION_KIND_INVALID', row.mapping_id);
  });

  const occupationRows = parseTsv(occupationsText);
  const conditionalContext = authoring.conditional_context_rows.map((row) => {
    const occupation = exact(occupationRows, row.occupation_ref, 'occupation_id',
      'FUNCTIONAL_OCCUPATION');
    if (occupation.status !== 'approved'
        || occupation.mapping_review_status !== 'accepted_with_caution')
      fail('FUNCTIONAL_OCCUPATION_NOT_APPROVED', row.occupation_ref);
    return { family_candidate_ref: row.family_candidate_ref, layer: row.layer,
      required: false, occupation_ref: row.occupation_ref,
      occupation_status: occupation.status,
      mapping_review_status: occupation.mapping_review_status,
      evidence: structuredClone(row.evidence) };
  });

  const payload = {
    schema: 'rus.procedural_scene_functional_mapping_candidate.v1',
    candidate_id: 'novgorod_procedural_functional_mapping_candidate_001',
    version: 1, status: 'candidate_approval_pending',
    authoring_approval: 'pending_independent_review',
    import_authorized: false, activation_authorized: false,
    activation_request: null,
    provenance: {
      authoring_id: authoring.authoring_id,
      authoring_version: authoring.version,
      authoring_rows_digest: digest(authoring),
      v5_bundle_id: manifest.bundle_id,
      v5_candidate_digest: manifest.candidate_digest,
      v5_approval_request_digest: finalApproval.request_digest,
      v5_target_revision_id: promotion.target_revision_id,
      v5_target_catalog_digest: promotion.target_catalog_digest,
      v5_dataset_digests: Object.fromEntries(manifest.datasets.filter(({ table }) =>
        V5_TABLES.includes(table)).map(({ table, sha256 }) => [table, sha256])),
      route_free_overlay_id: overlay.overlay_id,
      route_free_overlay_digest: overlay.overlay_digest,
      family_attestation_digests: Object.fromEntries([...attestations]
        .sort(([a], [b]) => a.localeCompare(b)).map(([ref, value]) =>
          [ref, value.attestation_digest]))
    },
    source_accounting: {
      source_identity_policy: 'single_committed_source_ref',
      unrevealed_stock_and_created_item_may_share_source: false,
      runtime_instances_created: false
    },
    mappings: rows.sort((a, b) => a.mapping_id.localeCompare(b.mapping_id)),
    conditional_context: conditionalContext,
    remaining_gaps: structuredClone(authoring.remaining_gap_rows)
  };
  validateProceduralFunctionalMappingCandidate(payload);
  const candidate = { ...payload, candidate_digest: digest(payload) };
  const requestPayload = {
    schema: 'rus.procedural_scene_functional_mapping_approval_request.v1',
    request_id: 'novgorod_procedural_functional_mapping_review_001',
    decision_requested: 'review_functional_mapping_candidate',
    authoring_approval: 'pending_independent_review',
    import_authorized: false, activation_authorized: false,
    activation_request: null,
    candidate_ref: `${candidate.candidate_id}@${candidate.version}`,
    candidate_digest: candidate.candidate_digest,
    mapping_ids: candidate.mappings.map(({ mapping_id: id }) => id),
    remaining_gap_codes: candidate.remaining_gaps.map(({ code }) => code)
  };
  return { candidate, approvalRequest: { ...requestPayload,
    request_digest: digest(requestPayload) } };
}

export function validateProceduralFunctionalMappingCandidate(candidate) {
  if (candidate.status !== 'candidate_approval_pending'
      || candidate.authoring_approval !== 'pending_independent_review'
      || candidate.import_authorized !== false
      || candidate.activation_authorized !== false
      || candidate.activation_request !== null)
    fail('FUNCTIONAL_MAPPING_STATUS_INVALID');
  const serialized = JSON.stringify(candidate);
  if (/"(?:title|display_name|presence_percentage|presence_probability)"\s*:/u
    .test(serialized)) fail('FUNCTIONAL_DISPLAY_OR_PRESENCE_MATCH_FORBIDDEN');
  if (candidate.source_accounting.runtime_instances_created !== false
      || candidate.source_accounting
        .unrevealed_stock_and_created_item_may_share_source !== false)
    fail('FUNCTIONAL_SOURCE_ACCOUNTING_INVALID');

  const byFamilyVariant = (family, variant) => candidate.mappings.filter((row) =>
    row.family_candidate_ref === family && row.variant_id === variant);
  const fishing = byFamilyVariant('novgorod_inland_fishing_worksite_v3@1',
    'active_worksite');
  exactLayers(fishing, ['storage', 'tool', 'work_material', 'work_zone'],
    'FUNCTIONAL_FISHING_COMPLETENESS');
  const dormant = byFamilyVariant('novgorod_drying_storage_workspace_v3@1',
    'dormant');
  exactLayers(dormant, ['storage', 'work_zone'],
    'FUNCTIONAL_DRYING_DORMANT_COMPLETENESS');
  if (dormant.some((row) => row.candidates?.length))
    fail('FUNCTIONAL_DRYING_DORMANT_OBJECT_FORBIDDEN');
  exactLayers(byFamilyVariant('novgorod_natural_shore_v3@1', 'baseline'),
    ['natural_layers'], 'FUNCTIONAL_NATURAL_COMPLETENESS');
  for (const row of candidate.mappings.filter(({ layer }) =>
    layer === 'storage' || layer === 'work_zone')) {
    if (row.semantics !== 'persistent_place_function_group'
        || row.persistent !== true || row.item_template_refs.length
        || row.container_template_refs.length)
      fail('FUNCTIONAL_STORAGE_MUST_BE_PLACE_FUNCTION', row.mapping_id);
  }
  const itemRows = candidate.mappings.filter(({ candidates }) => candidates);
  const seen = new Map();
  for (const row of itemRows) for (const member of row.candidates) {
    const prior = seen.get(member.item_template_ref);
    if (prior) fail('FUNCTIONAL_CROSS_LAYER_SOURCE_DUPLICATE',
      `${prior}:${row.mapping_id}:${member.item_template_ref}`);
    seen.set(member.item_template_ref, row.mapping_id);
  }
  const gaps = new Set(candidate.remaining_gaps.map(({ code }) => code));
  for (const code of ['FUNCTIONAL_CONTAINER_MAPPING_MISSING',
    'ACTIVE_PROCESS_TOOL_REF_REQUIRED', 'ACTIVE_PROCESS_MATERIAL_REF_REQUIRED',
    'ACTIVE_PROCESS_CONTAINER_MAPPING_CONDITIONAL',
    'FINITE_WRECK_SOURCE_REF_REQUIRED']) if (!gaps.has(code))
    fail('FUNCTIONAL_TYPED_GAP_MISSING', code);
  return candidate;
}

function selectV5Candidates(selection, tables) {
  const profileSet = exact(tables.profileSets, selection.profile_id, 'id',
    'FUNCTIONAL_PROFILE_SET');
  if (profileSet.status !== 'draft') fail('FUNCTIONAL_V5_STATUS_INVALID',
    profileSet.id);
  const profile = tables.profileEntries.filter(({ profile_id: id }) =>
    id === selection.profile_id);
  return selection.object_category_ids.map((categoryId) => {
    const bindings = tables.categoryBindings.filter((row) =>
      row.category_id === categoryId && row.binding_kind === 'object_type');
    if (bindings.length !== 1) fail(bindings.length
      ? 'FUNCTIONAL_CATEGORY_MAPPING_AMBIGUOUS'
      : 'FUNCTIONAL_CATEGORY_MAPPING_MISSING', categoryId);
    const templateId = bindings[0].item_template_id;
    const entry = exact(profile, templateId, 'item_template_id',
      'FUNCTIONAL_PROFILE_ENTRY');
    const template = exact(tables.templates, templateId, 'id',
      'FUNCTIONAL_ITEM_TEMPLATE');
    if (template.category_id !== categoryId || template.status !== 'draft')
      fail('FUNCTIONAL_V5_TEMPLATE_PIN_INVALID', templateId);
    const quantity = exact(tables.quantityProfiles, templateId,
      'item_template_id', 'FUNCTIONAL_QUANTITY_PROFILE');
    const inventory = exact(tables.inventoryProfiles, templateId,
      'item_template_id', 'FUNCTIONAL_INVENTORY_PROFILE');
    if (bindings[0].status !== 'draft' || quantity.status !== 'draft'
        || inventory.status !== 'draft') fail('FUNCTIONAL_V5_STATUS_INVALID',
      templateId);
    const sources = tables.sourceBindings.filter(({ item_template_id: id }) =>
      id === templateId);
    for (const scope of REQUIRED_SOURCE_SCOPES) if (sources.filter((row) =>
      row.claim_scope === scope && row.review_status === 'reviewed'
        && row.status === 'draft').length !== 1)
      fail('FUNCTIONAL_SOURCE_BINDING_INCOMPLETE', `${templateId}:${scope}`);
    return {
      profile_entry_ref: entry.id,
      profile_ref: entry.profile_id,
      item_template_ref: template.id,
      object_category_ref: categoryId,
      quantity_profile_ref: quantity.id,
      inventory_profile_ref: inventory.id,
      source_binding_refs: sources.map(({ id }) => id).sort(),
      source_refs: [...new Set([template.source_id, quantity.source_id,
        inventory.source_id, ...sources.map(({ source_id: id }) => id)])].sort(),
      min_quantity: entry.min_quantity,
      max_quantity: entry.max_quantity,
      source_required: entry.required,
      source_weight: entry.weight,
      quantity_policy: structuredClone(quantity.default_quantity_policy)
    };
  }).sort((a, b) => a.item_template_ref.localeCompare(b.item_template_ref));
}

function validatePins({ authoring, overlay, manifest, finalApproval,
  promotion }) {
  const pins = authoring.source_pins;
  if (manifest.bundle_id !== EXPECTED.bundle
      || manifest.candidate_digest !== EXPECTED.candidate
      || finalApproval.decision !== 'approve_all_120'
      || finalApproval.candidate_digest !== EXPECTED.candidate
      || finalApproval.request_digest !== EXPECTED.request
      || finalApproval.activation_authorized !== false
      || promotion.target_revision_id !== EXPECTED.targetRevision
      || promotion.target_catalog_digest !== EXPECTED.targetCatalog
      || promotion.activation_performed !== false
      || overlay.overlay_digest !== EXPECTED.overlay
      || pins.v5_bundle_id !== EXPECTED.bundle
      || pins.v5_candidate_digest !== EXPECTED.candidate
      || pins.v5_approval_request_digest !== EXPECTED.request
      || pins.v5_target_revision_id !== EXPECTED.targetRevision
      || pins.v5_target_catalog_digest !== EXPECTED.targetCatalog
      || pins.route_free_overlay_digest !== EXPECTED.overlay)
    fail('FUNCTIONAL_SOURCE_PIN_MISMATCH');
}

const V5_TABLES = Object.freeze(['item_profile_sets', 'item_profile_entries',
  'item_templates', 'item_template_category_bindings',
  'item_template_quantity_profiles', 'item_template_inventory_profiles',
  'item_template_source_bindings']);

async function validateV5DatasetDigests(root, manifest, overrides) {
  const datasets = new Map(manifest.datasets.map((row) => [row.table, row]));
  for (const table of V5_TABLES) {
    const dataset = exactMap(datasets, table, 'FUNCTIONAL_V5_DATASET');
    const relative = `${V5_ROOT}/${dataset.path}`;
    if (Object.hasOwn(overrides, relative)) continue;
    const content = JSON.parse(await readFile(resolve(root, relative), 'utf8'));
    const actual = digestValue(content);
    if (actual !== dataset.sha256) fail('FUNCTIONAL_V5_DATASET_DIGEST_MISMATCH',
      table);
  }
}

function validateEvidence(row, family) {
  if (!row.evidence?.directness || !row.evidence.confidence
      || !row.evidence.limits) fail('FUNCTIONAL_EVIDENCE_INCOMPLETE',
    row.mapping_id);
  const claims = new Set(family.evidence_claims.map(({ claim_ref: ref }) => ref));
  for (const ref of row.evidence.claim_refs ?? []) if (!claims.has(ref))
    fail('FUNCTIONAL_EVIDENCE_REF_INVALID', `${row.mapping_id}:${ref}`);
}

function exactLayers(rows, expected, code) {
  const actual = rows.map(({ layer }) => layer).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) fail(code);
}
function exact(rows, id, key, code) {
  const found = rows.filter((row) => row[key] === id);
  if (found.length !== 1) fail(`${code}_${found.length ? 'AMBIGUOUS' : 'MISSING'}`,
    id);
  return found[0];
}
function exactMap(map, id, code) {
  if (!map.has(id)) fail(`${code}_MISSING`, id);
  return map.get(id);
}
function parseTsv(text) {
  const [header, ...lines] = text.trimEnd().split(/\r?\n/u);
  const keys = header.split('\t');
  return lines.map((line) => Object.fromEntries(line.split('\t').map((value,
    index) => [keys[index], value])));
}
function fail(code, detail = '') {
  throw Object.assign(new Error(detail ? `${code}:${detail}` : code), { code });
}
function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
async function json(path) { return JSON.parse(await readFile(path, 'utf8')); }

async function main(argv) {
  const root = resolve(argv.find((arg) => !arg.startsWith('--')) ?? '.');
  const result = await generateProceduralFunctionalMappings(root);
  const outputs = [
    [resolve(root, OUTPUT_ROOT, 'candidate.json'), result.candidate],
    [resolve(root, OUTPUT_ROOT, 'approval-request.json'), result.approvalRequest]
  ];
  if (argv.includes('--validate')) {
    for (const [path, expected] of outputs) {
      const actual = await json(path);
      if (actual.schema ===
        'rus.procedural_scene_functional_mapping_candidate.v1')
        validateProceduralFunctionalMappingCandidate(actual);
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        fail('FUNCTIONAL_MAPPING_GENERATED_STALE', path);
    }
  } else if (argv.includes('--check')) {
    for (const [path, value] of outputs) if (await readFile(path, 'utf8')
      !== `${JSON.stringify(value, null, 2)}\n`)
      fail('FUNCTIONAL_MAPPING_GENERATED_STALE', path);
  } else {
    await mkdir(resolve(root, OUTPUT_ROOT), { recursive: true });
    await Promise.all(outputs.map(([path, value]) => writeFile(path,
      `${JSON.stringify(value, null, 2)}\n`, 'utf8')));
  }
  process.stdout.write(`${JSON.stringify({ pass: true,
    mode: argv.includes('--validate') ? 'validate'
      : argv.includes('--check') ? 'check' : 'write',
    candidate_digest: result.candidate.candidate_digest,
    request_digest: result.approvalRequest.request_digest }, null, 2)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main(process.argv.slice(2));
