import { getNewGameLlmTierConfig } from './provider-config.js';

export const NewGameKnowledgeHiddenRoles = Object.freeze({
  TIME_LIGHT_AUDITOR: 'TimeLightSemanticAuditor',
  TIME_LIGHT_FORMAT_REPAIRER: 'TimeLightAuditFormatRepairer',
  TIME_LIGHT_ROUTER: 'TimeLightAuditRouter',
  KNOWLEDGE_BUILDER: 'CharacterKnowledgeMapBuilder',
  KNOWLEDGE_AUDITOR: 'CharacterKnowledgeMapAuditor',
  KNOWLEDGE_FORMAT_REPAIRER: 'CharacterKnowledgeMapFormatRepairer',
  KNOWLEDGE_SEMANTIC_REPAIRER: 'CharacterKnowledgeMapSemanticRepairer',
  KNOWLEDGE_SENIOR_REPAIRER: 'CharacterKnowledgeMapSeniorRepairer',
  HIDDEN_STATE_AUDITOR: 'FullHiddenStateAuditor',
  HIDDEN_STATE_AUDIT_FORMAT_REPAIRER: 'FullHiddenStateAuditFormatRepairer'
});

export const NEW_GAME_KNOWLEDGE_HIDDEN_ROLE_TIERS = Object.freeze({
  [NewGameKnowledgeHiddenRoles.TIME_LIGHT_AUDITOR]: 'tier_2_standard',
  [NewGameKnowledgeHiddenRoles.TIME_LIGHT_FORMAT_REPAIRER]: 'tier_1_fast',
  [NewGameKnowledgeHiddenRoles.TIME_LIGHT_ROUTER]: 'tier_2_standard',
  [NewGameKnowledgeHiddenRoles.KNOWLEDGE_BUILDER]: 'tier_2_standard',
  [NewGameKnowledgeHiddenRoles.KNOWLEDGE_AUDITOR]: 'tier_2_standard',
  [NewGameKnowledgeHiddenRoles.KNOWLEDGE_FORMAT_REPAIRER]: 'tier_1_fast',
  [NewGameKnowledgeHiddenRoles.KNOWLEDGE_SEMANTIC_REPAIRER]: 'tier_2_standard',
  [NewGameKnowledgeHiddenRoles.KNOWLEDGE_SENIOR_REPAIRER]: 'tier_3_senior',
  [NewGameKnowledgeHiddenRoles.HIDDEN_STATE_AUDITOR]: 'tier_2_standard',
  [NewGameKnowledgeHiddenRoles.HIDDEN_STATE_AUDIT_FORMAT_REPAIRER]: 'tier_1_fast'
});

export function getNewGameKnowledgeHiddenRoleDescriptor(role, env = process.env) {
  const roleId = String(role ?? '').trim();
  const tierId = NEW_GAME_KNOWLEDGE_HIDDEN_ROLE_TIERS[roleId];
  if (!tierId) throw new Error(`Unsupported Stage 17-19 LLM role: ${roleId || '<empty>'}`);
  const tierConfig = getNewGameLlmTierConfig(tierId, env);
  return Object.freeze({
    role: roleId,
    model_tier: tierId,
    provider: 'deepseek',
    model: tierConfig.model,
    thinking: tierConfig.thinking,
    reasoning_effort: tierConfig.reasoningEffort,
    response_format: tierConfig.responseFormat,
    max_tokens: tierId === 'tier_3_senior' ? 12000 : tierId === 'tier_1_fast' ? 5000 : 10000
  });
}
