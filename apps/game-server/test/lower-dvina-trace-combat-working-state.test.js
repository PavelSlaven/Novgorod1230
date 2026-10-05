import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { initializeBodyState } from '@rus/body-state';
import { loadApprovedMaterializedNpcBodyInitializationProfile } from
  '../src/runtime/combat-min-data.js';
import { projectTraceCombatWorkingState } from
  '../src/runtime/lower-dvina-trace-combat-working-state.js';

const profile = { schema: 'rus.body_state.initialization_profile.v1',
  status: 'approved', profile_ref: { entity_ref: {
    entity_kind: 'body_state_profile', entity_id: 'npc:one' },
  authoring_version: 'v1' },
  initial_state: { health: 72, energy: 48, satiety: 61 } };
const session = { participant_refs: [
  { entity_kind: 'player_character', entity_id: 'player' },
  { entity_kind: 'npc', entity_id: 'npc:one' }
] };
const state = (npcs) => ({ actor_id: 'player', body_state: { health: 90 },
  npcs: npcs.map((npc) => ({ instance_id: npc.instance_id,
    machine_state: { body_condition: { health: 100 } }, ...npc })) });

test('approved DTO is mechanically derived from the pinned source bytes', async () => {
  const source = await readFile(new URL('../../../data/world-catalogs/novgorod/live-world-runtime-v17/combat-min-data-v1/body-init-profile-source.json', import.meta.url));
  assert.equal(createHash('sha256').update(source).digest('hex'),
    '208672c3b1faa36def01470e81dd517cc3417eec1c87f850ece8b321c2f361bf');
  const profile = await loadApprovedMaterializedNpcBodyInitializationProfile();
  assert.deepEqual(Object.keys(profile).sort(), [
    'initial_state', 'profile_ref', 'schema', 'status'
  ]);
  const initialized = initializeBodyState({ body_state_profile: profile });
  assert.equal(initialized.ok, true);
  assert.deepEqual(initialized.body_state,
    { health: 100, satiety: 70, energy: 80 });
  assert.deepEqual(initialized.profile_ref, profile.profile_ref);
  assert.equal(JSON.stringify(profile).includes('calibration'), false);
});

test('body initialization loader rejects source bytes with a SHA mismatch', async () => {
  const source = await readFile(new URL('../../../data/world-catalogs/novgorod/live-world-runtime-v17/combat-min-data-v1/body-init-profile-source.json', import.meta.url));
  await assert.rejects(loadApprovedMaterializedNpcBodyInitializationProfile({
    readFileImpl: async () => Buffer.concat([source, Buffer.from('\n')])
  }), { code: 'combat_actor_body_state_profile_gap' });
});

test('combat working state initializes only participating NPC with explicit profile', () => {
  const working = projectTraceCombatWorkingState(state([
    { instance_id: 'npc:one', body_state_profile: profile },
    { instance_id: 'npc:other' }
  ]), session);
  assert.deepEqual(working.actor_states['npc:npc:one'].body_state, {
    health: 72, energy: 48, satiety: 61, active_conditions: [],
    body_parts: {}, prose: null
  });
  assert.equal(working.actor_states['npc:npc:other'], undefined);
  assert.deepEqual(working.npcs[0].body_profile_ref, profile.profile_ref);
  assert.equal(working.npcs[0].machine_state.body_condition.health, 100);
});

test('combat working state uses persisted body row and ignores machine health', () => {
  const working = projectTraceCombatWorkingState(state([{
    instance_id: 'npc:one', body_state_persisted: true,
    body_state: { health: 42, energy: 30, satiety: 20 },
    body_profile_ref: { id: 'persisted:body' }
  }]), session);
  assert.deepEqual(working.actor_states['npc:npc:one'].body_state,
    { health: 42, energy: 30, satiety: 20 });
  assert.equal(working.npcs[0].machine_state.body_condition.health, 100);
});

test('participating NPC without persisted body or profile fails with NPC-scoped gap', () => {
  assert.throws(() => projectTraceCombatWorkingState(state([
    { instance_id: 'npc:one' }
  ]), session), (error) => error.code === 'body_state_profile_gap'
    && error.details.actor_ref.entity_id === 'npc:one');
});

test('an approved materialization body profile that differs from the default is a typed gap', () => {
  const sourceProfile = { schema: 'rus.body_state.profile.v1', status: 'approved',
    values: { health: 99, energy: 80, satiety: 70 },
    condition_bindings: [] };
  assert.throws(() => projectTraceCombatWorkingState(state([{
    instance_id: 'npc:one', body_state_profile: sourceProfile,
    body_state_initialization_profile: profile
  }]), session), (error) => error.code
    === 'combat_actor_body_state_profile_conflict');
  const conditionProfile = { ...sourceProfile,
    values: { health: 100, energy: 80, satiety: 70 },
    condition_bindings: [{ condition_id: 'condition:1' }] };
  assert.throws(() => projectTraceCombatWorkingState(state([{
    instance_id: 'npc:one', body_state_profile: conditionProfile,
    body_state_initialization_profile: profile
  }]), session), (error) => error.code
    === 'combat_actor_body_state_profile_conflict');
});

test('approved body profile is compared with DTO values, not duplicated defaults', () => {
  const matchingProfile = { schema: 'rus.body_state.profile.v1', status: 'approved',
    values: { health: 72, energy: 48, satiety: 61 }, condition_bindings: [] };
  const working = projectTraceCombatWorkingState(state([{
    instance_id: 'npc:one', body_state_profile: matchingProfile,
    body_state_initialization_profile: profile
  }]), session);
  assert.equal(working.actor_states['npc:npc:one'].body_state.health, 72);

  const explicitInitialization = { ...profile,
    initial_state: { ...profile.initial_state, health: 71 } };
  assert.throws(() => projectTraceCombatWorkingState(state([{
    instance_id: 'npc:one', body_state_profile: explicitInitialization,
    body_state_initialization_profile: profile
  }]), session), (error) => error.code
    === 'combat_actor_body_state_profile_conflict');
});

test('left NPC participant remains in history but is not required in exchange state', () => {
  const departed = { entity_kind: 'npc', entity_id: 'npc:one' };
  const sessionAfterExit = { participant_refs: [departed], participant_states: [{
    actor_ref: departed, combat_status: 'left', current_intent: null,
    next_action_boundary_ref: null
  }] };
  const working = projectTraceCombatWorkingState(state([]), sessionAfterExit);
  assert.deepEqual(working.actor_states, {
    'player_character:player': { body_state: { health: 90 } }
  });
});
