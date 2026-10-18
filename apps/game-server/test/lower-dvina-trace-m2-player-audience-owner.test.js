import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTracePhase3Contracts } from
  '../src/runtime/lower-dvina-trace-phase-3-contracts.js';
import { projectPlayerStatementAudience } from
  '../src/runtime/lower-dvina-trace-m2-conversation-statements.js';
import {
  digest,
  phase3State,
  revision14Bundle,
  runPhase3
} from './lower-dvina-trace-m2-conversation-fixture.js';

test('player statement audience projection keeps all M2 side effects', async () => {
  const state = phase3State();
  for (const npc of state.npcs) {
    npc.semantic_state = {
      ...npc.semantic_state,
      speaker_recognition: 'unidentified'
    };
  }
  const contracts = resolveTracePhase3Contracts({
    state, bundle: revision14Bundle
  });
  const exchange = await runPhase3({
    state,
    contracts,
    rawText: 'Еремей, скажи, что ты знаешь.',
    inputDigest: digest('a'),
    responseKind: 'withhold'
  });
  const result = exchange.result;
  const statement = result.statements.find(
    ({ speaker_ref }) => speaker_ref.entity_kind === 'player_character'
  );
  const audience = result.audiences.find(({ statement_ref }) =>
    statement_ref.entity_id === statement.statement_id
  );
  assert.ok(statement);
  assert.ok(audience);
  assert.deepEqual(audience.statement_ref, {
    entity_kind: 'conversation_statement',
    entity_id: statement.statement_id
  });
  assert.ok(audience.received_messages.length > 0);
  assert.ok(audience.received_messages.every(
    ({ speaker_ref }) => speaker_ref === null
  ));
  assert.ok(Array.isArray(result.new_signal_records));
  assert.ok(Array.isArray(result.supporting_operation_perceptions));
  assert.ok(result.decision_boundary);
});

test('player audience owner rejects unbound and inconsistent audience refs', async () => {
  const state = phase3State();
  const contracts = resolveTracePhase3Contracts({
    state, bundle: revision14Bundle
  });
  const { result } = await runPhase3({
    state,
    contracts,
    rawText: 'Еремей, скажи, что ты знаешь.',
    inputDigest: digest('b'),
    responseKind: 'withhold'
  });
  const statement = result.statements.find(
    ({ speaker_ref }) => speaker_ref.entity_kind === 'player_character'
  );
  const audience = result.audiences.find(({ statement_ref }) =>
    statement_ref.entity_id === statement.statement_id
  );
  const context = {
    actualNpcActors: audience.actual_listener_refs.map(({ entity_id }) => ({
      instance_id: entity_id
    }))
  };
  const reject = (candidate, event = statement) => assert.throws(
    () => projectPlayerStatementAudience(
      context, {}, event, {}, candidate
    ),
    { code: 'TRACE_M2_PLAYER_AUDIENCE_INVALID' }
  );

  reject({ ...audience, statement_ref: {
    entity_kind: 'conversation_statement', entity_id: 'another-statement'
  } });
  reject({ ...audience, actual_listener_refs: [
    ...audience.actual_listener_refs,
    { entity_kind: 'npc', entity_id: 'outside-conversation' }
  ] });
  if (audience.actual_listener_refs.length) {
    reject({ ...audience, actual_listener_refs: [
      ...audience.actual_listener_refs,
      audience.actual_listener_refs[0]
    ] });
    reject({ ...audience, actual_listener_refs: [
      { entity_kind: 'npc', entity_id: '' }
    ] });
    reject({ ...audience, received_messages: audience.received_messages.map(
      (message, index) => index === 0 ? {
        ...message,
        source_statement_ref: {
          entity_kind: 'conversation_statement', entity_id: 'other'
        }
      } : message
    ) });
    reject({ ...audience, witness_candidate_refs: [
      { entity_kind: 'npc', entity_id: 'outside-conversation' }
    ] });
  }
});
