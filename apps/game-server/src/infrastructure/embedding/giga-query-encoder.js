import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = fileURLToPath(new URL('./giga-query-worker.py', import.meta.url));

export function createGigaQueryEncoder({ profilePath,
  python = 'python' } = {}) {
  if (typeof profilePath !== 'string' || !profilePath
      || typeof python !== 'string' || !python.trim()) {
    throw new TypeError('Giga query encoder configuration is invalid');
  }
  let child = null;
  let ready = null;
  let nextId = 1;
  const pending = new Map();

  async function encode(text) {
    const normalized = String(text ?? '').trim();
    if (!normalized || normalized.length > 8000) {
      throw new TypeError('Giga query text is invalid');
    }
    await start();
    const id = nextId++;
    return new Promise((accept, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error('Giga query encoding timed out'));
      }, 120_000);
      pending.set(id, { accept, reject, timeout });
      child.stdin.write(`${JSON.stringify({ id, text: normalized })}\n`);
    });
  }

  function start() {
    if (ready != null) return ready;
    ready = new Promise((accept, reject) => {
      child = spawn(python, ['-u', WORKER, '--profile', resolve(profilePath)], {
        windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONUTF8: '1', HF_HUB_OFFLINE: '1',
          TRANSFORMERS_OFFLINE: '1' }
      });
      child.stderr.resume();
      let settled = false;
      const startupTimeout = setTimeout(() => {
        if (!settled) reject(new Error('Giga query encoder startup timed out'));
      }, 120_000);
      createInterface({ input: child.stdout }).on('line', (line) => {
        let message;
        try { message = JSON.parse(line); } catch { return; }
        if (message.ready === true && !settled) {
          settled = true;
          clearTimeout(startupTimeout);
          accept();
          return;
        }
        const request = pending.get(message.id);
        if (request == null) return;
        pending.delete(message.id);
        clearTimeout(request.timeout);
        if (!Array.isArray(message.vector) || message.vector.length !== 1024
            || message.vector.some((value) => !Number.isFinite(value))) {
          request.reject(new Error('Giga query encoding failed'));
        } else request.accept(new Float32Array(message.vector));
      });
      child.once('error', fail);
      child.once('exit', () => fail(new Error('Giga query encoder exited')));
      function fail(error) {
        clearTimeout(startupTimeout);
        if (!settled) reject(error);
        for (const request of pending.values()) {
          clearTimeout(request.timeout);
          request.reject(error);
        }
        pending.clear();
        child = null;
        ready = null;
      }
    });
    return ready;
  }

  return Object.freeze({ encode,
    async close() {
      if (child == null) return;
      const current = child;
      current.stdin.end(`${JSON.stringify({ op: 'close' })}\n`);
      await new Promise((accept) => current.once('exit', accept));
    }
  });
}
