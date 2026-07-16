import { buildRevisionPromotionPlan } from './revision-promotion.js';

export function buildAllTemplateRevisionPromotionPlan({ required_template_ids = [], editorial_readiness_report, legacy_inventory_snapshot, approval_attestation, approved_record_ids_by_table = {}, ...input } = {}) {
  const errors = [];
  const required = [...required_template_ids].sort();
  const selected = [...(approved_record_ids_by_table.item_templates ?? []), ...(approved_record_ids_by_table.container_templates ?? [])].sort();
  if (required.length !== 120 || new Set(required).size !== 120) errors.push(problem('APPROVAL_COHORT_NOT_120', 'The required cohort must contain exactly 120 unique template IDs.'));
  if (selected.length !== 120 || !sameIds(required, selected)) errors.push(problem('APPROVAL_COHORT_INCOMPLETE', 'Partial item/container promotion is forbidden.'));
  if (editorial_readiness_report?.approval_cohort_ready !== true || editorial_readiness_report?.summary?.ready_for_editorial_approval_count !== 120) errors.push(problem('EDITORIAL_READINESS_NOT_COMPLETE', 'All 120 templates must be ready for editorial approval.'));
  if (approval_attestation?.decision !== 'approve_all_120' || approval_attestation?.readiness_report_digest !== editorial_readiness_report?.report_digest || !approval_attestation?.approved_by || !approval_attestation?.approved_at) errors.push(problem('PROMOTION_ALL_120_ATTESTATION_REQUIRED', 'Approval must explicitly bind the exact all-120 readiness report.'));
  if (legacy_inventory_snapshot?.source?.verified !== true || legacy_inventory_snapshot?.complete !== true) errors.push(problem('LEGACY_SOURCE_NOT_VERIFIED', 'The actual operator PostgreSQL/NocoDB source must be exported before promotion.'));
  const unresolved = (legacy_inventory_snapshot?.rows ?? []).filter((row) => !['mapped','deferred'].includes(row.resolution_status));
  if (unresolved.length) errors.push(problem('LEGACY_MIGRATION_UNRESOLVED', `Legacy inventory contains ${unresolved.length} unresolved rows.`));
  if (errors.length) return Object.freeze({ status: 'blocked', errors: Object.freeze(errors), typed_data_gaps: Object.freeze(errors), records_by_table: Object.freeze({}), manifest: Object.freeze({ datasets: Object.freeze([]), approval: 'blocked', activation: 'not_requested' }), activation: Object.freeze({ requested: false, performed: false, runtime_loader_changed: false, existing_parties_changed: false }) });
  return buildRevisionPromotionPlan({ ...input, approved_record_ids_by_table, approval_attestation: { ...approval_attestation, decision: 'approve_subset' } });
}

function sameIds(left, right) { return left.length === right.length && left.every((value, index) => value === right[index]); }
function problem(code, message) { return Object.freeze({ code, message, severity: 'hard_block' }); }
