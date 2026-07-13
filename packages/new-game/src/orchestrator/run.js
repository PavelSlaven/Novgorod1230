import { ArtifactRegistry } from '@rus/pipeline-engine';
import { createModularNewGameContext } from './context.js';
import { commitApprovedStage } from './commit.js';
import { MODULAR_NEW_GAME_STAGE_PLAN, validateModularStagePlan } from './stage-plan.js';

export async function runModularNewGamePipeline(options = {}) {
  if (options.enableNewGamePipeline !== true) {
    throw new Error('Modular new-game pipeline is opt-in only: pass enableNewGamePipeline=true.');
  }

  const stages = validateModularStagePlan(options.stages ?? MODULAR_NEW_GAME_STAGE_PLAN);
  const checkpoint = options.checkpoint ?? await options.checkpointStore?.load?.(options.requestId ?? null) ?? null;
  const context = options.context ?? createModularNewGameContext({ ...options, checkpoint });
  const registry = options.registry ?? new ArtifactRegistry();
  const builders = options.stageInputBuilders ?? {};
  const repairSignatures = new Set();
  const repairCounts = new Map();
  const maxRepairCycles = Math.max(0, Number(options.maxRepairCycles ?? 3));
  const maxExecutions = Math.max(stages.length, Number(options.maxStageExecutions ?? 100));
  let cursor = resolveStartCursor(stages, context, options.startAtStage);
  let executions = 0;

  while (cursor < stages.length) {
    if (++executions > maxExecutions) return blocked('execution_limit', stages[cursor], context, registry);
    const stage = stages[cursor];
    if (options.resume !== false && context.getStageOutput(stage.id) != null) {
      emit(options, context, { type: 'stage_resumed', stage_id: stage.id, stage_name: stage.name });
      cursor += 1;
      continue;
    }

    emit(options, context, { type: 'stage_started', stage_id: stage.id, stage_name: stage.name });
    try {
      const input = await buildStageInput(stage, context, options, builders);
      const rawResult = await stage.execute({ input, context, services: options.services ?? {}, registry });
      const result = normalizeExecutionResult(stage, rawResult, context);
      context.setStageResult(stage.id, result);

      if (result.status === 'approved') {
        const artifact = commitApprovedStage(context, stage, result);
        if (!registry.has(`stage:${stage.id}`)) registry.put(`stage:${stage.id}`, artifact, { stageName: stage.name });
        emit(options, context, { type: 'stage_approved', stage_id: stage.id, stage_name: stage.name });
        await saveCheckpoint(options, context, stage.id);
        cursor += 1;
        continue;
      }

      if (result.status === 'repair_required') {
        const route = await resolveRepairRoute(stage, result, context, options);
        const target = normalizeRepairTarget(route, stage, stages);
        const signature = repairSignature(stage, route, result);
        const count = (repairCounts.get(signature) ?? 0) + 1;
        repairCounts.set(signature, count);
        context.addRepairAttempt(stage.id, { route, signature, count });
        if (count > maxRepairCycles || repairSignatures.has(`${signature}|exhausted`)) {
          repairSignatures.add(`${signature}|exhausted`);
          return blocked('repair_exhausted', stage, context, registry, result, route);
        }
        repairSignatures.add(signature);
        context.clearFromStage(target);
        emit(options, context, { type: 'stage_repair_routed', stage_id: stage.id, target_stage_id: target, route });
        await saveCheckpoint(options, context, target - 1);
        cursor = stages.findIndex((item) => item.id === target);
        continue;
      }

      return blocked(result.status, stage, context, registry, result);
    } catch (error) {
      const route = error?.semanticRecoveryRoute ?? error?.lifecycle?.repair_route ?? null;
      if (route) {
        const target = normalizeRepairTarget(route, stage, stages);
        const signature = `${stage.id}|${target}|${route.reason_code ?? error.message}`;
        const count = (repairCounts.get(signature) ?? 0) + 1;
        repairCounts.set(signature, count);
        context.addRepairAttempt(stage.id, { route, signature, count, error: error.message });
        if (count <= maxRepairCycles) {
          context.clearFromStage(target);
          emit(options, context, { type: 'stage_exception_repair_routed', stage_id: stage.id, target_stage_id: target, route });
          cursor = stages.findIndex((item) => item.id === target);
          continue;
        }
      }
      if (options.throwOnFailure === true) throw error;
      return blocked('failed', stage, context, registry, { error: serializeError(error) }, route);
    }
  }

  const finalResult = context.getStageResult(26);
  return {
    status: 'approved',
    request_id: context.requestId,
    stage_id: 26,
    artifact: context.getStageOutput(26),
    result: finalResult,
    checkpoint: context.snapshot(),
    registry
  };
}

