import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(HERE, '../../../../../..');
const SOURCE_PATH = resolve(HERE, 'source-authoring.json');
const AUDIT_SOURCE_REF =
  'task-input:Novgorod1230_Regional_Environment_Audit_Novgorod_1230_1250.md';
const APPROVAL_SUBJECT_COMMIT =
  '20275b3a39372d1dc5c4fa95d21660dbb44420b3';
const APPROVAL_DATE = '2026-09-21';
const DRYING_ENABLEMENT_ATTESTATION_DIGEST =
  '2ead91157c3efc214c7431bd47cb79acfd1e334f814d74dc9c45ea96a7ecd550';
const FORBIDDEN_NEW_PLACE_KEYS = [
  'fire', 'fuel', 'material', 'container', 'tool', 'npc', 'process'
];

const DOMAINS = {
  landscape: {
    count: 34,
    universalTable: 'landscape_templates',
    regionalTable: 'region_landscape_templates',
    seed: 'infra/world-base/landscape_templates.seed.json',
    regionalArchive: 'nov_region_audit/novgorod_region_template_links_v1_full_pack_EXTRACTED/novgorod_region_landscape_templates.tsv',
    idField: 'landscape_template_id'
  },
  water: {
    count: 21,
    universalTable: 'water_body_templates',
    regionalTable: 'region_water_body_templates',
    seed: 'infra/world-base/water_body_templates.seed.json',
    regionalArchive: 'nov_region_audit/novgorod_region_template_links_v1_full_pack_EXTRACTED/novgorod_region_water_body_templates.tsv',
    idField: 'water_body_template_id'
  },
  land_use: {
    count: 24,
    universalTable: 'land_use_templates',
    regionalTable: 'region_land_use_templates',
    seed: 'infra/world-base/land_use_templates.seed.json',
    regionalArchive: 'nov_region_audit/novgorod_region_template_links_v1_full_pack_EXTRACTED/novgorod_region_land_use_templates.tsv',
    idField: 'land_use_template_id'
  },
  place: {
    count: 37,
    universalTable: 'place_templates',
    regionalTable: 'region_place_templates',
    seed: 'infra/world-base/place_templates.seed.json',
    regionalArchive: 'nov_region_audit/novgorod_region_template_links_v1_full_pack_EXTRACTED/novgorod_region_place_templates.tsv',
    idField: 'place_template_id'
  }
};

