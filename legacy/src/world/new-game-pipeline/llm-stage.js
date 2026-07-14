import { explainJsonObjectParse } from '../json-contracts.js';
import { loadRus13Contract } from '../rus13-contracts.js';
import { createGateResult } from './gate.js';
import { getNewGameStageMatrixEntry } from './llm-matrix.js';
import {
  createFrozenArtifactRecord,
  createLifecycleFailure,
  deriveMutableScope,
  evaluateAntiRegression,
  evaluateDependencyGate
} from './lifecycle.js';

export function createLlmStageStub(stage) {
  return async function runLlmStageStub() {
    return {
      version: 1,
      schema: 'new_game_llm_stage_stub',
      stage_id: stage.id,
      stage_slug: stage.slug,
      status: 'blocked',
      audit: {
        pass: false,
        concerns: [{
          code: 'NEW_GAME_LLM_STAGE_NOT_IMPLEMENTED',
          message: `LLM stage ${stage.id} (${stage.slug}) is not implemented yet.`
        }],
        evidence: []
      }
    };
  };
}

export function createLlmStageAdapter(definition) {
  return async function runLlmStageAdapter(context, options = {}) {
    const executor = options.executor ?? options.llmStageExecutor;
    if (typeof executor !== 'function') {
      throw new Error(`New-game LLM stage ${definition.stageId} requires an explicit executor.`);
    }

    const stageMeta = {
      id: definition.stageId,
      slug: definition.stageSlug,
      type: definition.stageType ?? getNewGameStageMatrixEntry(definition.stageId)?.stage_type ?? 'semantic_generation',
      output_schema: definition.outputSchema,
      contract_name: definition.contractName ?? null,
      spec_file: `${definition.stageId}.txt`
    };

    const preDependencyGate = evaluateDependencyGate(context, {
      stageId: definition.stageId,
      stageSlug: definition.stageSlug,
      gateKind: 'pre_dependency_gate',
      requirements: definition.preDependencyRequirements
    });
    context.setGateResult(definition.stageId, preDependencyGate);
    if (!preDependencyGate.pass) {
      const failure = createLifecycleFailure({
        stageId: definition.stageId,
        stageSlug: definition.stageSlug,
        stageType: stageMeta.type,
        failedGate: 'pre_dependency_gate',
        concerns: preDependencyGate.concerns,
        repairHistory: context.getRepairHistory(definition.stageId)
      });
      context.setLifecycleState(definition.stageId, {
        stage_id: definition.stageId,
        stage_slug: definition.stageSlug,
        stage_type: stageMeta.type,
        input_snapshot: structuredClone(options.input ?? null),
        pre_dependency_gate: preDependencyGate,
        failed_gate: 'pre_dependency_gate',
        terminal_status: 'stage_failed',
        final_blocked_reason: failure.message,
        missing_dependency_references: preDependencyGate.concerns.map((item) => item.dependency ?? item.field).filter(Boolean)
      });
      throw failure;
    }

    const input = options.input ?? definition.buildInput?.(context) ?? {};

    const rawResult = await executor({ context, input, stage: stageMeta });
    const normalizedOutput = normalizeExecutorOutput(rawResult, definition);
    const processedOutput = typeof options.normalizeOutput === 'function'
      ? options.normalizeOutput({
          context,
          input,
          definition,
          rawResult,
          normalizedOutput
        })
      : null;
    const output = processedOutput?.output ?? normalizedOutput.output;
    const lifecycleExtras = processedOutput?.lifecycle_state ?? {};
    const rawOutputForState = processedOutput?.raw_output ?? rawResult?.output ?? rawResult ?? null;
    const artifactForFreeze = processedOutput?.freeze_artifact ?? output;
    const gate = runLlmStageGate(definition, output, input, normalizedOutput.gateKind);
    if (normalizedOutput.parseError) {
      gate.pass = false;
      gate.concerns.unshift(concern(
        definition.audit === true ? 'SEMANTIC_AUDIT_FORMAT_INVALID' : 'NEW_GAME_LLM_INVALID_JSON',
        `LLM stage returned invalid JSON: ${normalizedOutput.parseError}`
      ));
    }

    const repairBaseline = context.getRepairBaseline?.(definition.stageId) ?? null;
    const frozenCandidate = context.getFrozenArtifactBySchema(definition.outputSchema);
    const previousArtifact = repairBaseline?.artifact ?? frozenCandidate;
    const mutableScope = deriveMutableScope({
      policyAllowedPaths: repairBaseline?.mutable_scope?.allowed_mutable_paths ?? definition.mutableScopeDefaults?.allowed,
      policyForbiddenPaths: repairBaseline?.mutable_scope?.forbidden_mutable_paths ?? definition.mutableScopeDefaults?.forbidden,
      structuralValidation: gate,
      semanticAudit: definition.audit === true ? output : null,
      frozenPaths: previousArtifact?.frozen_paths ?? []
    });
    const antiRegressionReport = evaluateAntiRegression({
      previousArtifact,
      repairedArtifact: output,
      allowedMutablePaths: mutableScope.allowed_mutable_paths,
      forbiddenMutablePaths: mutableScope.forbidden_mutable_paths,
      semanticAudit: definition.audit === true ? output : null
    });
    const postDependencyGate = evaluateDependencyGate(context, {
      stageId: definition.stageId,
      stageSlug: definition.stageSlug,
      gateKind: 'post_dependency_gate',
      requirements: definition.postDependencyRequirements,
      output
    });

    const finalPass = gate.pass === true && antiRegressionReport.pass === true && postDependencyGate.pass === true;
    const finalGate = finalPass
      ? createGateResult({
          stageId: definition.stageId,
          stageSlug: definition.stageSlug,
          gateKind: 'commit_ready_artifact',
          pass: true,
          concerns: [],
          evidence: ['lifecycle gates passed']
        })
      : createGateResult({
          stageId: definition.stageId,
          stageSlug: definition.stageSlug,
          gateKind: !gate.pass ? normalizedOutput.gateKind : (antiRegressionReport.pass ? 'post_dependency_gate' : 'anti_regression'),
          pass: false,
          concerns: [
            ...(gate.pass ? [] : gate.concerns ?? []),
            ...(antiRegressionReport.pass ? [] : antiRegressionReport.concerns ?? []),
            ...(postDependencyGate.pass ? [] : postDependencyGate.concerns ?? [])
          ],
          evidence: [...(gate.evidence ?? []), ...(postDependencyGate.evidence ?? [])]
        });

    context.setGateResult(definition.stageId, finalGate);
    context.setStageMeta(definition.stageId, {
      attempt_index: (context.getStageMeta(definition.stageId)?.attempt_index ?? 0) + 1,
      repair_attempt_index: context.getRepairHistory(definition.stageId).length,
      model_tier: inferStageModelTier(definition.stageId),
      terminal_status: finalPass === true ? 'passed' : 'failed'
    });
    context.setLifecycleState(definition.stageId, {
      stage_id: definition.stageId,
      stage_slug: definition.stageSlug,
      stage_type: stageMeta.type,
      input_snapshot: structuredClone(input),
      raw_output: rawOutputForState,
      parsed_output: structuredClone(output),
      structural_validation: gate,
      semantic_audit_report: definition.audit === true ? structuredClone(output) : null,
      repair_history: context.getRepairHistory(definition.stageId),
      anti_regression_report: antiRegressionReport,
      pre_dependency_gate: preDependencyGate,
      post_dependency_gate: postDependencyGate,
      mutable_scope: mutableScope,
      failed_gate: finalPass ? null : finalGate.gate_kind,
      terminal_status: finalPass ? 'passed' : 'stage_failed',
      semantic_concerns: finalGate.concerns ?? [],
      missing_dependency_references: (postDependencyGate.concerns ?? []).map((item) => item.dependency ?? item.field).filter(Boolean),
      final_blocked_reason: finalPass ? null : finalGate.concerns?.map((item) => item.message ?? item.code).join('; '),
      ...structuredClone(lifecycleExtras)
    });

    if (!finalPass) {
      const route = createStageRecoveryRoute(definition.stageId, definition.stageSlug, finalGate);
      const error = createLifecycleFailure({
        stageId: definition.stageId,
        stageSlug: definition.stageSlug,
        stageType: stageMeta.type,
        failedGate: finalGate.gate_kind,
        concerns: finalGate.concerns,
        repairHistory: context.getRepairHistory(definition.stageId)
      });
      error.semanticRecoveryRoute = route;
      throw error;
    }

    context.setStageOutput(definition.stageId, output);
    context.clearRepairBaseline?.(definition.stageId);
    const frozenRecord = createFrozenArtifactRecord({
      artifact: artifactForFreeze,
      stageId: definition.stageId,
      stageSlug: definition.stageSlug,
      schema: definition.outputSchema,
      version: artifactForFreeze?.version ?? output?.version ?? 1,
      producedBy: definition.stageSlug,
      validationStatus: 'passed',
      auditStatus: definition.audit === true ? (output?.pass === true ? 'passed' : 'failed') : 'not_required',
      dependencyStatus: 'passed'
    });
    context.freezeArtifact(frozenRecord);
    context.note(definition.stageId, {
      label: definition.stageSlug,
      message: `${definition.stageSlug} ready`,
      responseRaw: { gate: finalGate }
    });
    return output;
  };
}

