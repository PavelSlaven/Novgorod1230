import { serverError } from '../../errors.js';
import { playerSafeHeardNpcIntroduction } from '../../runtime/lower-dvina-trace-player-safe-npc-details.js';

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
    const exterior = Object.fromEntries(['public_role_label', 'sex_category', 'age_category', 'appearance']
      .filter((key) => identity?.[key] != null).map((key) => [key, identity[key]]));
    if (!Object.keys(exterior).length) gap('committed_entity_exterior_required');
    return exterior;
  }
  if (placement.entity_kind === 'item') {
    const result = await transaction.query(`SELECT state,condition_state FROM party_runtime.party_items
      WHERE party_id=$1 AND item_id=$2`, [partyId, placement.entity_id]);
    if (result.rows.length !== 1) gap('committed_entity_exterior_required');
    return { condition_state: result.rows[0].condition_state,
      ...(result.rows[0].state?.visual_profile_snapshot == null ? {} : {
        visual_profile_snapshot: result.rows[0].state.visual_profile_snapshot }) };
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