export async function generateRegionalEnvironmentRevision(root = DEFAULT_ROOT) {
  const source = JSON.parse(await readFile(SOURCE_PATH, 'utf8'));
  const archive = resolve(root, source.source_bundle.archive_path);
  const archiveBytes = await readFile(archive);
  assert(sha256(archiveBytes) === source.source_bundle.archive_sha256,
    'SOURCE_ARCHIVE_DIGEST_MISMATCH');
  const sourceManifest = JSON.parse(await readFile(
    resolve(root, source.source_bundle.manifest_path), 'utf8'));
  assert(sourceManifest.archive.sha256 === source.source_bundle.archive_sha256,
    'SOURCE_MANIFEST_ARCHIVE_MISMATCH');

  const promotions = {};
  const dataGaps = [];
  for (const [domain, spec] of Object.entries(DOMAINS)) {
    const seedRows = JSON.parse(await readFile(resolve(root, spec.seed), 'utf8'));
    const regionalRows = parseTsv(execFileSync('tar', [
      '-xOf', archive, spec.regionalArchive
    ], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }));
    promotions[domain] = source.selectors[domain].flatMap((id) => {
      const universalSource = exactlyOne(seedRows, 'id', id,
        `UNIVERSAL_SOURCE_ROW_MISSING:${domain}:${id}`);
      const regionalMatches = regionalRows.filter((row) => row[spec.idField] === id);
      if (regionalMatches.length === 0) {
        dataGaps.push({
          code: 'AUDIT_SELECTOR_PREPARED_MEMBERSHIP_MISMATCH',
          domain,
          template_id: id,
          audit_verdict: 'APPROVE',
          candidate_status: 'blocked_missing_prepared_regional_row',
          required_resolution: 'independent authoring and audit of exact regional row',
          substitution_forbidden: true
        });
        return [];
      }
      assert(regionalMatches.length === 1,
        `REGIONAL_SOURCE_ROW_DUPLICATE:${domain}:${id}`);
      const [regionalSource] = regionalMatches;
      assert(regionalSource.region_id === source.region_id,
        `REGIONAL_SOURCE_REGION_MISMATCH:${domain}:${id}`);
      const requiredContextRefs = source.conditional_guards[id] ?? [];
      const universal = { ...structuredClone(universalSource), status: 'approved' };
      const regional = { ...structuredClone(regionalSource), is_allowed: true,
        status: 'approved' };
      if (requiredContextRefs.length > 0) {
        regional.regional_limits = appendGuard(regional.regional_limits,
          requiredContextRefs);
      }
      return [{
        audit_verdict: requiredContextRefs.length > 0
          ? 'APPROVE_WITH_LIMITS' : 'APPROVE',
        required_context_refs: requiredContextRefs,
        context_guard: requiredContextRefs.length > 0 ? {
          schema: source.context_ref_schema.guard_schema,
          enforcement: source.context_ref_schema.enforcement,
          required_ref_fields: requiredContextRefs
        } : null,
        source_refs: unique([
          source.audit.source_ref,
          ...universalSource.sources,
          ...regionalSource.sources
        ]),
        source_row_digests: {
          universal: digest(universalSource),
          regional: digest(regionalSource)
        },
        universal,
        regional
      }];
    });
  }

  const newPlace = await buildNewPlace(root, source);
  const sourceAuthoringDigest = sha256(await readFile(SOURCE_PATH));
  const candidatePayload = {
    schema: 'rus.regional_environment_authoring_candidate.v1',
    revision_id: source.revision_id,
    status: 'pending_independent_approval',
    region_id: source.region_id,
    period: structuredClone(source.period),
    source_authoring_digest: sourceAuthoringDigest,
    source_bundle: structuredClone(source.source_bundle),
    audit: structuredClone(source.audit),
    context_ref_schema: structuredClone(source.context_ref_schema),
    audit_selector_counts: Object.fromEntries(Object.entries(DOMAINS)
      .map(([domain, spec]) => [domain, spec.count])),
    promotion_counts: Object.fromEntries(Object.entries(promotions)
      .map(([domain, rows]) => [domain, rows.length])),
    promotions,
    data_gaps: dataGaps,
    explicit_exclusions: [...source.explicit_exclusions],
    minimum_m3_rows: [...source.minimum_m3_rows],
    pending_rows: newPlace,
    import_authorized: false,
    activation_authorized: false,
    activation_request: null,
    combined_import_pack_status: 'stale_intermediate'
  };
  const candidate = { ...candidatePayload,
    candidate_digest: digest(candidatePayload) };

  const reviewRows = Object.entries(promotions).flatMap(([domain, rows]) =>
    rows.map((entry) => ({
      domain,
      universal_id: entry.universal.id,
      regional_id: entry.regional.id,
      audit_verdict: entry.audit_verdict,
      proposed_universal_status: entry.universal.status,
      proposed_regional_status: entry.regional.status,
      proposed_is_allowed: entry.regional.is_allowed,
      required_context_refs: [...entry.required_context_refs],
      context_guard: structuredClone(entry.context_guard),
      regional_limits: entry.regional.regional_limits,
      source_refs: [...entry.source_refs],
      source_row_digests: structuredClone(entry.source_row_digests)
    })));
  const requestPayload = {
    schema: 'rus.regional_environment_approval_request.v1',
    request_id: 'novgorod_regional_environment_1230_1250_review_001',
    revision_id: source.revision_id,
    candidate_digest: candidate.candidate_digest,
    decision_requested: 'approve_exact_audited_promotions_and_review_new_place',
    region_id: source.region_id,
    period: structuredClone(source.period),
    row_reviews: reviewRows,
    pending_new_place_review: {
      decision_requested: 'independent_review_required',
      candidate_status: newPlace.candidate_status,
      universal_id: newPlace.universal_row.id,
      regional_id: newPlace.regional_row.id,
      source_refs: [...newPlace.universal_row.sources],
      spatial_context_ref: structuredClone(newPlace.spatial_context_ref)
    },
    import_authorized: false,
    activation_authorized: false,
    production_authorized: false,
    default_authorized: false,
    rematerialization_authorized: false
  };
  const approvalRequest = { ...requestPayload,
    request_digest: digest(requestPayload) };

  validateRevision({ source, candidate, approvalRequest });
  const candidateBytes = jsonBytes(candidate);
  const requestBytes = jsonBytes(approvalRequest);
  const manifestPayload = {
    schema: 'rus.regional_environment_authoring_manifest.v1',
    revision_id: source.revision_id,
    region_id: source.region_id,
    period: structuredClone(source.period),
    candidate_digest: candidate.candidate_digest,
    approval_request_digest: approvalRequest.request_digest,
    files: [
      { path: 'source-authoring.json', sha256: sourceAuthoringDigest },
      { path: 'candidate.json', sha256: sha256(candidateBytes) },
      { path: 'approval-request.json', sha256: sha256(requestBytes) }
    ],
    import_authorized: false,
    activation_authorized: false
  };
  const manifest = { ...manifestPayload,
    manifest_digest: digest(manifestPayload) };
  const validationReport = {
    schema: 'rus.regional_environment_validation_report.v1',
    revision_id: source.revision_id,
    verdict: 'PASS',
    checks: [
      'exact_selectors_and_counts', 'universal_and_regional_status',
      'conditional_context_guards', 'explicit_exclusions',
      'source_and_provenance', 'region_and_period',
      'no_weight_scale_node_or_commonness_drift',
      'new_place_process_boundary', 'no_import_or_activation'
    ],
    candidate_digest: candidate.candidate_digest,
    approval_request_digest: approvalRequest.request_digest,
    manifest_digest: manifest.manifest_digest,
    rows_requiring_second_audit:
      dataGaps.map(({ template_id: id }) => id)
  };
  const attestations = buildApprovalAttestations({ candidate, approvalRequest,
    manifest });
  validateApprovalAttestations({ candidate, approvalRequest, manifest,
    ...attestations });
  const dryingEnablementAttestation = buildDryingEnablementAttestation({
    candidate, approvalRequest, manifest,
    dryingDesignAttestation: attestations.dryingDesignAttestation
  });
  applyDryingEnablement({ candidate, dryingEnablementAttestation });
  return { candidate, approvalRequest, manifest, validationReport,
    ...attestations, dryingEnablementAttestation };
}

