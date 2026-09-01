import { createServer } from 'node:http';

const ROLE_MODELS = Object.freeze({
  TURN_INTENT_ROUTER_MODEL: 'fixture-intent-router',
  TURN_STEP_PLANNER_MODEL: 'fixture-turn-step-planner',
  TURN_STEP_PLANNER_REPAIR_MODEL: 'fixture-turn-step-planner-repair',
  TURN_SPATIAL_SEMANTIC_DESCRIPTOR_MODEL:
    'fixture-spatial-semantic-descriptor',
  PLAYER_CONVERSATION_INTERPRETER_MODEL:
    'fixture-player-conversation-interpreter',
  PLAYER_CONVERSATION_INTERPRETER_REPAIR_MODEL:
    'fixture-player-conversation-interpreter-repair',
  NPC_CONVERSATION_RESPONDER_MODEL: 'fixture-npc-conversation-responder',
  NPC_CONVERSATION_RESPONDER_REPAIR_MODEL:
    'fixture-npc-conversation-responder-repair',
  NPC_CONVERSATION_GROUNDING_AUDITOR_MODEL:
    'fixture-npc-conversation-grounding-auditor',
  NPC_AUTONOMOUS_DECIDER_MODEL: 'fixture-npc-autonomous-decider',
  NPC_AUTONOMOUS_DECIDER_REPAIR_MODEL:
    'fixture-npc-autonomous-decider-repair',
  NPC_COMBAT_DECIDER_MODEL: 'fixture-npc-combat-decider',
  NPC_COMBAT_DECIDER_REPAIR_MODEL: 'fixture-npc-combat-decider-repair',
  TURN_GAMEPLAY_NARRATOR_MODEL: 'fixture-gameplay-narrator',
  TURN_GAMEPLAY_NARRATOR_REPAIR_MODEL: 'fixture-gameplay-narrator-repair',
  TURN_GAMEPLAY_NARRATOR_AUDITOR_MODEL: 'fixture-gameplay-narrator-auditor'
});

export function localLlmProductionEnv(baseUrl) {
  return Object.freeze({
    DEEPSEEK_API_KEY: 'test',
    DEEPSEEK_BASE_URL: baseUrl,
    ...ROLE_MODELS
  });
}

export async function startLocalLlmProviderFixture({ respond } = {}) {
  if (typeof respond !== 'function') {
    throw new TypeError('respond must be a function.');
  }
  const requests = [];
  const responses = [];
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST'
        || request.url !== '/chat/completions') {
      response.writeHead(404).end();
      return;
    }
    try {
      const body = JSON.parse(await readBody(request));
      const captured = Object.freeze({
        ordinal: requests.length + 1,
        model: String(body.model ?? ''),
        body: structuredClone(body),
        input: parseLastUserMessage(body.messages)
      });
      requests.push(captured);
      const output = await respond(captured);
      responses.push(structuredClone(output));
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        id: `fixture-call-${captured.ordinal}`,
        object: 'chat.completion',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: typeof output === 'string'
              ? output
              : JSON.stringify(output)
          },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      }));
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: String(error?.stack ?? error) }));
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return Object.freeze({
    baseUrl,
    env: localLlmProductionEnv(baseUrl),
    requests,
    responses,
    close: () => new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()))
  });
}

function parseLastUserMessage(messages) {
  const content = [...(Array.isArray(messages) ? messages : [])]
    .reverse()
    .find(({ role }) => role === 'user')?.content;
  if (typeof content !== 'string') return null;
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}
