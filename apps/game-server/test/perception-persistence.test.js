import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluatePerceptionCycle } from '@rus/perception';
import { activatePerceptionForParty, buildPerceptionPersistencePlan, writePerceptionCycle } from '../src/infrastructure/postgres/perception-persistence.js';

const digest = 'a'.repeat(64);
const event = { version: 1, schema: 'sensory_event_v1', event_id: 'e', party_id: 'p', turn_id: 't', wave_index: 0, modality: 'sound', source_kind: 'action', source_id: 'action', source_anchor_id: 'a', signal_profile_id: 'signal', causal_action_id: 'command', emitted_at: '1241-01-01T00:00:00.000Z', duration_ms: 1, base_strength_units: 10, directionality_profile_id: 'omni', semantic_class_id: 'noise', routine_context_tags: [], state_version: 2, profile_digest: digest };
const snapshot = { version: 1, schema: 'sensory_scene_snapshot_v1', party_id: 'p', g4_id: 'g4', state_version: 2, clock: {}, weather: { sound_loss_units: 0 }, light_state: { visibility_loss_units: 0 }, g5_nodes: [{ node_id: 'n' }], g5_anchors: [{ anchor_id: 'a', node_id: 'n' }], g5_edges: [], actor_positions: [], actor_attention_states: [], actor_perception_profile_refs: [], active_light_sources: [], ambient_sound_profiles: [], prospective_edge_states: [], snapshot_digest: digest };
const observer = { kind: 'npc', actor_id: 'npc', anchor_id: 'a', perception_profile: { profile_id: 'profile', hearing_threshold_units: 1, localization_margin_units: 1, classification_margin_units: 2, identification_margin_units: 3, speech_margin_units: 4 }, attention_state: {}, ambient_profile: { ambient_noise_floor_units: 0 }, reaction_context: { current_awareness_state: 'calm', routine_match: true, significance: 'high', reaction_policy_id: 'policy', policy: { transitions: { calm: { routine: 'calm', nonroutine: 'attentive', significant: 'suspicious' } } }, options: [] } };

test('maps only a code-owned, pinned perception cycle to party_runtime records', () => {
  const cycle = evaluatePerceptionCycle({ cycle_id: 'c', snapshot, events: [event], observers: [observer] });
  const plan = buildPerceptionPersistencePlan({ cycle, pins: { perception_algorithm_id: 'perception_v1', sensory_catalog_digest: digest, reaction_policy_digest: digest } });
  assert.deepEqual(plan.transaction.write_order, ['perception-cycle', 'perception-events', 'perception-results', 'perception-awareness']);
  assert.equal(plan.write_batches.find((batch) => batch.target_table === 'party_perception_results').records[0].margin_units, 9);
  assert.throws(() => buildPerceptionPersistencePlan({ cycle: structuredClone(cycle), pins: { perception_algorithm_id: 'perception_v1', sensory_catalog_digest: digest, reaction_policy_digest: digest } }), (error) => error.code === 'PERCEPTION_CYCLE_NOT_CODE_OWNED');
});

test('requires explicit party activation before persisting a perception cycle', async () => {
  const cycle = evaluatePerceptionCycle({ cycle_id: 'activation-cycle', snapshot, events: [event], observers: [observer] });
  const pins = { perception_algorithm_id: 'perception_v1', sensory_catalog_digest: digest, reaction_policy_digest: digest };
  const queries = [];
  const transaction = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.includes('party_perception_cycles')) return { rows: [] };
      if (sql.includes('FROM party_runtime.parties')) return { rows: [{ state_version: 2, party_id: 'p' }] };
      if (sql.includes('party_perception_pins')) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  await assert.rejects(
    () => writePerceptionCycle(transaction, { cycle, pins, errorFactory: (code, message) => Object.assign(new Error(message), { code }) }),
    (error) => error.code === 'PERCEPTION_NOT_ACTIVATED'
  );
  assert.equal(queries.some(({ sql }) => sql.includes('INSERT INTO party_runtime.party_perception_pins')), false);
});

test('activation is an explicit, idempotent operation', async () => {
  const pins = { perception_algorithm_id: 'perception_v1', sensory_catalog_digest: digest, reaction_policy_digest: digest };
  const queries = [];
  const transaction = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.includes('FROM party_runtime.parties')) return { rows: [{ party_id: 'p' }] };
      if (sql.includes('SELECT perception_algorithm_id')) return { rows: [] };
      if (sql.includes('INSERT INTO party_runtime.party_perception_pins')) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  assert.deepEqual(await activatePerceptionForParty(transaction, { partyId: 'p', pins }), { activated: true });
  assert.equal(queries.some(({ sql }) => sql.includes('INSERT INTO party_runtime.party_perception_pins')), true);
});