export function applyDryingEnablement({ candidate,
  dryingEnablementAttestation: attestation }) {
  const { attestation_digest: claimed, ...payload } = attestation;
  assert(claimed === DRYING_ENABLEMENT_ATTESTATION_DIGEST
    && digest(payload) === claimed, 'DRYING_ENABLEMENT_ATTESTATION_DIGEST_MISMATCH');
  const pending = candidate.pending_rows;
  assert(attestation.schema ===
      'rus.regional_environment_drying_enablement_attestation.v1'
    && attestation.subject_commit_sha ===
      'e53f911677fef38863897b5ea25c6aa0cb3fc138'
    && attestation.revision_id === candidate.revision_id
    && attestation.candidate_digest === candidate.candidate_digest
    && attestation.pending_bundle_digest === digest(pending)
    && attestation.evidence_attestation_digest ===
      pending.evidence_attestation_digest
    && attestation.universal_row.id === pending.universal_row.id
    && attestation.universal_row.digest === digest(pending.universal_row)
    && attestation.regional_row.id === pending.regional_row.id
    && attestation.regional_row.digest === digest(pending.regional_row),
  'DRYING_ENABLEMENT_SOURCE_BINDING_INVALID');
  assert(attestation.approval_scope ===
      'authoring_and_exact_regional_enablement_only'
    && attestation.authoring_approved === true
    && attestation.regional_enablement_approved === true
    && attestation.generic_regional_generation_authorized === false
    && attestation.import_authorized === false
    && attestation.activation_authorized === false
    && attestation.production_authorized === false
    && attestation.default_authorized === false
    && attestation.rematerialization_authorized === false
    && attestation.activation_request === null,
  'DRYING_ENABLEMENT_AUTHORITY_INVALID');
  assert(JSON.stringify(attestation.applicability_guard) === JSON.stringify({
    mode: 'exact_spatial_context_only',
    ...pending.spatial_context_ref,
    reject_if_context_mismatch: true
  }), 'DRYING_ENABLEMENT_SPATIAL_GUARD_INVALID');
  assert(JSON.stringify(attestation.process_state_contract) ===
      JSON.stringify(pending.process_state_contract)
    && JSON.stringify(attestation.forbidden_implications) === JSON.stringify([
      'generic_regional_generation', 'mandatory_water', 'route', 'fire',
      'heat', 'fuel', 'material', 'container', 'tool', 'npc', 'process',
      'pt_forest_work_camp_substitution'
    ]), 'DRYING_ENABLEMENT_BOUNDARY_INVALID');
  const universal = structuredClone(pending.universal_row);
  const regional = structuredClone(pending.regional_row);
  applyExactTransition(universal, 'status', attestation.universal_row.status_transition);
  applyExactTransition(regional, 'status', attestation.regional_row.status_transition);
  applyExactTransition(regional, 'is_allowed',
    attestation.regional_row.is_allowed_transition);
  assert(regional.generation_weight === 0
    && regional.generation_weight === attestation.regional_row.generation_weight,
  'DRYING_ENABLEMENT_WEIGHT_INVALID');
  return {
    universal_row: universal,
    regional_row: regional,
    applicability_guard: structuredClone(attestation.applicability_guard),
    generic_regional_generation_authorized: false,
    import_authorized: false,
    activation_authorized: false
  };
}

