import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLowerDvinaTracePhase6Commit } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-6-commit.js';
import { successEnvelope } from '../src/http/contracts.js';
import { phase3CommittedNpcUtterances } from
  '../src/runtime/lower-dvina-trace-npc-utterances.js';
import { planTracePhase6SynchronizedCarry, contracts as phase6Contracts,
  state as phase6State } from './lower-dvina-trace-phase-6-fixtures.js';
import { phase7Command, phase7CommittedState, phase7PlayerInput,
  persistPhase7Consequence } from './lower-dvina-trace-phase-7-runtime-fixture.js';
import { approvedPhase7Contracts, phase7DirectPlan } from
  './lower-dvina-trace-phase-7-contract-fixture.js';
import { createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory } from
  '../src/runtime/lower-dvina-trace-npc-actor-step-owner-capabilities.js';
import { createLowerDvinaTraceNpcActorStepModeOwnerCapabilities } from
  '../src/runtime/lower-dvina-trace-npc-actor-step-mode-handoffs.js';
import { runLowerDvinaTraceNpcConversationExchange } from
  '../src/runtime/lower-dvina-trace-npc-initiated-conversation.js';

const digest = 'a'.repeat(64);
const oldSpeech = [{ speaker_ref: { entity_kind: 'npc', entity_id: 'npc-old' },
  utterance_text: 'Старая реплика.', provenance: { source: 'phase3_statement_receipt',
    player_receipt: 'full', precommit_service_marker_check: true,
    statement_ref: { entity_kind: 'conversation_statement', entity_id: 'old' },
    listener_ref: { entity_kind: 'player_character', entity_id: 'mikula' },
    receipt_utterance_text: 'Старая реплика.' } }];

test('Phase 6 committed pending screen drops prior-turn NPC speech', async () => {
  const state = phase6State();
  Object.assign(state.party_state, { session_state_version: 1,
    clock_state_version: 1, body_state_version: 1 });
  state.opening_identity = { opening_screen_digest: 'opening-digest' };
  state.world_identity = { world_revision_id: 'world-revision',
    world_catalog_digest: 'world-digest' };
  state.clock_weather_light = { clock: structuredClone(state.clock) };
  state.last_turn = { exact_npc_utterances: structuredClone(oldSpeech) };
  const intent = planTracePhase6SynchronizedCarry({ state,
    contracts: phase6Contracts, inputDigest: digest,
    commandIdempotencyKey: 'pending-screen-phase6' });
  const factual = phase6FactualTurn(state, intent);
  const committed = await buildLowerDvinaTracePhase6Commit({
    partyId: state.party_id, factual, state, inputDigest: digest,
    visibleContext: { visible_scene: 'Перенос завершён.', visible_changes: [],
      sensory_details: [], visible_npc: [], visible_objects: [],
      known_context: [], uncertainties: [] }, phase6Contracts
  });
  const screen = screenFromPlan(committed.plan);
  const snapshot = snapshotFromPlan(committed.plan);
  assert.equal(screen.turn_id, factual.mode_resolution.turn_id);
  assertPendingAnchor({ screen, snapshot });
  assert.equal(Object.hasOwn(snapshot.last_turn, 'exact_npc_utterances'), false);
  assert.equal(Object.hasOwn(screen, 'exact_npc_utterances'), false);
  assert.equal(Object.hasOwn(publicScreen(screen), 'exact_npc_utterances'), false);
});

test('Phase 7 committed pending screen drops prior-turn NPC speech', async () => {
  const state = phase7CommittedState();
  state.last_turn = { exact_npc_utterances: structuredClone(oldSpeech) };
  const contracts = approvedPhase7Contracts(state);
  const consequence = await phase7Command({ state, contracts,
    model: async (request) => phase7DirectPlan(request, 'move_bag')
  }).consequence({ retrievedState: state,
    playerInput: phase7PlayerInput(state, 'pending-screen-no-speech') });
  const committed = await persistPhase7Consequence({ state, contracts,
    consequence });
  const screen = screenFromPlan(committed.plan);
  assertPendingAnchor({ screen, snapshot: committed.snapshot });
  assert.deepEqual(committed.snapshot.last_turn.exact_npc_utterances ?? [], []);
  assert.equal(Object.hasOwn(screen, 'exact_npc_utterances'), false);
  assert.equal(Object.hasOwn(publicScreen(screen), 'exact_npc_utterances'), false);
});

