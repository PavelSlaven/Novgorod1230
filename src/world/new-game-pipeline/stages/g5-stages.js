import { assertGatePassed, createGateResult } from '../gate.js';
import { runG5AuditAdapter, runG5MaterializationAdapter } from '../g5-runtime.js';
import { createFrozenArtifactRecord } from '../lifecycle.js';
import {
  buildStage13G5CodePrecheck,
  buildStage13G5MaterializationInput,
  runStage13G5MaterializationBlock,
  validateStage13G5SceneGraphDraft
} from './stage13-g5-materialization.js';
import {
  buildStage14G5AuditInput,
  runStage14G5AuditBlock,
  validateStage14G5SceneAuditOutput
} from './stage14-g5-audit.js';

const PROVIDED_OUTPUT_PRODUCTION_FORBIDDEN_STAGES = new Set([13, 14]);

export async function runStage13G5Materialization(context, input = {}, deps = {}) {
  const materializationInput = input.schema === 'g5_materialization_input'
    ? input
    : buildStage13G5MaterializationInput(context, input);
  const provided = deps.stageOutputs?.[13] ?? deps.stageOutputs?.g5_materialization ?? null;
  if (provided) {
    rejectProductionProvidedOutput(context, 13, deps);
    const codePrecheck = buildStage13G5CodePrecheck(provided, materializationInput);
    const output = commitG5Stage(context, 13, 'g5_materialization', provided, {
      pass: codePrecheck.pass === true && provided?.materialization_status === 'materialized',
      concerns: codePrecheck.concerns ?? [],
      evidence: codePrecheck.evidence ?? [{ kind: 'g5_scene_code_precheck', result: codePrecheck.pass === true ? 'passed' : 'failed' }]
    });
    context.setStageOutput?.(1301, codePrecheck);
    return output;
  }
  const result = await runStage13G5MaterializationBlock({
    input: materializationInput,
    materialize: async (stageInput) => runG5MaterializationAdapter(stageInput, {
      env: context.env,
      ...deps
    })
  });
  const output = commitG5Stage(context, 13, 'g5_materialization', result.output, {
    pass: result.pass === true && result.output?.materialization_status === 'materialized',
    concerns: result.concerns ?? [],
    evidence: result.code_precheck?.evidence ?? [{ kind: 'g5_scene_code_precheck', result: result.pass === true ? 'passed' : 'failed' }]
  });
  context.setStageOutput?.(1301, result.code_precheck);
  return output;
}

export async function runStage14G5Audit(context, input = {}, deps = {}) {
  const auditInput = input.schema === 'g5_scene_audit_input'
    ? input
    : buildStage14G5AuditInput(context, input);
  const provided = deps.stageOutputs?.[14] ?? deps.stageOutputs?.g5_audit ?? null;
  if (provided) {
    rejectProductionProvidedOutput(context, 14, deps);
    const concerns = validateStage14G5SceneAuditOutput(provided, auditInput);
    return commitG5Stage(context, 14, 'g5_audit', provided, {
      pass: concerns.length === 0 && provided.pass === true,
      concerns,
      evidence: provided.evidence ?? [{ kind: 'g5_scene_audit_fixture', result: concerns.length === 0 ? 'passed' : 'failed' }]
    });
  }
  const result = await runStage14G5AuditBlock({
    input: auditInput,
    audit: async (stageInput) => runG5AuditAdapter(stageInput, {
      env: context.env,
      ...deps
    })
  });
  context.setStageOutput?.(1401, result.code_precheck);
  return commitG5Stage(context, 14, 'g5_audit', result.output, {
    pass: result.pass === true,
    concerns: result.concerns ?? [],
    evidence: result.output?.evidence ?? result.code_precheck?.evidence ?? []
  });
}

