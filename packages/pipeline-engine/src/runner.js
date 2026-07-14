import { assertStageDefinition } from '@rus/contracts';
import { ArtifactRegistry } from './artifact-registry.js';

export async function runStageGraph({ stages, input, services = {}, registry = new ArtifactRegistry(), onEvent = null }) {
  let current = input;
  for (const rawStage of stages) {
    const stage = assertStageDefinition(rawStage);
    onEvent?.({ type: 'stage_started', stageId: stage.id, name: stage.name });
    const result = await stage.execute({ input: current, services, registry });
    if (!result || result.status !== 'approved') {
      onEvent?.({ type: 'stage_stopped', stageId: stage.id, result });
      return { status: result?.status ?? 'failed', stage_id: stage.id, result, registry };
    }
    registry.put(`stage:${stage.id}`, result.artifact, { stageName: stage.name });
    current = result.artifact;
    onEvent?.({ type: 'stage_approved', stageId: stage.id, digest: registry.require(`stage:${stage.id}`).digest });
  }
  return { status: 'approved', artifact: current, registry };
}