export function validateApprovalAttestations({ candidate, approvalRequest,
  manifest, existingPromotionsAttestation, dryingDesignAttestation }) {
  const common = (value) => value.subject_commit_sha === APPROVAL_SUBJECT_COMMIT
    && value.revision_id === candidate.revision_id
    && value.candidate_digest === candidate.candidate_digest
    && value.approval_request_digest === approvalRequest.request_digest
    && value.manifest_digest === manifest.manifest_digest
    && value.import_authorized === false
    && value.activation_authorized === false
    && value.production_authorized === false
    && value.default_authorized === false
    && value.rematerialization_authorized === false
    && value.activation_request === null
    && value.auditor === 'independent_contract_auditor'
    && value.audit_date === APPROVAL_DATE;
  for (const attestation of [existingPromotionsAttestation,
    dryingDesignAttestation]) {
    const { attestation_digest: claimed, ...payload } = attestation;
    assert(claimed === digest(payload), 'APPROVAL_ATTESTATION_DIGEST_MISMATCH');
    assert(common(attestation), 'APPROVAL_ATTESTATION_BINDING_INVALID');
  }
  assert(existingPromotionsAttestation.schema ===
      'rus.regional_environment_authoring_approval_attestation.v1'
    && existingPromotionsAttestation.approval_scope ===
      'existing_promotions_only'
    && JSON.stringify(existingPromotionsAttestation.approved_counts) ===
      JSON.stringify({ landscape: 33, water: 21, land_use: 24, place: 37 })
    && existingPromotionsAttestation.conditional_guard_count === 33
    && existingPromotionsAttestation.authoring_approved === true
    && JSON.stringify(existingPromotionsAttestation.sparse_gap_retained) ===
      JSON.stringify(candidate.data_gaps[0])
    && JSON.stringify(existingPromotionsAttestation.explicit_exclusions_retained)
      === JSON.stringify(candidate.explicit_exclusions)
    && JSON.stringify(existingPromotionsAttestation.pending_rows_excluded) ===
      JSON.stringify(['pt_drying_storage_workspace',
        'rpt_novgorod_drying_storage_workspace']),
  'EXISTING_PROMOTIONS_ATTESTATION_INVALID');
  const pending = candidate.pending_rows;
  assert(dryingDesignAttestation.schema ===
      'rus.regional_environment_drying_design_attestation.v1'
    && dryingDesignAttestation.approval_scope === 'authoring_design_only'
    && dryingDesignAttestation.pending_bundle_digest === digest(pending)
    && dryingDesignAttestation.universal_row_digest ===
      digest(pending.universal_row)
    && dryingDesignAttestation.regional_row_digest ===
      digest(pending.regional_row)
    && dryingDesignAttestation.evidence_attestation_digest ===
      pending.evidence_attestation_digest
    && dryingDesignAttestation.authoring_design_approved === true
    && dryingDesignAttestation.regional_enablement_approved === false
    && dryingDesignAttestation.universal_row_status === 'needs_review'
    && dryingDesignAttestation.regional_row_status === 'needs_review'
    && dryingDesignAttestation.regional_is_allowed === false,
  'DRYING_DESIGN_ATTESTATION_INVALID');
  return true;
}

