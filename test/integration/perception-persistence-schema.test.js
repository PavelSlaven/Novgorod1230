import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('world_base declares normalized approved perception profiles and G5/NPC bindings', async () => {
  const ddl = await readFile('infra/world-base/schema/13.sql', 'utf8');
  for (const table of [
    'sensory_signal_profiles', 'sensory_transition_profiles', 'ambient_sound_profiles',
    'light_visibility_profiles', 'actor_perception_profiles', 'routine_sound_profiles',
    'npc_reaction_policies', 'npc_reaction_policy_options',
    'g5_edge_sensory_transition_bindings', 'region_npc_perception_profile_bindings'
  ]) assert.match(ddl, new RegExp(`CREATE TABLE world_base\\.${table}\\s*\\(`));
  assert.match(ddl, /status TEXT NOT NULL DEFAULT 'draft'/);
  assert.match(ddl, /REFERENCES world_base\.g5_edge_templates\(id\)/);
  assert.match(ddl, /REFERENCES world_base\.region_npc_profile_sets\(id\)/);
});

test('party runtime persists perception pins, events, results, awareness and stimulus memory', async () => {
  const ddl = await readFile('schemas/party-db/001_party_runtime.sql', 'utf8');
  for (const table of [
    'party_perception_pins', 'party_sensory_events', 'party_perception_cycles',
    'party_perception_results', 'party_actor_attention_states',
    'party_npc_awareness_states', 'party_stimulus_memory', 'party_npc_reaction_decisions'
  ]) assert.match(ddl, new RegExp(`CREATE TABLE IF NOT EXISTS party_runtime\\.${table}\\s*\\(`));
  assert.match(ddl, /FOREIGN KEY \(party_id, event_id\) REFERENCES party_runtime\.party_sensory_events/);
  assert.match(ddl, /parent_event_id TEXT/);
  assert.match(ddl, /causal_reaction_id TEXT/);
  assert.match(ddl, /UNIQUE \(party_id, idempotency_key\)/);
});
