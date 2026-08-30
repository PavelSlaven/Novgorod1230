export const CombatTurnRuntimeRoles = Object.freeze({
  NPC_COMBAT_DECIDER: 'npc_combat_decider',
  NPC_COMBAT_DECIDER_REPAIR: 'npc_combat_decider_format_repair',
  ACTION_PRODUCED_WEAPON_CLASSIFIER: 'combat_weapon_classification'
});

export function combatTurnRoleDefaults(contractModes) {
  return {
    npc_combat_decider: semanticRole(
      'NPC_COMBAT_DECIDER',
      contractModes.JSON_OBJECT
    ),
    npc_combat_decider_format_repair: repairRole(
      'NPC_COMBAT_DECIDER_REPAIR',
      contractModes.JSON_REPAIR
    ),
    combat_weapon_classification: {
      envPrefix: 'COMBAT_WEAPON_CLASSIFICATION',
      model: 'deepseek-v4-flash', thinking: 'disabled',
      reasoningEffort: null, responseFormat: 'json_object', maxTokens: 500,
      temperature: 0, topP: 1,
      outputContractMode: contractModes.JSON_OBJECT_WITH_SCHEMA,
      expectedSchema:
        'rus.combat.action_produced_weapon_classification.v1',
      parseJson: true, targetInputTokens: 4000,
      comfortableInputTokens: 8000, hardInputLimitTokens: 30000,
      reserveOutputTokens: 500, reserveRepairTokens: 500
    }
  };
}

function semanticRole(envPrefix, outputContractMode) {
  return {
    envPrefix, model: 'deepseek-v4-flash', thinking: 'disabled',
    reasoningEffort: null, responseFormat: 'json_object', maxTokens: 8000,
    outputContractMode, expectedSchema: null,
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
    expectedSchema: null, parseJson: true,
    targetInputTokens: 30000, comfortableInputTokens: 30000,
    hardInputLimitTokens: 100000, reserveOutputTokens: 4000,
    reserveRepairTokens: 4000
  };
}
