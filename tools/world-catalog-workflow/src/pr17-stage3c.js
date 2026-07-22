import { buildAllTemplateRevisionPromotionPlan } from './all-template-promotion.js';
import { digestValue } from './digest.js';

export function buildPr17Stage3CApprovalRequest({ candidate_manifest: manifest, records_by_table: records = {}, editorial_readiness_report: readiness, g4_coverage_report: coverage, compilation_report: compilation, template_ids: templateIds = [], target_revision: targetRevision } = {}) {
  const errors = [];
  const ids = [...templateIds].sort();
  const manifestCore = manifest ? (({ candidate_digest: candidateDigest, ...core }) => core)(manifest) : null;
  const datasetTables = (manifest?.datasets ?? []).map((dataset) => dataset.table);
  if (manifest?.approval !== 'pending_approve_all_120'
    || manifest?.activation !== 'not_requested'
    || manifest?.deletion_policy !== 'none'
    || !/^[a-f0-9]{64}$/u.test(String(manifest?.candidate_digest ?? ''))
    || manifest?.candidate_digest !== digestValue(manifestCore)
    || datasetTables.length !== 39
    || new Set(datasetTables).size !== 39
    || manifest?.cohort?.template_count !== 120
    || manifest?.cohort?.item_template_count !== 102
    || manifest?.cohort?.container_template_count !== 18
    || manifest?.cohort?.context_profile_count !== 9
    || manifest?.cohort?.imported_g4_count !== 9332) errors.push(problem('PR17_CANDIDATE_MANIFEST_INVALID', 'A validated exact pending all-120 candidate manifest is required.'));
  for (const dataset of manifest?.datasets ?? []) {
    const rows = records[dataset.table];
    if (!Array.isArray(rows) || rows.length !== dataset.record_count || digestValue(rows) !== dataset.sha256) errors.push(problem('PR17_CANDIDATE_DATASET_MISMATCH', `Candidate dataset ${dataset.table} does not match its exact manifest count and digest.`));
  }
  if (readiness?.approval_cohort_ready !== true || readiness?.summary?.ready_for_editorial_approval_count !== 120 || readiness?.report_digest !== digestValue((({ report_digest, ...core }) => core)(readiness ?? {}))) errors.push(problem('PR17_READINESS_REPORT_INVALID', 'The exact 120/120 editorial readiness report is required.'));
  if (coverage?.pass !== true || coverage?.summary?.g4_count !== 9332 || coverage?.summary?.resolved_profile_count !== 9332 || coverage?.summary?.ambiguous_binding_count !== 0 || coverage?.summary?.missing_required_slot_count !== 0 || coverage?.summary?.draft_dependency_rule_count !== 0 || coverage?.summary?.unapproved_dependency_count !== 0) errors.push(problem('PR17_G4_COVERAGE_REPORT_INVALID', 'The exact zero-gap 9,332-G4 coverage report is required.'));
  if (compilation?.pass !== true || compilation?.candidate_digest !== manifest?.candidate_digest || compilation?.coverage_report_digest !== digestValue(coverage) || compilation?.activation_performed !== false || compilation?.graph_node_status_transitions?.length !== 9) errors.push(problem('PR17_COMPILATION_REPORT_INVALID', 'The exact non-activating compilation report with nine G4 transitions is required.'));
  if (ids.length !== 120 || new Set(ids).size !== 120) errors.push(problem('PR17_APPROVAL_COHORT_INVALID', 'The approval request must contain exactly 120 unique template IDs.'));
  if (!targetRevision?.id || !targetRevision?.title) errors.push(problem('PR17_TARGET_REVISION_INVALID', 'The Stage 3C target revision is required.'));
  const core = {
    schema_version: 'rus.pr17.item_container_approval_request.v1',
    decision: 'approve_all_120',
    candidate_digest: manifest?.candidate_digest ?? null,
    readiness_report_digest: readiness?.report_digest ?? null,
    g4_coverage_report_digest: digestValue(coverage),
    template_ids: ids,
    template_ids_digest: digestValue(ids),
    g4_status_transitions: [...(compilation?.graph_node_status_transitions ?? [])].map(normalizeTransition).sort((left, right) => left.id.localeCompare(right.id)),
    target_revision: structuredClone(targetRevision ?? null),
    activation: 'not_requested',
    existing_parties_rematerialized: false
  };
  const request = { ...core, request_digest: digestValue(core) };
  return freeze({ status: errors.length ? 'blocked' : 'ready_for_human_confirmation', errors, request });
}

export function buildPr17Stage3CPromotionPlan({ approval_request: approvalRequest, approval_attestation: attestation, candidate_manifest: manifest, editorial_readiness_report: readiness, g4_coverage_report: coverage, compilation_report: compilation, template_ids: templateIds = [], target_revision: targetRevision, ...input } = {}) {
  const expected = buildPr17Stage3CApprovalRequest({ candidate_manifest: manifest, records_by_table: input.source_records_by_table, editorial_readiness_report: readiness, g4_coverage_report: coverage, compilation_report: compilation, template_ids: templateIds, target_revision: targetRevision });
  const errors = [...expected.errors];
  if (approvalRequest?.request_digest !== expected.request.request_digest || digestValue((({ request_digest, ...core }) => core)(approvalRequest ?? {})) !== approvalRequest?.request_digest) errors.push(problem('PR17_APPROVAL_REQUEST_DIGEST_MISMATCH', 'The approval request must match the exact verified candidate.'));
  if (attestation?.decision !== 'approve_all_120'
    || attestation?.request_digest !== expected.request.request_digest
    || attestation?.candidate_digest !== manifest?.candidate_digest
    || attestation?.readiness_report_digest !== readiness?.report_digest
    || attestation?.activation_authorized !== false
    || !attestation?.approved_by
    || !attestation?.approved_at) errors.push(problem('PR17_APPROVAL_ATTESTATION_INVALID', 'A human all-120 attestation bound to the exact request, candidate and readiness digests is required.'));
  if (errors.length) return blocked(errors);
  const plan = buildAllTemplateRevisionPromotionPlan({
    ...input,
    required_template_ids: templateIds,
    editorial_readiness_report: readiness,
    approval_attestation: attestation,
    candidate_digest: manifest.candidate_digest,
    target_revision: targetRevision,
    graph_node_status_transitions: compilation.graph_node_status_transitions
  });
  return freeze({ ...plan, approval_request_digest: expected.request.request_digest, approval_attestation_digest: digestValue(attestation), candidate_digest: manifest.candidate_digest });
}

function normalizeTransition(value) {
  return { id: value.graph_node_id ?? value.id, from_status: value.from_status, to_status: value.to_status, approval_basis: value.approval_basis, causal_basis_type: value.causal_basis_type, causal_basis_id: value.causal_basis_id };
}
function blocked(errors) { return freeze({ status: 'blocked', errors, typed_data_gaps: errors, manifest: { datasets: [], status_transitions: [], approval: 'blocked', activation: 'not_requested' }, records_by_table: {}, status_transitions: [], activation: { requested: false, performed: false, runtime_loader_changed: false, existing_parties_changed: false } }); }
function problem(code, message) { return Object.freeze({ code, message, severity: 'hard_block' }); }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
