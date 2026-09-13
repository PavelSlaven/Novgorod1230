import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createLowerDvinaTracePostAppliedActorStepOwner } from
  '../src/runtime/lower-dvina-trace-post-applied-actor-step.js';

const at = { whole_minutes: '10', subminute_numerator: '0',
  subminute_denominator: '1' };
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
async function perceptionPolicy() {
  return JSON.parse(await readFile(
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m22-content/post-action-perception-profile.json',
    'utf8'
  ));
}

async function state(runtimeStatus = 'available') {
  return {
    party_id: 'party-1',
    party_state: { state_version: 3, turn_number: 3 },
    environment_snapshot: {
      environment_profile_id: 'environment-1'
    },
    npcs: [{ instance_id: 'npc-1', anchor_id: 'anchor-1',
      check_body_state: { health: 10 },
      machine_state: { runtime_status: runtimeStatus } }],
    npc_schedule_runtime: [{ npc_id: 'npc-1', status: 'active',
      state_version: 2, current_position_node_id: 'position:anchor-1',
      attention_state_ref: ref('condition_set', 'attention-1'),
      knowledge_state_ref: ref('knowledge_fact', 'knowledge-1') }],
    post_action_perception_sources: [{ npc_id: 'npc-1',
      current_position_node_id: 'position:anchor-1', schedule_state_version: 2,
      attention_state_ref: ref('condition_set', 'attention-1'),
      knowledge_state_ref: ref('knowledge_fact', 'knowledge-1'),
      g6_instance_id: 'g6-1', position_state_version: 2,
      ambient_noise: 0, acoustic_uniformity: 'uniform',
      acoustic_state_version: 1 }],
    post_action_knowledge_states: [{ npc_id: 'npc-1', exists: false,
      state_version: null, fact_refs: [], hypothesis_refs: [] }]
  };
}

function event(channel = 'acoustic') {
  return {
    version: 1, schema: 'turn_step_factual_event_v1',
    event_ref: ref(channel === 'acoustic' ? 'sound_event' : 'action_contract',
      'event-1'),
    source_activity_ref: ref('semantic_activity', 'activity-1'),
    occurred_at: at,
    source_ref: ref('player_character', 'player-1'),
    source_scope_ref: ref('canonical_spatial_node', 'position:anchor-1'),
    rule_ref: { entity_kind: 'activity_profile', entity_id: 'activity-rule',
      authoring_version: '1' },
    policy_ref: { entity_kind: 'turn_step_owner_profile_set',
      entity_id: 'turn-profile', authoring_version: '1' },
    profile_pin: { artifact_id: 'turn-profile', revision: 1,
      digest: 'a'.repeat(64) },
    perceptible_signal: { channel, emission_strength: 3,
      duration_class: 'brief' }
  };
}

test('co-located loud speech persists perception, first knowledge and exact summary', async () => {
  const owner = createLowerDvinaTracePostAppliedActorStepOwner({
    committedState: await state(), idempotencyKey: 'idem-1',
    perceptionProfile: await perceptionPolicy()
  });
  const result = await owner({
    working_projection: {}, factual_events: [event()],
    actor_step_plan: { direct_result_kind: 'player_utterance', utterance: {
      speaker_ref: 'player-1', utterance_text: 'Эй, отзовитесь!',
      input_mode: 'verbatim'
    } }
  });
  const writes = result.temporal_results[0].combined_change_set.proposals
    .flatMap(({ write_set }) => [
      ...(write_set.appends ?? []), ...(write_set.inserts ?? []),
      ...(write_set.updates ?? [])
    ]);

  assert.equal(writes.some(({ target_table }) =>
    target_table === 'party_perception_records'), true);
  assert.equal(writes.some(({ target_table }) =>
    target_table === 'party_npc_knowledge_merge_states'), true);
  assert.equal(result.working_projection.npc_decision_signal_descriptors[0]
    .perceived_change_summary, 'Игрок произнёс: Эй, отзовитесь!');
  assert.deepEqual(result.consequence_fragment.visible_seed
    .turn_step_post_applied_perception_window, {
      kind: 'post_applied_perception_window', status: 'pending_npc_decision',
      observable_response_event_refs: [], pending_npc_decision_refs: ['npc-1']
    });
});

