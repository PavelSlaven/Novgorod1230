import { serverError } from '../../errors.js';
import { validateActorBaseAppearance } from '@rus/actors';
import { runtimeItemRecordIsConcealed } from '@rus/items-property';
import { playerSafeHeardNpcIntroduction, safeVisualProfile } from
  '../../runtime/lower-dvina-trace-player-safe-npc-details.js';

/** Only outward fields from the committed entity; identity stays with knowledge. */
export async function readCommittedEntityExterior({ transaction, partyId, placement } = {}) {
  if (typeof transaction?.query !== 'function' || !partyId || !placement?.entity_id) {
    gap('committed_entity_exterior_required');
  }
  if (placement.entity_kind === 'npc') {
    const result = await transaction.query(`SELECT identity_state FROM party_runtime.party_npcs
      WHERE party_id=$1 AND npc_id=$2`, [partyId, placement.entity_id]);
    if (result.rows.length !== 1) gap('committed_entity_exterior_required');
    const identity = result.rows[0].identity_state;
    if (!validateActorBaseAppearance(identity, { requireComplete: true }).ok) {
      gap('committed_entity_exterior_required');
    }
    const gear = await transaction.query(`SELECT i.state,i.condition_state,
        p.physical_position,p.equipment_slot_category_id
      FROM party_runtime.party_item_placements p
      JOIN party_runtime.party_items i ON i.party_id=p.party_id AND i.item_id=p.item_id
      WHERE p.party_id=$1 AND p.holder_npc_id=$2
        AND p.physical_position IN ('worn','equipped') ORDER BY p.item_id`,
    [partyId, placement.entity_id]);
    if (!Array.isArray(gear.rows)) gap('committed_entity_exterior_required');
    const visible_equipment = [];
    for (const row of gear.rows) {
      if (runtimeItemRecordIsConcealed(row, { includeAccess: false })) continue;
      const visual_profile_snapshot = safeVisualProfile(row.state?.visual_profile_snapshot);
      if (!visual_profile_snapshot) gap('committed_entity_exterior_required');
      visible_equipment.push({ physical_position: row.physical_position,
        equipment_slot_category_id: row.equipment_slot_category_id,
        visual_profile_snapshot });
    }
    return { sex_category: identity.sex_category, age_category: identity.age_category,
      appearance: structuredClone(identity.appearance), visible_equipment };
  }
  if (placement.entity_kind === 'item') {
    const result = await transaction.query(`SELECT i.state,i.condition_state,
        p.anchor_id,p.scene_position_id,p.container_id,p.holder_npc_id,p.holder_character_id
      FROM party_runtime.party_items i
      JOIN party_runtime.party_item_placements p ON p.party_id=i.party_id AND p.item_id=i.item_id
      WHERE i.party_id=$1 AND i.item_id=$2`, [partyId, placement.entity_id]);
    if (result.rows.length !== 1) gap('committed_entity_exterior_required');
    const row = result.rows[0];
    if (placement.placement_kind !== 'scene_position'
      || row.container_id != null || row.holder_npc_id != null
      || row.holder_character_id != null
      || row.scene_position_id != null
        && row.scene_position_id !== placement.position_node_id
      || row.scene_position_id == null && row.anchor_id == null
      || runtimeItemRecordIsConcealed(row, { includeAccess: false })) {
      gap('committed_entity_exterior_required');
    }
    const snapshot = row.state?.visual_profile_snapshot;
    const visual_profile_snapshot = snapshot == null ? null : safeVisualProfile(snapshot);
    if (snapshot != null && !visual_profile_snapshot) gap('committed_entity_exterior_required');
    return { condition_state: row.condition_state,
      ...(visual_profile_snapshot == null ? {} : { visual_profile_snapshot }) };
  }
  gap('committed_entity_exterior_required');
}

/** A name is known only through a committed, fully heard self-introduction. */
export async function readPlayerKnowledge({ transaction, partyId, actorId, placement } = {}) {
  if (placement?.entity_kind !== 'npc') return null;
  if (typeof transaction?.query !== 'function' || !partyId || !actorId || !placement.entity_id) {
    gap('player_npc_name_knowledge_required');
  }
  const npcId = placement.entity_id;
  const npc = await transaction.query(`SELECT npc_id FROM party_runtime.party_npcs
    WHERE party_id=$1 AND npc_id=$2`, [partyId, npcId]);
  if (npc.rows?.length !== 1) gap('player_npc_name_knowledge_required');
  const statements = await transaction.query(`SELECT statement_id,speaker_ref,utterance_text,audience_projection
    FROM party_runtime.party_conversation_statements
    WHERE party_id=$1 AND speaker_ref->>'entity_kind'='npc'
      AND speaker_ref->>'entity_id'=$2 ORDER BY statement_id`, [partyId, npcId]);
  if (!Array.isArray(statements.rows)) gap('player_npc_name_knowledge_required');
  const receivedMessages = [];
  for (const row of statements.rows) {
    const audience = row.audience_projection;
    if (audience?.schema !== 'conversation_audience_projection_v1'
      || audience.statement_ref?.entity_kind !== 'conversation_statement'
      || audience.statement_ref.entity_id !== row.statement_id
      || !Array.isArray(audience.received_messages)) {
      gap('player_npc_name_knowledge_required');
    }
    receivedMessages.push(...audience.received_messages);
  }
  const name = playerSafeHeardNpcIntroduction({
    committedNpcs: npc.rows, conversationStatements: statements.rows,
    receivedMessages, playerId: actorId, npcId
  });
  return name === null ? null : { display_name: name };
}

function gap(reason) { throw serverError('SCENE_ENTITY_PERCEPTION_DATA_GAP',
  'Complete current visibility and disclosure are required.', { status: 409, details: { reason } }); }