test('Phase 7 pending screen keeps only current fully received NPC speech', async () => {
  const state = phase7CommittedState();
  state.last_turn = { exact_npc_utterances: structuredClone(oldSpeech) };
  const speaker = state.npcs.find(({ instance_id }) => instance_id === 'zhdanko-1');
  speaker.identity_state = { canonical_name: 'Жданко' };
  speaker.anchor_id = state.position.g5_anchor_id;
  speaker.knowledge_profile_snapshot = {};
  speaker.knowledge_records = [];
  speaker.semantic_state = {};
  speaker.perception_snapshot = { present_actors: [{ actor_ref: 'mikula',
    source_event_ref: { entity_kind: 'event', entity_id: 'seen:player' } }] };
  speaker.machine_state = { ...speaker.machine_state, speech_capability: 'full' };
  const contracts = approvedPhase7Contracts(state);
  contracts.npcSemanticProfile = { profile_id:
    'lower_dvina_trace_npc_actor_step_profile_v1', revision: 1,
  status: 'approved', activation_boundary: { phase: 'phase_7',
    npc_participant_slot_ref: 'zhdanko_storehouse_controller' } };
  const conversationBindings = { fallback_policy: 'forbidden',
    legacy_bounded_production_path: 'forbidden', max_contributions_per_exchange: 8 };
  const conversationActivity = { profile_id: 'approved-talk', duration_minutes: 5 };
  const factory = createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory({
    createModeOwnerCapabilities: createLowerDvinaTraceNpcActorStepModeOwnerCapabilities
  });
  const consequence = await phase7Command({ state, contracts,
    conversationBindings, conversationActivity,
    createBoundaryNpcOwnerCapabilities: (boundary) => factory({
      partyId: state.party_id, requestId: 'pending-heard', inputDigest: digest,
      phase7Contracts: contracts, ...boundary }),
    runNpcConversationExchange: (input) =>
      runLowerDvinaTraceNpcConversationExchange({ ...input,
        npcSemanticModel: async (request) => speechPlan(request),
        revalidateStateVersion: async () => 7,
        temporalAdvanceOwner: conversationTemporalOwner() }),
    model: async (request) => {
      const plan = phase7DirectPlan(request);
      plan.resolution = 'domain_request';
      plan.activity = { owner: 'domain', duration_class: null, effort: null };
      plan.operations = [{ op: 'request_conversation', actor_ref: request.npc_ref,
        target_actor_refs: ['mikula'], conversation_goal: 'узнать новости' }];
      return plan;
    }
  }).consequence({ retrievedState: state,
    playerInput: phase7PlayerInput(state, 'pending-heard') });
  const semantic = consequence.phase7.actor_step_owner_outputs.consequence_fragment
    .state_changes[0].mode_handoff.result;
  const expected = phase3CommittedNpcUtterances(semantic);
  assert.equal(expected.length, 1);
  const withoutFullReceipt = structuredClone(semantic);
  withoutFullReceipt.audiences[0].received_messages = [];
  assert.deepEqual(phase3CommittedNpcUtterances(withoutFullReceipt), []);

  const committed = await persistPhase7Consequence({ state, contracts,
    consequence });
  const screen = screenFromPlan(committed.plan);
  assert.equal(speechPlanText, expected[0].utterance_text);
  assert.deepEqual(committed.snapshot.last_turn.exact_npc_utterances, expected);
  assertPendingAnchor({ screen, snapshot: committed.snapshot });
  assert.deepEqual(screen.exact_npc_utterances, expected);
  assert.equal(screen.exact_npc_utterances.some(({ utterance_text }) =>
    utterance_text === oldSpeech[0].utterance_text), false);
  const published = publicScreen(screen);
  assert.deepEqual(published.exact_npc_utterances.map(({ speaker_ref,
    utterance_text }) => ({ speaker_ref, utterance_text })), expected.map(({
    speaker_ref, utterance_text }) => ({ speaker_ref, utterance_text })));
  for (const leaf of published.exact_npc_utterances) {
    assert.deepEqual(Object.keys(leaf).sort(), ['speaker_ref', 'utterance_text']);
  }
  assert.equal(published.exact_npc_utterances.some(({ utterance_text }) =>
    utterance_text === oldSpeech[0].utterance_text), false);
});

