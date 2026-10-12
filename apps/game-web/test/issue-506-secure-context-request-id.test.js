import assert from 'node:assert/strict';
import test from 'node:test';
import { newGameRequest } from '../src/app/pending-new-game.js';
import { createTurnRequest } from '../src/app/turn-submission.js';

function withGetRandomValuesOnly(run) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  let sequence = 0;
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      getRandomValues(bytes) {
        for (let index = 0; index < bytes.length; index += 1) {
          bytes[index] = (sequence + index) & 0xff;
        }
        sequence += 17;
        return bytes;
      }
    }
  });
  try { return run(); }
  finally {
    if (previous) Object.defineProperty(globalThis, 'crypto', previous);
    else delete globalThis.crypto;
  }
}

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

test('new-game request generates and reuses UUID v4 without randomUUID', () => {
  withGetRandomValuesOnly(() => {
    const values = new Map();
    const storage = {
      getItem(key) { return values.get(key) ?? null; },
      setItem(key, value) { values.set(key, value); },
      removeItem(key) { values.delete(key); }
    };
    let request;
    assert.doesNotThrow(() => {
      request = newGameRequest(storage, { scenario_id: 'test-start' });
    });
    assert.match(request.request_id, /^web:new-game:/u);
    assert.match(request.request_id.slice('web:new-game:'.length), uuidV4);
    assert.equal(newGameRequest(storage, { scenario_id: 'test-start' }).request_id,
      request.request_id);
  });
});

test('turn request generates UUID v4 used as its idempotency key without randomUUID', () => {
  withGetRandomValuesOnly(() => {
    let request;
    assert.doesNotThrow(() => {
      request = createTurnRequest({ action: 'look' });
    });
    assert.match(request.request_id, /^web:turn:/u);
    assert.match(request.request_id.slice('web:turn:'.length), uuidV4);
    assert.equal(request.idempotency_key, request.request_id);
  });
});

function withRandomUUIDOnly(run) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  let calls = 0;
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      randomUUID() {
        calls += 1;
        return calls === 1
          ? '123e4567-e89b-42d3-a456-426614174000'
          : '123e4567-e89b-42d3-a456-426614174001';
      },
      getRandomValues() { throw new Error('getRandomValues must not be used'); }
    }
  });
  try { return run(() => calls); }
  finally {
    if (previous) Object.defineProperty(globalThis, 'crypto', previous);
    else delete globalThis.crypto;
  }
}

test('new-game and turn requests prefer randomUUID when it is available', () => {
  withRandomUUIDOnly((randomUUIDCalls) => {
    const values = new Map();
    const storage = {
      getItem(key) { return values.get(key) ?? null; },
      setItem(key, value) { values.set(key, value); },
      removeItem(key) { values.delete(key); }
    };
    const newGame = newGameRequest(storage, { scenario_id: 'test-start' });
    assert.equal(newGame.request_id,
      'web:new-game:123e4567-e89b-42d3-a456-426614174000');
    assert.equal(newGameRequest(storage, { scenario_id: 'test-start' }).request_id,
      newGame.request_id);

    const turn = createTurnRequest({ action: 'look' });
    assert.equal(turn.request_id,
      'web:turn:123e4567-e89b-42d3-a456-426614174001');
    assert.equal(turn.idempotency_key, turn.request_id);
    assert.equal(randomUUIDCalls(), 2);
  });
});
