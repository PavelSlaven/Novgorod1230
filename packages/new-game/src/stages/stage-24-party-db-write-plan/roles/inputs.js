import {
  REQUIRED_AUDIT_CHECKS,
  STAGE24_AUDIT_SCHEMA,
  STAGE24_PLAN_SCHEMA,
  STAGE24_REPAIR_ROUTES,
  STAGE24_ROUTE_SCHEMA
} from '../policy/constants.js';
import { safeClone } from '../shared/utils.js';

export function buildBuilderRoleInput(input) {
  return {
    version: 1,
    schema: 'party_db_write_plan_builder_request',
    request_id: input.request_id,
    party_creation_context: safeClone(input.party_creation_context),
    approved_pipeline_outputs: safeClone(input.approved_pipeline_outputs),
    approved_pipeline_manifest: safeClone(input.approved_pipeline_manifest),
    party_database_schema: safeClone(input.party_database_schema),
    world_base_reference_snapshot: safeClone(input.world_base_reference_snapshot),
    write_policy: safeClone(input.write_policy),
    binding: {
      source_input_digest: input.party_db_write_plan_input_digest,
      party_database_schema_digest: input.party_database_schema_digest,
      world_base_reference_digest: input.world_base_reference_digest,
      approved_pipeline_manifest_digest: input.approved_pipeline_manifest_digest
    },
    output_contract: { version: 1, schema: STAGE24_PLAN_SCHEMA },
    constraints: {
      no_database_write: true,
      no_sql_execution: true,
      no_new_world_facts: true,
      no_new_ids_for_approved_entities: true,
      map_approved_data_only: true
    }
  };
}

export function buildPlanFormatRepairInput(input, raw, parseError = null, validationErrors = []) {
  return {
    version: 1,
    schema: 'party_db_write_plan_format_repair_input',
    request_id: input.request_id,
    raw_builder_response: typeof raw === 'string' ? raw : null,
    parsed_builder_response: typeof raw === 'string' ? null : safeClone(raw),
    parse_error: parseError,
    validation_errors: safeClone(validationErrors),
    required_schema: { version: 1, schema: STAGE24_PLAN_SCHEMA },
    original_input_digest: input.party_db_write_plan_input_digest,
    constraints: {
      change_format_only: true,
      do_not_add_or_remove_records: true,
      do_not_change_ids: true,
      do_not_change_semantic_mapping: true,
      do_not_create_world_facts: true
    }
  };
}

export function buildAuditorRoleInput(input, plan, planDigest, extra = {}) {
  return {
    version: 1,
    schema: 'party_db_write_plan_auditor_request',
    request_id: input.request_id,
    party_db_write_plan: safeClone(plan),
    party_db_write_plan_digest: planDigest,
    approved_pipeline_manifest: safeClone(input.approved_pipeline_manifest),
    approved_pipeline_outputs: safeClone(input.approved_pipeline_outputs),
    party_database_schema: safeClone(input.party_database_schema),
    world_base_reference_snapshot: safeClone(input.world_base_reference_snapshot),
    write_policy: safeClone(input.write_policy),
    output_contract: { version: 1, schema: STAGE24_AUDIT_SCHEMA },
    ...safeClone(extra)
  };
}

export function buildAuditFormatRepairInput(input, plan, planDigest, rawAudit, validationErrors) {
  return {
    version: 1,
    schema: 'party_db_write_plan_audit_format_repair_input',
    request_id: input.request_id,
    party_db_write_plan_digest: planDigest,
    raw_audit_response: typeof rawAudit === 'string' ? rawAudit : null,
    parsed_audit_response: typeof rawAudit === 'string' ? null : safeClone(rawAudit),
    audit_validation_errors: safeClone(validationErrors),
    required_schema: { version: 1, schema: STAGE24_AUDIT_SCHEMA },
    constraints: {
      change_format_only: true,
      do_not_change_pass_semantics: true,
      do_not_add_or_remove_findings: true,
      do_not_create_evidence: true,
      do_not_change_plan: true
    },
    plan_binding: { digest: planDigest, request_id: plan.request_id }
  };
}

export function buildRouterRoleInput(input, audit) {
  return {
    version: 1,
    schema: 'party_db_write_plan_router_input',
    request_id: input.request_id,
    failed_checks: REQUIRED_AUDIT_CHECKS.filter((key) => audit.checks?.[key]?.pass === false),
    concerns: safeClone(audit.concerns),
    evidence: safeClone(audit.evidence),
    allowed_routes: [...STAGE24_REPAIR_ROUTES],
    output_contract: { version: 1, schema: STAGE24_ROUTE_SCHEMA }
  };
}

export function buildPlanSemanticRepairInput(input, plan, concerns, audit, repairHistory, route = null) {
  return {
    version: 1,
    schema: 'party_db_write_plan_semantic_repair_input',
    request_id: input.request_id,
    original_input: safeClone(input),
    failed_party_db_write_plan: safeClone(plan),
    audit: safeClone(audit),
    concerns: safeClone(concerns),
    repair_route: safeClone(route),
    repair_history: safeClone(repairHistory),
    allowed_mutable_paths: safeClone(route?.allowed_mutable_paths ?? ['write_batches', 'transaction.write_order', 'preconditions', 'postconditions', 'rollback_plan', 'source_trace', 'audit_snapshots', 'knowledge_projection_validation', 'self_audit']),
    forbidden_mutable_paths: safeClone(route?.forbidden_mutable_paths ?? ['approved_pipeline_outputs', 'party_database_schema', 'world_base_reference_snapshot', 'party_creation_context']),
    constraints: { no_new_world_facts: true, no_upstream_mutation: true, preserve_approved_ids: true }
  };
}

export function buildSeniorBuilderInput(input, plan, audit, route, repairHistory) {
  return {
    ...buildBuilderRoleInput(input),
    schema: 'party_db_write_plan_senior_builder_request',
    previous_failed_plan: safeClone(plan),
    failed_audit: safeClone(audit),
    repair_route: safeClone(route),
    repair_history: safeClone(repairHistory),
    reasoning_requirement: 'max'
  };
}