export function validateRevision({ source, candidate, approvalRequest }) {
  assert(candidate.region_id === source.region_id, 'REGION_MISMATCH');
  assert(JSON.stringify(candidate.period) === JSON.stringify(source.period),
    'PERIOD_MISMATCH');
  const { candidate_digest: claimedCandidate, ...candidatePayload } = candidate;
  assert(claimedCandidate === digest(candidatePayload), 'CANDIDATE_DIGEST_MISMATCH');
  const { request_digest: claimedRequest, ...requestPayload } = approvalRequest;
  assert(claimedRequest === digest(requestPayload), 'REQUEST_DIGEST_MISMATCH');
  assert(approvalRequest.candidate_digest === candidate.candidate_digest,
    'REQUEST_CANDIDATE_MISMATCH');
  validateContextRefSchema(source.context_ref_schema,
    Object.values(source.conditional_guards).flat());
  assert(JSON.stringify(candidate.context_ref_schema) ===
    JSON.stringify(source.context_ref_schema), 'CONTEXT_REF_SCHEMA_DRIFT');
  assert(JSON.stringify(Object.keys(source.conditional_guards).sort()) ===
    JSON.stringify([...source.approve_with_limits_ids].sort()),
  'APPROVE_WITH_LIMITS_SOURCE_PARITY_INVALID');

  for (const [domain, spec] of Object.entries(DOMAINS)) {
    const rows = candidate.promotions[domain];
    const gaps = candidate.data_gaps.filter((gap) => gap.domain === domain);
    assert(rows.length === spec.count - gaps.length,
      `PROMOTION_COUNT_MISMATCH:${domain}`);
    const ids = rows.map((entry) => entry.universal.id);
    const expectedIds = source.selectors[domain].filter((id) =>
      !gaps.some((gap) => gap.template_id === id));
    assert(JSON.stringify(ids) === JSON.stringify(expectedIds),
      `REGIONAL_SELECTOR_SET_INVALID:${domain}`);
    assert(new Set(ids).size === ids.length, `PROMOTION_DUPLICATE:${domain}`);
    for (const entry of rows) {
      const id = entry.universal.id;
      assert(entry.regional[spec.idField] === id,
        `REGIONAL_PAIR_MISMATCH:${domain}:${id}`);
      assert(entry.universal.status === 'approved'
        && entry.regional.status === 'approved'
        && entry.regional.is_allowed === true,
      `PROMOTION_STATUS_INVALID:${domain}:${id}`);
      const expectedGuard = source.conditional_guards[id] ?? [];
      assert(JSON.stringify(entry.required_context_refs) ===
        JSON.stringify(expectedGuard), `CONDITIONAL_GUARD_MISMATCH:${domain}:${id}`);
      assert(entry.audit_verdict === (expectedGuard.length
        ? 'APPROVE_WITH_LIMITS' : 'APPROVE'),
      `AUDIT_VERDICT_MISMATCH:${domain}:${id}`);
      if (expectedGuard.length) {
        assert(entry.context_guard?.schema === source.context_ref_schema.guard_schema
          && entry.context_guard.enforcement ===
            'reject_if_any_required_ref_missing'
          && JSON.stringify(entry.context_guard.required_ref_fields) ===
            JSON.stringify(expectedGuard),
        `CONDITIONAL_RUNTIME_REJECTION_MISSING:${domain}:${id}`);
        assert(entry.regional.regional_limits.includes(
          `requires_context_refs=${JSON.stringify(expectedGuard)}`),
        `CONDITIONAL_GUARD_NOT_PERSISTED:${domain}:${id}`);
      }
      else assert(entry.context_guard === null,
        `UNCONDITIONAL_ROW_HAS_GUARD:${domain}:${id}`);
      assert(entry.source_refs.includes(AUDIT_SOURCE_REF)
        && entry.source_refs.length > 1,
      `SOURCE_PROVENANCE_MISSING:${domain}:${id}`);
      const originalUniversal = restoreStatus(entry.universal, 'draft');
      assert(digest(originalUniversal) === entry.source_row_digests.universal,
        `UNIVERSAL_SOURCE_DRIFT:${domain}:${id}`);
      const originalRegional = restoreRegional(entry.regional, expectedGuard);
      assert(digest(originalRegional) === entry.source_row_digests.regional,
        `REGIONAL_SOURCE_DRIFT:${domain}:${id}`);
    }
  }
  assert(candidate.data_gaps.length === 1
    && candidate.data_gaps[0].code ===
      'AUDIT_SELECTOR_PREPARED_MEMBERSHIP_MISMATCH'
    && candidate.data_gaps[0].template_id === 'lt_sparse_forest_woodland'
    && candidate.data_gaps[0].substitution_forbidden === true,
  'PREPARED_MEMBERSHIP_GAP_INVALID');
  const limitedIds = Object.values(candidate.promotions).flat()
    .filter(({ audit_verdict: verdict }) => verdict === 'APPROVE_WITH_LIMITS')
    .map(({ universal }) => universal.id);
  assert(JSON.stringify(limitedIds) ===
    JSON.stringify(source.approve_with_limits_ids),
  'APPROVE_WITH_LIMITS_CANDIDATE_PARITY_INVALID');
  const allApproved = Object.values(candidate.promotions).flatMap((rows) =>
    rows.flatMap((entry) => [entry.universal.id, entry.regional[regionalIdField(entry)]]));
  assert(source.explicit_exclusions.every((id) => !allApproved.includes(id)),
    'EXPLICIT_EXCLUSION_APPROVED');
  assert(source.minimum_m3_rows.every((id) =>
    Object.values(candidate.promotions).flat().some(({ universal }) =>
      universal.id === id)), 'M3_MINIMUM_ROW_MISSING');
  validateNewPlace(candidate.pending_rows, source);
  assert(candidate.import_authorized === false
    && candidate.activation_authorized === false
    && candidate.activation_request === null
    && candidate.combined_import_pack_status === 'stale_intermediate',
  'CANDIDATE_AUTHORITY_INVALID');
  assert(approvalRequest.import_authorized === false
    && approvalRequest.activation_authorized === false
    && approvalRequest.production_authorized === false
    && approvalRequest.default_authorized === false
    && approvalRequest.rematerialization_authorized === false,
  'REQUEST_AUTHORITY_INVALID');
  assert(approvalRequest.row_reviews.length === 115,
    'REQUEST_ROW_REVIEW_COUNT_INVALID');
  const limitedRequestIds = approvalRequest.row_reviews
    .filter(({ audit_verdict: verdict }) => verdict === 'APPROVE_WITH_LIMITS')
    .map(({ universal_id: id }) => id);
  assert(JSON.stringify(limitedRequestIds) ===
    JSON.stringify(source.approve_with_limits_ids)
    && approvalRequest.row_reviews
      .filter(({ audit_verdict: verdict }) => verdict === 'APPROVE_WITH_LIMITS')
      .every(({ context_guard: guard, required_context_refs: refs }) =>
        guard?.enforcement === 'reject_if_any_required_ref_missing'
          && JSON.stringify(guard.required_ref_fields) === JSON.stringify(refs)),
  'APPROVE_WITH_LIMITS_REQUEST_PARITY_INVALID');
  return true;
}