export function runLlmStageGate(definition, output, input = {}, gateKind = 'structural_validation') {
  const concerns = [];
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    concerns.push(concern('NEW_GAME_LLM_OUTPUT_NOT_OBJECT', 'LLM stage output must be a JSON object.'));
  }

  if (definition.outputSchema && output?.schema !== definition.outputSchema) {
    concerns.push(concern(
      'NEW_GAME_LLM_WRONG_SCHEMA',
      `Expected schema ${definition.outputSchema}, got ${String(output?.schema ?? 'missing')}.`
    ));
  }

  for (const field of definition.requiredFields ?? []) {
    if (readPath(output, field) === undefined) {
      concerns.push(concern('NEW_GAME_LLM_MISSING_FIELD', `Output is missing ${field}.`, { field }));
    }
  }

  const contract = definition.contractName ? loadRus13Contract(definition.contractName) : null;
  for (const field of contract?.required ?? []) {
    if (readPath(output, field) === undefined) {
      concerns.push(concern('NEW_GAME_LLM_CONTRACT_MISSING_FIELD', `Output is missing contract field ${field}.`, { field }));
    }
  }

  for (const auditField of definition.embeddedAuditFields ?? []) {
    if (!isPassLikeAudit(readPath(output, auditField))) {
      concerns.push(concern('NEW_GAME_LLM_EMBEDDED_AUDIT_FAILED', `Embedded audit ${auditField} must pass.`, { field: auditField }));
    }
  }

  if (definition.audit === true && !isPassLikeAudit(output)) {
    concerns.push(concern('NEW_GAME_LLM_AUDIT_FAILED', 'Audit stage did not approve output.'));
  }

  const customConcerns = definition.validate?.(output, input) ?? [];
  concerns.push(...customConcerns);

  return createGateResult({
    stageId: definition.stageId,
    stageSlug: definition.stageSlug,
    gateKind,
    pass: concerns.length === 0,
    concerns,
    evidence: [{
      kind: 'llm_stage_gate',
      output_schema: definition.outputSchema,
      contract_name: definition.contractName ?? null
    }]
  });
}

