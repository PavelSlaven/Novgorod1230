const AGENT_RULES = {
  prose: {
    forbidden: [
      '# скрытая информация',
      'hidden_state',
      'sourcedossier',
      'sourceDossier',
      '"audit"',
      'state_delta',
      '"dossier"',
      '"input"',
      '"intent"',
      '"world"',
      '"witnesses"',
      'requestRaw',
      'responseRaw',
      'objectiveMap',
      ' DC',
      'roll',
      '"hidden"'
    ]
  },
  visibility: {
    forbiddenOutput: ['"hidden_state"', '"secret_motive"', 'future_event_untriggered']
  },
  shaper: {
    forbidden: ['# скрытая информация', 'пиши как фрагмент книги', 'художественн']
  },
  repair: {
    required: ['validation', 'source']
  }
};

export function validateAgentPrompt(agentType, messages = []) {
  const errors = [];
  const payload = serializeMessages(messages).toLowerCase();
  const rules = AGENT_RULES[agentType];
  if (!rules) return { ok: true, errors: [], agentType };

  if (Array.isArray(rules.forbidden)) {
    for (const token of rules.forbidden) {
      if (payload.includes(String(token).toLowerCase())) {
        errors.push(`forbidden token for ${agentType}: ${token}`);
      }
    }
  }
  if (Array.isArray(rules.required)) {
    for (const token of rules.required) {
      if (!payload.includes(String(token).toLowerCase())) {
        errors.push(`missing required token for ${agentType}: ${token}`);
      }
    }
  }

  return { ok: errors.length === 0, errors, agentType };
}

export function shouldEnforcePromptGuard(env = process.env) {
  return env.PROMPT_GUARD === '1';
}

function serializeMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .map((message) => `${message?.role ?? ''}:${message?.content ?? ''}`)
    .join('\n');
}