async function buildNewPlace(root, source) {
  const pending = structuredClone(source.new_place);
  const attestation = JSON.parse(await readFile(resolve(root,
    'data/world-catalogs/novgorod/procedural-scene-v2/drying-storage-workspace-approval-attestation.json'), 'utf8'));
  assert(attestation.attestation_digest === pending.evidence_attestation_digest
    && attestation.authoring_approved === true
    && attestation.approval_scope === 'authoring_row_only',
  'NEW_PLACE_EVIDENCE_ATTESTATION_MISMATCH');
  const overlay = JSON.parse(await readFile(resolve(root,
    'data/world-catalogs/novgorod/procedural-scene-v2/authoring-overlay.json'), 'utf8'));
  const candidate = exactlyOne(overlay.candidates, 'candidate_id',
    'novgorod_drying_storage_workspace_v3', 'NEW_PLACE_OVERLAY_ROW_MISSING');
  for (const [key, value] of Object.entries(pending.spatial_context_ref)) {
    assert(candidate.spatial_closure_ref[key] === value,
      `NEW_PLACE_SPATIAL_CONTEXT_MISMATCH:${key}`);
  }
  return pending;
}

function validateNewPlace(pending, source) {
  assert(pending.candidate_status === 'pending_independent_review'
    && pending.universal_row.status === 'needs_review'
    && pending.regional_row.status === 'needs_review'
    && pending.regional_row.is_allowed === false,
  'NEW_PLACE_SELF_APPROVED');
  assert(pending.universal_row.id === 'pt_drying_storage_workspace'
    && pending.universal_row.slug === 'drying_storage_workspace'
    && pending.regional_row.place_template_id === pending.universal_row.id
    && pending.regional_row.region_id === source.region_id,
  'NEW_PLACE_IDENTITY_INVALID');
  assert(pending.spatial_context_ref.g5_id === 'trace_ld_v1_g5_old_drying_shed'
    && pending.regional_row.allowed_scale_levels.length === 1
    && pending.regional_row.allowed_scale_levels[0] === 'G5'
    && pending.regional_row.regional_limits.includes('exact current old-shed G5')
    && pending.regional_row.regional_limits.includes('pt_forest_work_camp substitution'),
  'NEW_PLACE_BINDING_INVALID');
  assert(pending.process_state_contract.owner === 'process'
    && JSON.stringify(pending.process_state_contract.states) ===
      JSON.stringify(['dormant', 'active'])
    && pending.process_state_contract.row_asserts_current_state === false,
  'NEW_PLACE_STATE_OWNER_INVALID');
  const boundaries = `${pending.universal_row.limits} ${pending.regional_row.limits}`.toLowerCase();
  assert(FORBIDDEN_NEW_PLACE_KEYS.every((key) => boundaries.includes(key)),
    'NEW_PLACE_PROCESS_BOUNDARY_MISSING');
  assert(!FORBIDDEN_NEW_PLACE_KEYS.some((key) => hasKey(pending, key)),
    'NEW_PLACE_FORBIDDEN_STATE');
  assert(!JSON.stringify(pending).includes('pt_forest_work_camp"'),
    'NEW_PLACE_FOREST_CAMP_SUBSTITUTION');
}

function validateContextRefSchema(schema, usedFields) {
  assert(schema.schema === 'rus.regional_environment_context_ref.v1'
    && schema.guard_schema === 'rus.regional_environment_context_guard.v1'
    && schema.enforcement === 'reject_if_any_required_ref_missing'
    && schema.reference_shape.additional_properties === false
    && schema.reference_shape.field_enum_source === 'required_ref_fields'
    && schema.reference_shape.owner_record_version_type === 'positive_integer'
    && schema.reference_shape.owner_record_digest_pattern === '^[0-9a-f]{64}$',
  'CONTEXT_REF_SCHEMA_INVALID');
  const fields = new Set(schema.required_ref_fields);
  assert(fields.size === schema.required_ref_fields.length
    && usedFields.every((field) => fields.has(field)),
  'CONTEXT_REF_SCHEMA_FIELDS_INVALID');
}