async function buildStageInput(stage, context, options, builders) {
  const key = String(stage.id);
  const builder = builders[stage.id] ?? builders[key] ?? builders[stage.name] ?? stage.buildInput;
  const provided = options.stageInputs?.[stage.id] ?? options.stageInputs?.[key] ?? options.stageInputs?.[stage.name];
  if (typeof provided === 'function') return provided({ stage, context, options });
  if (provided != null) return structuredClone(provided);
  if (typeof builder !== 'function') {
    throw new Error(`Stage ${stage.id} (${stage.name}) requires an explicit stage input builder.`);
  }
  return builder(context, options.stageOptions?.[stage.id] ?? options.stageOptions?.[stage.name] ?? {}, options.services ?? {});
}

function normalizeExecutionResult(stage, rawResult, context) {
  if (rawResult?.status) return rawResult;
  const gate = context.getGateResult(stage.id);
  if (rawResult?.schema === 'stage_result') {
    return { status: rawResult.status === 'ready' ? 'approved' : rawResult.status === 'requires_repair' ? 'repair_required' : 'blocked', artifact: rawResult.output ?? rawResult, raw: rawResult };
  }
  if (gate) return { status: gate.pass === true ? 'approved' : 'blocked', artifact: rawResult, gate };
  if (rawResult?.pass === true) return { status: 'approved', artifact: rawResult };
  if (rawResult?.repair_route || rawResult?.repair_request) return { status: 'repair_required', artifact: rawResult };
  return { status: rawResult == null ? 'failed' : 'approved', artifact: rawResult };
}

async function resolveRepairRoute(stage, result, context, options) {
  const embedded = result?.artifact?.repair_route ?? result?.artifact?.repair_request ?? result?.repair_route ?? null;
  if (typeof options.repairRouter === 'function') return options.repairRouter({ stage, result, context, embedded });
  return embedded ?? { return_to_stage: stage.id, rerun_from_stage: stage.id, reason_code: 'REPAIR_REQUIRED' };
}

function normalizeRepairTarget(route, stage, stages) {
  const raw = route?.rerun_from_stage ?? route?.return_to_stage ?? stage.id;
  const numeric = Number(raw);
  if (Number.isInteger(numeric) && stages.some((item) => item.id === numeric)) return numeric;
  const slug = String(raw ?? '').replace(/^stage[_-]?/u, '').replaceAll('_', '-');
  const byName = stages.find((item) => item.name === slug || String(item.id) === slug);
  return byName?.id ?? stage.id;
}

function resolveStartCursor(stages, context, startAtStage) {
  if (startAtStage != null) {
    const index = stages.findIndex((stage) => stage.id === Number(startAtStage));
    if (index < 0) throw new Error(`Invalid startAtStage: ${startAtStage}`);
    return index;
  }
  const index = stages.findIndex((stage) => context.getStageOutput(stage.id) == null);
  return index < 0 ? stages.length : index;
}

function repairSignature(stage, route, result) {
  const concerns = result?.artifact?.concerns ?? result?.concerns ?? [];
  return `${stage.id}|${route?.rerun_from_stage ?? route?.return_to_stage ?? stage.id}|${route?.reason_code ?? concerns[0]?.code ?? 'repair'}`;
}

async function saveCheckpoint(options, context, stageId) {
  await options.checkpointStore?.save?.(context.snapshot(), { request_id: context.requestId, stage_id: stageId });
}

function emit(options, context, event) {
  context.note(event.stage_id ?? 0, event);
  options.onEvent?.(structuredClone(event));
}

function blocked(reason, stage, context, registry, result = null, route = null) {
  return {
    status: 'blocked',
    reason,
    request_id: context.requestId,
    stage_id: stage?.id ?? null,
    stage_name: stage?.name ?? null,
    result,
    repair_route: route,
    checkpoint: context.snapshot(),
    registry
  };
}

function serializeError(error) {
  return { name: error?.name ?? 'Error', message: error?.message ?? String(error), code: error?.code ?? null, lifecycle: error?.lifecycle ?? null };
}
