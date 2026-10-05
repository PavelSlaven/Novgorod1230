const PROMPT_ROLES = new Set([
  'intent_router',
  'turn_step_planner',
  'turn_step_planner_repair',
  'world_knowledge_query_planner'
]);

function providerUserInput(messages) {
  const content = Array.isArray(messages)
    ? messages.find(({ role }) => role === 'user')?.content
    : null;
  if (content != null && typeof content === 'object') return content;
  if (typeof content !== 'string') return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export function identifyLlmTestRole(callOrBody = {}) {
  const explicitRole = callOrBody.role_id ?? callOrBody.roleId;
  if (PROMPT_ROLES.has(explicitRole)) {
    return explicitRole === 'turn_step_planner_repair'
      ? 'turn_step_planner' : explicitRole;
  }

  const messages = callOrBody.messages ?? callOrBody.body?.messages;
  const input = providerUserInput(messages);
  const request = input?.request ?? input;
  if (request?.schema === 'world_knowledge_query_planner_request_v1') {
    return 'world_knowledge_query_planner';
  }
  if (request?.schema === 'turn_semantic_resolution_request') {
    return 'intent_router';
  }
  if (Object.hasOwn(request ?? {}, 'root_player_action')
      && Number.isInteger(request?.step_index)) {
    return 'turn_step_planner';
  }
  return null;
}