function buildApprovalAttestations({ candidate, approvalRequest, manifest }) {
  const shared = {
    subject_commit_sha: APPROVAL_SUBJECT_COMMIT,
    revision_id: candidate.revision_id,
    candidate_digest: candidate.candidate_digest,
    approval_request_digest: approvalRequest.request_digest,
    manifest_digest: manifest.manifest_digest
  };
  const authority = {
    import_authorized: false,
    activation_authorized: false,
    production_authorized: false,
    default_authorized: false,
    rematerialization_authorized: false,
    activation_request: null,
    auditor: 'independent_contract_auditor',
    audit_date: APPROVAL_DATE
  };
  const existingPayload = {
    schema: 'rus.regional_environment_authoring_approval_attestation.v1',
    attestation_id: 'novgorod_regional_environment_existing_promotions_approval_001',
    ...shared,
    approval_scope: 'existing_promotions_only',
    approved_counts: { landscape: 33, water: 21, land_use: 24, place: 37 },
    conditional_guard_count: 33,
    authoring_approved: true,
    sparse_gap_retained: structuredClone(candidate.data_gaps[0]),
    explicit_exclusions_retained: [...candidate.explicit_exclusions],
    pending_rows_excluded: [
      'pt_drying_storage_workspace', 'rpt_novgorod_drying_storage_workspace'
    ],
    ...authority
  };
  const pending = candidate.pending_rows;
  const dryingPayload = {
    schema: 'rus.regional_environment_drying_design_attestation.v1',
    attestation_id: 'novgorod_drying_storage_workspace_design_approval_001',
    ...shared,
    approval_scope: 'authoring_design_only',
    pending_bundle_digest: digest(pending),
    universal_row_digest: digest(pending.universal_row),
    regional_row_digest: digest(pending.regional_row),
    evidence_attestation_digest: pending.evidence_attestation_digest,
    authoring_design_approved: true,
    regional_enablement_approved: false,
    universal_row_status: pending.universal_row.status,
    regional_row_status: pending.regional_row.status,
    regional_is_allowed: pending.regional_row.is_allowed,
    ...authority
  };
  return {
    existingPromotionsAttestation: { ...existingPayload,
      attestation_digest: digest(existingPayload) },
    dryingDesignAttestation: { ...dryingPayload,
      attestation_digest: digest(dryingPayload) }
  };
}

function buildDryingEnablementAttestation({ candidate, approvalRequest,
  manifest, dryingDesignAttestation }) {
  const pending = candidate.pending_rows;
  const payload = {
    schema: 'rus.regional_environment_drying_enablement_attestation.v1',
    attestation_id: 'novgorod_drying_storage_workspace_regional_enablement_001',
    subject_commit_sha: 'e53f911677fef38863897b5ea25c6aa0cb3fc138',
    revision_id: candidate.revision_id,
    candidate_digest: candidate.candidate_digest,
    approval_request_digest: approvalRequest.request_digest,
    manifest_digest: manifest.manifest_digest,
    design_attestation_digest: dryingDesignAttestation.attestation_digest,
    pending_bundle_digest: digest(pending),
    evidence_attestation_digest: pending.evidence_attestation_digest,
    region_id: candidate.region_id,
    period: structuredClone(candidate.period),
    universal_row: {
      id: pending.universal_row.id,
      digest: digest(pending.universal_row),
      status_transition: { from: 'needs_review', to: 'approved' }
    },
    regional_row: {
      id: pending.regional_row.id,
      digest: digest(pending.regional_row),
      status_transition: { from: 'needs_review', to: 'approved' },
      is_allowed_transition: { from: false, to: true },
      generation_weight: 0
    },
    approval_scope: 'authoring_and_exact_regional_enablement_only',
    authoring_approved: true,
    regional_enablement_approved: true,
    applicability_guard: {
      mode: 'exact_spatial_context_only',
      ...structuredClone(pending.spatial_context_ref),
      reject_if_context_mismatch: true
    },
    generic_regional_generation_authorized: false,
    process_state_contract: structuredClone(pending.process_state_contract),
    forbidden_implications: [
      'generic_regional_generation', 'mandatory_water', 'route', 'fire',
      'heat', 'fuel', 'material', 'container', 'tool', 'npc', 'process',
      'pt_forest_work_camp_substitution'
    ],
    import_authorized: false,
    activation_authorized: false,
    production_authorized: false,
    default_authorized: false,
    rematerialization_authorized: false,
    activation_request: null,
    auditor: 'independent_contract_auditor',
    audit_date: APPROVAL_DATE
  };
  const attestation = { ...payload, attestation_digest: digest(payload) };
  assert(attestation.attestation_digest === DRYING_ENABLEMENT_ATTESTATION_DIGEST,
    'DRYING_ENABLEMENT_AUDITOR_DIGEST_MISMATCH');
  return attestation;
}

