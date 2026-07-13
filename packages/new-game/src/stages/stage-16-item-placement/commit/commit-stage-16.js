import { assertGatePassed, createFrozenArtifactRecord, createGateResult } from '../../shared/lifecycle-compat.js';

export function commitStage16Artifacts(context, result, input) {
  const pass = result.pass === true
    && result.code_precheck?.pass === true
    && result.audit?.pass === true
    && result.audit?.commit_permission?.can_continue_to_time_light_gate === true;
  const gate = createGateResult({
    stageId: 16,
    stageSlug: 'item_placement',
    gateKind: 'commit_ready_artifact',
    pass,
    concerns: pass ? [] : (result.code_precheck?.concerns ?? result.audit?.concerns ?? []),
    evidence: [...(result.code_precheck?.evidence ?? []), ...(result.audit?.evidence ?? [])]
  });
  context.setGateResult(16, gate);
  assertGatePassed(gate);
  context.setStageOutput(16, result.draft);
  context.setStageOutput(1601, result.code_precheck);
  context.setStageOutput(1602, result.audit);
  context.setLifecycleState(16, {
    stage_id: 16,
    stage_slug: 'item_placement',
    stage_type: 'semantic_generation',
    input_snapshot: structuredClone(input),
    parsed_output: structuredClone(result.draft),
    structural_validation: structuredClone(result.code_precheck),
    semantic_audit_report: structuredClone(result.audit),
    pre_dependency_gate: createGateResult({ stageId: 16, stageSlug: 'item_placement', gateKind: 'pre_dependency_gate', pass: true }),
    post_dependency_gate: gate,
    terminal_status: 'passed',
    failed_gate: null,
    final_blocked_reason: null
  });
  freeze(context, 16, 'item_placement', result.draft, 'passed', 'passed');
  freeze(context, 1601, 'item_placement_code_precheck', result.code_precheck, 'passed', 'not_required');
  freeze(context, 1602, 'item_placement_audit', result.audit, 'passed', 'passed');
  context.note?.(16, { label: 'item_placement', message: 'item_placement ready', responseRaw: { gate } });
}

export function freeze(context, stageId, stageSlug, artifact, validationStatus, auditStatus) {
  context.freezeArtifact(createFrozenArtifactRecord({ artifact, stageId, stageSlug, schema: artifact.schema, version: artifact.version ?? 1, producedBy: stageSlug, validationStatus, auditStatus, dependencyStatus: 'passed' }));
}
