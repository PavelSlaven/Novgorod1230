import { serverError } from '../../errors.js';

export async function withLowerDvinaTracePostActionKnowledge(
  partyPool,
  partyId,
  state
) {
  const [npcs, knowledge, perception] = await Promise.all([
    partyPool.query(`SELECT n.npc_id,s.state_version,s.last_proposal_id,
      s.last_result_digest,s.updated_change_set_id
      FROM party_runtime.party_npcs n
      LEFT JOIN party_runtime.party_npc_knowledge_merge_states s
        ON s.party_id=n.party_id AND s.npc_id=n.npc_id
      WHERE n.party_id=$1 ORDER BY n.npc_id`, [partyId]),
    partyPool.query(`SELECT npc_id,fact_id,knowledge_ref_kind,
      knowledge_classification
      FROM party_runtime.party_npc_knowledge
      WHERE party_id=$1 AND target_contract_version='4.4.0-target.1'
      ORDER BY npc_id,knowledge_ref_kind,fact_id`, [partyId]),
    partyPool.query(`SELECT s.npc_id,s.current_position_node_id,
      s.state_version AS schedule_state_version,s.attention_state_ref,
      s.knowledge_state_ref,a.g6_instance_id,
      p.state_version AS position_state_version,
      a.ambient_noise,a.acoustic_uniformity,
      a.state_version AS acoustic_state_version
      FROM party_runtime.party_npc_spatial_schedules s
      LEFT JOIN party_runtime.scene_position_nodes p
        ON p.party_id=s.party_id AND p.id=s.current_position_node_id
      LEFT JOIN party_runtime.g6_acoustic_profiles a
        ON a.party_id=p.party_id AND a.g6_instance_id=p.g6_instance_id
      WHERE s.party_id=$1 AND s.status='active'
      ORDER BY s.npc_id`, [partyId])
  ]);
  const byNpc = Map.groupBy(knowledge.rows, ({ npc_id }) => npc_id);
  const rows = npcs.rows.map((row) => {
    const known = byNpc.get(row.npc_id) ?? [];
    if (row.state_version == null && known.length > 0) invalid();
    const refs = known.map((entry) => ({
      classification: entry.knowledge_classification,
      ref: {
        entity_kind: entry.knowledge_ref_kind,
        entity_id: entry.fact_id
      }
    }));
    if (refs.some(({ classification, ref }) =>
      !['fact', 'hypothesis'].includes(classification)
      || typeof ref.entity_kind !== 'string' || ref.entity_kind.length === 0
      || typeof ref.entity_id !== 'string' || ref.entity_id.length === 0)) {
      invalid();
    }
    return Object.freeze({
      npc_id: row.npc_id,
      exists: row.state_version != null,
      state_version: row.state_version == null ? null : Number(row.state_version),
      fact_refs: refs.filter(({ classification }) => classification === 'fact')
        .map(({ ref }) => ref),
      hypothesis_refs: refs
        .filter(({ classification }) => classification === 'hypothesis')
        .map(({ ref }) => ref)
    });
  });
  if (rows.some(({ exists, state_version }) =>
    exists && (!Number.isSafeInteger(state_version) || state_version < 1))) {
    invalid();
  }
  return {
    ...state,
    post_action_knowledge_states: Object.freeze(rows),
    post_action_perception_sources: Object.freeze(
      perception.rows.map((row) => Object.freeze({
        npc_id: row.npc_id,
        current_position_node_id: row.current_position_node_id,
        schedule_state_version: Number(row.schedule_state_version),
        attention_state_ref: structuredClone(row.attention_state_ref),
        knowledge_state_ref: structuredClone(row.knowledge_state_ref),
        g6_instance_id: row.g6_instance_id,
        position_state_version: row.position_state_version == null
          ? null : Number(row.position_state_version),
        ambient_noise: row.ambient_noise == null
          ? null : Number(row.ambient_noise),
        acoustic_uniformity: row.acoustic_uniformity,
        acoustic_state_version: row.acoustic_state_version == null
          ? null : Number(row.acoustic_state_version)
      })))
  };
}

function invalid() {
  throw serverError(
    'TRACE_POST_ACTION_KNOWLEDGE_STATE_INVALID',
    'NPC knowledge state rows are incomplete or contradictory.',
    { status: 409 }
  );
}
