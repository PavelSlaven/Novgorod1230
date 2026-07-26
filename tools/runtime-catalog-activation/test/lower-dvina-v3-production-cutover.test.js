import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildProductionCutoverPhaseEvent,
  deleteAuthorizedProductionParties,
  evaluateLowerDvinaV3ProductionCutover,
  LOWER_DVINA_V2_WORLD_PIN,
  LOWER_DVINA_V3_WORLD_PIN,
  PARTY_AGGREGATE_DELETE_TRIGGERS,
  recordProductionCutoverPhase
} from '../src/lower-dvina-v3-production-cutover.js';

const PARTY_ID = 'party:b5660e1f406bb9f83379173f';
const PREVIOUS_EVENT_ID =
  'runtime_catalog_activation_6ee035c89a5d9c4f97adf3c76a2e7e1d';
const REQUEST_DIGEST = 'f'.repeat(64);

function cutoverRequest(requestDigest = REQUEST_DIGEST) {
  return {
    request_digest: requestDigest,
    release_id: 'spatial-v3-production-v3',
    world_revision_id:
      'novgorod_spatial_v3_production_v3_candidate_001',
    world_catalog_digest:
      '1cf914ed9a19801f94b8b1463a717dbb0be7f1d51ea2351e6d1d5a51c492215e',
    expected_previous_event_id: PREVIOUS_EVENT_ID,
    expected_party_ids: [PARTY_ID],
    authorization_ref: 'test authorization',
    expected_party_database: 'lower_dvina_party_production_v3',
    expected_party_principal: 'party_operator'
  };
}

function inventory(overrides = {}) {
  const request = cutoverRequest();
  return {
    world: {
      database: 'pr17_lower_dvina_world_production_v2',
      active_event: {
        event_id: PREVIOUS_EVENT_ID,
        compatible_world_revision_id:
          LOWER_DVINA_V2_WORLD_PIN.world_revision_id,
        compatible_world_catalog_digest:
          LOWER_DVINA_V2_WORLD_PIN.world_catalog_digest
      },
      ...overrides.world
    },
    party: {
      database: 'lower_dvina_party_production_v3',
      parties: [{
        party_id: PARTY_ID,
        ...LOWER_DVINA_V2_WORLD_PIN
      }],
      inflight_count: 0,
      ...overrides.party
    },
    expectedWorldDatabase: 'pr17_lower_dvina_world_production_v2',
    expectedPartyDatabase: 'lower_dvina_party_production_v3',
    expectedPreviousEventId: PREVIOUS_EVENT_ID,
    expectedPartyIds: [PARTY_ID],
    requestDigest: REQUEST_DIGEST,
    expectedPreparedEvent: buildProductionCutoverPhaseEvent({
      request,
      phase: 'prepared'
    })
  };
}

test('v3 production cutover accepts only the exact v2 predecessor and party set', () => {
  const result = evaluateLowerDvinaV3ProductionCutover(inventory());
  assert.equal(result.status, 'ready');
  assert.equal(result.ready, true);
  assert.equal(result.exact_predecessor, true);
  assert.equal(result.exact_party_set, true);

  assert.equal(evaluateLowerDvinaV3ProductionCutover(inventory({
    party: { parties: [{ party_id: 'unexpected-party' }] }
  })).status, 'blocked');
  assert.equal(evaluateLowerDvinaV3ProductionCutover(inventory({
    world: {
      active_event: {
        event_id: 'unexpected-event',
        compatible_world_revision_id:
          LOWER_DVINA_V2_WORLD_PIN.world_revision_id,
        compatible_world_catalog_digest:
          LOWER_DVINA_V2_WORLD_PIN.world_catalog_digest
      }
    }
  })).status, 'blocked');
  assert.equal(evaluateLowerDvinaV3ProductionCutover(inventory({
    party: { inflight_count: 1 }
  })).status, 'blocked');
});

test('exact prepared phase permits only request-bound resume from empty party state', () => {
  const prepared = buildProductionCutoverPhaseEvent({
    request: cutoverRequest(),
    phase: 'prepared'
  });
  const resumable = evaluateLowerDvinaV3ProductionCutover(inventory({
    world: {
      cutover_events: [prepared]
    },
    party: { parties: [] }
  }));
  assert.equal(resumable.status, 'resume_after_cleanup');
  assert.equal(resumable.ready, true);

  const arbitraryEmpty = evaluateLowerDvinaV3ProductionCutover(inventory({
    party: { parties: [] }
  }));
  assert.equal(arbitraryEmpty.status, 'blocked');

  const differentRequest = evaluateLowerDvinaV3ProductionCutover(inventory({
    world: {
      cutover_events: [buildProductionCutoverPhaseEvent({
        request: cutoverRequest('e'.repeat(64)),
        phase: 'prepared'
      })]
    },
    party: { parties: [] }
  }));
  assert.equal(differentRequest.status, 'blocked');
  assert.equal(differentRequest.conflicting_phase_event, true);

  const exact = buildProductionCutoverPhaseEvent({
    request: cutoverRequest(),
    phase: 'prepared'
  });
  const tampered = evaluateLowerDvinaV3ProductionCutover(inventory({
    world: {
      cutover_events: [{
        ...exact,
        expected_party_ids: ['another-party']
      }]
    },
    party: { parties: [] }
  }));
  assert.equal(tampered.status, 'blocked');
  assert.equal(tampered.exact_prepared_event, false);

  const changedPredecessor = evaluateLowerDvinaV3ProductionCutover(
    inventory({
      world: {
        active_event: {
          event_id: 'changed-after-initial-preflight',
          compatible_world_revision_id:
            LOWER_DVINA_V2_WORLD_PIN.world_revision_id,
          compatible_world_catalog_digest:
            LOWER_DVINA_V2_WORLD_PIN.world_catalog_digest
        },
        cutover_events: [prepared]
      }
    })
  );
  assert.equal(changedPredecessor.status, 'blocked');
  assert.equal(changedPredecessor.exact_predecessor, false);
});

