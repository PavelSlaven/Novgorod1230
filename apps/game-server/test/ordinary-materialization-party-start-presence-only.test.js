import assert from 'node:assert/strict';
import test from 'node:test';
import { createOrdinaryMaterializationFirstEntryProvisioner } from
  '../src/infrastructure/postgres/ordinary-materialization-first-entry-provisioning.js';
import {
  emptyPresenceFirstArrivalResult,
  PRESENCE_FIRST_ARRIVAL_GAP,
} from '../src/infrastructure/postgres/ordinary-materialization-presence-first-arrival.js';

const profile = { technical_limits: { max_resolution_records: 8 } };
const firstEntryBinding = { g6_instance_id: 'g6:start', position_id: 'position:start' };
const rule = {
  rule_id: 'pr_test', rule_version: 1, status: 'approved', scope_kind: 'place_family', scope_ref: 'pf_test',
  region_id: null, subject_kind: 'category', subject_ref: 'cat_child', presence_probability_ppm: 1_000_000,
  count_limit: 2, allowed_seasons: ['all'], refresh_class: 'none', entry_exposed_weight: 1,
  search_concealed_weight: 0,
};

function recordingTransaction() {
  const statements = [];
  return { statements, async query(sql) { statements.push(sql); return { rowCount: 0, rows: [] }; } };
}

const provision = (resolvePresenceRulesFirstArrival, transaction) =>
  createOrdinaryMaterializationFirstEntryProvisioner({
    profile, includeContextBoundCapabilities: false, partyStartPresenceOnly: true,
    resolvePresenceRulesFirstArrival,
  }).provision({ transaction, partyId: 'party-1', firstEntryBinding, changeSetId: 'change:new-game' });

test('party start with empty presence returns the typed gap and writes nothing', async () => {
  const transaction = recordingTransaction();
  const seen = [];
  const result = await provision(async (input) => {
    seen.push(input);
    return emptyPresenceFirstArrivalResult({ partyId: 'party-1', siteId: 'g5:start',
      presence_gap: PRESENCE_FIRST_ARRIVAL_GAP.NO_PLACE_FAMILY_BINDING });
  }, transaction);
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].scope, { entity_kind: 'g6', entity_id: 'g6:start' });
  assert.equal(result.provisioned, false);
  assert.equal(result.presence_gap, 'no_place_family_binding');
  assert.deepEqual(result.scope_ref, { entity_kind: 'g6', entity_id: 'g6:start' });
  assert.deepEqual(transaction.statements, []);
});

test('party start with rules inserts only the presence aggregate', async () => {
  const transaction = recordingTransaction();
  const result = await provision(async () => ({
    partyId: 'party-1', scopeInstanceRef: 'g5:start', rules: [rule], parentById: new Map(),
    periodNumber: 4, requestIdentityPrefix: 'presence-first-arrival:g5:start',
  }), transaction);
  assert.equal(result.provisioned, true);
  assert.equal(transaction.statements.length, 2);
  assert.match(transaction.statements[0], /^SELECT[\s\S]*party_ordinary_materialization_aggregates[\s\S]*FOR UPDATE/u);
  assert.match(transaction.statements[1], /^INSERT INTO party_runtime\.party_ordinary_materialization_aggregates/u);
  assert.ok(transaction.statements.every((sql) => !/enablements/u.test(sql)));
});

test('party start presence-only mode requires a resolver and a typed gap for empty presence', async () => {
  assert.throws(() => createOrdinaryMaterializationFirstEntryProvisioner({
    profile, partyStartPresenceOnly: true }), { code: 'ORDINARY_FIRST_ENTRY_PROVISIONING_INVALID' });
  await assert.rejects(provision(async () => ({ partyId: 'party-1', rules: [] }), recordingTransaction()),
    { code: 'ORDINARY_FIRST_ENTRY_PROVISIONING_INVALID' });
});
