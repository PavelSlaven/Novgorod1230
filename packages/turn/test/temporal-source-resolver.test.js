import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTemporalAdvanceOwner,
  createTemporalSourceResolver
} from '../src/temporal-advance.js';

const exact = (entityKind, entityId) => ({
  entity_ref: { entity_kind: entityKind, entity_id: entityId },
  authoring_version: '1'
});

const registration = (overrides = {}) => ({
  source_ref: exact('temporal_event_source', 'weather'),
  rule_ref: exact('temporal_rule', 'weather-change'),
  policy_ref: exact('temporal_policy', 'weather-resolution'),
  resolve: () => ({ disposition: 'execute', proposals: [] }),
  ...overrides
});

test('temporal source resolver dispatches only an exact registered owner', () => {
  const registered = registration();
  const resolve = createTemporalSourceResolver({ registrations: [registered] });
  assert.equal(resolve({
    policy_ref: structuredClone(registered.policy_ref),
    source_ref: { entity_kind: 'temporal_event_source',
      entity_id: 'party-specific-event-42' },
    rule_ref: structuredClone(registered.rule_ref)
  }).disposition, 'execute');
  assert.throws(() => resolve({
    ...registered,
    rule_ref: exact('temporal_rule', 'unknown')
  }), { code: 'temporal_source_owner_missing' });
});

test('temporal source resolver rejects duplicate exact registrations', () => {
  assert.throws(() => createTemporalSourceResolver({
    registrations: [registration(), registration()]
  }), /ambiguous/u);
});

test('temporal advance owner rejects an ambiguous effect owner', () => {
  const effect = exact('temporal_effect', 'carrier-rebinding');
  assert.throws(() => createTemporalAdvanceOwner({
    effect_registrations: [
      { effect_ref: effect, resolve() {} },
      { effect_ref: structuredClone(effect), resolve() {} }
    ]
  }), /ambiguous/u);
});
