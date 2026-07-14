import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { createAutonomousUpdateRegistry, runAutonomousUpdates } from '@rus/turn';

const schemaDirectory = new URL('../../schemas/materialization/', import.meta.url);

test('every materialization JSON Schema is complete JSON with a unique identifier', async () => {
  const names = (await readdir(schemaDirectory)).filter((name) => name.endsWith('.schema.json')).sort();
  const ids = new Set();
  assert.ok(names.length > 0);
  for (const name of names) {
    const schema = JSON.parse(await readFile(new URL(name, schemaDirectory), 'utf8'));
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema', name);
    assert.equal(typeof schema.$id, 'string', name);
    assert.ok(schema.$id.length > 0, name);
    assert.equal(ids.has(schema.$id), false, `duplicate schema id ${schema.$id}`);
    ids.add(schema.$id);
  }
});

test('code-generated autonomous envelopes satisfy their closed JSON Schema shapes', async () => {
  const schemas = new Map();
  for (const name of (await readdir(schemaDirectory)).filter((value) => value.endsWith('.schema.json'))) schemas.set(name, JSON.parse(await readFile(new URL(name, schemaDirectory), 'utf8')));
  const registry = createAutonomousUpdateRegistry([{ rule_id: 'schema-rule', rule_version: '1', policy_id: 'schema-policy', policy_version: '1', applies: () => true, buildChangeSet: ({ party_id: partyId, state_version: stateVersion }) => ({
    version: 2, schema: 'party_change_set_v2', change_set_id: 'schema-change', party_id: partyId, rule_id: 'schema-rule', base_state_version: stateVersion, result_state_version: stateVersion + 1,
    operations: [{ target: 'party_events', value: { event: 'tick' } }], created_or_changed_refs: [{ target: 'party_events' }], validation_report: { pass: true }, trace: { handler: 'must-not-leak' }
  }) }]);
  let update;
  await runAutonomousUpdates({ registry, partyId: 'schema-party', baseState: { state_version: 0 }, stateVersion: 0, trigger: { kind: 'clock_tick', at: '2030-01-01T00:00:00Z' }, catalogPins: { world_revision_id: 'revision', catalog_digest: 'a'.repeat(64), command_catalog_digest: 'b'.repeat(64), profile_bundle_digest: 'c'.repeat(64) }, commit: async (value) => { update = value; return {}; } });
  assertSchemaValue(update, schemas.get('party-autonomous-update-v2.schema.json'), schemas, 'update');
});

function assertSchemaValue(value, schema, schemas, path) {
  if (schema.$ref) return assertSchemaValue(value, schemas.get(schema.$ref), schemas, path);
  if (schema.const !== undefined) assert.deepEqual(value, schema.const, path);
  if (schema.enum) assert.ok(schema.enum.includes(value), path);
  if (schema.type === 'object') {
    assert.ok(value && typeof value === 'object' && !Array.isArray(value), path);
    for (const key of schema.required ?? []) assert.ok(Object.hasOwn(value, key), `${path}.${key} is required`);
    if (schema.additionalProperties === false) for (const key of Object.keys(value)) assert.ok(Object.hasOwn(schema.properties ?? {}, key), `${path}.${key} is forbidden`);
    for (const [key, child] of Object.entries(schema.properties ?? {})) if (Object.hasOwn(value, key)) assertSchemaValue(value[key], child, schemas, `${path}.${key}`);
  } else if (schema.type === 'array') {
    assert.ok(Array.isArray(value), path);
    if (schema.minItems != null) assert.ok(value.length >= schema.minItems, path);
    for (const [index, item] of value.entries()) assertSchemaValue(item, schema.items ?? {}, schemas, `${path}[${index}]`);
  } else if (schema.type === 'string') {
    assert.equal(typeof value, 'string', path);
    if (schema.minLength != null) assert.ok(value.length >= schema.minLength, path);
    if (schema.pattern) assert.match(value, new RegExp(schema.pattern, 'u'), path);
    if (schema.format === 'date-time') assert.ok(Number.isFinite(Date.parse(value)), path);
  } else if (schema.type === 'integer') {
    assert.ok(Number.isInteger(value), path);
    if (schema.minimum != null) assert.ok(value >= schema.minimum, path);
  } else if (schema.type === 'boolean') assert.equal(typeof value, 'boolean', path);
}
