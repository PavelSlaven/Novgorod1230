import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceN1ProductionResolverFactory } from
  '../src/runtime/releases/lower-dvina-trace-n1-production.js';
import { applyBackgroundNpcSemanticPlan } from
  '../src/infrastructure/postgres/background-npc-semantic-atomic-write-plan.js';

const loadedProfile = { schema: 'rus.lower_dvina_trace_n1_loaded_profile.v1',
  profile: { status: 'approved', profile_id: 'n1', revision: 1,
    eligible_participant_profiles: [{ profile_id: 'fisher', revision: 2 }] } };

test('N1 grounds one existing visible background NPC and replays without model', async () => {
  let calls = 0;
  const factory = createLowerDvinaTraceN1ProductionResolverFactory({
    loadedProfile, roleRunner: {},
    async resolveNpcOrdinarySemanticRemainder({ request }) {
      calls += 1;
      assert.equal(Object.hasOwn(request, 'formal_facets'), false);
      assert.equal(JSON.stringify(request).includes('occupation_ref'), false);
      return { schema: 'npc_ordinary_semantic_remainder_proposal_v1',
        request_id: request.request_id,
        ordinary_descriptor: 'Коренастый мужчина в мокрой рубахе.',
        ordinary_activity: 'Он перебирает край сети.' };
    }
  });
  const resolve = factory({ partyId: 'party:1',
    applyWorkingProjection: (value) => value });
  const input = requestInput();
  const first = await resolve(input);
  assert.equal(calls, 1);
  assert.equal(first.background_npc_semantic_atomic_write_plan.npc_ref, 'npc:1');
  assert.deepEqual(first.working_projection.current_visible_context.visible_npc[0]
    .observable_cues.ordinary_remainder, {
      ordinary_descriptor: 'Коренастый мужчина в мокрой рубахе.',
      ordinary_activity: 'Он перебирает край сети.'
    });
  const snapshot = structuredClone(input.committed_state);
  const write = applyBackgroundNpcSemanticPlan({
    plan: first.background_npc_semantic_atomic_write_plan,
    state: input.committed_state, snapshot
  });
  assert.equal(write.target_table, 'party_npcs');
  assert.deepEqual(snapshot.npcs[0].semantic_state.n1_remainder,
    first.background_npc_semantic_atomic_write_plan.remainder);
  assert.throws(() => applyBackgroundNpcSemanticPlan({
    plan: first.background_npc_semantic_atomic_write_plan,
    state: snapshot, snapshot: structuredClone(snapshot)
  }), { code: 'BACKGROUND_NPC_SEMANTIC_PLAN_INVALID' });
  const committed = structuredClone(input);
  committed.committed_state.npcs[0].semantic_state.n1_remainder =
    first.background_npc_semantic_atomic_write_plan.remainder;
  const replay = await resolve(committed);
  assert.equal(calls, 1);
  assert.equal(replay.background_npc_semantic_atomic_write_plan, undefined);
});

function requestInput() {
  const visibleNpc = { entity_ref: { entity_kind: 'npc', entity_id: 'npc:1' },
    display_label: 'рыбак', recognition: 'unrecognized' };
  return {
    schema: 'turn_step_background_npc_remainder_request_v1',
    operation: { op: 'request_discovery', discovery_kind: 'inspect',
      actor_ref: 'actor:1', target_refs: ['npc:1'], query: 'присмотреться' },
    actor: { actor_id: 'actor:1' },
    request: { request_id: 'req:1', root_turn_id: 'turn:1', step_index: 1,
      committed_state_version: 4,
      player_safe_state: { background_npc_remainder: {
        semantic_grounding_available: true, eligible_npc_refs: ['npc:1'] },
      current_visible_context: { schema: 'player_visible_context_v1', version: 1,
        visible_scene: 'Берег.', visible_changes: [], sensory_details: ['Сети сохнут.'],
        visible_npc: [visibleNpc], visible_objects: [], known_context: [],
        uncertainties: [] } } },
    working_projection: {},
    committed_state: { party_id: 'party:1', actor_id: 'actor:1',
      party_state: { state_version: 4, turn_number: 2 },
      position: { location_ref: 'shore' },
      npcs: [{ npc_id: 'npc:1', profile_set_id: 'fisher',
        profile_level: 'background', anchor_id: 'anchor:1',
        role_ref: 'fisher', occupation_ref: 'fishing', identity_state: {},
        machine_state: {}, semantic_state: { profile_revision: 2,
          participant_slot_ref: 'slot:1', location_profile_ref: 'shore',
          zone_ref: 'water' } }] }
  };
}
