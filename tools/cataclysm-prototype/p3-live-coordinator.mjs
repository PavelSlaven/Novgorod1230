import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createP3AttemptBudget, createP3RoleRuntime, loadP3QwenSettingsOwner,
  resolveP3EffectiveConfig, runP3TurnStep } from './p3-boundary.js';
import { runP3NativeNpcReply } from './p3-boundary.js';
import { createP3LiveChannel, createP3NativeSocketAdapter,
  requireLiveObservation } from './p3-live-socket.js';

export async function loadP3DevConfig() {
  const config = JSON.parse(await readFile(new URL('./p3-dev-config.json', import.meta.url), 'utf8'));
  if (!Number.isSafeInteger(config.modelCallBudget) || config.modelCallBudget < 1
      || config.modelCallBudget > 30 || config.npcMaxRepairAttempts !== 1) {
    throw new Error('P3_LIVE_CONFIG_INVALID');
  }
  return Object.freeze(config);
}

export async function startP3LiveCoordinator({ socketPath, env = process.env,
  settingsOwner = null, runtimeFactory = createP3RoleRuntime, execute,
  config = null } = {}) {
  if (typeof socketPath !== 'string' || !socketPath) throw new Error('P3_LIVE_SOCKET_REQUIRED');
  config ??= await loadP3DevConfig();
  settingsOwner ??= await loadP3QwenSettingsOwner({ env });
  let activeChannel = null;
  const sockets = new Set();
  const budget = createP3AttemptBudget({ budget: config.modelCallBudget,
    onAttempt: async event => {
      if (event.phase !== 'before') return;
      const effective = resolveP3EffectiveConfig({ roleId: event.input.role_id, env, settingsOwner });
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
    try {
      const message = await channel.receive();
      channel.bind(message.id);
      if (message.type !== 'intent' || typeof message.intent !== 'string'
          || !message.intent.trim()) throw new Error('P3_LIVE_INTENT_REQUIRED');
      if (activeChannel) throw new Error('P3_LIVE_BUSY');
      const observation = requireLiveObservation(message.observation);
      activeChannel = channel;
      ownsRequest = true;
      adapter = createP3NativeSocketAdapter({ channel, observation });
      const result = await runP3TurnStep({ intent: message.intent, observation,
        nativeAdapter: adapter, turnStepModel: runtime.turnStepModel,
        operationId: `live-${message.id}`, nativeSpeechOnly: true });
      const playerReadback = result.working_projection.native_readback;
      const npcReply = playerReadback?.status === 'applied'
          && playerReadback.native_effect?.utterance !== undefined
        ? await runP3NativeNpcReply({ nativeAdapter: adapter, observation,
          playerReadback, semanticModel: runtime.npcConversationModel,
          maxRepairAttempts: config.npcMaxRepairAttempts }) : null;
      const readback = adapter.lastReadback;
      const applied = readback?.status === 'applied';
      channel.send({ type: 'result', status: applied ? 'completed' : 'refused',
        applied_operations: adapter.appliedOperations,
        goal_result: npcReply?.native_readback?.status === 'refused' ? 'partially_achieved'
          : result.working_projection.native_goal_result ?? 'not_achieved',
        code: readback?.refusal?.code ?? (applied ? null : 'P3_LIVE_NO_NATIVE_ACTION'),
        message: applied ? 'Родное действие принято. Черновик, не сохранено.'
          : 'Действие не выполнено.',
        stop_reason: result.stop_reason });
    } catch (error) {
      if (!socket.destroyed && socket.writable && error?.message !== 'P3_LIVE_CONNECTION_CLOSED') {
        const applied = adapter?.appliedOperations > 0;
        const unknown = adapter?.pendingOperation === true;
        const code = /^[A-Z][A-Z0-9_]{0,100}$/u.test(error?.code ?? error?.message ?? '')
          ? error.code ?? error.message : 'P3_LIVE_REQUEST_FAILED';
        channel.send({ type: 'result', status: 'refused', code,
          applied_operations: unknown ? null : adapter?.appliedOperations ?? 0,
          goal_result: unknown ? 'unknown' : applied ? 'partially_achieved' : 'not_achieved',
          message: unknown ? 'Результат родного действия не подтверждён. Черновик, не сохранено.'
            : applied ? 'Действие уже начато; дальнейшая обработка не завершена. Черновик, не сохранено.'
            : 'Действие не выполнено: семантический координатор недоступен или отказал.' });
      }
    } finally {
      if (ownsRequest) activeChannel = null;
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
