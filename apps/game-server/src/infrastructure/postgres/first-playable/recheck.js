export async function firstPlayableCommitRecheck({
  transaction,
  party_id: partyId,
  check
}) {
  if (check.kind === 'state') {
    const result = await transaction.query(
      `SELECT state_version
       FROM party_runtime.parties
       WHERE party_id=$1
       FOR UPDATE`,
      [partyId]
    );
    return resultOf(
      Number(result.rows[0]?.state_version)
        === check.expected_party_state_version
    );
  }
  if (check.kind === 'resource_binding') {
    const result = await transaction.query(
      `SELECT state_version,owner_ref,holder_ref,controller_ref
       FROM party_runtime.party_entity_controls
       WHERE party_id=$1 AND entity_kind='item' AND entity_id=$2
       FOR UPDATE`,
      [partyId, check.resource_id]
    );
    const actual = result.rows[0];
    return resultOf(
      Number(actual?.state_version) === check.expected_state_version
      && actual?.owner_ref?.entity_id === check.owner_id
      && actual?.holder_ref?.entity_id === check.holder_id
      && actual?.controller_ref?.entity_id === check.controller_id
    );
  }
  if (check.kind === 'resource_quantity') {
    const result = await transaction.query(
      `SELECT state_version,quantity_numerator
       FROM party_runtime.party_resource_nodes
       WHERE party_id=$1 AND resource_node_id=$2
       FOR UPDATE`,
      [partyId, check.resource_id]
    );
    const actual = result.rows[0];
    return resultOf(
      Number(actual?.state_version) === check.expected_state_version
      && Number(actual?.quantity_numerator) >= check.minimum_quantity
    );
  }
  if (check.kind === 'carrier_endpoint') {
    const result = await transaction.query(
      `SELECT
         (SELECT scene_position_id
          FROM party_runtime.party_journey_locations
          WHERE party_id=$1 AND owner_kind='transport'
            AND owner_id=$2) AS transport_position,
         (SELECT scene_position_id
          FROM party_runtime.party_journey_locations
          WHERE party_id=$1 AND owner_kind='actor'
            AND owner_id=$3) AS actor_position,
         (SELECT state_version
          FROM party_runtime.party_carrier_attachments
          WHERE party_id=$1 AND subject_kind='actor'
            AND subject_id=$3 AND status='active') AS attachment_version`,
      [partyId, check.transport_id, check.actor_id]
    );
    const actual = result.rows[0];
    const boarding = check.expected_attachment_state_version == null;
    return resultOf(boarding
      ? actual?.transport_position === check.position_id
        && actual?.actor_position === check.position_id
      : actual?.transport_position === check.position_id
        && Number(actual?.attachment_version)
          === check.expected_attachment_state_version);
  }
  return Object.freeze({ ok: true });
}

function resultOf(ok) {
  return Object.freeze({
    ok,
    code: 'state_version_conflict'
  });
}
