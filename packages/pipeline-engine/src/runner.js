import { assertStageDefinition } from '@rus/contracts';
import { ArtifactRegistry } from './artifact-registry.js';

export async function runStageGraph({ stages, input, services = {}, transient = false,
  registry = transient ? null : new ArtifactRegistry(), onEvent = null }) {
  if (transient && registry != null) {
    throw new TypeError('Transient stage graphs cannot retain an artifact registry.');
  }
  if (!transient && registry == null) {
    throw new TypeError('Use transient: true to run without an artifact registry.');
  }
  let current = input;
  for (const rawStage of stages) {
    const stage = assertStageDefinition(rawStage);
    onEvent?.({ type: 'stage_started', stageId: stage.id, name: stage.name });
    const result = await stage.execute({ input: current, services, registry });
    if (!result || result.status !== 'approved') {
      onEvent?.({ type: 'stage_stopped', stageId: stage.id, result });
      return { status: result?.status ?? 'failed', stage_id: stage.id, result, registry };
    }
    const record = registry?.put(`stage:${stage.id}`, result.artifact,
      { stageName: stage.name });
    current = result.artifact;
    onEvent?.({ type: 'stage_approved', stageId: stage.id,
      digest: record?.digest ?? null });
  }
  return { status: 'approved', artifact: current, registry };
}
