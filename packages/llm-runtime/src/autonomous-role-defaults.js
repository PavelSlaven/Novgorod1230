export function autonomousTurnRoleDefaults(contractModes) {
  return {
    npc_autonomous_decider: semanticRole(
      'NPC_AUTONOMOUS_DECIDER',
      contractModes.JSON_OBJECT_WITH_SCHEMA
    ),
    npc_autonomous_decider_format_repair: repairRole(
      'NPC_AUTONOMOUS_DECIDER_REPAIR',
      contractModes.JSON_REPAIR
    )
  };
}

function semanticRole(envPrefix, outputContractMode) {
  return {
    envPrefix,
    model: 'deepseek-v4-flash',
    thinking: 'disabled',
    reasoningEffort: null,
    responseFormat: 'json_object',
    maxTokens: 8000,
    outputContractMode,
    expectedSchema: 'npc_step_plan_v1',
    parseJson: true,
    targetInputTokens: 100000,
    comfortableInputTokens: 220000,
    hardInputLimitTokens: 600000,
    reserveOutputTokens: 8000,
    reserveRepairTokens: 30000
  };
}

function repairRole(envPrefix, outputContractMode) {
  return {
    envPrefix,
    model: 'deepseek-v4-flash',
    thinking: 'disabled',
    reasoningEffort: null,
    responseFormat: 'json_object',
    maxTokens: 4000,
    temperature: 0,
    topP: 1,
    outputContractMode,
    expectedSchema: 'npc_step_plan_v1',
    parseJson: true,
    targetInputTokens: 30000,
    comfortableInputTokens: 30000,
    hardInputLimitTokens: 100000,
    reserveOutputTokens: 4000,
    reserveRepairTokens: 4000
  };
}
