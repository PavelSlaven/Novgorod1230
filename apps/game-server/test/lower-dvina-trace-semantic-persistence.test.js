
import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDigest } from '@rus/materialization';
import {
  computeSpatialV3CanonicalDigest
} from '@rus/contracts/spatial-v3/registry';
import {
  buildConversationSession,
  buildConversationStatementEvent,
  buildNpcConversationResponseRequest,
  buildNpcDecisionBoundary,
  buildNpcDecisionSignal,
  buildNpcSemanticDecisionTrace
} from '@rus/npc-runtime';
import {
  appendNpcSemanticConversationWrites,
  buildNpcSemanticConversationWriteInput
} from '../src/infrastructure/postgres/npc-semantic-conversation-writes.js';
import {
  assertLowerDvinaTraceSemanticConversationRows
} from '../src/infrastructure/postgres/lower-dvina-trace-semantic-conversation-read.js';
import { assertChangeSetLineage } from
  '../src/infrastructure/postgres/lower-dvina-trace-semantic-conversation-read-rows.js';
import { conversationExchangeVersions } from
  '../src/infrastructure/postgres/lower-dvina-trace-semantic-conversation-read-messages.js';
import {
  assertPhase4NormalizedRows,
  phase4ActivityIdentity
} from '../src/infrastructure/postgres/lower-dvina-trace-phase-4-read.js';
import {
  same as samePhase4SemanticValue
} from '../src/infrastructure/postgres/lower-dvina-trace-phase-4-semantic-write-shared.js';
import { appendPhase4ActivityExecution } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-4-activity-writes.js';

const PARTY_ID = 'party-semantic-persistence';
const CHANGE_SET_ID = 'change:' + PARTY_ID + ':semantic';
const ROOT_TURN_ID = 'turn:' + PARTY_ID + ':semantic';
const AT = Object.freeze({
  whole_minutes: '120',
  subminute_numerator: '0',
  subminute_denominator: '1'
});
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });

function activitySnapshotFor(consequenceKind) {
  const inserts = [];
  appendPhase4ActivityExecution({
    inserts,
    appends: [],
    partyId: PARTY_ID,
    state: { actor_id: 'player', position: {} },
    factual: {
      consequence: consequenceKind,
      time_update: { clock_before: AT },
      mode_resolution: { option_id: 'option' },
      player_input: { request_id: 'request' }
    },
    next: { clock: { ...AT, whole_minutes: '125' } },
    root: { activity_ref: 'activity-profile', duration_minutes: 5,
      status: 'completed' },
    id: 'activity-execution',
    seriesOrdinal: 0,
    activitySeriesId: 'activity-series',
    attemptOrdinal: 0,
    turnNumber: 1,
    changeSetId: CHANGE_SET_ID,
    idemId: 'idempotency'
  });
  return only(inserts, 'party_timed_activity_executions')
    .record.activity_snapshot;
}

import { semanticWriterFixture } from './lower-dvina-trace-semantic-persistence-semantic-fixture.js';
import { semanticReadPool } from './lower-dvina-trace-semantic-persistence-read-pool.js';
import { phase4ReadFixture } from './lower-dvina-trace-semantic-persistence-phase4-fixture.js';
import { integrityFailure, only, rows } from './lower-dvina-trace-semantic-persistence-pool.js';

test('Phase 4 semantic persistence compares canonical values', () => {
  assert.equal(samePhase4SemanticValue(
    { category: 'others', significance: 'material' },
    { significance: 'material', category: 'others' }
  ), true);
  assert.equal(samePhase4SemanticValue(
    { category: 'others', significance: 'material' },
    { category: 'objective', significance: 'material' }
  ), false);
});

test('shared activity writer preserves Phase 4 and Phase 8 snapshot identities',
  () => {
    assert.deepEqual(activitySnapshotFor({ phase4_kind: 'negotiation' }), {
      activity_ref: 'activity-profile', phase4_kind: 'negotiation'
    });
    assert.deepEqual(activitySnapshotFor({ phase8_kind: 'accusation' }), {
      activity_ref: 'activity-profile', phase_kind: 'accusation'
    });
  });

