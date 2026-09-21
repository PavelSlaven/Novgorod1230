import { deepFreeze } from '@rus/kernel';
import { canonicalDigest, MaterializationError } from './core.js';

/** Authoring-only validation; runtime never accepts this candidate shape. */
export function validateProceduralSceneAuthoringCandidate({ candidate,
  world_pin: worldPin } = {}) {
  if (candidate?.schema !== 'rus.procedural_scene_authoring_candidate.v1'
      || candidate.status !== 'candidate_approval_pending'
      || !text(candidate.candidate_id) || !text(candidate.family)
      || candidate.route_required !== false || Object.hasOwn(candidate, 'route_ref')
      || candidate.spatial_closure_ref?.world_revision_id
        !== worldPin?.world_revision_id
      || !text(candidate.spatial_closure_ref?.scene_template_digest)
      || !text(candidate.spatial_closure_ref?.g5_digest)
      || !Array.isArray(candidate.evidence_claims)
      || candidate.evidence_claims.some(({ claim_ref, review_status, evidence_refs }) =>
        !text(claim_ref) || review_status !== 'approved'
          || !Array.isArray(evidence_refs) || evidence_refs.length === 0)
      || containsForbiddenField(candidate)) invalid('AUTHORING_CANDIDATE');
  return deepFreeze(structuredClone(candidate));
}

/** Compiles one materialized scene from exact activated V2 catalog records. */
export function compileProceduralSceneProfile({
  verified_procedural_compiled_catalog: catalog,
  scene,
  world_pin: worldPin
} = {}) {
  if (!verifiedCatalog(catalog) || !sceneIdentity(scene)
      || catalog.pin.compatible_world_revision_id !== worldPin?.world_revision_id
      || catalog.pin.compatible_world_catalog_digest !== worldPin?.world_catalog_digest) {
    invalid('INPUT');
  }
  const profiles = catalog.profiles.filter(({ payload }) => text(payload?.family));
  const matches = profiles.filter(({ payload }) =>
    payload.spatial_closure_ref?.scene_template_id === scene.scene_template_id
      && payload.spatial_closure_ref?.g5_id === scene.g5_id);
  if (matches.length !== 1) gap('SCENE_CLOSURE', scene);
  const profileRecord = matches[0];
  const familyCandidateRef = `${profileRecord.record_id.slice('profile:'.length)}@1`;
  const mappings = catalog.mappings.filter(({ payload }) =>
    payload?.family_candidate_ref === familyCandidateRef);
  if (mappings.length === 0) gap('FUNCTION_LAYERS', profileRecord.record_id);
  const components = mappings.map(component).sort(byComponent);
  const requiredLayers = [...new Set(mappings.filter(({ payload }) => payload.required === true)
    .map(({ payload }) => payload.layer))].filter((layer) =>
    !components.some((component) => component.layer === layer)).sort();
  if (requiredLayers.length > 0) gap('FUNCTION_LAYERS', { family: profileRecord.payload.family, missing: requiredLayers });
  const historicalSourceGaps = structuredClone(profileRecord.payload.data_gap_codes ?? []);
  const readiness = reconcileReadiness({ profileRecord, mappings,
    allocationPolicy: catalog.allocation_policy?.payload?.policy,
    familyCandidateRef, historicalSourceGaps });
  const artifact = {
    schema: 'rus.compiled_procedural_scene_profile.v1', version: 1,
    family: profileRecord.payload.family,
    family_candidate_ref: familyCandidateRef,
    world_pin: structuredClone(worldPin),
    spatial_closure_ref: structuredClone(profileRecord.payload.spatial_closure_ref),
    scene: structuredClone(scene),
    required_layers: [...new Set(components.filter(({ required }) => required)
      .map(({ layer }) => layer))].sort(),
    components,
    regional_facets: regionalFacets(catalog.profiles),
    allowed_semantics: structuredClone(profileRecord.payload.allowed_semantics ?? []),
    requirements: structuredClone(profileRecord.payload.requirements ?? {}),
    forbidden_implications: structuredClone(profileRecord.payload.forbidden_implications ?? []),
    materialization_limits: structuredClone(profileRecord.payload.materialization_limits ?? []),
    historical_source_data_gap_codes: historicalSourceGaps,
    authoring_approval: structuredClone(profileRecord.payload.authoring_approval ?? null),
    source_candidate_digest: profileRecord.payload.source_candidate_digest ?? null,
    readiness,
    optional_selection_policy: 'source_weighted_candidates_only',
    optional_presence_policy: null,
    gameplay_materialization_llm_calls: 0
  };
  return deepFreeze({ ...artifact, artifact_digest: canonicalDigest(artifact) });
}

