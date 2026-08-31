import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export function createPartyLog({ directory,
  now = () => new Date().toISOString() } = {}) {
  if (!String(directory ?? '').trim()) {
    throw new TypeError('party log directory is required.');
  }
  const pending = new Map();
  return Object.freeze({
    pathFor(partyId) {
      return join(directory, `${fileName(partyId)}.jsonl`);
    },
    append(partyId, event) {
      const id = requiredText(partyId, 'party_id');
      if (!event || typeof event !== 'object' || Array.isArray(event)) {
        throw new TypeError('party log event must be an object.');
      }
      const path = join(directory, `${fileName(id)}.jsonl`);
      const line = `${stringify({ ...event, version: 1,
        schema: 'rus.party_game_log_event.v1', recorded_at: now(),
        party_id: id })}\n`;
      const write = (pending.get(path) ?? Promise.resolve())
        .catch(() => undefined)
        .then(async () => {
          await mkdir(directory, { recursive: true });
          await appendFile(path, line, 'utf8');
        });
      pending.set(path, write);
      return write.finally(() => {
        if (pending.get(path) === write) pending.delete(path);
      });
    }
  });
}

export function createPartyLoggingRoot({ root, partyLog, llmDiagnostics = null,
  metadata = null, clock = () => Date.now(), onLogError = console.error } = {}) {
  for (const method of ['startNewGame', 'acknowledgeOpening', 'submitTurn',
    'getPartyScreen']) {
    if (typeof root?.[method] !== 'function') {
      throw new TypeError(`root.${method} is required.`);
    }
  }
  if (typeof partyLog?.append !== 'function') {
    throw new TypeError('partyLog.append is required.');
  }
  const record = async (partyId, event) => {
    try {
      await partyLog.append(partyId, event);
    } catch (error) {
      onLogError?.(`Party log write failed for ${partyId}.`, error);
    }
  };
  const llmReport = (partyId) => llmDiagnostics?.logReport?.({
    party_id: partyId
  }) ?? llmDiagnostics?.report?.({ party_id: partyId }) ?? null;

  return Object.freeze({
    ...root,
    async startNewGame(input) {
      const startedAt = clock();
      const output = await root.startNewGame(input);
      await record(output.party_id, {
        event: 'party.created', duration_ms: duration(startedAt, clock()),
        input, output, metadata
      });
      return output;
    },
    async acknowledgeOpening(partyId, input) {
      const startedAt = clock();
      try {
        const output = await root.acknowledgeOpening(partyId, input);
        await record(partyId, {
          event: 'opening.acknowledged',
          duration_ms: duration(startedAt, clock()), input, output
        });
        return output;
      } catch (error) {
        await record(partyId, {
          event: 'opening.failed', duration_ms: duration(startedAt, clock()),
          input, error: errorRecord(error)
        });
        throw error;
      }
    },
    async submitTurn(partyId, input) {
      const startedAt = clock();
      await record(partyId, { event: 'turn.requested', input });
      try {
        const output = await root.submitTurn(partyId, input);
        await record(partyId, {
          event: 'turn.completed', duration_ms: duration(startedAt, clock()),
          input, output, llm: llmReport(partyId)
        });
        return output;
      } catch (error) {
        await record(partyId, {
          event: 'turn.failed', duration_ms: duration(startedAt, clock()),
          input, error: errorRecord(error), llm: llmReport(partyId)
        });
        throw error;
      }
    },
    async getPartyScreen(partyId) {
      const startedAt = clock();
      try {
        const output = await root.getPartyScreen(partyId);
        await record(partyId, {
          event: 'screen.read', duration_ms: duration(startedAt, clock()), output
        });
        return output;
      } catch (error) {
        await record(partyId, {
          event: 'screen.read_failed',
          duration_ms: duration(startedAt, clock()), error: errorRecord(error)
        });
        throw error;
      }
    }
  });
}

function errorRecord(error) {
  return {
    name: String(error?.name ?? 'Error'),
    message: String(error?.message ?? error),
    code: error?.code ?? null,
    status: error?.status ?? null,
    retryable: error?.retryable === true,
    details: error?.details ?? null,
    stack: error?.stack ?? null,
    cause: error?.cause ?? null
  };
}
function stringify(value) {
  const seen = new WeakSet();
  return JSON.stringify(value, (_key, entry) => {
    if (typeof entry === 'bigint') return entry.toString();
    if (entry instanceof Error) return errorRecord(entry);
    if (entry && typeof entry === 'object') {
      if (seen.has(entry)) return '[Circular]';
      seen.add(entry);
    }
    return entry;
  });
}
function fileName(partyId) {
  const value = requiredText(partyId, 'party_id')
    .replace(/[^A-Za-z0-9._-]+/gu, '_');
  if (!value) throw new TypeError('party_id cannot form a log filename.');
  return value;
}
function requiredText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${label} is required.`);
  return normalized;
}
function duration(startedAt, completedAt) {
  return Math.max(0, Number(completedAt) - Number(startedAt));
}