function normalizeExecutorOutput(result, definition) {
  const value = result?.output ?? result;
  if (typeof value !== 'string') {
    return {
      output: value,
      gateKind: definition?.audit === true ? 'semantic_audit' : 'structural_validation'
    };
  }
  const parsed = explainJsonObjectParse(value);
  if (!parsed.ok) {
    const gateKind = definition?.audit === true ? 'semantic_audit_format' : 'structural_validation';
    return {
      output: {
        version: 1,
        schema: definition?.outputSchema ?? 'invalid_json',
        raw_response: value
      },
      gateKind,
      parseError: parsed.error
    };
  }
  return {
    output: parsed.data,
    gateKind: definition?.audit === true ? 'semantic_audit' : 'structural_validation'
  };
}

function isPassLikeAudit(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.pass === true) return true;
  if (value.approval_status === 'approved_to_persist' && emptyArray(value.blocking_issues)) return true;
  if (value.is_consistent === true && emptyArray(value.blocking_issues)) return true;
  if (value.is_safe_for_player === true && value.requires_rewrite !== true && emptyArray(value.leaks)) return true;
  return false;
}

function emptyArray(value) {
  return Array.isArray(value) && value.length === 0;
}

function readPath(value, path) {
  return String(path).split('.').reduce((current, key) => current?.[key], value);
}

