import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { npcRoutineActivity } from '@rus/npc-runtime';
import { createLowerDvinaTraceN1ProductionResolverFactory, resolveNpcOrdinarySemanticParticipant } from
  '../src/runtime/releases/lower-dvina-trace-n1-production.js';
import { createLowerDvinaTraceTurnStepPlayerSafeProjector } from '../src/runtime/lower-dvina-trace-phase-2-player-safe.js';
import { applyBackgroundNpcSemanticPlan } from '../src/infrastructure/postgres/background-npc-semantic-atomic-write-plan.js';
import { loadLiveWorldAuthoredStartCatalog } from '../src/internal/live-world-authored-starts.js';

const root = new URL('../../../', import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, root)));
const data = read('data/world-catalogs/novgorod/live-world-runtime-v17/target-runtime-profiles-approved.json');
const runtimeRows = read('data/world-catalogs/novgorod/m2c-npc/canonical-initial/datasets/spatial_v3_npc_runtime_profiles.json');
const loadedProfile = { ...data.profiles.n1, participant_binding_kind: 'approved_source_binding', target_applicability: {
  world_revision_id: data.target.world_revision_id, applicability: data.applicability, n1_binding_basis: data.n1_binding_basis } };
const same = (a, b) => a.id === b.id && a.version === b.version;

test('historical authored N1 uses explicit persisted-profile admission while target remains source-bound', async () => {
  const historical = (await loadLiveWorldAuthoredStartCatalog()).ordinary_profiles.n1;
  assert.equal(historical.participant_binding_kind, 'persisted_profile_revision');
  const npc = { profile_level: 'background', profile_set_id: 'nov_occ_fisher', profile_revision: 1,
    machine_state: { schedule_state: 'working', current_activity: { activity_ref: 'fishing',
      status: 'active', summary: 'Чинит сети.', can_continue_automatically: true } },
    schedule_records: [{ schedule_profile_id: 'fishing', time_band: 'day', g5_node_id: 'camp' }] };
  assert.deepEqual(resolveNpcOrdinarySemanticParticipant({ npc, loadedProfile: historical }),
    { profile_id: 'nov_occ_fisher', revision: 1, current_activity: 'Чинит сети.' });
  for (const kind of [undefined, 'unknown', 'approved_source_binding']) {
    assert.equal(resolveNpcOrdinarySemanticParticipant({ npc,
      loadedProfile: { ...historical, participant_binding_kind: kind } }), null);
  }
  assert.equal(resolveNpcOrdinarySemanticParticipant({ npc: { ...npc,
    semantic_state: { source_binding: {} } }, loadedProfile: historical }), null);
});

test('target N1 resolves all twelve exact bindings to eight occupations and preserves formal state', async () => {
  const occupations = new Set();
  for (const basis of data.n1_binding_basis) {
    const input = fixture(basis);
    const participant = resolveNpcOrdinarySemanticParticipant({ npc: input.committed_state.npcs[0],
      loadedProfile, committedState: input.committed_state });
    assert.deepEqual(participant, { ...basis.participant_profile,
      current_activity: input.committed_state.npcs[0].machine_state.current_activity.summary });
    occupations.add(participant.profile_id);
    let calls = 0;
    const resolve = createLowerDvinaTraceN1ProductionResolverFactory({ loadedProfile,
      async resolveNpcOrdinarySemanticRemainder({ request }) {
        calls += 1;
        return { schema: 'npc_ordinary_semantic_remainder_proposal_v1', request_id: request.request_id,
          ordinary_descriptor: 'Человек занят своим делом.', ordinary_activity: null };
      } })({ partyId: 'party' });
    const result = await resolve(input);
    const snapshot = structuredClone(input.committed_state);
    applyBackgroundNpcSemanticPlan({ plan: result.background_npc_semantic_atomic_write_plan,
      state: input.committed_state, snapshot });
    assert.deepEqual(snapshot.npcs[0].semantic_state.source_binding, input.committed_state.npcs[0].semantic_state.source_binding);
    assert.deepEqual(snapshot.npcs[0].machine_state, input.committed_state.npcs[0].machine_state);
    assert.deepEqual(snapshot.npcs[0].identity_state, input.committed_state.npcs[0].identity_state);
    const replay = await resolve({ ...input, committed_state: snapshot });
    assert.equal(replay.background_npc_semantic_atomic_write_plan, undefined);
    assert.equal(calls, 1);
  }
  assert.equal(occupations.size, 8);
});

test('target N1 projection and execution both reject missing or mismatched approved basis and routine', async () => {
  const mutations = [
    (input) => { delete input.committed_state.npcs[0].semantic_state.source_binding; },
    (input) => { input.committed_state.npcs[0].semantic_state.source_binding.npc_binding_ref.version += 1; },
    (input) => { input.committed_state.npcs[0].semantic_state.source_binding.g4_ref.id = 'other'; },
    (input) => { input.committed_state.npcs[0].semantic_state.source_binding.regional_context_ref.id = 'other'; },
    (input) => { input.committed_state.npcs[0].semantic_state.regional_context.profile_ref.id = 'other'; },
    (input) => { delete input.committed_state.npcs[0].semantic_state.profile_revision; },
    (input) => { input.committed_state.npcs[0].occupation_ref.id = 'nov_occ_fisher'; },
    (input) => { input.committed_state.npcs[0].profile_level = 'scene'; },
    (input) => { input.committed_state.npc_schedule_runtime = []; },
    (input) => { input.committed_state.npc_schedule_runtime[0].status = 'inactive'; },
    (input) => { input.committed_state.npc_schedule_runtime[0].current_position_node_id = 'other'; },
    (input) => { input.committed_state.npcs[0].machine_state.current_activity.summary = 'invented'; }
  ];
  const project = createLowerDvinaTraceTurnStepPlayerSafeProjector({ npcSemanticRemainderProfile: loadedProfile,
    createTurnStepBackgroundNpcResolver() {},
    async playerSafeStateProjector(input) { return { player_safe_state: input.player_safe_state }; } });
  for (const mutate of [null, ...mutations]) {
    const input = fixture(data.n1_binding_basis[0]);
    if (mutate) mutate(input);
    const safe = structuredClone(input.request.player_safe_state);
    delete safe.background_npc_remainder;
    const projected = await project({ committed_state: input.committed_state, player_safe_state: safe });
    assert.equal(Boolean(projected.player_safe_state.background_npc_remainder), mutate == null);
    if (!mutate) continue;
    const resolve = createLowerDvinaTraceN1ProductionResolverFactory({ loadedProfile,
      async resolveNpcOrdinarySemanticRemainder() { assert.fail('ineligible NPC must not reach model'); } })({ partyId: 'party' });
    await assert.rejects(resolve(input), { code: 'TRACE_N1_SCOPE_INVALID' });
  }
});

