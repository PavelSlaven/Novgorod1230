export function conversationTurnRoleDefaults(contractModes) {
  return {
    player_conversation_interpreter: semanticRole(
      'PLAYER_CONVERSATION_INTERPRETER',
      'player_conversation_contribution_plan_v1',
      contractModes.JSON_OBJECT_WITH_SCHEMA
    ),
    player_conversation_interpreter_format_repair: repairRole(
      'PLAYER_CONVERSATION_INTERPRETER_REPAIR',
      'player_conversation_contribution_plan_v1',
      contractModes.JSON_REPAIR
    ),
    npc_conversation_responder: semanticRole(
      'NPC_CONVERSATION_RESPONDER',
      'conversation_contribution_plan_v1',
      contractModes.JSON_OBJECT_WITH_SCHEMA
    ),
    npc_conversation_responder_format_repair: repairRole(
      'NPC_CONVERSATION_RESPONDER_REPAIR',
      'conversation_contribution_plan_v1',
      contractModes.JSON_REPAIR
    )
  };
}

function semanticRole(envPrefix, expectedSchema, outputContractMode) {
  return {
    envPrefix,
    model: 'deepseek-v4-flash',
    thinking: 'disabled',
    reasoningEffort: null,
    responseFormat: 'json_object',
    maxTokens: 8000,
    outputContractMode,
    expectedSchema,
    parseJson: true,
    targetInputTokens: 100000,
    comfortableInputTokens: 220000,
    hardInputLimitTokens: 600000,
    reserveOutputTokens: 8000,
    reserveRepairTokens: 30000
  };
}

function repairRole(envPrefix, expectedSchema, outputContractMode) {
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
    expectedSchema,
    parseJson: true,
    targetInputTokens: 30000,
    comfortableInputTokens: 30000,
    hardInputLimitTokens: 100000,
    reserveOutputTokens: 4000,
    reserveRepairTokens: 4000
  };
}
