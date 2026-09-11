import assert from 'node:assert/strict';
import test from 'node:test';
import { applySemanticActivity } from
  '../src/runtime/lower-dvina-trace-turn-step-delegated-ports.js';
import { initializeRuntimeState } from
  '../src/runtime/lower-dvina-trace-turn-step-item-operations.js';
import { createLowerDvinaTracePostAppliedActorStepOwner } from
  '../src/runtime/lower-dvina-trace-post-applied-actor-step.js';

const at = { whole_minutes: '10', subminute_numerator: '0',
  subminute_denominator: '1' };
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const versionedRef = (entity_kind, entity_id) => ({ entity_kind, entity_id,
  authoring_version: '1' });

test('direct utterance emits exact delivery without speech text', async () => {
  const state = initializeRuntimeState({ party_id: 'party', actor_id: 'actor',
    party_state: { turn_number: 0 }, clock: at,
    position: { location_ref: 'shore' }, items: [] });
  const result = await applySemanticActivity({
    request: { root_turn_id: 'turn', step_index: 1,
      actor: { actor_id: 'actor', body: {} } },
    plan: { resolution: 'direct', direct_result_kind: 'player_utterance',
      utterance: { speaker_ref: 'actor', utterance_text: 'Эй, отзовитесь!',
        input_mode: 'verbatim',
        delivery: { loudness: 4, duration_class: 'instant' } } },
    operation: { activity: { owner: 'semantic', duration_class: 'moment',
      effort: 'none' } },
    working_projection: { actor_id: 'actor', spatial_semantic: {
      position_ref: 'shore' } }, check_result: null,
    prepared_chain_context: null
  }, state, { resolve: async () => ({
    profile_ref: 'semantic:moment:none',
    profile_pin: { artifact_id: 'semantic', revision: 1,
      digest: 'a'.repeat(64) },
    duration_class: 'moment', effort: 'none', duration_minutes: 0,
    body_effect_ref: null, body_effect_profile_ref: 'body:none',
    exact_deltas: {}, body_state_after: {}
  }) });
  assert.deepEqual(result.factual_events[0].perceptible_signal, {
    channel: 'acoustic', emission_strength: 4, duration_class: 'instant' });
  assert.deepEqual(result.factual_events[0].rule_ref, {
    entity_kind: 'activity_profile', entity_id: 'semantic:moment:none',
    authoring_version: '1' });
  assert.deepEqual(result.factual_events[0].policy_ref, {
    entity_kind: 'turn_step_owner_profile_set', entity_id: 'semantic',
    authoring_version: '1' });
  assert.deepEqual(result.factual_events[0].profile_pin, {
    artifact_id: 'semantic', revision: 1, digest: 'a'.repeat(64) });
  assert.equal(JSON.stringify(result.factual_events).includes('Эй'), false);
});

for (const [label, value] of [
  ['speech', event()],
  ['unseen visual physical event', event({ channel: 'visual',
    eventKind: 'action_contract', id: 'physical:1',
    ruleId: 'physical-event', policyId: 'physical-policy' })]
]) test(`${label} persists without invented listener or response`, async () => {
    const owner = ownerFor();
    const result = await owner({ root_turn_id: 'turn:party:1', step_index: 1,
      working_projection: {}, factual_events: [value] });
    assert.equal(result.consequence_fragment, null);
    const temporal = result.temporal_results[0];
    assert.deepEqual(temporal.projection, {});
    assert.equal(temporal.temporal_status, 'completed');
    const row = temporal.combined_change_set.proposals[0]
      .write_set.inserts[0];
    assert.equal(row.target_table, 'party_temporal_events');
    assert.equal(row.record.status, 'resolved');
    assert.equal(row.record.state_version, 2);
  });

function ownerFor() {
  return createLowerDvinaTracePostAppliedActorStepOwner({
    committedState: { party_id: 'party', actor_id: 'actor',
      party_state: { state_version: 7, turn_number: 0 } },
    idempotencyKey: 'idem-1'
  });
}

function event({ channel = 'acoustic', eventKind = 'sound_event', id = 'sound:1',
  ruleId = 'speech-event', policyId = 'speech-policy' } = {}) {
  return { version: 1, schema: 'turn_step_factual_event_v1',
    event_ref: ref(eventKind, id), occurred_at: structuredClone(at),
    source_activity_ref: ref('semantic_activity', 'activity:1'),
    source_ref: ref('player_character', 'actor'),
    source_scope_ref: ref('canonical_spatial_node', 'shore'),
    rule_ref: versionedRef('activity_profile', ruleId),
    policy_ref: versionedRef('turn_step_owner_profile_set', policyId),
    profile_pin: { artifact_id: policyId, revision: 1,
      digest: 'a'.repeat(64) },
    perceptible_signal: { channel, emission_strength: 4,
      duration_class: 'instant' } };
}