export function concern(code, message, extra = {}) {
  return { code, message, ...extra };
}

function createStageRecoveryRoute(stageId, stageSlug, gate) {
  const matrixEntry = getNewGameStageMatrixEntry(stageId);
  const firstConcern = gate?.concerns?.[0] ?? {};
  const reasonCode = firstConcern?.code ?? 'NEW_GAME_STAGE_GATE_FAILED';
  return {
    schema: 'semantic_recovery_route',
    class: inferRecoveryClass(gate),
    current_stage: stageSlug,
    repair_target_stage: inferRepairTargetStage(stageSlug, reasonCode),
    reason_code: reasonCode,
    offending_field: firstConcern?.field ?? null,
    offending_value: null,
    missing_fact_type: null,
    missing_fact_id: null,
    allowed_routes: inferAllowedRoutes(reasonCode),
    forbidden_local_fix: null,
    rerun_from_stage: matrixEntry?.returns_to_stage_on_failure ?? stageId,
    terminal_status: null
  };
}

function inferRecoveryClass(gate) {
  const codes = new Set((gate?.concerns ?? []).map((item) => item?.code));
  if (codes.has('NEW_GAME_LLM_OUTPUT_NOT_OBJECT') || codes.has('NEW_GAME_LLM_WRONG_SCHEMA')) return 'shape_repair';
  if (codes.has('START_POSITION_CONTRACT_ERROR')) return 'start_position_rebuild';
  if (codes.has('PLAYER_POSITION_MISMATCH')) return 'contract_violation';
  if ([...codes].some((code) => String(code).startsWith('OBSERVABLE_LEDGER'))) return 'observable_ledger_repair';
  if (codes.has('OBSERVED_ACTOR_PROJECTION_ERROR')) return 'observable_actor_projection_repair';
  if (codes.has('OBJECT_WITHOUT_VISIBILITY_BASIS')) return 'item_visibility_projection_repair';
  return 'same_stage_repair';
}

function inferRepairTargetStage(stageSlug, reasonCode) {
  if (reasonCode === 'START_POSITION_CONTRACT_ERROR') return 'approved_start_position';
  if (reasonCode === 'PLAYER_POSITION_MISMATCH') return 'validated_player_seed';
  if (String(reasonCode).startsWith('OBSERVABLE_LEDGER')) return 'observable_fact_ledger';
  if (reasonCode === 'OBSERVED_ACTOR_PROJECTION_ERROR') return 'observable_actor_projection';
  if (reasonCode === 'OBJECT_WITHOUT_VISIBILITY_BASIS') return 'item_visibility_projection';
  return stageSlug;
}

function inferAllowedRoutes(reasonCode) {
  if (reasonCode === 'START_POSITION_CONTRACT_ERROR') return ['rebuild_approved_start_position'];
  if (reasonCode === 'PLAYER_POSITION_MISMATCH') return [];
  if (String(reasonCode).startsWith('OBSERVABLE_LEDGER')) return ['rerun_stage_20_with_observable_ledger_repair'];
  if (reasonCode === 'OBSERVED_ACTOR_PROJECTION_ERROR') return ['rerun_stage_20_with_actor_projection_repair'];
  if (reasonCode === 'OBJECT_WITHOUT_VISIBILITY_BASIS') return ['rerun_stage_20_with_item_visibility_projection_repair'];
  return ['rerun_current_stage_with_repair_context'];
}

function inferStageModelTier(stageId) {
  const entry = getNewGameStageMatrixEntry(stageId);
  return entry?.model_tier ?? entry?.model_tier_name ?? null;
}
