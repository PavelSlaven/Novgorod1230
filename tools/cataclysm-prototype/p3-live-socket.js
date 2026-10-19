import { createInterface } from 'node:readline';
import { validateP3Readback } from './p3-boundary.js';

export function requireLiveObservation(observation) {
  rejectSnapshot(observation);
  if (observation?.schema !== 'p3_native_observation_v1'
      || !Number.isSafeInteger(observation.turn)
      || observation.turn !== Number(observation.revision)
      || !Array.isArray(observation.actors) || !Array.isArray(observation.items)
      || !Array.isArray(observation.targets)
      || !observation.actors.some(actor => actor.actor_ref === 'avatar'
        && typeof actor.actor_id === 'string'
        && Array.isArray(actor.position) && actor.position.length === 3)) {
    throw new Error('P3_LIVE_OBSERVATION_INVALID');
  }
  return structuredClone(observation);
}

function rejectSnapshot(value) {
  if (!value || typeof value !== 'object') return;
  if (Object.hasOwn(value, 'native_snapshot')) throw new Error('P3_LIVE_SNAPSHOT_FORBIDDEN');
  for (const item of Object.values(value)) rejectSnapshot(item);
}

export function createP3LiveChannel(socket) {
  let identity = null;
  const lines = createInterface({ input: socket, crlfDelay: Infinity });
  const iterator = lines[Symbol.asyncIterator]();
  socket.on('error', () => lines.close());
  return Object.freeze({
    bind(id) {
      if (identity !== null || typeof id !== 'string' || !/^\d+$/u.test(id)) {
        throw new Error('P3_LIVE_INTENT_ID_INVALID');
      }
      identity = id;
    },
    async receive() {
      const { value, done } = await iterator.next();
      if (done) throw new Error('P3_LIVE_CONNECTION_CLOSED');
      let message;
      try { message = JSON.parse(value); }
      catch { throw new Error('P3_LIVE_MESSAGE_INVALID'); }
      if (!message || typeof message !== 'object' || Array.isArray(message)) {
        throw new Error('P3_LIVE_MESSAGE_INVALID');
      }
      if (identity !== null && message.id !== identity) {
        throw new Error('P3_LIVE_INTENT_IDENTITY_MISMATCH');
      }
      return message;
    },
    send(message) {
      if (socket.destroyed || !socket.writable) throw new Error('P3_LIVE_CONNECTION_CLOSED');
      socket.write(`${JSON.stringify({ ...message, ...(identity === null ? {} : { id: identity }) })}\n`);
    }
  });
}

export function createP3NativeSocketAdapter({ channel, observation } = {}) {
  let current = requireLiveObservation(observation);
  let pending = null;
  let operations = 0;
  let appliedOperations = 0;
  let lastReadback = null;
  let playerSpeech = null;
  let npcSpeech = false;
  return Object.freeze({
    get operations() { return operations; },
    get appliedOperations() { return appliedOperations; },
    get operationSent() { return pending !== null || operations > 0; },
    get pendingOperation() { return pending !== null; },
    get lastReadback() { return lastReadback; },
    async writeOperationRequest(request) {
      if (pending || operations > 1 || (operations === 1
          && (npcSpeech || !playerSpeech || request.primitive !== 'speak'
            || request.actor_id === playerSpeech.actor_id
            || request.operation_id === playerSpeech.operation_id))) {
        throw new Error('P3_LIVE_ONE_OPERATION_BOUNDARY');
      }
      if (operations === 0 && request.primitive === 'speak'
          && request.actor_id === current.actors.find(actor => actor.actor_ref === 'avatar')?.actor_id) {
        playerSpeech = request;
      }
      if (operations === 1) npcSpeech = true;
      pending = request;
      channel.send({ type: 'operation', request });
    },
    async readOperationReadback(request) {
      if (!pending || pending.operation_id !== request.operation_id) {
        throw new Error('P3_LIVE_OPERATION_IDENTITY_MISMATCH');
      }
      const message = await channel.receive();
      if (message.type !== 'readback') throw new Error('P3_LIVE_READBACK_REQUIRED');
      rejectSnapshot(message);
      const readback = validateP3Readback(request, message.readback);
      if (message.observation) current = requireLiveObservation(message.observation);
      pending = null;
      operations++;
      if (readback.status === 'applied') appliedOperations++;
      lastReadback = readback;
      return readback;
    },
    async execute(request) {
      await this.writeOperationRequest(request);
      return this.readOperationReadback(request);
    },
    async refreshObservation() {
      if (pending) throw new Error('P3_LIVE_OPERATION_PENDING');
      channel.send({ type: 'observe' });
      const message = await channel.receive();
      if (message.type !== 'observation') throw new Error('P3_LIVE_OBSERVATION_REQUIRED');
      current = requireLiveObservation(message.observation);
      return current;
    }
  });
}
