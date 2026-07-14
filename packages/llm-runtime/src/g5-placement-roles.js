import { getNewGameLlmTierConfig } from './provider-config.js';

// Materialization v2 deliberately exposes audit roles only. G5/NPC/item creation
// belongs to @rus/materialization and code services in Stages 13, 15 and 16.
export const NewGameG5PlacementRoles = Object.freeze({
  G5_AUDITOR: 'G5SceneSemanticAuditor',
  G5_AUDIT_FORMAT_REPAIRER: 'G5SceneAuditFormatRepairer',
  NPC_AUDITOR: 'InitialNpcPlacementAuditor',
  NPC_AUDIT_FORMAT_REPAIRER: 'InitialNpcPlacementAuditFormatRepairer',
  ITEM_AUDITOR: 'InitialItemPlacementAuditor',
  ITEM_AUDIT_FORMAT_REPAIRER: 'InitialItemPlacementAuditFormatRepairer',
  BOUNDED_DECISION: 'BoundedDecisionSelector'
});

export const NEW_GAME_G5_PLACEMENT_ROLE_TIERS = Object.freeze({
  [NewGameG5PlacementRoles.G5_AUDITOR]: 'tier_2_standard',
  [NewGameG5PlacementRoles.G5_AUDIT_FORMAT_REPAIRER]: 'tier_1_fast',
  [NewGameG5PlacementRoles.NPC_AUDITOR]: 'tier_2_standard',
  [NewGameG5PlacementRoles.NPC_AUDIT_FORMAT_REPAIRER]: 'tier_1_fast',
  [NewGameG5PlacementRoles.ITEM_AUDITOR]: 'tier_2_standard',
  [NewGameG5PlacementRoles.ITEM_AUDIT_FORMAT_REPAIRER]: 'tier_1_fast',
  [NewGameG5PlacementRoles.BOUNDED_DECISION]: 'tier_2_standard'
});

export function getNewGameG5PlacementRoleDescriptor(role, env = process.env) {
  const roleId = String(role ?? '').trim();
  const tierId = NEW_GAME_G5_PLACEMENT_ROLE_TIERS[roleId];
  if (!tierId) throw new Error(`Unsupported materialization-v2 LLM role: ${roleId || '<empty>'}`);
  const tierConfig = getNewGameLlmTierConfig(tierId, env);
  return Object.freeze({
    role: roleId,
    capability: roleId === NewGameG5PlacementRoles.BOUNDED_DECISION ? 'bounded_decision' : 'audit_only',
    model_tier: tierId,
    provider: 'deepseek',
    model: tierConfig.model,
    thinking: tierConfig.thinking,
    reasoning_effort: tierConfig.reasoningEffort,
    response_format: tierConfig.responseFormat,
    max_tokens: tierId === 'tier_1_fast' ? 5000 : 10000
  });
}
