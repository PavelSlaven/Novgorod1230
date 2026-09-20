import assert from 'node:assert/strict';
import test from 'node:test';
import { clearNewGameRequest, newGameRequest, storedNewGameRequest } from
  '../src/app/pending-new-game.js';

test('new-game request identity survives timeout and reload until success', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key) };
  const first = newGameRequest(storage, {
    scenario_id: 'vikhtuy_fishing_camp_v1'
  }, () => 'fixed');
  const retry = newGameRequest(storage, {
    scenario_id: 'vikhtuy_fishing_camp_v1'
  }, () => 'different');
  assert.equal(first.request_id, 'web:new-game:fixed');
  assert.equal(retry.request_id, first.request_id);
  assert.equal(storedNewGameRequest(storage).request_id, first.request_id);
  clearNewGameRequest(storage, 'wrong');
  assert.notEqual(storedNewGameRequest(storage), null);
  clearNewGameRequest(storage, first.request_id);
  assert.equal(storedNewGameRequest(storage), null);
});
