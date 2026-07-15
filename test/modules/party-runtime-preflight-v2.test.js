import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PARTY_RUNTIME_SCHEMA,
  REQUIRED_PARTY_PRIMARY_KEYS,
  REQUIRED_PARTY_TABLES,
  checkPartyDbSeed
} from '../../src/world/new-game-prerequisites.js';

test('party preflight targets the normalized party_runtime_v2 schema', () => {
  assert.equal(PARTY_RUNTIME_SCHEMA, 'party_runtime');
  assert.ok(REQUIRED_PARTY_TABLES.includes('parties'));
  assert.ok(REQUIRED_PARTY_TABLES.includes('party_materialization_runs'));
  assert.ok(REQUIRED_PARTY_TABLES.includes('party_g5_nodes'));
  assert.ok(REQUIRED_PARTY_TABLES.includes('party_decision_results'));
  assert.ok(REQUIRED_PARTY_TABLES.includes('party_perception_results'));
  assert.equal(REQUIRED_PARTY_TABLES.includes('party_state'), false);
});

test('party preflight rejects same table names with the wrong shape', async () => {
  let queryIndex = 0;
  const client = {
    connect: async () => {},
    end: async () => {},
    query: async () => {
      queryIndex += 1;
      if (queryIndex === 1) {
        return { rows: REQUIRED_PARTY_TABLES.map((table_name) => ({ table_name })) };
      }
      return { rows: [] };
    }
  };

  const result = await checkPartyDbSeed('postgresql://unused', {
    clientFactory: () => client
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.primaryKeyMismatches.sort(), Object.keys(REQUIRED_PARTY_PRIMARY_KEYS).sort());
  assert.equal(result.versionConstraintOk, false);
  assert.match(result.errors.join('\n'), /primary keys|schema_version = 2/);
});

test('party preflight rejects a broad schema version check', async () => {
  let queryIndex = 0;
  const primaryKeyRows = Object.entries(REQUIRED_PARTY_PRIMARY_KEYS).flatMap(([table_name, columns]) =>
    columns.map((column_name, index) => ({ table_name, column_name, ordinal_position: index + 1 }))
  );
  const client = {
    connect: async () => {},
    end: async () => {},
    query: async () => {
      queryIndex += 1;
      if (queryIndex === 1) return { rows: REQUIRED_PARTY_TABLES.map((table_name) => ({ table_name })) };
      if (queryIndex === 2) return { rows: primaryKeyRows };
      return { rows: [{ definition: 'CHECK ((schema_version = 2) OR (schema_version = 3))' }] };
    }
  };

  const result = await checkPartyDbSeed('postgresql://unused', { clientFactory: () => client });

  assert.equal(result.ok, false);
  assert.deepEqual(result.primaryKeyMismatches, []);
  assert.equal(result.versionConstraintOk, false);
});

test('party preflight queries party_runtime and rejects legacy-only tables', async () => {
  const calls = [];
  const client = {
    connect: async () => {},
    end: async () => {},
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [{ table_name: 'party_state' }] };
    }
  };

  const result = await checkPartyDbSeed('postgresql://unused', {
    clientFactory: () => client
  });

  assert.equal(calls[0].params[0], PARTY_RUNTIME_SCHEMA);
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes('parties'));
  assert.ok(!result.missing.includes('party_state'));
});