test('target schema cannot enter legacy admission when applicability is absent or malformed', async () => {
  const input = fixture(data.n1_binding_basis[0]);
  const npc = input.committed_state.npcs[0];
  npc.profile_set_id = data.n1_binding_basis[0].participant_profile.profile_id;
  npc.profile_revision = 1;
  delete npc.semantic_state.source_binding;
  npc.machine_state.schedule_state = 'working';
  npc.schedule_records = [{ time_band: 'day', g5_node_id: 'g5',
    schedule_profile_id: npc.machine_state.current_activity.activity_ref }];
  for (const target of [undefined, null, {}, { ...loadedProfile.target_applicability, applicability: [] },
    { ...loadedProfile.target_applicability, n1_binding_basis: [{}] },
    { ...loadedProfile.target_applicability, world_revision_id: '' }]) {
    const malformed = { ...loadedProfile, target_applicability: target };
    assert.equal(resolveNpcOrdinarySemanticParticipant({ npc, loadedProfile: malformed, committedState: input.committed_state }), null);
    const resolve = createLowerDvinaTraceN1ProductionResolverFactory({ loadedProfile: malformed,
      async resolveNpcOrdinarySemanticRemainder() { assert.fail('target mapping cannot fall back'); } })({ partyId: 'party' });
    await assert.rejects(resolve(input), { code: 'TRACE_N1_SCOPE_INVALID' });
    const project = createLowerDvinaTraceTurnStepPlayerSafeProjector({ npcSemanticRemainderProfile: malformed,
      createTurnStepBackgroundNpcResolver() {},
      async playerSafeStateProjector(value) { return { player_safe_state: value.player_safe_state }; } });
    const safe = structuredClone(input.request.player_safe_state);
    delete safe.background_npc_remainder;
    assert.equal((await project({ committed_state: input.committed_state, player_safe_state: safe }))
      .player_safe_state.background_npc_remainder, undefined);
  }
});

function fixture(basis) {
  const scope = data.applicability.find((row) => row.eligible_npc_binding_refs.some((ref) => same(ref, basis.binding_ref)));
  const profile = runtimeRows.find((row) => same(row, basis.binding_ref)).payload;
  const routine = runtimeRows.find((row) => same(row, profile.routine_profile_ref)).payload;
  const activity = runtimeRows.find((row) => same(row, profile.activity_profile_ref)).payload;
  const state = { schema: 'npc_routine_state_v1', status: 'active', profile: routine, phase_index: 0,
    work_activity: { activity_ref: activity.payload.activity_profile_id, summary: profile.observable_activity.value } };
  const source = { world_revision_id: data.target.world_revision_id, g4_ref: scope.g4_ref,
    npc_composition_ref: scope.npc_composition_ref, npc_binding_ref: basis.binding_ref,
    regional_context_ref: basis.regional_context_refs[0],
    ...(scope.canonical_g5_ref ? { canonical_g5_ref: scope.canonical_g5_ref } : { generation_template_ref: scope.generation_template_ref }) };
  const npc = { npc_id: 'npc', profile_set_id: basis.binding_ref.id, profile_level: 'background', position_id: 'position',
    role_ref: { id: basis.role_ref }, occupation_ref: { id: basis.participant_profile.profile_id }, identity_state: {},
    machine_state: { current_activity: npcRoutineActivity(state) },
    semantic_state: { source_binding: source, profile_revision: basis.binding_ref.version,
      regional_context: { profile_ref: basis.regional_context_refs[0], language_status: 'unknown', language_repertoire: null },
      location_profile_ref: scope.npc_composition_ref.id, participant_slot_ref: 'slot', zone_ref: 'focus' } };
  return structuredClone({ schema: 'turn_step_background_npc_remainder_request_v1',
    operation: { op: 'request_discovery', discovery_kind: 'inspect', actor_ref: 'player', target_refs: ['npc'] },
    actor: { actor_id: 'player' }, request: { request_id: 'request', root_turn_id: 'turn', step_index: 1,
      committed_state_version: 1, player_safe_state: { background_npc_remainder: { eligible_npc_refs: ['npc'] },
        current_visible_context: { visible_npc: [{ entity_ref: { entity_kind: 'npc', entity_id: 'npc' }, display_label: 'Человек' }] } } },
    working_projection: {}, committed_state: { party_id: 'party', party_state: { party_id: 'party', state_version: 1, turn_number: 1 },
      npcs: [npc], npc_schedule_runtime: [{ npc_id: 'npc', status: 'active', current_position_node_id: 'position',
        schedule_profile_ref: { entity_ref: { entity_id: routine.profile_id }, authoring_version: String(routine.revision) },
        causal_state_ref: { routine_state: state } }] } });
}