function applyExactTransition(row, field, transition) {
  assert(row[field] === transition.from, `DRYING_TRANSITION_FROM_MISMATCH:${field}`);
  row[field] = transition.to;
}

function restoreStatus(row, status) {
  return { ...structuredClone(row), status };
}

function restoreRegional(row, guard) {
  const restored = { ...structuredClone(row), is_allowed: true, status: 'draft' };
  if (guard.length) {
    const suffix = ` AUDIT_GUARD requires_context_refs=${JSON.stringify(guard)}.`;
    assert(restored.regional_limits.endsWith(suffix),
      'CONDITIONAL_GUARD_SUFFIX_INVALID');
    restored.regional_limits = restored.regional_limits.slice(0, -suffix.length);
  }
  return restored;
}

function regionalIdField(entry) {
  return ['landscape_template_id', 'water_body_template_id',
    'land_use_template_id', 'place_template_id']
    .find((key) => Object.hasOwn(entry.regional, key));
}

function appendGuard(value, refs) {
  return `${value} AUDIT_GUARD requires_context_refs=${JSON.stringify(refs)}.`;
}

function hasKey(value, key) {
  if (!value || typeof value !== 'object') return false;
  if (Object.hasOwn(value, key)) return true;
  return Object.values(value).some((child) => hasKey(child, key));
}

function exactlyOne(rows, field, value, code) {
  const matches = rows.filter((row) => row[field] === value);
  assert(matches.length === 1, code);
  return matches[0];
}

function parseTsv(text) {
  const table = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === '\t' && !quoted) { row.push(field); field = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((value) => value !== '')) table.push(row);
      row = [];
    } else field += char;
  }
  if (field || row.length) { row.push(field); table.push(row); }
  const [headers, ...rows] = table;
  return rows.map((values) => Object.fromEntries(headers.map((header, index) =>
    [header, parseTsvValue(header, values[index] ?? '')])));
}

function parseTsvValue(field, value) {
  if (['is_allowed', 'is_common', 'is_dominant', 'is_rare'].includes(field))
    return value.toLowerCase() === 'true';
  if (field === 'generation_weight') return Number(value);
  if (['allowed_scale_levels', 'allowed_node_types', 'sources'].includes(field))
    return JSON.parse(value);
  return value === '' ? null : value;
}

function unique(values) { return [...new Set(values)]; }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function digest(value) { return sha256(JSON.stringify(value)); }
function jsonBytes(value) { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`); }
function assert(condition, code) {
  if (!condition) throw Object.assign(new Error(code), { code });
}

async function main(args) {
  const root = resolve(args.find((arg) => !arg.startsWith('--')) ?? DEFAULT_ROOT);
  const pack = await generateRegionalEnvironmentRevision(root);
  const outputs = [
    ['candidate.json', pack.candidate],
    ['approval-request.json', pack.approvalRequest],
    ['manifest.json', pack.manifest],
    ['validation-report.json', pack.validationReport],
    ['existing-promotions-approval-attestation.json',
      pack.existingPromotionsAttestation],
    ['drying-design-approval-attestation.json', pack.dryingDesignAttestation],
    ['drying-enablement-approval-attestation.json',
      pack.dryingEnablementAttestation]
  ];
  if (args.includes('--check')) {
    for (const [name, value] of outputs) {
      const actual = await readFile(resolve(HERE, name));
      assert(actual.equals(jsonBytes(value)), `GENERATED_FILE_STALE:${name}`);
    }
  } else {
    await Promise.all(outputs.map(([name, value]) =>
      writeFile(resolve(HERE, name), jsonBytes(value))));
  }
  process.stdout.write(`${JSON.stringify({ pass: true,
    candidate_digest: pack.candidate.candidate_digest,
    approval_request_digest: pack.approvalRequest.request_digest,
    manifest_digest: pack.manifest.manifest_digest,
    existing_promotions_attestation_digest:
      pack.existingPromotionsAttestation.attestation_digest,
    drying_design_attestation_digest:
      pack.dryingDesignAttestation.attestation_digest,
    drying_enablement_attestation_digest:
      pack.dryingEnablementAttestation.attestation_digest,
    rows_requiring_second_audit:
      pack.validationReport.rows_requiring_second_audit }, null, 2)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main(process.argv.slice(2));
}
