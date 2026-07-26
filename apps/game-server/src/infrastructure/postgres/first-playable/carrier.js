import { serverError } from '../../../errors.js';

export async function persistActorCarrierState(tx, {
  partyId,
  state,
  command,
  position,
  changeSet
}) {
  const playerId = state.player.id;
  if (command.verb === 'board') {
    const endpoint = await tx.query(
      `SELECT scene_position_id
       FROM party_runtime.party_journey_locations
       WHERE party_id=$1 AND owner_kind='transport' AND owner_id=$2
       FOR UPDATE`,
      [partyId, state.boat.id]
    );
    if (endpoint.rows[0]?.scene_position_id !== position) {
      throw serverError(
        'CARRIER_ENDPOINT_MISMATCH',
        'Actor and transport are not at the same verified endpoint.',
        { status: 409 }
      );
    }
    await tx.query(
      `DELETE FROM party_runtime.party_journey_locations
       WHERE party_id=$1 AND owner_kind='actor' AND owner_id=$2`,
      [partyId, playerId]
    );
    await tx.query(
      `INSERT INTO party_runtime.party_carrier_attachments
       (id,party_id,subject_kind,subject_id,carrier_kind,carrier_id,status,
        state_version,attached_change_set_id,terminal_change_set_id)
       VALUES ($1,$2,'actor',$3,'transport',$4,'active',1,$5,NULL)`,
      [`attachment:${partyId}:${changeSet}`, partyId, playerId,
        state.boat.id, changeSet]
    );
    return;
  }
  if (command.verb === 'alight') {
    const detached = await tx.query(
      `UPDATE party_runtime.party_carrier_attachments
       SET status='detached',state_version=state_version+1,
           terminal_change_set_id=$3
       WHERE party_id=$1 AND subject_kind='actor' AND subject_id=$2
         AND carrier_kind='transport' AND carrier_id=$4 AND status='active'
       RETURNING id`,
      [partyId, playerId, changeSet, state.boat.id]
    );
    if (detached.rowCount !== 1) {
      throw serverError(
        'CARRIER_ATTACHMENT_MISSING',
        'The active carrier attachment is missing.',
        { status: 409 }
      );
    }
    await tx.query(
      `INSERT INTO party_runtime.party_journey_locations
       (id,party_id,owner_kind,owner_id,location_kind,scene_position_id,
        state_version,updated_change_set_id)
       VALUES ($1,$2,'actor',$3,'scene',$4,1,$5)`,
      [`location:${partyId}:player`, partyId, playerId, position, changeSet]
    );
    return;
  }
  if (!state.boat?.boarded) {
    await tx.query(
      `UPDATE party_runtime.party_journey_locations
       SET scene_position_id=$2,state_version=state_version+1,
           updated_change_set_id=$3
       WHERE party_id=$1 AND owner_kind='actor' AND owner_id=$4`,
      [partyId, position, changeSet, playerId]
    );
  }
}