test('semantic writer persists CAS, audiences, lineage and actual messages', () => {
  const fixture = semanticWriterFixture();
  const { inserts, updates, appends } = fixture.writes;
  const session = only(updates, 'party_conversation_sessions');
  const statements = rows(appends, 'party_conversation_statements');
  const traces = rows(appends, 'party_npc_decision_traces');
  const perceptions = rows(appends, 'party_perception_records');

  assert.equal(session.record.state_version, 2);
  assert.equal(fixture.expectedSessionStateVersion, 1);
  assert.equal(rows(inserts, 'party_conversation_sessions').length, 0);
  assert.equal(session.record.conversation_id, fixture.session.conversation_id);
  assert.deepEqual(
    statements.map(({ record }) => record.audience_projection),
    fixture.audiences
  );
  assert.deepEqual(
    statements.map(({ record }) => record.audience_digest),
    fixture.audiences.map(canonicalDigest)
  );
  assert.equal(traces.length, 1);
  assert.equal(traces[0].record.root_turn_id, ROOT_TURN_ID);
  assert.equal(traces[0].record.working_revision, 3);
  assert.equal(traces[0].record.change_set_id, CHANGE_SET_ID);
  assert.equal(traces[0].record.option_id, null);
  assert.equal(traces[0].record.command_token, null);
  assert.equal(traces[0].record.options_digest, null);
  assert.equal(traces.some(({ record }) => record.option_id !== null), false);
  assert.deepEqual(traces[0].record.semantic_request, fixture.request);
  assert.deepEqual(traces[0].record.semantic_plan, fixture.plan);
  assert.equal(
    Object.hasOwn(fixture.payload, 'npc_semantic_decision_traces'),
    false
  );
  assert.deepEqual(
    perceptions.map(({ id }) => id).sort(),
    fixture.receivedMessages.map(
      ({ perception_result_ref: perception }) => perception.entity_id
    ).sort()
  );
  const temporalEvents = rows(inserts, 'party_temporal_events');
  assert.equal(temporalEvents.length, 2);
  assert.deepEqual(
    temporalEvents.map(({ record }) => record.state_version),
    [2, 2]
  );
  assert.equal(rows(appends, 'party_perception_witnesses').length, 2);
  assert.equal(rows(appends, 'party_perception_replay_evidence').length, 2);
});

test('semantic restart is symmetric and rejects corrupt audience digest', async () => {
  const fixture = semanticWriterFixture();
  const replayInputs = [];
  const reloadedTraces =
    await assertLowerDvinaTraceSemanticConversationRows(
      semanticReadPool(fixture.writes), fixture.payload, { replayInputs }
    );
  assert.deepEqual(
    reloadedTraces,
    [fixture.trace],
    'exact replay must hydrate the private plan from its dedicated trace row'
  );
  const decisionRow = rows(fixture.writes.appends,
    'party_npc_decision_traces')[0].record;
  assert.equal(replayInputs[0].canonical_input_digest,
    decisionRow.canonical_input_digest);
  assert.deepEqual(replayInputs[0].signal_records, decisionRow.signal_records);
  const corrupt = structuredClone(fixture.writes);
  rows(corrupt.appends, 'party_conversation_statements')[0]
    .record.audience_digest = 'sha256:corrupt';
  await assert.rejects(
    assertLowerDvinaTraceSemanticConversationRows(
      semanticReadPool(corrupt),
      fixture.payload
    ),
    integrityFailure
  );
});

test('stateful conversation lineage selects the latest turn before working revision', () => {
  const conversationId = 'conversation:stateful';
  const decisions = [1, 2].map((stateVersion) => ({
    semantic_request: {
      conversation_id: conversationId,
      exchange_id: `exchange:${stateVersion}`,
      state_version: stateVersion
    },
    working_revision: '0',
    change_set_id: `change:${stateVersion}`
  }));
  const statements = decisions.map((decision) => ({
    conversation_id: conversationId,
    exchange_id: decision.semantic_request.exchange_id,
    change_set_id: decision.change_set_id
  }));

  assert.doesNotThrow(() => assertChangeSetLineage([{
    conversation_id: conversationId,
    updated_change_set_id: 'change:2'
  }], statements, decisions));
  const versions = conversationExchangeVersions(
    [...decisions].reverse(),
    new Map([[conversationId, { state_version: '3' }]])
  );
  assert.equal(versions.get(`${conversationId}\u0000exchange:1`), 2);
  assert.equal(versions.get(`${conversationId}\u0000exchange:2`), 3);
  const conflictingBranch = {
    semantic_request: {
      conversation_id: conversationId,
      exchange_id: 'exchange:2:conflict',
      state_version: 2
    },
    working_revision: '0',
    change_set_id: 'change:2:conflict'
  };
  assert.throws(() => assertChangeSetLineage([], [], [
    ...decisions,
    conflictingBranch
  ]));
});

test('Phase 4 restart accepts historical player arrival', async () => {
  const fixture = phase4ReadFixture({ revision: 13, semantic: false });
  await assert.doesNotReject(assertPhase4NormalizedRows(
    fixture.pool,
    fixture.payload,
    fixture.head
  ));
});

test('Phase 4 semantic readback keeps the approved exchange total on negotiation', () => {
  assert.deepEqual(phase4ActivityIdentity({
    semanticRevision: true,
    durationMinutes: 10
  }), {
    activityKind: 'negotiation',
    seriesOrdinal: 0
  });
  assert.deepEqual(phase4ActivityIdentity({
    semanticRevision: false,
    durationMinutes: 2
  }), {
    activityKind: 'response',
    seriesOrdinal: 1
  });
});

test('Phase 4 restart accepts Ratsha arrival and two knife observers', async () => {
  const fixture = phase4ReadFixture({ revision: 14, semantic: true });
  await assert.doesNotReject(assertPhase4NormalizedRows(
    fixture.pool,
    fixture.payload,
    fixture.head
  ));
  fixture.replayRows[0].canonical_digest = 'sha256:corrupt';
  await assert.rejects(
    assertPhase4NormalizedRows(fixture.pool, fixture.payload, fixture.head),
    integrityFailure
  );
});
