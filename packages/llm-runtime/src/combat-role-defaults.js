export const CombatTurnRuntimeRoles = Object.freeze({
  NPC_COMBAT_DECIDER: 'npc_combat_decider',
  NPC_COMBAT_DECIDER_REPAIR: 'npc_combat_decider_format_repair'
});

export function combatTurnRoleDefaults(contractModes) {
  return {
    npc_combat_decider: semanticRole(
      'NPC_COMBAT_DECIDER',
      contractModes.JSON_OBJECT_WITH_SCHEMA
    ),
    npc_combat_decider_format_repair: repairRole(
      'NPC_COMBAT_DECIDER_REPAIR',
      contractModes.JSON_REPAIR
    )
  };
}

function semanticRole(envPrefix, outputContractMode) {
  return {
    envPrefix, model: 'deepseek-v4-pro', thinking: 'enabled',
    reasoningEffort: 'high', responseFormat: 'json_object', maxTokens: 8000,
    outputContractMode, expectedSchema: 'npc_combat_intent_plan_v1',
    parseJson: true, targetInputTokens: 100000, comfortableInputTokens: 220000,
    hardInputLimitTokens: 600000, reserveOutputTokens: 8000,
    reserveRepairTokens: 30000
  };
}

function repairRole(envPrefix, outputContractMode) {
  return {
    envPrefix, model: 'deepseek-v4-flash', thinking: 'disabled',
    reasoningEffort: null, responseFormat: 'json_object', maxTokens: 4000,
    temperature: 0, topP: 1, outputContractMode,
    expectedSchema: 'npc_combat_intent_plan_v1', parseJson: true,
    targetInputTokens: 30000, comfortableInputTokens: 30000,
    hardInputLimitTokens: 100000, reserveOutputTokens: 4000,
    reserveRepairTokens: 4000
  };
}
