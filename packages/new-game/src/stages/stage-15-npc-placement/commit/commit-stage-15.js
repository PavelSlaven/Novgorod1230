import { assertGatePassed, createFrozenArtifactRecord, createGateResult } from '../../shared/lifecycle-compat.js';

export function commitStage15Artifacts(context, result, input) {
  const gate = createGateResult({
    stageId: 15,
    stageSlug: 'npc_placement',
    gateKind: 'commit_ready_artifact',
    pass: result.pass === true
      && result.code_precheck?.pass === true
      && result.audit?.pass === true
      && result.audit?.commit_permission?.can_continue_to_item_placement === true,
    concerns: result.pass === true ? [] : (result.code_precheck?.concerns ?? result.audit?.concerns ?? []),
    evidence: [
      ...(result.code_precheck?.evidence ?? []),
      ...(result.audit?.evidence ?? [])
    ]
  });
  context.setGateResult(15, gate);
  assertGatePassed(gate);
  context.setStageOutput(15, result.draft);
  context.setStageOutput(1501, result.code_precheck);
  context.setStageOutput(1502, result.audit);
  context.setLifecycleState(15, {
    stage_id: 15,
    stage_slug: 'npc_placement',
    stage_type: 'semantic_generation',
    input_snapshot: structuredClone(input),
    parsed_output: structuredClone(result.draft),
    structural_validation: structuredClone(result.code_precheck),
    semantic_audit_report: structuredClone(result.audit),
    pre_dependency_gate: createGateResult({ stageId: 15, stageSlug: 'npc_placement', gateKind: 'pre_dependency_gate', pass: true }),
    post_dependency_gate: gate,
    terminal_status: 'passed',
    failed_gate: null,
    final_blocked_reason: null
  });
  freeze(context, 15, 'npc_placement', result.draft, 'passed', 'passed');
  freeze(context, 1501, 'npc_placement_code_precheck', result.code_precheck, 'passed', 'not_required');
  freeze(context, 1502, 'npc_placement_audit', result.audit, 'passed', 'passed');
  context.note(15, { label: 'npc_placement', message: 'npc_placement ready', responseRaw: { gate } });
}

export function freeze(context, stageId, stageSlug, artifact, validationStatus, auditStatus) {
  context.freezeArtifact(createFrozenArtifactRecord({
    artifact,
    stageId,
    stageSlug,
    schema: artifact.schema,
    version: artifact.version ?? 1,
    producedBy: stageSlug,
    validationStatus,
    auditStatus,
    dependencyStatus: 'passed'
  }));
}
