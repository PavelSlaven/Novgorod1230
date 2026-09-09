import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorldKnowledgeError } from '@rus/world-knowledge';

const WORKER = fileURLToPath(new URL('./giga-query-worker.py', import.meta.url));

export function createGigaQueryEncoder({ profilePath,
  python = 'python', timeoutMs = 120_000, spawnProcess = spawn,
  workerPath = WORKER } = {}) {
  if (typeof profilePath !== 'string' || !profilePath
      || typeof python !== 'string' || !python.trim()
      || !Number.isInteger(timeoutMs) || timeoutMs < 1
      || typeof spawnProcess !== 'function') {
    throw new TypeError('Giga query encoder configuration is invalid');
  }
  let child = null;
  let startup = null;
  let nextId = 1;
  const pending = new Map();

  async function encode(text) {
    const normalized = String(text ?? '').trim();
    if (!normalized || normalized.length > 8000) {
      throw new TypeError('Giga query text is invalid');
    }
    await start();
    const active = child;
    if (active == null) throw unavailable('WK_EMBEDDING_WORKER_EXIT');
    const id = nextId++;
    return new Promise((accept, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(unavailable('WK_EMBEDDING_TIMEOUT'));
      }, timeoutMs);
      pending.set(id, { accept, reject, timeout, child: active });
      try {
        active.stdin.write(`${JSON.stringify({ id, text: normalized })}\n`);
      } catch {
        clearTimeout(timeout);
        pending.delete(id);
        reject(unavailable('WK_EMBEDDING_WORKER_WRITE_FAILED'));
      }
    });
  }

  function start() {
    if (startup != null) return startup;
    startup = new Promise((accept, reject) => {
      const spawned = spawnProcess(python,
        ['-u', workerPath, '--profile', resolve(profilePath)], {
        windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONUTF8: '1', HF_HUB_OFFLINE: '1',
          TRANSFORMERS_OFFLINE: '1' }
      });
      child = spawned;
      spawned.stderr.resume();
      let settled = false;
      const startupTimeout = setTimeout(() => {
        if (!settled) {
          fail(unavailable('WK_EMBEDDING_STARTUP_TIMEOUT'));
          spawned.kill?.();
        }
      }, timeoutMs);
      createInterface({ input: spawned.stdout }).on('line', (line) => {
        let message;
        try { message = JSON.parse(line); } catch { return; }
        if (message.ready === true && !settled) {
          settled = true;
          clearTimeout(startupTimeout);
          accept();
          return;
        }
        const request = pending.get(message.id);
        if (request == null || request.child !== spawned) return;
        pending.delete(message.id);
        clearTimeout(request.timeout);
        if (message.error != null) {
          request.reject(unavailable('WK_EMBEDDING_ENCODE_FAILED'));
        } else if (!Array.isArray(message.vector)
            || message.vector.length !== 1024
            || message.vector.some((value) => !Number.isFinite(value))) {
          request.reject(unavailable('WK_EMBEDDING_VECTOR_INVALID'));
        } else request.accept(new Float32Array(message.vector));
      });
      spawned.once('error', () => fail(unavailable(
        'WK_EMBEDDING_WORKER_ERROR')));
      spawned.once('exit', () => fail(unavailable(
        'WK_EMBEDDING_WORKER_EXIT')));
      function fail(error) {
        clearTimeout(startupTimeout);
        if (!settled) {
          settled = true;
          reject(error);
        }
        for (const [id, request] of pending) {
          if (request.child !== spawned) continue;
          clearTimeout(request.timeout);
          request.reject(error);
          pending.delete(id);
        }
        if (child === spawned) {
          child = null;
          startup = null;
        }
      }
    });
    return startup;
  }

  return Object.freeze({ encode, ready: start,
    async close() {
      if (child == null) return;
      const current = child;
      current.stdin.end(`${JSON.stringify({ op: 'close' })}\n`);
      await new Promise((accept) => current.once('exit', accept));
    }
  });
}

function unavailable(causeCode) {
  return new WorldKnowledgeError('WORLD_KNOWLEDGE_UNAVAILABLE',
    'Giga World Knowledge query encoding is unavailable.', {
      cause_code: causeCode
    });
}
