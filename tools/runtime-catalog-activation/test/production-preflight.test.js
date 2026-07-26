import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateFirstPlayableProductionPreflight
} from '../src/production-preflight.js';

test('production preflight accepts exact fresh production database identities', () => {
  const world = {
    database: 'lower_dvina_world_production_v2',
    principal: 'world_operator',
    user_table_count: 0
  };
  const party = {
    database: 'lower_dvina_party_production_v3',
    principal: 'party_operator',
    user_table_count: 0
  };

  assert.deepEqual(evaluateFirstPlayableProductionPreflight({
    world,
    party,
    expectedWorldDatabase: world.database,
    expectedPartyDatabase: party.database
  }), {
    ready: true,
    fresh: true,
    identity_matches: true,
    world,
    party
  });
});

test('production preflight fails closed for a non-empty or mismatched database', () => {
  const base = {
    principal: 'operator',
    user_table_count: 0
  };

  assert.equal(evaluateFirstPlayableProductionPreflight({
    world: {
      ...base,
      database: 'lower_dvina_world_production_v2',
      user_table_count: 1
    },
    party: {
      ...base,
      database: 'lower_dvina_party_production_v3'
    },
    expectedWorldDatabase: 'lower_dvina_world_production_v2',
    expectedPartyDatabase: 'lower_dvina_party_production_v3'
  }).ready, false);

  assert.equal(evaluateFirstPlayableProductionPreflight({
    world: {
      ...base,
      database: 'unexpected_world'
    },
    party: {
      ...base,
      database: 'lower_dvina_party_production_v3'
    },
    expectedWorldDatabase: 'lower_dvina_world_production_v2',
    expectedPartyDatabase: 'lower_dvina_party_production_v3'
  }).ready, false);
});
