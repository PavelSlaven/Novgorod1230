import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTracePhase3Contracts } from
  '../src/runtime/lower-dvina-trace-phase-3-contracts.js';
import { runLowerDvinaTraceNpcConversationExchange } from
  '../src/runtime/lower-dvina-trace-npc-initiated-conversation.js';
import { phase7CommittedState } from
  './lower-dvina-trace-phase-7-runtime-fixture.js';
import {
  checkResult,
  digest,
  npcSpeechPlan,
  phase3State,
  revision14Bundle,
  runPhase3,
  withAccessibleBlueWool
} from './lower-dvina-trace-m2-conversation-fixture.js';

const relationship = (actorRef) => ({
  relationship_ref: 'eremey-player', actor_ref: actorRef,
  relation: 'stranger', status: 'wary'
});

const greeting = (plan) => {
  plan.speech.interaction_tags = ['greeting'];
  return plan;
};

function eremeyState() {
  const state = phase3State();
  const initial = resolveTracePhase3Contracts({
    state, bundle: revision14Bundle
  });
  const actor = state.npcs.find(({ instance_id: id }) =>
    id === initial.actors[0].instance_id);
  assert.ok(actor);
  return { state, actor };
}

test('saved relationship reaches the NPC request without evidence', async () => {
  const { state, actor } = eremeyState();
  actor.relationships = [relationship(state.actor_id)];
  const contracts = resolveTracePhase3Contracts({
    state, bundle: revision14Bundle
  });
  const { npcRequest: request } = await runPhase3({
    state, contracts, rawText: 'Здравствуйте. Что вы знаете об Онисиме?',
    inputDigest: digest('a'), responseKind: 'withhold',
    transformPlayerPlan: greeting,
    targetActorId: actor.instance_id
  });

  assert.deepEqual(request.npc.relationships, [relationship(state.actor_id)]);
  assert.deepEqual(request.social_context.npc_behavior,
    { required_interaction_tag: 'withhold' });
});

test('presented evidence does not replace the saved relationship', async () => {
  const { state, actor } = eremeyState();
  actor.relationships = [relationship(state.actor_id)];
  const contracts = resolveTracePhase3Contracts({
    state, bundle: revision14Bundle
  });
  withAccessibleBlueWool(state, contracts);
  const { npcRequest: request } = await runPhase3({
    state, contracts, rawText: 'Вот синяя шерсть с берега. Что ты знаешь?',
    inputDigest: digest('4'), responseKind: 'route_disclosure',
    checkResult: checkResult(contracts.check.check_id, 'success'),
    playerPlanOptions: { evidence: true }, targetActorId: actor.instance_id
  });

  assert.deepEqual(request.npc.relationships, [relationship(state.actor_id)]);
  assert.equal(Object.hasOwn(request.social_context, 'npc_behavior'), false);
  assert.ok(request.social_context.presented_evidence_ref);
});

test('saved goal reaches the NPC request without policy substitution', async () => {
  const { state, actor } = eremeyState();
  actor.goals = [{ goal_ref: 'own-goal', summary: 'своя цель' }];
  const contracts = resolveTracePhase3Contracts({
    state, bundle: revision14Bundle
  });
  const { npcRequest: request } = await runPhase3({
    state, contracts, rawText: 'Здравствуйте. Что вы знаете об Онисиме?',
    inputDigest: digest('c'), responseKind: 'withhold',
    transformPlayerPlan: greeting,
    targetActorId: actor.instance_id
  });

  assert.deepEqual(request.npc.goals, actor.goals);
  assert.deepEqual(request.npc.fears, []);
});

test('NPC initiated conversation projects saved relationships', async () => {
  const state = phase7CommittedState();
  const npc = state.npcs.find(({ instance_id: id }) => id === 'zhdanko-1');
  assert.ok(npc);
  Object.assign(npc, {
    identity_state: { canonical_name: 'Жданко' },
    ref: { entity_kind: 'npc', entity_id: npc.instance_id },
    location_profile_ref: state.position.location_ref,
    anchor_id: state.position.g5_anchor_id,
    knowledge_profile_snapshot: {}, knowledge_records: [], semantic_state: {},
    perception_snapshot: { present_actors: [{ actor_ref: state.actor_id,
      source_event_ref: { entity_kind: 'event', entity_id: 'seen:player' } }] },
    machine_state: { ...npc.machine_state, speech_capability: 'full' },
    relationships: [relationship(state.actor_id)]
  });
  let requestSeen = null;
  await runLowerDvinaTraceNpcConversationExchange({
    state, npc, actor_step_request: { request_id: 'saved-relationship' },
    operation: { op: 'request_conversation',
      target_actor_refs: [state.actor_id], conversation_goal: 'узнать новости' },
    conversation_bindings: { fallback_policy: 'forbidden',
      legacy_bounded_production_path: 'forbidden',
      max_contributions_per_exchange: 8 },
    conversation_activity: { profile_id: 'approved-talk', duration_minutes: 5 },
    temporalAdvanceOwner: { advance({ request }) {
      return { result: { clock_after: request.inclusive_limit_timestamp,
        trace: { processed_boundary_ids: [],
          stopped_after_current_batch: false } },
      state_projection: { ...request.relevant_state_projection,
        conversation_state: request.relevant_state_projection
          .conversation_state } };
    } },
    revalidateStateVersion: async () => state.party_state.state_version,
    npcSemanticModel: async (request) => {
      requestSeen = request;
      const playerRef = { entity_kind: 'player_character',
        entity_id: state.actor_id };
      return { ...npcSpeechPlan(request, { utteranceText: 'Всё ли спокойно?',
        dominantAct: 'question' }), primary_addressee_ref: playerRef,
      intended_addressee_refs: [playerRef] };
    }
  });

  assert.ok(requestSeen);
  assert.deepEqual(requestSeen.npc.relationships, [relationship(state.actor_id)]);
});
