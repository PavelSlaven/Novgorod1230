import { SCENE_NPC_SOURCE, withoutSceneNpcs } from
  '../../runtime/lower-dvina-trace-scene-presence.js';

export { SCENE_NPC_SOURCE, withoutSceneNpcs };

/**
 * Turn state carries only the NPCs sealed at party start. NPCs created later at a
 * first entry (generated or canonical places) live only in party_npcs plus their
 * scene placement, so the NPCs of the player's current site are read here, with the
 * G6 of their position (same-G6 is the conversation co-presence rule).
 */
export async function withSceneNpcs(pool, partyId, state) {
  const siteId = state?.position?.site_id;
  if (typeof siteId !== 'string' || siteId === '') return state;
  const { rows } = await pool.query(
    `SELECT n.npc_id,n.profile_set_id,n.profile_level,n.anchor_id,
            n.identity_state,n.machine_state,n.semantic_state,
            apb.role_ref,apb.occupation_ref,apb.skill_profile_snapshot,
            apb.knowledge_profile_snapshot,apb.attribute_profile_snapshot,
            apb.profile_candidate_set_digest,
            body.body_profile_ref,body.health,body.energy,body.satiety,
            body.state_version AS body_state_version,
            placement.position_node_id AS position_id,pos.g6_instance_id
       FROM party_runtime.party_npcs n
       JOIN party_runtime.party_actor_profile_bindings apb
         ON apb.party_id=n.party_id AND apb.actor_kind='npc' AND apb.actor_id=n.npc_id
       JOIN party_runtime.entity_placements placement
         ON placement.party_id=n.party_id AND placement.entity_kind='npc'
        AND placement.entity_id=n.npc_id AND placement.placement_kind='scene_position'
       JOIN party_runtime.scene_position_nodes pos
         ON pos.party_id=placement.party_id AND pos.id=placement.position_node_id
       JOIN party_runtime.party_g6_instances g6
         ON g6.party_id=pos.party_id AND g6.id=pos.g6_instance_id
       LEFT JOIN party_runtime.party_actor_body_states body
         ON body.party_id=n.party_id AND body.actor_kind='npc'
        AND body.actor_id=n.npc_id
      WHERE n.party_id=$1 AND g6.host_id=$2 AND g6.host_kind='g5_site' AND pos.status='active' AND g6.status='active'
      ORDER BY n.npc_id`,
    [partyId, siteId]);
  const positions = await pool.query(
    `SELECT pos.id,pos.g6_instance_id
       FROM party_runtime.scene_position_nodes pos
       JOIN party_runtime.party_g6_instances g6
         ON g6.party_id=pos.party_id AND g6.id=pos.g6_instance_id
      WHERE pos.party_id=$1 AND g6.host_id=$2 AND g6.host_kind='g5_site' AND pos.status='active' AND g6.status='active'`, [partyId, siteId]);
  const scene_position_g6 = Object.fromEntries(
    positions.rows.map(({ id, g6_instance_id: g6 }) => [id, g6]));
  const current = new Map((state.npcs ?? []).map((npc) =>
    [npc.instance_id, npc]));
  const loaded = [];
  for (const row of rows) {
    if (current.has(row.npc_id)) {
      const prior = current.get(row.npc_id);
      current.set(row.npc_id, { ...current.get(row.npc_id),
        ...sceneNpcBodyState(row),
        body_state_profile: row.semantic_state?.body_state_profile
          ?? prior.body_state_profile ?? null });
      continue;
    }
    loaded.push({
    instance_id: row.npc_id,
    participant_slot_ref: row.semantic_state?.participant_slot_ref,
    profile_id: row.profile_set_id,
    profile_level: row.profile_level,
    anchor_id: row.anchor_id,
    location_profile_ref: row.semantic_state?.location_profile_ref,
    zone_ref: row.semantic_state?.zone_ref,
    role_ref: { id: row.role_ref, source: 'approved_social_roles' },
    occupation_ref: { id: row.occupation_ref, source: 'approved_occupations' },
    identity_state: row.identity_state,
    machine_state: row.machine_state,
    semantic_state: row.semantic_state,
    ...sceneNpcBodyState(row),
    relationships: [],
    skill_profile_snapshot: row.skill_profile_snapshot,
    knowledge_profile_snapshot: row.knowledge_profile_snapshot,
    base_attributes: row.attribute_profile_snapshot,
    profile_candidate_set_digest: row.profile_candidate_set_digest,
    position_id: row.position_id,
    g6_instance_id: row.g6_instance_id,
    runtime_source: SCENE_NPC_SOURCE
    });
  }
  return { ...state, scene_position_g6,
    npcs: [...current.values(), ...loaded] };
}

function sceneNpcBodyState(row) {
  return { body_state_profile: row.semantic_state?.body_state_profile ?? null,
    body_state: row.body_state_version == null ? null : {
      health: Number(row.health), energy: Number(row.energy),
      satiety: Number(row.satiety)
    }, body_profile_ref: row.body_profile_ref ?? null,
    body_state_version: row.body_state_version == null ? null
      : Number(row.body_state_version),
    body_state_persisted: row.body_state_version != null };
}
