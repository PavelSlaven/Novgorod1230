import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { P3_ATTEMPT_BUDGET, createP3AttemptBudget, createP3RoleRuntime, loadP3QwenSettingsOwner,
  resolveP3EffectiveConfig, runP3TurnStep } from './p3-boundary.js';
import { runP3NativeNpcReply } from './p3-boundary.js';
import { createP3LiveChannel, createP3NativeSocketAdapter,
  requireLiveObservation } from './p3-live-socket.js';

function requireP3DevConfig(config) {
  if (Object.keys(config ?? {}).sort().join() !== 'npcMaxRepairAttempts,turnCallBudget'
      || !Number.isSafeInteger(config.turnCallBudget) || config.turnCallBudget < 1
      || config.turnCallBudget > P3_ATTEMPT_BUDGET
      || ![1, 2].includes(config.npcMaxRepairAttempts)) {
    throw new Error('P3_LIVE_CONFIG_INVALID');
  }
  return Object.freeze({ ...config });
}

export async function loadP3DevConfig() {
  return requireP3DevConfig(JSON.parse(await readFile(
    new URL('./p3-dev-config.json', import.meta.url), 'utf8')));
}

export async function startP3LiveCoordinator({ socketPath, env = process.env,
  settingsOwner = null, runtimeFactory = createP3RoleRuntime, execute,
  config = null, journal = record => process.stdout.write(`${JSON.stringify(record)}\n`) } = {}) {
  if (typeof socketPath !== 'string' || !socketPath) throw new Error('P3_LIVE_SOCKET_REQUIRED');
  config = config === null ? await loadP3DevConfig() : requireP3DevConfig(config);
  settingsOwner ??= await loadP3QwenSettingsOwner({ env });
  let activeChannel = null;
  let activePhrase = null;
  const attempts = new Map();
  const sockets = new Set();
  const budget = createP3AttemptBudget({ budget: config.turnCallBudget, scope: 'turn',
    onAttempt: async event => {
      if (event.phase === 'after') {
        const { role, started } = attempts.get(event.attempt);
        attempts.delete(event.attempt);
        Object.assign(role, { ms: Date.now() - started, ok: event.error === null });
        return;
      }
      const effective = resolveP3EffectiveConfig({ roleId: event.input.role_id, env, settingsOwner });
      const role = { role_id: effective.role_id, repair_kind: event.input.repair_kind ?? null,
        ms: null, ok: null };
      activePhrase.roles.push(role);
      attempts.set(event.attempt, { role, started: Date.now() });
      activeChannel.send({ type: 'role_phase', role_id: effective.role_id,
        timeout_ms: effective.timeout_ms });
    } });
  const runtime = runtimeFactory({ env, settingsOwner, budget, ...(execute ? { execute } : {}) });
  const server = createServer(socket => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    void handle(socket);
  });
  async function handle(socket) {
    const channel = createP3LiveChannel(socket);
    let ownsRequest = false;
    let adapter = null;
    let phrase = null;
    let requestId = null;
    let enteredAt = null;
    try {
      const message = await channel.receive();
      enteredAt = Date.now();
      channel.bind(message.id);
      requestId = message.id;
      if (message.type !== 'intent' || typeof message.intent !== 'string'
          || !message.intent.trim()) throw new Error('P3_LIVE_INTENT_REQUIRED');
      if (activeChannel) throw new Error('P3_LIVE_BUSY');
      const observation = requireLiveObservation(message.observation);
      activeChannel = channel;
      ownsRequest = true;
      phrase = activePhrase = { type: 'p3_phrase', id: message.id, t_enter: enteredAt,
        t_native_reply: null, roles: [], outcome: 'failure', code: null, category: null };
      budget.beginTurn();
      adapter = createP3NativeSocketAdapter({ channel, observation });
      const result = await runP3TurnStep({ intent: message.intent, observation,
        nativeAdapter: adapter, turnStepModel: runtime.turnStepModel,
        operationId: `live-${message.id}`, nativeSpeechOnly: true,
        targetActorRef: message.target_actor_ref });
      const playerReadback = result.working_projection.native_readback;
      const npcReply = playerReadback?.status === 'applied'
          && playerReadback.native_effect?.utterance !== undefined
        ? await runP3NativeNpcReply({ nativeAdapter: adapter, observation,
          playerReadback, semanticModel: runtime.npcConversationModel,
          targetActorRef: message.target_actor_ref,
          maxRepairAttempts: config.npcMaxRepairAttempts }) : null;
      if (npcReply?.native_readback?.status === 'applied') phrase.t_native_reply = Date.now();
      if (npcReply?.proposal?.script_respellings) phrase.script_respellings = npcReply.proposal.script_respellings;
      const readback = adapter.lastReadback;
      const applied = readback?.status === 'applied';
      const code = readback?.refusal?.code ?? (applied ? null : 'P3_LIVE_NO_NATIVE_ACTION');
      Object.assign(phrase, { code, outcome: !applied || npcReply?.native_readback?.status === 'refused'
        ? 'failure' : phrase.roles.some(({ role_id }) => role_id.endsWith('_repair')) ? 'repair' : 'ok' });
      channel.send({ type: 'result', status: applied ? 'completed' : 'refused',
        applied_operations: adapter.appliedOperations,
        goal_result: npcReply?.native_readback?.status === 'refused' ? 'partially_achieved'
          : result.working_projection.native_goal_result ?? 'not_achieved',
        code,
        stop_reason: result.stop_reason });
    } catch (error) {
      const applied = adapter?.appliedOperations > 0;
      const unknown = adapter?.pendingOperation === true;
      const code = ownsRequest && budget.turnExhausted ? 'P3_TURN_CALL_BUDGET_EXHAUSTED'
        : /^[A-Z][A-Z0-9_]{0,100}$/u.test(error?.code ?? error?.message ?? '')
          ? error.code ?? error.message : 'P3_LIVE_REQUEST_FAILED';
      const category = code === 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE'
        && ['format', 'semantic'].includes(error.details?.category) ? error.details.category : null;
      if (phrase) {
        Object.assign(phrase, { code, category });
        const respellings = error?.details?.script_respellings;
        if (Array.isArray(respellings) && respellings.length > 0) {
          phrase.script_respellings = respellings;
        }
      } else if (!ownsRequest) {
        journal({ type: 'p3_phrase', id: requestId, t_enter: enteredAt,
          t_native_reply: null, roles: [], outcome: 'failure', code, category, calls: 0 });
      }
      if (!socket.destroyed && socket.writable && error?.message !== 'P3_LIVE_CONNECTION_CLOSED') {
        channel.send({ type: 'result', status: 'refused', code, ...(category ? { category } : {}),
          applied_operations: unknown ? null : adapter?.appliedOperations ?? 0,
          goal_result: unknown ? 'unknown' : applied ? 'partially_achieved' : 'not_achieved' });
      }
    } finally {
      if (ownsRequest) {
        activeChannel = null;
        activePhrase = null;
        journal({ ...phrase, calls: budget.turnCalls });
      }
      socket.end();
    }
  }
  server.listen(socketPath);
  await once(server, 'listening');
  return Object.freeze({ server, budget,
    async close() {
      const closed = once(server, 'close');
      server.close();
      for (const socket of sockets) socket.destroy();
      await closed;
    }
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--socket' || !path.isAbsolute(args[1])
      || process.platform !== 'linux') throw new Error('P3_LIVE_USAGE_NODE_COORDINATOR_SOCKET');
  const coordinator = await startP3LiveCoordinator({ socketPath: args[1] });
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await coordinator.close();
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(() => { process.stderr.write('P3_LIVE_START_FAILED\n'); process.exitCode = 1; });
}
