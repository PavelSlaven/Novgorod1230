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
  state = await withCombatParticipantBodies(pool, partyId, state);
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
        scene_readback_prior_locus: {
          position_id: { present: Object.hasOwn(prior, 'position_id'),
            value: prior.position_id },
          g6_instance_id: { present: Object.hasOwn(prior, 'g6_instance_id'),
            value: prior.g6_instance_id }
        },
        position_id: row.position_id,
        g6_instance_id: row.g6_instance_id,
        scene_readback_present: true,
        ...sceneNpcBodyState(row),
        body_state_profile: row.semantic_state?.body_state_profile
          ?? prior.body_state_profile ?? null });
      continue;
    }
    loaded.push(sceneNpcSnapshot(row));
  }
  return { ...state, scene_position_g6,
    npcs: [...current.values(), ...loaded] };
}

async function withCombatParticipantBodies(pool, partyId, state) {
  const participantIds = combatNpcParticipantIds(state);
  if (participantIds.length === 0) return state;
  const { rows } = await pool.query(
    `SELECT actor_id,body_profile_ref,health,energy,satiety,
            state_version AS body_state_version
       FROM party_runtime.party_actor_body_states
      WHERE party_id=$1 AND actor_kind='npc' AND actor_id=ANY($2::text[])
      ORDER BY actor_id`, [partyId, participantIds]);
  const persisted = new Map(rows.map((row) => [row.actor_id, row]));
  const npcs = (state.npcs ?? []).map((npc) => {
    const body = persisted.get(npc.instance_id);
    return body == null ? npc : { ...npc,
      ...sceneNpcBodyState(body, npc.body_state_profile) };
  });
  const known = new Set(npcs.map(({ instance_id: id }) => id));
  const missingIds = participantIds.filter((id) => !known.has(id));
  if (missingIds.length === 0) return { ...state, npcs };
  const { rows: missing } = await pool.query(
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
       LEFT JOIN party_runtime.entity_placements placement
         ON placement.party_id=n.party_id AND placement.entity_kind='npc'
        AND placement.entity_id=n.npc_id AND placement.placement_kind='scene_position'
       LEFT JOIN party_runtime.scene_position_nodes pos
         ON pos.party_id=placement.party_id AND pos.id=placement.position_node_id
       LEFT JOIN party_runtime.party_actor_body_states body
         ON body.party_id=n.party_id AND body.actor_kind='npc'
        AND body.actor_id=n.npc_id
      WHERE n.party_id=$1 AND n.npc_id=ANY($2::text[])
      ORDER BY n.npc_id`, [partyId, missingIds]);
  return { ...state, npcs: [...npcs, ...missing.map(sceneNpcSnapshot)] };
}

function combatNpcParticipantIds(state) {
  return [...new Set((state?.combat_sessions ?? [])
    .filter(({ status }) => status !== 'ended')
    .flatMap(({ participant_refs: refs, participant_states: states }) => {
      const left = new Set((states ?? [])
        .filter(({ combat_status }) => combat_status === 'left')
        .map(({ actor_ref }) => actor_ref?.entity_kind === 'npc'
          ? actor_ref.entity_id : null));
      return (refs ?? []).filter(({ entity_kind: kind, entity_id: id }) =>
        kind === 'npc' && typeof id === 'string' && id !== ''
          && !left.has(id)).map(({ entity_id: id }) => id);
    }))];
}

function sceneNpcSnapshot(row) {
  return {
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
    scene_readback_present: true,
    runtime_source: SCENE_NPC_SOURCE
  };
}

function sceneNpcBodyState(row, existingProfile = null) {
  return { body_state_profile: row.semantic_state?.body_state_profile
      ?? existingProfile ?? null,
    body_state: row.body_state_version == null ? null : {
      health: bodyMetric(row.health), energy: bodyMetric(row.energy),
      satiety: bodyMetric(row.satiety)
    }, body_profile_ref: row.body_profile_ref ?? null,
    body_state_version: row.body_state_version == null ? null
      : Number(row.body_state_version),
    body_state_persisted: row.body_state_version != null };
}

function bodyMetric(value) {
  if (value == null || typeof value === 'string' && value.trim() === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 100
    ? numeric : null;
}