const speechPlanText = 'Путь пока свободен.';

function screenFromPlan(plan) {
  return [...plan.inserts, ...plan.updates, ...plan.appends]
    .find(({ target_table }) => target_table === 'party_server_sessions')
    ?.record?.screen;
}

function snapshotFromPlan(plan) {
  return [...plan.inserts, ...plan.updates, ...plan.appends]
    .find(({ target_table }) => target_table === 'party_state_snapshots')
    ?.record?.state_payload;
}

function assertPendingAnchor({ screen, snapshot }) {
  assert.equal(screen.turn_number, snapshot.party_state.turn_number);
  assert.equal(screen.current_projection_anchor.committed_state_version,
    snapshot.party_state.state_version);
  assert.equal(screen.current_projection_anchor.package_id,
    snapshot.last_turn.visible_package.package_id);
  assert.equal(screen.current_projection_anchor.package_digest,
    snapshot.last_turn.visible_package.package_digest);
}

function publicScreen(screen) {
  return successEnvelope({ screen }).data.screen;
}

function phase6FactualTurn(state, intent) {
  const traversal = intent.traversal;
  return { player_input: { party_id: state.party_id,
    request_id: 'pending-screen-phase6-request',
    idempotency_key: 'pending-screen-phase6',
    raw_text: 'Сделать носилки и отнести Онисима в стан' },
  mode_resolution: { option_id: 'make_stretcher_and_carry_onisim_to_camp',
    turn_id: 'phase6-new-turn', decision_trace: {
      state_version: state.party_state.state_version, action_set_digest: 'action-set' } },
  consequence: { phase6_kind: 'synchronized_carry', carry: { intent, traversal } },
  time_update: { clock_before: traversal.clock_before,
    clock_after: traversal.clock_update.world_time_after,
    exact_elapsed: { exact_minutes: intent.exact_elapsed } },
  body_update: { applied: false, proposal: null,
    state_after: structuredClone(state.body_state) } };
}

function speechPlan(request) {
  return { schema: 'conversation_contribution_plan_v1', request_id: request.request_id,
    boundary_id: request.boundary_id, conversation_id: request.conversation_id,
    exchange_id: request.exchange_id, state_version: request.state_version,
    speaker_ref: request.npc_ref, contribution_kind: 'speech',
    primary_addressee_ref: { entity_kind: 'player_character', entity_id: 'mikula' },
    intended_addressee_refs: [{ entity_kind: 'player_character', entity_id: 'mikula' }],
    affected_actor_refs: [], speech: { utterance_text: 'Путь пока свободен.',
      dominant_act: 'answer', interaction_tags: [], topic_refs: [], claims: [],
      response_expectation: { kind: 'none', target_refs: [] } },
    interpretation: { intent: 'ответить', grounded_contribution: 'ответ',
      adaptation: 'literal' }, resolution: 'automatic',
    activity: { duration_class: 'domain_owned', effort: 'none' },
    supporting_operations: [], check: null, handoff: null, reason: 'Нужен ответ.' };
}

function conversationTemporalOwner() {
  return { advance({ request }) { return { result: {
    clock_after: request.inclusive_limit_timestamp,
    trace: { processed_boundary_ids: [], stopped_after_current_batch: false } },
  state_projection: { ...request.relevant_state_projection,
    conversation_state: request.relevant_state_projection.conversation_state } }; } };
}
