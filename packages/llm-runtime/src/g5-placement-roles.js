import { getNewGameLlmTierConfig } from './provider-config.js';

export const NewGameG5PlacementRoles = Object.freeze({
  G5_MATERIALIZER: 'G5SceneMaterializer',
  G5_MATERIALIZATION_REPAIRER: 'G5SceneMaterializationRepairer',
  G5_MATERIALIZATION_SENIOR_REPAIRER: 'SeniorG5SceneMaterializationRepairer',
  G5_AUDITOR: 'G5SceneSemanticAuditor',
  G5_AUDIT_ROUTER: 'G5SceneAuditRouter',
  G5_AUDIT_FORMAT_REPAIRER: 'G5SceneAuditFormatRepairer',
  G5_SEMANTIC_REPAIRER: 'G5SceneSemanticRepairer',
  G5_SENIOR_REPAIRER: 'SeniorG5SceneRepairer',
  NPC_PLACER: 'InitialNpcPlacer',
  NPC_AUDITOR: 'InitialNpcPlacementAuditor',
  NPC_FORMAT_REPAIRER: 'InitialNpcPlacementFormatRepairer',
  NPC_SEMANTIC_REPAIRER: 'InitialNpcPlacementSemanticRepairer',
  NPC_SENIOR_REPAIRER: 'SeniorInitialNpcPlacementRepairer',
  ITEM_PLACER: 'InitialItemPlacer',
  ITEM_AUDITOR: 'InitialItemPlacementAuditor',
  ITEM_FORMAT_REPAIRER: 'InitialItemPlacementFormatRepairer',
  ITEM_SEMANTIC_REPAIRER: 'InitialItemPlacementSemanticRepairer',
  ITEM_SENIOR_REPAIRER: 'SeniorInitialItemPlacementRepairer'
});

export const NEW_GAME_G5_PLACEMENT_ROLE_TIERS = Object.freeze({
  [NewGameG5PlacementRoles.G5_MATERIALIZER]: 'tier_2_standard',
  [NewGameG5PlacementRoles.G5_MATERIALIZATION_REPAIRER]: 'tier_2_standard',
  [NewGameG5PlacementRoles.G5_MATERIALIZATION_SENIOR_REPAIRER]: 'tier_3_senior',
  [NewGameG5PlacementRoles.G5_AUDITOR]: 'tier_2_standard',
  [NewGameG5PlacementRoles.G5_AUDIT_ROUTER]: 'tier_2_standard',
  [NewGameG5PlacementRoles.G5_AUDIT_FORMAT_REPAIRER]: 'tier_1_fast',
  [NewGameG5PlacementRoles.G5_SEMANTIC_REPAIRER]: 'tier_2_standard',
  [NewGameG5PlacementRoles.G5_SENIOR_REPAIRER]: 'tier_3_senior',
  [NewGameG5PlacementRoles.NPC_PLACER]: 'tier_2_standard',
  [NewGameG5PlacementRoles.NPC_AUDITOR]: 'tier_2_standard',
  [NewGameG5PlacementRoles.NPC_FORMAT_REPAIRER]: 'tier_1_fast',
  [NewGameG5PlacementRoles.NPC_SEMANTIC_REPAIRER]: 'tier_2_standard',
  [NewGameG5PlacementRoles.NPC_SENIOR_REPAIRER]: 'tier_3_senior',
  [NewGameG5PlacementRoles.ITEM_PLACER]: 'tier_2_standard',
  [NewGameG5PlacementRoles.ITEM_AUDITOR]: 'tier_2_standard',
  [NewGameG5PlacementRoles.ITEM_FORMAT_REPAIRER]: 'tier_1_fast',
  [NewGameG5PlacementRoles.ITEM_SEMANTIC_REPAIRER]: 'tier_2_standard',
  [NewGameG5PlacementRoles.ITEM_SENIOR_REPAIRER]: 'tier_3_senior'
});

export function getNewGameG5PlacementRoleDescriptor(role, env = process.env) {
  const roleId = String(role ?? '').trim();
  const tierId = NEW_GAME_G5_PLACEMENT_ROLE_TIERS[roleId];
  if (!tierId) throw new Error(`Unsupported Stage 13-16 LLM role: ${roleId || '<empty>'}`);
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
