import { assertStage12Ports } from './ports.js';
import { buildStage12FailedAuditFromPrecheck } from './failure.js';
import { validateStage12PlayerCharacterAuditInput } from './input.js';
import { validateStage12PlayerCharacterAuditOutput } from './output-validation.js';

function normalizeExecutorOutput(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw.output ?? raw.data ?? raw;
  return raw;
}

export const stage12Definition = Object.freeze({
  id: 12,
  name: 'player-character-audit',
  version: 1,
  stageType: 'semantic_audit',
  async execute({ input, services = {} } = {}) {
    const inputConcerns = validateStage12PlayerCharacterAuditInput(input);
    if (inputConcerns.length > 0) {
      const artifact = buildStage12FailedAuditFromPrecheck(input);
      return { status: 'blocked', artifact, concerns: inputConcerns };
    }
    const { executor } = assertStage12Ports(services.stage12 ?? services);
    const artifact = normalizeExecutorOutput(await executor({ input, stage: { id: 12, slug: 'player_character_audit', type: 'semantic_audit' } }));
    const concerns = validateStage12PlayerCharacterAuditOutput(artifact, input);
    return { status: artifact?.pass === true && concerns.length === 0 ? 'approved' : 'blocked', artifact, concerns };
  }
});