test('cutover phase ledger is append-only and exact replay is idempotent', async () => {
  const request = cutoverRequest();
  const event = buildProductionCutoverPhaseEvent({
    request,
    phase: 'prepared'
  });
  const statements = [];
  const client = {
    query: async (sql) => {
      statements.push(sql);
      if (/SELECT request_digest/u.test(sql)) return { rows: [] };
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const recorded = await recordProductionCutoverPhase({
    worldPool: { connect: async () => client },
    event
  });
  assert.equal(recorded.status, 'recorded');
  assert.match(
    statements.find((sql) => /INSERT INTO operator_control/u.test(sql)),
    /lower_dvina_v3_cutover_events/u
  );
  assert.equal(statements.at(-1), 'COMMIT');

  const replayClient = {
    query: async (sql) => /SELECT request_digest/u.test(sql)
      ? { rows: [{ ...event }] }
      : { rows: [] },
    release() {}
  };
  assert.equal((await recordProductionCutoverPhase({
    worldPool: { connect: async () => replayClient },
    event
  })).status, 'already_recorded');
});

test('v3 production cutover recognizes committed v3 and never requests cleanup again', () => {
  const result = evaluateLowerDvinaV3ProductionCutover(inventory({
    world: {
      active_event: {
        event_id: 'active-v3',
        compatible_world_revision_id:
          LOWER_DVINA_V3_WORLD_PIN.world_revision_id,
        compatible_world_catalog_digest:
          LOWER_DVINA_V3_WORLD_PIN.world_catalog_digest
      }
    },
    party: {
      parties: [{
        party_id: 'first-real-v3-party',
        ...LOWER_DVINA_V3_WORLD_PIN
      }]
    }
  }));
  assert.equal(result.status, 'already_active');
  assert.equal(result.ready, false);
  assert.equal(result.already_active, true);
});

test('authorized party cleanup deletes restrict children then exact root in one transaction', async () => {
  const statements = [];
  let released = false;
  const client = {
    query: async (sql) => {
      statements.push(sql);
      if (/SELECT party_id/u.test(sql)) {
        return { rows: [{ party_id: PARTY_ID }] };
      }
      if (/commit_idempotency/u.test(sql)) {
        return { rows: [{ count: 0 }] };
      }
      if (/SELECT c\.relname/u.test(sql)) {
        return {
          rows: PARTY_AGGREGATE_DELETE_TRIGGERS
            .map(([table_name, trigger_name]) => ({
              table_name,
              trigger_name
            }))
            .sort((left, right) =>
              `${left.table_name}:${left.trigger_name}`
                .localeCompare(`${right.table_name}:${right.trigger_name}`))
        };
      }
      if (/DELETE FROM party_runtime\.parties/u.test(sql)) {
        return { rowCount: 1, rows: [] };
      }
      if (/DELETE FROM/u.test(sql)) {
        return { rowCount: 1, rows: [] };
      }
      if (/SELECT count/u.test(sql)) {
        return { rows: [{ count: 0 }] };
      }
      return { rows: [] };
    },
    release: () => { released = true; }
  };
  const result = await deleteAuthorizedProductionParties({
    partyPool: { connect: async () => client },
    expectedPartyIds: [PARTY_ID]
  });
  assert.equal(result.deleted_party_count, 1);
  assert.equal(result.deleted_materialization_run_catalog_pin_count, 1);
  assert.equal(statements[0], 'BEGIN');
  assert.match(
    statements.find((sql) =>
      /DELETE FROM party_runtime\.spatial_v3_migration_coverage/u.test(sql)),
    /DELETE/u
  );
  assert.ok(
    statements.findIndex((sql) => /party_catalog_pins/u.test(sql))
      < statements.findIndex((sql) =>
        /DELETE FROM party_runtime\.parties/u.test(sql))
  );
  assert.equal(statements.at(-1), 'COMMIT');
  assert.equal(
    statements.filter((sql) => /DISABLE TRIGGER/u.test(sql)).length,
    PARTY_AGGREGATE_DELETE_TRIGGERS.length
  );
  assert.equal(
    statements.filter((sql) => /ENABLE TRIGGER/u.test(sql)).length,
    PARTY_AGGREGATE_DELETE_TRIGGERS.length
  );
  assert.equal(released, true);
});

test('party cleanup rolls back without deleting when exact scope changes', async () => {
  const statements = [];
  const client = {
    query: async (sql) => {
      statements.push(sql);
      if (/SELECT party_id/u.test(sql)) {
        return { rows: [{ party_id: 'unexpected-party' }] };
      }
      return { rows: [] };
    },
    release() {}
  };
  await assert.rejects(
    deleteAuthorizedProductionParties({
      partyPool: { connect: async () => client },
      expectedPartyIds: [PARTY_ID]
    }),
    (error) => error.code === 'PRODUCTION_PARTY_DELETE_SCOPE_CHANGED'
  );
  assert.equal(
    statements.some((sql) => /DELETE FROM/u.test(sql)),
    false
  );
  assert.equal(statements.at(-1), 'ROLLBACK');
});