test('one event gives every co-located listener a distinct idempotency identity', async () => {
  const committed = await state();
  committed.npcs.push({ ...structuredClone(committed.npcs[0]),
    instance_id: 'npc-2' });
  committed.npc_schedule_runtime.push({
    ...structuredClone(committed.npc_schedule_runtime[0]), npc_id: 'npc-2' });
  committed.post_action_perception_sources.push({
    ...structuredClone(committed.post_action_perception_sources[0]),
    npc_id: 'npc-2' });
  committed.post_action_knowledge_states.push({
    ...structuredClone(committed.post_action_knowledge_states[0]),
    npc_id: 'npc-2' });
  const owner = createLowerDvinaTracePostAppliedActorStepOwner({
    committedState: committed, idempotencyKey: 'idem-multi',
    perceptionProfile: await perceptionPolicy()
  });

  const result = await owner({ working_projection: {},
    factual_events: [event()] });
  const identities = result.temporal_results[0].combined_change_set.proposals
    .flatMap(({ write_set: writes }) => writes.appends ?? [])
    .filter(({ target_table }) => target_table === 'party_perception_records')
    .map(({ record }) => record.idempotency_record_id);

  assert.deepEqual(identities.sort(), [
    'idem-multi:perception:event-1:npc-1',
    'idem-multi:perception:event-1:npc-2'
  ]);
  assert.deepEqual(result.consequence_fragment.visible_seed
    .turn_step_post_applied_perception_window.pending_npc_decision_refs,
  ['npc-1', 'npc-2']);
});

test('sleeping co-located NPC persists not-perceived without signal or knowledge', async () => {
  const owner = createLowerDvinaTracePostAppliedActorStepOwner({
    committedState: await state('sleeping'), idempotencyKey: 'idem-2',
    perceptionProfile: await perceptionPolicy()
  });
  const result = await owner({
    working_projection: {}, factual_events: [event()]
  });
  const proposal = result.temporal_results[0].combined_change_set.proposals[1];
  const perception = proposal.perception_reaction_result.perception_result;

  assert.equal(perception.result, 'not_perceived');
  assert.equal(result.working_projection.npc_decision_signal_descriptors,
    undefined);
  assert.equal(proposal.write_set.inserts.some(({ target_table }) =>
    target_table === 'party_npc_knowledge'), false);
  assert.equal(result.consequence_fragment.visible_seed
    .turn_step_post_applied_perception_window.status, 'completed');
});

test('visual event outside NPC position creates no perception or knowledge', async () => {
  const committed = await state();
  committed.post_action_perception_sources[0].current_position_node_id =
    'other-anchor';
  const owner = createLowerDvinaTracePostAppliedActorStepOwner({
    committedState: committed, idempotencyKey: 'idem-3',
    perceptionProfile: await perceptionPolicy()
  });

  const result = await owner({
    working_projection: {}, factual_events: [event('visual')]
  });
  const proposals = result.temporal_results[0].combined_change_set.proposals;

  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].write_set.inserts[0].target_table,
    'party_temporal_events');
  assert.equal(result.working_projection.npc_decision_signal_descriptors,
    undefined);
});

test('co-located NPC without committed acoustic context fails closed', async () => {
  const committed = await state();
  committed.post_action_perception_sources[0].g6_instance_id = null;
  const owner = createLowerDvinaTracePostAppliedActorStepOwner({
    committedState: committed, idempotencyKey: 'idem-4',
    perceptionProfile: await perceptionPolicy()
  });

  await assert.rejects(owner({
    working_projection: {}, factual_events: [event()]
  }), ({ code }) => code === 'TRACE_POST_ACTION_PERCEPTION_CONTEXT_GAP');
});
