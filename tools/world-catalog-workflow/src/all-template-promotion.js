import { buildRevisionPromotionPlan } from './revision-promotion.js';

export function buildAllTemplateRevisionPromotionPlan({ required_template_ids = [], editorial_readiness_report, legacy_inventory_snapshot, approval_attestation, approval_amendment_attestation: amendment = null, approval_request_digest: approvalRequestDigest = null, candidate_digest: candidateDigest = null, approved_record_ids_by_table = {}, ...input } = {}) {
  const errors = [];
  const required = [...required_template_ids].sort();
  const selected = [...(approved_record_ids_by_table.item_templates ?? []), ...(approved_record_ids_by_table.container_templates ?? [])].sort();
  if (required.length !== 120 || new Set(required).size !== 120) errors.push(problem('APPROVAL_COHORT_NOT_120', 'The required cohort must contain exactly 120 unique template IDs.'));
  if (selected.length !== 120 || !sameIds(required, selected)) errors.push(problem('APPROVAL_COHORT_INCOMPLETE', 'Partial item/container promotion is forbidden.'));
  if (editorial_readiness_report?.approval_cohort_ready !== true || editorial_readiness_report?.summary?.ready_for_editorial_approval_count !== 120) errors.push(problem('EDITORIAL_READINESS_NOT_COMPLETE', 'All 120 templates must be ready for editorial approval.'));
  if (approval_attestation?.decision !== 'approve_all_120' || approval_attestation?.readiness_report_digest !== editorial_readiness_report?.report_digest || !approval_attestation?.approved_by || !approval_attestation?.approved_at) errors.push(problem('PROMOTION_ALL_120_ATTESTATION_REQUIRED', 'Approval must explicitly bind the exact all-120 readiness report.'));
  const amended = candidateDigest != null
    && approval_attestation?.candidate_digest !== candidateDigest;
  if (candidateDigest != null && (!/^[a-f0-9]{64}$/u.test(candidateDigest)
    || amended && (amendment?.original_stage3c_candidate_digest !==
        approval_attestation?.candidate_digest
      || amendment?.amended_stage3c_candidate_digest !== candidateDigest
      || amendment?.amended_stage3c_approval_request_digest !==
        approvalRequestDigest
      || amendment?.original_stage3c_attestation_transfer_authorized !== false))) errors.push(problem('PROMOTION_CANDIDATE_DIGEST_MISMATCH', 'Approval must explicitly bind the exact candidate manifest digest.'));
  if (legacy_inventory_snapshot?.source?.verified !== true || legacy_inventory_snapshot?.complete !== true) errors.push(problem('LEGACY_SOURCE_NOT_VERIFIED', 'The actual operator PostgreSQL/NocoDB source must be exported before promotion.'));
  const unresolved = (legacy_inventory_snapshot?.rows ?? []).filter((row) => !['mapped','deferred'].includes(row.resolution_status));
  if (unresolved.length) errors.push(problem('LEGACY_MIGRATION_UNRESOLVED', `Legacy inventory contains ${unresolved.length} unresolved rows.`));
  if (errors.length) return Object.freeze({ status: 'blocked', errors: Object.freeze(errors), typed_data_gaps: Object.freeze(errors), records_by_table: Object.freeze({}), manifest: Object.freeze({ datasets: Object.freeze([]), approval: 'blocked', activation: 'not_requested' }), activation: Object.freeze({ requested: false, performed: false, runtime_loader_changed: false, existing_parties_changed: false }) });
  const approvalChain = amended ? Object.freeze({
    schema: 'rus.exact_candidate_approval_chain.v1',
    original_candidate_digest: approval_attestation.candidate_digest,
    amended_candidate_digest: candidateDigest,
    amended_request_digest: approvalRequestDigest,
    original_attestation: approval_attestation,
    amendment_attestation: amendment
  }) : null;
  return buildRevisionPromotionPlan({ ...input, approved_record_ids_by_table,
    approval_attestation: amended ? null
      : { ...approval_attestation, decision: 'approve_subset' },
    approval_chain: approvalChain });
}

function sameIds(left, right) { return left.length === right.length && left.every((value, index) => value === right[index]); }
function problem(code, message) { return Object.freeze({ code, message, severity: 'hard_block' }); }
