import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDigest } from '@rus/materialization';
import { validateTurnStepCommitEnvelope } from '@rus/turn';
import {
  createLowerDvinaTracePhase2PostgresRepository
} from '../src/infrastructure/postgres/lower-dvina-trace-phase-2.js';
import {
  assertPhase2ReplayRecord
} from '../src/infrastructure/postgres/lower-dvina-trace-phase-2-replay.js';
import {
  bindLowerDvinaTraceTurnStepIdempotency
} from '../src/infrastructure/postgres/lower-dvina-trace-turn-step-idempotency.js';
import {
  deriveLowerDvinaTraceTurnStepVisibleDependencyPins
} from '../src/infrastructure/postgres/lower-dvina-trace-turn-step-state.js';
import {
  commitEnvelope
} from './lower-dvina-trace-turn-step-envelope-fixture.js';

test('turn-step commit rejects extra nested player, completed-step and trace fields',
  () => {
    const cases = [
      (envelope) => { envelope.player_input.forged = true; },
      (envelope) => { envelope.loop_trace.completed_steps[0].forged = true; },
      (envelope) => {
        envelope.loop_trace.step_traces[0].forged = true;
        envelope.mode_resolution.decision_trace.step_traces[0].forged = true;
      }
    ];
    for (const tamper of cases) {
      const envelope = commitEnvelope({ clarification: false, check: false });
      tamper(envelope);
      assert.equal(validateTurnStepCommitEnvelope(envelope).ok, false);
    }
  });

test('turn-step commit cross-binds every generic check to its loop plan', () => {
  const unmatched = commitEnvelope({ clarification: false, check: true });
  unmatched.checks.results = [];
  unmatched.loop_trace.check_results = [];
  assert.equal(validateTurnStepCommitEnvelope(unmatched).ok, false);

  const changedDigest = commitEnvelope({ clarification: false, check: true });
  changedDigest.checks.requests[0].step_plan_digest = '4'.repeat(64);
  changedDigest.loop_trace.step_traces[0]
    .check_binding.step_plan_digest = '4'.repeat(64);
  changedDigest.mode_resolution.decision_trace.step_traces[0]
    .check_binding.step_plan_digest = '4'.repeat(64);
  assert.equal(validateTurnStepCommitEnvelope(changedDigest).ok, false);
});

test('replay looks up idempotency before loading committed mechanics',
  async () => {
    const queries = [];
    const repository = createLowerDvinaTracePhase2PostgresRepository({
      partyPool: {
        async query(statement) {
          queries.push(statement);
          if (statement.includes('party_command_idempotency')) {
            return { rowCount: 0, rows: [] };
          }
          throw new Error('mechanics loaded before idempotency lookup');
        },
        async connect() { throw new Error('unexpected connection'); }
      },
      committer: { async commit() { throw new Error('unexpected commit'); } }
    });
    const replay = await repository.loadPhase2Replay({
      partyId: 'p', idempotencyKey: 'missing'
    });
    assert.equal(replay, null);
    assert.equal(queries.length, 1);
    assert.match(queries[0], /party_command_idempotency/u);
  });

test('replay rejects tampered command digest, dependency pins and envelope digest',
  () => {
    const fixture = replayFixture();
    assert.doesNotThrow(() => assertReplay(fixture));
    const tampers = [
      (record) => {
        record.semantic_command_digest = `sha256:${'f'.repeat(64)}`;
      },
      (record) => {
        record.semantic_dependency_pins = { pins: ['forged'] };
      },
      (record) => {
        record.semantic_command_snapshot.turn_step_commit_digest =
          'f'.repeat(64);
      }
    ];
    for (const tamper of tampers) {
      const changed = structuredClone(fixture);
      tamper(changed.record);
      assert.throws(() => assertReplay(changed));
    }
  });

test('generic replay rejects self-consistent visible and record pin tampering',
  () => {
    const fixture = replayFixture({ semanticChange: true });
    assert.doesNotThrow(() => assertReplay(fixture));

    const forgedPin = {
      dependency_role: 'source_authoring',
      entity_ref: {
        entity_kind: 'policy_profile', entity_id: 'forged-profile'
      },
      version_pin: {
        pin_kind: 'authoring_version', authoring_version: '99',
        state_version: null
      }
    };
    const forgedVisiblePins = dependencyPins([forgedPin]);
    const forgedBinding = bindLowerDvinaTraceTurnStepIdempotency({
      envelope: fixture.envelope,
      inputDigest: fixture.inputDigest,
      semanticCommandSnapshot: commandSnapshot(fixture.inputDigest),
      semanticCommandDigest: null,
      semanticDependencyPins: null,
      visibleDependencyPins: forgedVisiblePins
    });
    const changed = structuredClone(fixture);
    changed.visibleDependencyPins = forgedVisiblePins;
    changed.record = { ...changed.record, ...forgedBinding };

    assert.throws(() => assertReplay(changed));
  });

function replayFixture({ semanticChange = false } = {}) {
  const envelope = commitEnvelope({ clarification: false, check: false });
  if (semanticChange) envelope.consequence.state_changes.push({
    kind: 'semantic_activity',
    activity_id: 'activity-1',
    profile_ref: 'activity_profile:test',
    profile_pin: {
      artifact_id: 'activity-profile', revision: 2,
      digest: 'b'.repeat(64)
    }
  });
  const inputDigest = canonicalDigest({ input: 'беру песок' });
  const visibleDependencyPins =
    deriveLowerDvinaTraceTurnStepVisibleDependencyPins(envelope);
  const binding = bindLowerDvinaTraceTurnStepIdempotency({
    envelope,
    inputDigest,
    semanticCommandSnapshot: commandSnapshot(inputDigest),
    semanticCommandDigest: null,
    semanticDependencyPins: null,
    visibleDependencyPins,
    deriveVisiblePinsFromEnvelope: true
  });
  return {
    envelope,
    inputDigest,
    visibleDependencyPins,
    payload: {
      party_id: 'p',
      last_turn: {
        request_id: 'request-1', input_digest: inputDigest,
        option_id: 'turn_step_execution_draft',
        action_set_digest: 'action-digest',
        turn_step_commit: envelope,
        turn_step_idempotency_record_id: 'idem-1',
        visible_package: { change_set_id: 'change-1' }
      }
    },
    record: {
      id: 'idem-1', request_id: 'request-1',
      operation_kind: 'trace_turn_step',
      result_change_set_id: 'change-1',
      ...binding
    }
  };
}

function commandSnapshot(inputDigest) {
  return {
    input_digest: inputDigest,
    selected_option_id: 'turn_step_execution_draft',
    action_set_digest: 'action-digest'
  };
}

function dependencyPins(pins) {
  return {
    pins,
    canonical_digest: canonicalDigest(pins)
  };
}

function assertReplay(fixture) {
  assertPhase2ReplayRecord({
    record: fixture.record,
    payload: fixture.payload,
    visibleDependencyPins: fixture.visibleDependencyPins
  });
}
