import assert from 'node:assert/strict';
import test from 'node:test';
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
