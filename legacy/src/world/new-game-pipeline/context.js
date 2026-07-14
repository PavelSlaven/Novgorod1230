import { randomUUID } from 'node:crypto';
import { getNewGamePhaseId } from './registry.js';
import { normalizeStage2ClientDefaults, normalizeStage2UiFields } from './stages/stage2-normalization.js';

export function createNewGamePipelineContext({
  requestId = randomUUID(),
  startText = '',
  playerName = '',
  uiFields = null,
  clientDefaults = null,
  historicalFrameCandidateSet = null,
  historicalFrameSelectionPolicy = null,
  historicalFrameCandidatePolicy = null,
  env = process.env,
  tracker = null
} = {}) {
  const outputs = new Map();
  const gates = new Map();
  const repairs = new Map();
  const stageMeta = new Map();
  const lifecycle = new Map();
  const frozenArtifacts = new Map();
  const repairBaselines = new Map();
  const pipelineRuntime = 'new_lifecycle';
  const diagnostics = {
    pipeline_runtime: pipelineRuntime,
    legacy_provider_runtime_used: false,
    first_failed_gate: null,
    first_invalid_artifact: null,
    first_regression_stage: null,
    terminal_failed_stage: null,
    failed_stage_id: null,
    failed_stage_slug: null,
    failed_stage_type: null,
    failed_gate: null,
    last_valid_stage: null,
    validation_errors: [],
    semantic_concerns: [],
    repair_attempts: 0,
    senior_repair_used: false,
    observable_ledger_failed: false,
    observable_projection_failed: false,
    observable_duplicate_paths: [],
    observable_missing_basis: [],
    observable_rejected_sources: [],
    repeated_error_signature: false,
    anti_regression_diff: [],
    forbidden_paths_changed: [],
    missing_dependency_references: [],
    final_blocked_reason: null
  };

  return {
    requestId,
    startText: String(startText ?? ''),
    playerName: String(playerName ?? ''),
    // Stage 2 may receive optional legacy/API fields, but the normal game UI
    // still remains a single free-text request. These are normalized here so
    // the LLM stage does not have to guess missing technical defaults.
    uiFields: normalizeStage2UiFields(uiFields),
    clientDefaults: normalizeStage2ClientDefaults(clientDefaults),
    // Stage 3 can be driven either by a real world_base queryable or by an
    // explicit test/dev candidate set. This is backend state only; the UI does
    // not expose historical-frame candidates to the player.
    historicalFrameCandidateSet,
    historicalFrameSelectionPolicy,
    historicalFrameCandidatePolicy,
    env,
    tracker,

    note(stageId, payload = {}) {
      const entry = {
        phase: getNewGamePhaseId(stageId),
        progress: Number.isFinite(payload.progress) ? payload.progress : Math.round((Number(stageId) / 26) * 100),
        ...payload
      };
      if (typeof tracker?.update === 'function') {
        tracker.update(entry);
      } else {
        tracker?.note?.(entry);
      }
    },

    setStageOutput(stageId, output) {
      outputs.set(Number(stageId), output);
      return output;
    },

    getStageOutput(stageId) {
      return outputs.get(Number(stageId)) ?? null;
    },

    requireStageOutput(stageId, label = `stage ${stageId}`) {
      const output = outputs.get(Number(stageId));
      if (!output) throw new Error(`New-game pipeline requires ${label} output.`);
      return output;
    },

    setGateResult(stageId, result) {
      gates.set(Number(stageId), result);
       if (result?.pass === true) {
        diagnostics.last_valid_stage = result.stage_slug ?? diagnostics.last_valid_stage;
      } else if (result?.pass === false) {
        diagnostics.first_failed_gate ??= result.gate_kind ?? null;
        diagnostics.failed_gate = result.gate_kind ?? diagnostics.failed_gate;
        diagnostics.failed_stage_id = result.stage_id ?? diagnostics.failed_stage_id;
        diagnostics.failed_stage_slug = result.stage_slug ?? diagnostics.failed_stage_slug;
        diagnostics.validation_errors.push(...(result.concerns ?? []).map((item) => item.message ?? item.code));
      }
      return result;
    },

    setStageMeta(stageId, payload = {}) {
      stageMeta.set(Number(stageId), structuredClone(payload));
      return stageMeta.get(Number(stageId));
    },

    getStageMeta(stageId) {
      return stageMeta.get(Number(stageId)) ?? null;
    },

    addRepairAttempt(stageId, payload = {}) {
      const key = Number(stageId);
      const attempts = repairs.get(key) ?? [];
      attempts.push(structuredClone(payload));
      repairs.set(key, attempts);
      diagnostics.repair_attempts += 1;
      if (String(payload.model_tier ?? '').includes('senior')) diagnostics.senior_repair_used = true;
      if (payload.repeated_error_signature === true) diagnostics.repeated_error_signature = true;
      return attempts.slice();
    },

    getRepairHistory(stageId) {
      return (repairs.get(Number(stageId)) ?? []).map((item) => structuredClone(item));
    },

    setRepairBaseline(stageId, payload = {}) {
      repairBaselines.set(Number(stageId), structuredClone(payload));
      return repairBaselines.get(Number(stageId));
    },

    getRepairBaseline(stageId) {
      return repairBaselines.get(Number(stageId)) ?? null;
    },

    clearRepairBaseline(stageId) {
      repairBaselines.delete(Number(stageId));
    },

    getGateResult(stageId) {
      return gates.get(Number(stageId)) ?? null;
    },

    setLifecycleState(stageId, payload = {}) {
      lifecycle.set(Number(stageId), structuredClone(payload));
      const state = lifecycle.get(Number(stageId));
      if (state?.terminal_status === 'passed' && diagnostics.failed_stage_id === state.stage_id) {
        diagnostics.terminal_failed_stage = null;
        diagnostics.failed_stage_id = null;
        diagnostics.failed_stage_slug = null;
        diagnostics.failed_stage_type = null;
        diagnostics.failed_gate = null;
        diagnostics.final_blocked_reason = null;
      }
      if (state?.terminal_status && state.terminal_status !== 'passed') {
        diagnostics.terminal_failed_stage = state.stage_slug ?? diagnostics.terminal_failed_stage;
        diagnostics.failed_stage_type = state.stage_type ?? diagnostics.failed_stage_type;
        diagnostics.final_blocked_reason = state.final_blocked_reason ?? diagnostics.final_blocked_reason;
        diagnostics.failed_stage_id = state.stage_id ?? diagnostics.failed_stage_id;
        diagnostics.failed_stage_slug = state.stage_slug ?? diagnostics.failed_stage_slug;
        diagnostics.failed_gate = state.failed_gate ?? diagnostics.failed_gate;
        diagnostics.first_failed_gate ??= state.failed_gate ?? null;
        if (!diagnostics.first_invalid_artifact && state.stage_slug && state.parsed_output) {
          diagnostics.first_invalid_artifact = `${state.stage_slug}:${state.parsed_output.schema ?? 'artifact'}`;
        }
      }
      if (state?.semantic_concerns?.length) {
        diagnostics.semantic_concerns.push(...state.semantic_concerns.map((item) => item.message ?? item.code ?? item));
        if (state.semantic_concerns.some((item) => String(item?.code ?? item).includes('OBSERVABLE_LEDGER'))) {
          diagnostics.observable_ledger_failed = true;
        }
        if (state.semantic_concerns.some((item) => /OBJECT_WITHOUT_VISIBILITY_BASIS|VISIBLE_CONTEXT_/u.test(String(item?.code ?? item)))) {
          diagnostics.observable_projection_failed = true;
        }
      }
      if (state?.observable_dedupe_report?.duplicate_object_paths?.length) {
        diagnostics.observable_duplicate_paths.push(...state.observable_dedupe_report.duplicate_object_paths);
      }
      if (Array.isArray(state?.rejected_or_unsafe_sources) && state.rejected_or_unsafe_sources.length) {
        diagnostics.observable_rejected_sources.push(...state.rejected_or_unsafe_sources);
      }
      if (Array.isArray(state?.semantic_concerns)) {
        diagnostics.observable_missing_basis.push(...state.semantic_concerns
          .filter((item) => item?.code === 'OBJECT_WITHOUT_VISIBILITY_BASIS')
          .map((item) => item.field ?? item.message));
      }
      if (state?.anti_regression_report?.diff?.length) {
        diagnostics.first_regression_stage ??= state.stage_slug ?? null;
        diagnostics.anti_regression_diff.push(...state.anti_regression_report.diff);
        diagnostics.forbidden_paths_changed.push(...state.anti_regression_report.diff);
      }
      if (state?.missing_dependency_references?.length) {
        diagnostics.missing_dependency_references.push(...state.missing_dependency_references);
      }
      return state;
    },

    getLifecycleState(stageId) {
      return lifecycle.get(Number(stageId)) ?? null;
    },

    freezeArtifact(record = {}) {
      if (!record?.artifact_id) {
        throw new Error('Frozen artifact record requires artifact_id.');
      }
      frozenArtifacts.set(String(record.artifact_id), structuredClone(record));
      if (record.validation_status !== 'passed') {
        diagnostics.first_invalid_artifact ??= record.artifact_id;
      }
      return record;
    },

    getFrozenArtifact(artifactId) {
      const record = frozenArtifacts.get(String(artifactId));
      return record ? structuredClone(record) : null;
    },

    getFrozenArtifactBySchema(schema) {
      for (const record of frozenArtifacts.values()) {
        if (record?.schema === schema) return structuredClone(record);
      }
      return null;
    },

    listFrozenArtifacts() {
      return [...frozenArtifacts.values()].map((item) => structuredClone(item));
    },

    clearFromStage(stageId) {
      const from = Number(stageId);
      for (const key of [...outputs.keys()]) {
        if (resolveStageOrder(key) >= from) outputs.delete(key);
      }
      for (const key of [...gates.keys()]) {
        if (resolveStageOrder(key) >= from) gates.delete(key);
      }
      for (const key of [...repairs.keys()]) {
        if (resolveStageOrder(key) > from) repairs.delete(key);
      }
      for (const key of [...stageMeta.keys()]) {
        if (resolveStageOrder(key) >= from) stageMeta.delete(key);
      }
      for (const key of [...lifecycle.keys()]) {
        if (resolveStageOrder(key) >= from) lifecycle.delete(key);
      }
      for (const key of [...repairBaselines.keys()]) {
        if (resolveStageOrder(key) > from) repairBaselines.delete(key);
      }
      for (const [artifactId, record] of [...frozenArtifacts.entries()]) {
        if (resolveStageOrder(record?.stage_id) >= from) frozenArtifacts.delete(artifactId);
      }
    },

    snapshot() {
      return {
        request_id: requestId,
        pipeline_runtime: pipelineRuntime,
        outputs: Object.fromEntries(outputs),
        gates: Object.fromEntries(gates),
        repair_history: Object.fromEntries(repairs),
        stage_meta: Object.fromEntries(stageMeta),
        lifecycle: Object.fromEntries(lifecycle),
        repair_baselines: Object.fromEntries(repairBaselines),
        frozen_artifacts: Object.fromEntries([...frozenArtifacts.entries()]),
        diagnostics: structuredClone(diagnostics)
      };
    }
  };
}

function resolveStageOrder(stageId) {
  const numeric = Number(stageId);
  if (!Number.isFinite(numeric)) return Number.MAX_SAFE_INTEGER;
  if (numeric >= 1000) return Math.floor(numeric / 100);
  return numeric;
}
