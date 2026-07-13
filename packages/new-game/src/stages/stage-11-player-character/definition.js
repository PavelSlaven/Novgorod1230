import { assertStage11Ports } from './ports.js';
import { runStage11PlayerCharacterBlock } from './orchestration.js';
import { validateStage11PlayerCharacterOutput } from './validation.js';

export const stage11Definition = Object.freeze({
  id: 11,
  name: 'player-character',
  version: 1,
  stageType: 'semantic_generation',
  async execute({ input, services = {} } = {}) {
    const { executor } = assertStage11Ports(services.stage11 ?? services);
    const artifact = await runStage11PlayerCharacterBlock({ input, executor });
    const concerns = validateStage11PlayerCharacterOutput(artifact, input);
    return { status: artifact?.generation_status === 'generated' && concerns.length === 0 ? 'approved' : 'blocked', artifact, concerns };
  }
});