function verifiedCatalog(value) {
  return value?.schema === 'rus.verified_procedural_compiled_catalog.v1'
    && value.verified === true && Array.isArray(value.profiles)
    && Array.isArray(value.mappings) && value.pin != null
    && value.allocation_policy?.payload?.runtime_status
      === 'pending_runtime_inventory_owner_validation';
}
function sceneIdentity(scene) {
  return object(scene) && [scene.scene_template_id, scene.g5_id,
    scene.g5_node_id, scene.g6_instance_id, scene.position_id].every(text);
}
function component(record) {
  const payload = record.payload;
  if (!text(record.record_id) || !text(payload?.layer)) gap('MAPPING', record.record_id);
  return deepFreeze({
    component_ref: record.record_id,
    layer: payload.layer,
    required: payload.required === true,
    owner_ref: { table: 'procedural_scene_compiled_records', id: record.record_id },
    source_field: 'payload', source_value: structuredClone(payload),
    ...(Array.isArray(payload.candidates)
      ? { candidates: structuredClone(payload.candidates) } : {}),
    ...(payload.place_function_ref == null
      ? {} : { place_function_ref: structuredClone(payload.place_function_ref) }),
    ...(payload.typed_semantic_refs == null
      ? {} : { typed_semantic_refs: structuredClone(payload.typed_semantic_refs) })
  });
}
function regionalFacets(profiles) {
  return profiles.filter(({ payload }) => payload?.owner === 'regional_environment')
    .map(({ record_id: profile_ref, payload }) => deepFreeze({ profile_ref,
      domain: payload.domain ?? 'drying_workspace',
      approved_members: payload.approved_members == null
        ? [{ universal: structuredClone(payload.universal_row),
          regional: structuredClone(payload.regional_row),
          applicability_guard: structuredClone(payload.applicability_guard) }]
        : structuredClone(payload.approved_members)
    }))
    .sort((a, b) => a.profile_ref.localeCompare(b.profile_ref));
}
function reconcileReadiness({ profileRecord, mappings, allocationPolicy,
  familyCandidateRef, historicalSourceGaps }) {
  const expected = new Map();
  for (const code of historicalSourceGaps) {
    const layer = functionalLayerFromGap(code);
    if (layer) expected.set(layer, { source_gap_code: code });
  }
  for (const { payload } of mappings) expected.set(payload.layer,
    { mapping_required: payload.required === true });
  if (allocationPolicy?.family_candidate_ref === familyCandidateRef) {
    for (const allocation of allocationPolicy.allocations ?? []) {
      if (text(allocation?.layer)) expected.set(allocation.layer,
        { allocation_contract: true });
    }
  }
  const mapped = new Set(mappings.map(({ payload }) => payload.layer));
  const layers = [...expected].map(([layer, basis]) => ({ layer,
    status: mapped.has(layer) ? 'resolved' : layer === 'container'
      ? 'unresolved' : 'unresolved', ...basis })).sort((a, b) =>
    a.layer.localeCompare(b.layer));
  return { required_layers_satisfied: true, functional_layers: layers,
    unresolved_current_gaps: layers.filter(({ status }) => status !== 'resolved')
      .map(({ source_gap_code, layer }) => source_gap_code ?? `MAPPING:${layer}`) };
}
function functionalLayerFromGap(code) {
  const match = /^FUNCTIONAL_([A-Z_]+)_MAPPING_MISSING$/u.exec(code ?? '');
  return match == null ? null : match[1].toLowerCase();
}
function gap(kind, details) {
  throw new MaterializationError('PROCEDURAL_SCENE_PROFILE_DATA_GAP',
    'Exact procedural scene profile data is incomplete.', { kind, details });
}
function invalid(reason) { throw new MaterializationError(
  'PROCEDURAL_SCENE_PROFILE_COMPILER_INVALID', 'Compiler input is invalid.',
  { reason }); }
function text(value) { return typeof value === 'string' && value.trim() === value && value.length > 0; }
function object(value) { return value != null && typeof value === 'object' && !Array.isArray(value); }
function byComponent(a, b) { return a.layer.localeCompare(b.layer) || a.component_ref.localeCompare(b.component_ref); }
function containsForbiddenField(value) {
  if (Array.isArray(value)) return value.some(containsForbiddenField);
  return object(value) && Object.entries(value).some(([key, child]) =>
    ['quantity', 'capacity', 'route_ref'].includes(key)
      || containsForbiddenField(child));
}
