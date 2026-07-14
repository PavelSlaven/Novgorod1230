import assert from 'node:assert/strict';
import test from 'node:test';
import { createAutonomousUpdateRegistry, runAutonomousUpdates } from '../src/autonomous-update.js';

function rule(ruleId, target) {
  return {
    rule_id: ruleId,
    rule_version: '1',
    policy_id: 'autonomous-test-policy',
    policy_version: '1',
    applies: () => true,
    buildChangeSet: ({ party_id: partyId, state_version: stateVersion }) => ({
      version: 2,
      schema: 'party_change_set_v2',
      change_set_id: `change-${ruleId}-${stateVersion}`,
      party_id: partyId,
      rule_id: ruleId,
      base_state_version: stateVersion,
      result_state_version: stateVersion + 1,
      operations: [{ target, value: { rule_id: ruleId, state_version: stateVersion + 1 } }],
      created_or_changed_refs: [{ target }],
      validation_report: { pass: true },
      trace: { rule_id: ruleId }
    })
  };
}
const catalogPins = { world_revision_id: 'revision-1', catalog_digest: 'a'.repeat(64), command_catalog_digest: 'b'.repeat(64), profile_bundle_digest: 'c'.repeat(64) };

test('autonomous rules produce sequential version-bound code change sets and deterministic persistence envelopes', async () => {
  const registry = createAutonomousUpdateRegistry([rule('b-rule', 'party_events'), rule('a-rule', 'party_hidden_state')]);
  const committed = [];
  const results = await runAutonomousUpdates({
    registry,
    partyId: 'party-1',
    baseState: { state_version: 4 },
    stateVersion: 4,
    trigger: { kind: 'clock_tick', at: '2030-01-02T03:04:05.000Z' },
    catalogPins,
    commit: async (update) => { committed.push(update); return { update_id: update.update_id }; }
  });
  assert.equal(results.length, 2);
  assert.deepEqual(committed.map((value) => [value.rule_id, value.base_state_version, value.result_state_version]), [['a-rule', 4, 5], ['b-rule', 5, 6]]);
  assert.ok(committed.every((value) => value.scheduled_for === '2030-01-02T03:04:05.000Z' && value.validation_report.pass));
  assert.notEqual(committed[0].idempotency_key, committed[1].idempotency_key);
  assert.ok(committed.every((value) => value.input_digest.length === 64 && value.catalog_digest === catalogPins.catalog_digest && value.version_pins.rule_version === '1'));
  assert.deepEqual(Object.keys(committed[0].change_set.trace).sort(), ['catalog_digest','created_or_changed_refs','input_basis','input_digest','rule_id','trigger','version_pins']);
  assert.equal(Object.hasOwn(committed[0].change_set.trace, 'handler'), false);
  const replay = [];
  await runAutonomousUpdates({ registry, partyId: 'party-1', baseState: { state_version: 4 }, stateVersion: 4, trigger: { kind: 'clock_tick', at: '2030-01-02T03:04:05.000Z' }, catalogPins, commit: async (update) => { replay.push(update); return {}; } });
  assert.deepEqual(replay.map((value) => value.idempotency_key), committed.map((value) => value.idempotency_key));
});

test('autonomous workflow rejects invalid time and physical write instructions', async () => {
  const invalidOperation = createAutonomousUpdateRegistry([{ ...rule('invalid', 'party_events'), buildChangeSet: ({ party_id: partyId, state_version: stateVersion }) => ({
    version: 2, schema: 'party_change_set_v2', change_set_id: 'invalid', party_id: partyId, rule_id: 'invalid', base_state_version: stateVersion, result_state_version: stateVersion + 1,
    operations: [{ target: 'party_events', value: {}, target_table: 'party_items' }], created_or_changed_refs: [], validation_report: { pass: true }, trace: { rule_id: 'invalid' }
  }) }]);
  await assert.rejects(() => runAutonomousUpdates({ registry: invalidOperation, partyId: 'party-1', baseState: { state_version: 0 }, stateVersion: 0, trigger: { at: '2030-01-01T00:00:00Z' }, catalogPins, commit: async () => ({}) }), (error) => error.code === 'AUTONOMOUS_CHANGE_SET_INVALID');
  await assert.rejects(() => runAutonomousUpdates({ registry: createAutonomousUpdateRegistry([]), partyId: 'party-1', baseState: { state_version: 0 }, stateVersion: 0, trigger: { at: 'invalid' }, catalogPins, commit: async () => ({}) }), (error) => error.code === 'AUTONOMOUS_TRIGGER_TIME_INVALID');
  await assert.rejects(() => runAutonomousUpdates({ registry: createAutonomousUpdateRegistry([]), partyId: 'party-1', baseState: { state_version: 0 }, stateVersion: 0, trigger: { at: '2030-01-01T00:00:00Z' }, catalogPins: { ...catalogPins, catalog_digest: 'tampered' }, commit: async () => ({}) }), (error) => error.code === 'AUTONOMOUS_VERSION_PINS_INVALID');
});
