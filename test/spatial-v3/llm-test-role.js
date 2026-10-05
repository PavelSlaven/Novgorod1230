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
  if (isProjectedWorldKnowledgeRequest(request)) {
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

function isProjectedWorldKnowledgeRequest(request) {
  const refs = request?.available_knowledge_refs;
  const limits = request?.planner_limits;
  return ['semantic_resolution', 'materialization_support', 'npc_decision',
    'conversation', 'narration'].includes(request?.purpose)
    && typeof request.input_locale === 'string'
    && typeof request.semantic_input === 'string'
    && typeof request.situation_summary === 'string'
    && Array.isArray(request.allowed_domains)
    && request.allowed_domains.every((value) => typeof value === 'string')
    && refs != null && typeof refs === 'object' && !Array.isArray(refs)
    && Object.entries(refs).every(([key, value]) => /^f[0-9a-z]+$/u.test(key)
      && value != null && typeof value === 'object' && !Array.isArray(value)
      && Array.isArray(value.domains)
      && value.domains.every((domain) => typeof domain === 'string')
      && typeof value.label === 'string'
      && typeof value.description === 'string')
    && Number.isInteger(limits?.max_domains)
    && Number.isInteger(limits?.max_search_hints)
    && Number.isInteger(limits?.max_focus_refs);
}