export async function runNewGameG5Stages13To14(context, {
  normalizedRequest = null,
  historicalFrame,
  weatherState,
  regionalContextPackage,
  selectedStartNode,
  startPlaceAudit,
  playerCharacter,
  playerCharacterAudit,
  npcCandidateSet,
  itemProfileCandidateSet,
  allowedG5TemplateSet,
  policies = {},
  stageOutputs = {},
  allowProvidedStageOutputs = false
} = {}, deps = {}) {
  const stage13Input = buildStage13G5MaterializationInput(context, {
    normalized_request: normalizedRequest,
    historical_frame: historicalFrame,
    weather_state: weatherState,
    regional_context_package: regionalContextPackage,
    selected_start_node: selectedStartNode,
    start_place_audit: startPlaceAudit,
    player_character: playerCharacter,
    player_character_audit: playerCharacterAudit,
    npc_candidate_set: npcCandidateSet,
    item_profile_candidate_set: itemProfileCandidateSet,
    allowed_g5_template_set: allowedG5TemplateSet,
    materialization_policy: policies.materialization_policy
  });

  const g5SceneGraphDraft = await runStage13G5Materialization(context, stage13Input, {
    ...deps,
    stageOutputs,
    allowProvidedStageOutputs
  });
  const g5SceneCodePrecheck = context.getStageOutput?.(1301)
    ?? buildStage13G5CodePrecheck(g5SceneGraphDraft, stage13Input);

  const stage13GateConcerns = validateStage13G5SceneGraphDraft(g5SceneGraphDraft, stage13Input);
  if (stage13GateConcerns.length > 0 || g5SceneGraphDraft?.materialization_status !== 'materialized' || g5SceneCodePrecheck?.pass !== true) {
    throw new Error('Stage 13 failed; Stage 14/15 are blocked.');
  }

  const stage14Input = buildStage14G5AuditInput(context, {
    historical_frame: historicalFrame,
    selected_start_node: selectedStartNode,
    start_place_audit: startPlaceAudit,
    player_character: playerCharacter,
    player_character_audit: playerCharacterAudit,
    allowed_g5_template_set: stage13Input.allowed_g5_template_set,
    g5_scene_graph_draft: g5SceneGraphDraft,
    g5_scene_code_precheck: g5SceneCodePrecheck,
    npc_candidate_set: npcCandidateSet,
    item_profile_candidate_set: itemProfileCandidateSet,
    audit_policy: policies.audit_policy
  });

  const g5SceneAudit = await runStage14G5Audit(context, stage14Input, {
    ...deps,
    stageOutputs,
    allowProvidedStageOutputs
  });

  if (g5SceneAudit?.pass !== true
    || g5SceneAudit?.commit_permission?.can_commit_g5_scene_graph !== true
    || g5SceneAudit?.commit_permission?.can_continue_to_npc_placement !== true
    || g5SceneAudit?.commit_permission?.can_continue_to_item_placement !== true
    || g5SceneAudit?.commit_permission?.can_continue_to_visible_context !== false) {
    throw new Error('Stage 14 failed; Stage 15/16/visible/narrator are blocked.');
  }

  return {
    g5_scene_graph_draft: g5SceneGraphDraft,
    g5_scene_code_precheck: g5SceneCodePrecheck,
    g5_scene_audit: g5SceneAudit
  };
}

function rejectProductionProvidedOutput(context, stageId, deps = {}) {
  if (PROVIDED_OUTPUT_PRODUCTION_FORBIDDEN_STAGES.has(stageId)
    && context.env?.NODE_ENV === 'production'
    && deps.allowProvidedStageOutputs !== true) {
    throw new Error(`Provided stage ${stageId} output is disabled in production unless allowProvidedStageOutputs=true.`);
  }
}

function commitG5Stage(context, stageId, stageSlug, output, { pass, concerns = [], evidence = [] } = {}) {
  const gate = createGateResult({
    stageId,
    stageSlug,
    gateKind: /audit/u.test(stageSlug) ? 'semantic_audit' : 'structural_validation',
    pass,
    concerns,
    evidence
  });
  context.setGateResult(stageId, gate);
  context.setLifecycleState(stageId, {
    stage_id: stageId,
    stage_slug: stageSlug,
    stage_type: /audit/u.test(stageSlug) ? 'semantic_audit' : 'semantic_generation',
    parsed_output: structuredClone(output),
    structural_validation: gate,
    semantic_audit_report: /audit/u.test(stageSlug) ? structuredClone(output) : null,
    pre_dependency_gate: createGateResult({ stageId, stageSlug, gateKind: 'pre_dependency_gate', pass: true }),
    post_dependency_gate: createGateResult({ stageId, stageSlug, gateKind: 'post_dependency_gate', pass }),
    terminal_status: pass ? 'passed' : 'stage_failed',
    failed_gate: pass ? null : gate.gate_kind,
    final_blocked_reason: pass ? null : (concerns ?? []).map((item) => item.message ?? item.code).join('; ')
  });
  assertGatePassed(gate);
  context.setStageOutput(stageId, output);
  context.freezeArtifact(createFrozenArtifactRecord({
    artifact: output,
    stageId,
    stageSlug,
    schema: output?.schema,
    version: output?.version ?? 1,
    producedBy: stageSlug,
    validationStatus: 'passed',
    auditStatus: /audit/u.test(stageSlug) ? (output?.pass === true ? 'passed' : 'failed') : 'not_required',
    dependencyStatus: pass ? 'passed' : 'failed'
  }));
  context.note(stageId, {
    label: stageSlug,
    message: `${stageSlug} ready`,
    responseRaw: { gate }
  });
  return output;
}
