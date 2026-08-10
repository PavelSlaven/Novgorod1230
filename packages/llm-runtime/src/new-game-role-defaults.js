export const NewGameVisibleContextRoles = Object.freeze({
  BUILDER: 'VisibleContextBuilder',
  FORMAT_REPAIRER: 'VisibleContextFormatRepairer',
  SEMANTIC_REPAIRER: 'VisibleContextSemanticRepairer',
  SENIOR_SEMANTIC_REPAIRER: 'SeniorVisibleContextSemanticRepairer',
  AUDITOR: 'VisibleContextSemanticAuditor',
  AUDIT_FORMAT_REPAIRER: 'VisibleContextAuditFormatRepairer',
  SENIOR_AUDITOR: 'SeniorVisibleContextSemanticAuditor',
  AUDIT_ROUTER: 'VisibleContextAuditRouter'
});

export const NEW_GAME_VISIBLE_CONTEXT_ROLE_TIERS = Object.freeze({
  [NewGameVisibleContextRoles.BUILDER]: 'tier_2_standard',
  [NewGameVisibleContextRoles.FORMAT_REPAIRER]: 'tier_1_fast',
  [NewGameVisibleContextRoles.SEMANTIC_REPAIRER]: 'tier_2_standard',
  [NewGameVisibleContextRoles.SENIOR_SEMANTIC_REPAIRER]: 'tier_3_senior',
  [NewGameVisibleContextRoles.AUDITOR]: 'tier_2_standard',
  [NewGameVisibleContextRoles.AUDIT_FORMAT_REPAIRER]: 'tier_1_fast',
  [NewGameVisibleContextRoles.SENIOR_AUDITOR]: 'tier_3_senior',
  [NewGameVisibleContextRoles.AUDIT_ROUTER]: 'tier_2_standard'
});

export const NEW_GAME_VISIBLE_CONTEXT_ROLE_MAX_TOKENS = Object.freeze({
  [NewGameVisibleContextRoles.BUILDER]: 9000,
  [NewGameVisibleContextRoles.FORMAT_REPAIRER]: 4000,
  [NewGameVisibleContextRoles.SEMANTIC_REPAIRER]: 9000,
  [NewGameVisibleContextRoles.SENIOR_SEMANTIC_REPAIRER]: 12000,
  [NewGameVisibleContextRoles.AUDITOR]: 10000,
  [NewGameVisibleContextRoles.AUDIT_FORMAT_REPAIRER]: 6000,
  [NewGameVisibleContextRoles.SENIOR_AUDITOR]: 12000,
  [NewGameVisibleContextRoles.AUDIT_ROUTER]: 8000
});

export const NewGameTierIds = Object.freeze({
  TIER_1_FAST: 'tier_1_fast',
  TIER_2_STANDARD: 'tier_2_standard',
  TIER_3_SENIOR: 'tier_3_senior'
});

export function newGameTierDefaults(outputContractModes) {
  return Object.freeze({
    [NewGameTierIds.TIER_1_FAST]: {
      envPrefix: 'NEW_GAME_TIER_1',
      model: 'deepseek-v4-flash',
      thinking: 'disabled',
      reasoningEffort: null,
      responseFormat: 'json_object',
      maxTokens: 4000,
      temperature: 0,
      topP: 1,
      outputContractMode: outputContractModes.JSON_OBJECT,
      parseJson: true,
      targetInputTokens: 20000,
      comfortableInputTokens: 20000,
      hardInputLimitTokens: 120000,
      reserveOutputTokens: 4000,
      reserveRepairTokens: 4000
    },
    [NewGameTierIds.TIER_2_STANDARD]: {
      envPrefix: 'NEW_GAME_TIER_2',
      model: 'deepseek-v4-pro',
      thinking: 'enabled',
      reasoningEffort: 'high',
      responseFormat: 'json_object',
      maxTokens: 9000,
      outputContractMode: outputContractModes.JSON_OBJECT,
      parseJson: true,
      targetInputTokens: 120000,
      comfortableInputTokens: 250000,
      hardInputLimitTokens: 280000,
      reserveOutputTokens: 9000,
      reserveRepairTokens: 30000
    },
    [NewGameTierIds.TIER_3_SENIOR]: {
      envPrefix: 'NEW_GAME_TIER_3',
      model: 'deepseek-v4-pro',
      thinking: 'enabled',
      reasoningEffort: 'max',
      responseFormat: 'json_object',
      maxTokens: 12000,
      outputContractMode: outputContractModes.JSON_OBJECT,
      parseJson: true,
      targetInputTokens: 250000,
      comfortableInputTokens: 400000,
      hardInputLimitTokens: 700000,
      reserveOutputTokens: 12000,
      reserveRepairTokens: 50000
    }
  });
}
