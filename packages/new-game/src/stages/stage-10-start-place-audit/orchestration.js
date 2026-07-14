import { emptyAudit, finalizeAudit, runStage10StartPlaceAuditGate } from './audit.js';
import { STAGE10_INPUT_SCHEMA, STAGE10_OUTPUT_SCHEMA } from './constants.js';
import { buildStage10StartPlaceAuditInputFromPipeline } from './input.js';
import { block, hasHardBlock, route, safeClone, sanitizeRepairRoute } from './shared.js';

export function buildStage10ManagedPipelineResult({ input, output, gate } = {}) {
  const audit = output ?? emptyAudit(input, route('start_node_selector', 'start_place_audit_failed'));
  return {
    version: 1,
    schema: 'stage_result',
    stage_id: 10,
    stage_slug: 'start_place_audit',
    status: 'blocked',
    blocked_at_stage: 10,
    output: audit,
    gate: gate ?? { pass: false, concerns: audit.concerns ?? [], evidence: audit.evidence ?? [] },
    repair_route: audit.repair_route ?? route('start_node_selector', 'start_place_audit_failed'),
    repair_request: {
      repair_type: audit.repair_route?.repair_kind ?? 'start_place_audit_failed',
      return_to_stage: audit.repair_route?.return_to_stage ?? 'start_node_selector',
      semantic_repair_allowed: false,
      llm_allowed: true,
      llm_mode: 'thinking',
      can_create_world_entities: false,
      can_change_selected_start: false,
      can_change_candidate_sets: false,
      can_write_party_position: false
    }
  };
}

export async function runStage10StartPlaceAudit(context, input = null, deps = {}) {
  const stageInput = input?.schema === STAGE10_INPUT_SCHEMA
    ? input
    : buildStage10StartPlaceAuditInputFromPipeline(context, input ?? {});
  let audit = await runStage10StartPlaceAuditGate(stageInput, deps);
  if (audit.pass === true && stageInput.audit_policy?.require_semantic_llm_audit === true) {
    if (typeof deps.semanticExecutor !== 'function') {
      audit = finalizeAudit({
        input: stageInput,
        selectedStart: null,
        checks: audit.checks,
        concerns: [...(audit.concerns ?? []), block('START_PLACE_SEMANTIC_AUDITOR_UNAVAILABLE', 'Semantic LLM audit is required by policy but no semantic auditor executor is available.')],
        evidence: [...(audit.evidence ?? []), { kind: 'semantic_llm_audit', status: 'unavailable' }],
        repairRoute: route('start_node_selector', 'semantic_audit_unavailable'),
        mustPreserve: audit.downstream_constraints?.must_preserve ?? [],
        mustResolveLater: audit.downstream_constraints?.must_resolve_later ?? []
      });
    } else {
      const semanticAudit = await deps.semanticExecutor({ input: stageInput, precheck: audit });
      if (semanticAudit?.pass === false) {
        audit = finalizeAudit({
          input: stageInput,
          selectedStart: null,
          checks: audit.checks,
          concerns: [...(audit.concerns ?? []), ...(semanticAudit.concerns ?? [block('START_PLACE_SEMANTIC_AUDIT_FAILED', 'Semantic auditor rejected the selected start place.')])],
          evidence: [...(audit.evidence ?? []), ...(semanticAudit.evidence ?? [{ kind: 'semantic_llm_audit', status: 'failed' }])],
          repairRoute: sanitizeRepairRoute(semanticAudit.repair_route ?? route('start_node_selector', 'semantic_audit_failed')),
          mustPreserve: audit.downstream_constraints?.must_preserve ?? [],
          mustResolveLater: audit.downstream_constraints?.must_resolve_later ?? []
        });
      }
    }
  }
  const gate = {
    stage_id: 10,
    stage_slug: 'start_place_audit',
    gate_kind: 'start_place_audit_gate',
    pass: audit.pass === true && !hasHardBlock(audit),
    concerns: audit.concerns ?? [],
    evidence: audit.evidence ?? []
  };
  context.setStageOutput?.(10, audit);
  context.setGateResult?.(10, gate);
  context.setLifecycleState?.(10, {
    stage_id: 10,
    stage_slug: 'start_place_audit',
    stage_type: 'code_first_audit',
    parsed_output: safeClone(audit),
    structural_validation: gate,
    pre_dependency_gate: gate,
    post_dependency_gate: gate,
    terminal_status: gate.pass ? 'passed' : 'blocked',
    failed_gate: gate.pass ? null : 'start_place_audit_gate',
    final_blocked_reason: gate.pass ? null : (audit.concerns ?? []).map((item) => item.message ?? item.code).join('; ')
  });
  if (!gate.pass) return buildStage10ManagedPipelineResult({ input: stageInput, output: audit, gate });
  context.freezeArtifact?.({
    artifact: audit,
    stage_id: 10,
    stageId: 10,
    stage_slug: 'start_place_audit',
    stageSlug: 'start_place_audit',
    schema: STAGE10_OUTPUT_SCHEMA,
    version: 1,
    produced_by: 'stage10_start_place_audit_gate',
    producedBy: 'stage10_start_place_audit_gate',
    validation_status: 'passed',
    validationStatus: 'passed',
    audit_status: 'passed',
    auditStatus: 'passed',
    dependency_status: 'passed',
    dependencyStatus: 'passed'
  });
  return audit;
}
