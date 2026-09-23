import assert from 'node:assert/strict';
import { loadTargetRuntimeProfiles } from '../../apps/game-server/src/internal/target-runtime-profiles.js';
import { loadTracePhase2TemporalSourceProof } from '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2-temporal-state.js';
import { resolveNpcOrdinarySemanticParticipant } from '../../apps/game-server/src/runtime/releases/lower-dvina-trace-n1-production.js';

/** Verify actual committed bindings and Stage24 schedules; this does not disclose NPCs to a player. */
export async function assertTargetNpcSemanticReadback({ pool, partyId, expectedNpcs }) {
  const { rows } = await pool.query(`SELECT n.npc_id,n.profile_set_id,n.profile_level,
    n.semantic_state,n.machine_state,n.identity_state,b.role_ref,b.occupation_ref,p.position_node_id AS position_id
    FROM party_runtime.party_npcs n
    JOIN party_runtime.party_actor_profile_bindings b ON b.party_id=n.party_id AND b.actor_kind='npc' AND b.actor_id=n.npc_id
    JOIN party_runtime.entity_placements p ON p.party_id=n.party_id AND p.entity_kind='npc'
      AND p.entity_id=n.npc_id AND p.placement_kind='scene_position'
    WHERE n.party_id=$1 ORDER BY n.npc_id`, [partyId]);
  assert.equal(rows.length, expectedNpcs.length);
  assert.ok(rows.length > 0);
  const { rows: [party] } = await pool.query('SELECT world_revision_id FROM party_runtime.parties WHERE party_id=$1', [partyId]);
  const profiles = await loadTargetRuntimeProfiles({ worldRevisionId: party.world_revision_id });
  const loadedProfile = profiles.ordinary_profiles.n1;
  assert.ok(loadedProfile, 'actual target loader must supply exact reviewed N1 applicability');
  const proof = await loadTracePhase2TemporalSourceProof(pool, partyId);
  const state = { npcs: rows, npc_schedule_runtime: proof.npc_schedule_runtime };
  for (const npc of rows) {
    const expected = expectedNpcs.find((entry) => (entry.instance_id ?? entry.npc_id) === npc.npc_id);
    assert.deepEqual(npc.semantic_state.source_binding, expected.semantic_state.source_binding);
    assert.equal(npc.semantic_state.profile_revision, expected.semantic_state.source_binding.npc_binding_ref.version);
    const participant = resolveNpcOrdinarySemanticParticipant({ npc, loadedProfile, committedState: state });
    assert.ok(participant, `exact persisted target N1 participant: ${npc.npc_id}`);
    assert.equal(participant.profile_id, npc.occupation_ref.id);
    assert.equal(participant.current_activity, npc.machine_state.current_activity.summary);
    const missing = structuredClone(npc);
    delete missing.semantic_state.source_binding;
    assert.equal(resolveNpcOrdinarySemanticParticipant({ npc: missing, loadedProfile, committedState: state }), null);
  }
}
