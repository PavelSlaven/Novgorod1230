import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256 } from '@rus/kernel';
import { createLowerDvinaTracePostAppliedActorStepOwner } from
  '../src/runtime/lower-dvina-trace-post-applied-actor-step.js';
import { fixture } from './lower-dvina-trace-turn-step-commit-fixture.js';

test('factual event persists in P16', async () => {
  const event = factualEvent();
  const resolved = await eventOwner()({ root_turn_id: 'turn:p:1', step_index: 1,
    working_projection: {}, factual_events: [event] });
  const f = fixture({ speech: true, temporalResults: resolved.temporal_results });
  bindSpeechEvidence(f, event);
  f.envelope.loop_trace.factual_events = [event];

  await f.commit();

  const plan = f.plans[0];
  const row = plan.inserts.find(({ target_table: table }) =>
    table === 'party_temporal_events');
  assert.equal(row.record.status, 'resolved');
  assert.equal(row.record.state_version, 2);
  const snapshot = plan.inserts.find(({ target_table: table }) =>
    table === 'party_state_snapshots').record.state_payload;
  assert.deepEqual(snapshot.last_turn.turn_step_commit.loop_trace.factual_events,
    [event]);
});

test('factual event cannot reach commit without its exact P16 write',
  async () => {
    const f = fixture({ speech: true });
    bindSpeechEvidence(f, factualEvent());
    f.envelope.loop_trace.factual_events = [factualEvent()];
    await assert.rejects(() => f.commit(), {
      code: 'TRACE_TURN_STEP_FACTUAL_EVENT_RECONCILIATION_FAILED'
    });
    assert.equal(f.plans.length, 0);
  });

test('P16 factual row cannot reach commit without its public event', async () => {
  const event = factualEvent();
  const resolved = await eventOwner()({ root_turn_id: 'turn:p:1', step_index: 1,
    working_projection: {}, factual_events: [event] });
  const f = fixture({ speech: true, temporalResults: resolved.temporal_results });
  bindSpeechEvidence(f, event);
  await assert.rejects(() => f.commit(), {
    code: 'TRACE_TURN_STEP_FACTUAL_EVENT_RECONCILIATION_FAILED'
  });
  assert.equal(f.plans.length, 0);
});

test('factual event profile pin must match persisted owner evidence',
  async () => {
    const event = factualEvent();
    const resolved = await eventOwner()({ root_turn_id: 'turn:p:1',
      step_index: 1, working_projection: {}, factual_events: [event] });
    const f = fixture({ speech: true, temporalResults: resolved.temporal_results });
    bindSpeechEvidence(f, event);
    const forged = structuredClone(event);
    forged.profile_pin.digest = '2'.repeat(64);
    f.envelope.loop_trace.factual_events = [forged];
    await assert.rejects(() => f.commit(), {
      code: 'TRACE_TURN_STEP_FACTUAL_EVENT_RECONCILIATION_FAILED'
    });
    assert.equal(f.plans.length, 0);
  });

test('factual event rejects a forged rule owner before P16', async () => {
  const event = factualEvent();
  event.rule_ref.entity_kind = 'forged_rule_kind';
  const resolved = await eventOwner()({ root_turn_id: 'turn:p:1', step_index: 1,
    working_projection: {}, factual_events: [event] });
  const f = fixture({ speech: true, temporalResults: resolved.temporal_results });
  bindSpeechEvidence(f, event);
  f.envelope.loop_trace.factual_events = [event];
  await assert.rejects(() => f.commit(), {
    code: 'TRACE_TURN_STEP_COMMIT_ENVELOPE_INVALID'
  });
  assert.equal(f.plans.length, 0);
});

