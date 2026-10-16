import assert from 'node:assert/strict';
import test from 'node:test';
import { isInitialPartyState } from '../src/infrastructure/postgres/party-state-lifecycle.js';

test('party reader selects initial only at v0 before a server session exists', () => {
  for (const state_version of [0, '0']) {
    assert.equal(isInitialPartyState({ state_version, session_party_id: null }), true);
  }
});

test('party reader selects current at v0 after a server session exists', () => {
  for (const state_version of [0, '0']) {
    assert.equal(isInitialPartyState({ state_version, session_party_id: 'party-a' }), false);
  }
});

test('party reader selects current at v1 and later with or without a server session', () => {
  for (const state_version of [1, '1', 2, '2']) {
    for (const session_party_id of [null, 'party-a']) {
      assert.equal(isInitialPartyState({ state_version, session_party_id }), false);
    }
  }
});
