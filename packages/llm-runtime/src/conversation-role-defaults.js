export function conversationTurnRoleDefaults(contractModes) {
  return {
    player_conversation_interpreter: semanticRole(
      'PLAYER_CONVERSATION_INTERPRETER',
      contractModes.JSON_OBJECT
    ),
    player_conversation_interpreter_format_repair: repairRole(
      'PLAYER_CONVERSATION_INTERPRETER_REPAIR',
      contractModes.JSON_REPAIR
    ),
    npc_conversation_responder: semanticRole(
      'NPC_CONVERSATION_RESPONDER',
      contractModes.JSON_OBJECT
    ),
    npc_conversation_responder_format_repair: repairRole(
      'NPC_CONVERSATION_RESPONDER_REPAIR',
      contractModes.JSON_REPAIR
    ),
    npc_conversation_grounding_auditor: auditRole(
      'NPC_CONVERSATION_GROUNDING_AUDITOR',
      contractModes.JSON_OBJECT
    ),
    turn_step_grounding_auditor: auditRole(
      'TURN_STEP_GROUNDING_AUDITOR',
      contractModes.JSON_OBJECT
    )
  };
}

function auditRole(envPrefix, outputContractMode) {
  return {
    envPrefix, model: 'deepseek-v4-flash', thinking: 'disabled',
    reasoningEffort: null, responseFormat: 'json_object', maxTokens: 800,
    temperature: 0, topP: 1, outputContractMode, expectedSchema: null,
    parseJson: true, targetInputTokens: 100000, comfortableInputTokens: 220000,
    hardInputLimitTokens: 600000, reserveOutputTokens: 800,
    reserveRepairTokens: 0
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
    expectedSchema: null,
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
    expectedSchema: null,
    parseJson: true,
    targetInputTokens: 30000,
    comfortableInputTokens: 30000,
    hardInputLimitTokens: 100000,
    reserveOutputTokens: 4000,
    reserveRepairTokens: 4000
  };
}