test('self-consistent factual row cannot forge its causal activity evidence',
  async () => {
    const legitimate = factualEvent();
    const forged = structuredClone(legitimate);
    forged.event_ref.entity_id = 'forged-unrelated-event';
    forged.source_ref.entity_id = 'forged-actor';
    forged.source_scope_ref.entity_id = 'forged-scope';
    forged.perceptible_signal = { channel: 'acoustic', emission_strength: 4,
      duration_class: 'sustained' };
    const resolved = await eventOwner()({ root_turn_id: 'turn:p:1',
      step_index: 1, working_projection: {}, factual_events: [forged] });
    const f = fixture({ speech: true, temporalResults: resolved.temporal_results });
    bindSpeechEvidence(f, legitimate);
    f.envelope.loop_trace.factual_events = [forged];
    await assert.rejects(() => f.commit(), {
      code: 'TRACE_TURN_STEP_FACTUAL_EVENT_RECONCILIATION_FAILED'
    });
    assert.equal(f.plans.length, 0);
  });

test('unseen visual event uses the same causal P16 carrier', async () => {
  const event = factualEvent();
  event.event_ref = { entity_kind: 'action_event',
    entity_id: 'unseen-visual-event' };
  event.perceptible_signal = { channel: 'visual', emission_strength: 3,
    duration_class: 'brief' };
  const resolved = await eventOwner()({ root_turn_id: 'turn:p:1', step_index: 1,
    working_projection: {}, factual_events: [event] });
  const f = fixture({ speech: true, temporalResults: resolved.temporal_results });
  bindCommonEvidence(f, event);
  f.envelope.loop_trace.factual_events = [event];
  await f.commit();
  assert.equal(f.plans[0].inserts.some(({ target_table: table, id }) =>
    table === 'party_temporal_events' && id === 'unseen-visual-event'), true);
});

function eventOwner() {
  return createLowerDvinaTracePostAppliedActorStepOwner({
    committedState: { party_id: 'p', party_state: {
      state_version: 3, turn_number: 0 } }, idempotencyKey: 'idem-key'
  });
}

function bindSpeechEvidence(f, event) {
  bindCommonEvidence(f, event);
  const trace = f.envelope.loop_trace.step_traces[0];
  trace.approved_plan.direct_result_kind = 'player_utterance';
  trace.approved_plan.utterance = { speaker_ref: event.source_ref.entity_id,
    utterance_text: 'Эй', input_mode: 'intent_paraphrase',
    delivery: { loudness: event.perceptible_signal.emission_strength,
      duration_class: event.perceptible_signal.duration_class } };
  f.envelope.mode_resolution.decision_trace.step_traces =
    structuredClone(f.envelope.loop_trace.step_traces);
}

function bindCommonEvidence(f, event) {
  const trace = f.envelope.loop_trace.step_traces[0];
  trace.plan_request.player_safe_state.position = {
    position_id: event.source_scope_ref.entity_id,
    g5_anchor_id: `anchor:${event.source_scope_ref.entity_id}`
  };
  trace.plan_request.player_safe_state.spatial_semantic = {
    position_ref: `position:${event.source_scope_ref.entity_id}`
  };
  f.envelope.mode_resolution.decision_trace.step_traces =
    structuredClone(f.envelope.loop_trace.step_traces);
}

function factualEvent() {
  return { version: 1, schema: 'turn_step_factual_event_v1',
    event_ref: { entity_kind: 'sound_event',
      entity_id: `sound-event:${sha256('activity-1').slice(0, 32)}` },
    source_activity_ref: { entity_kind: 'semantic_activity',
      entity_id: 'activity-1' },
    occurred_at: { whole_minutes: '10', subminute_numerator: '0',
      subminute_denominator: '1' },
    source_ref: { entity_kind: 'player_character', entity_id: 'actor-1' },
    source_scope_ref: { entity_kind: 'canonical_spatial_node', entity_id: 'shore' },
    rule_ref: { entity_kind: 'activity_profile', entity_id: 'approved:moment-none',
      authoring_version: '1' },
    policy_ref: { entity_kind: 'turn_step_owner_profile_set',
      entity_id: 'turn-step-owner-profiles', authoring_version: '1' },
    profile_pin: { artifact_id: 'turn-step-owner-profiles', revision: 1,
      digest: '1'.repeat(64) },
    perceptible_signal: { channel: 'acoustic', emission_strength: 2,
      duration_class: 'instant' } };
}
