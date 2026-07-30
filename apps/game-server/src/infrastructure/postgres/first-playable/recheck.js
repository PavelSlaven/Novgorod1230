export async function firstPlayableCommitRecheck({
  transaction,
  party_id: partyId,
  check,
  plan
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
  if (check.kind === 'boundary_carrier') {
    const result = await transaction.query(
      `SELECT l.state_version,l.location_kind,
              a.state_version AS attachment_version
         FROM party_runtime.party_journey_locations l
         JOIN party_runtime.party_carrier_attachments a
           ON a.party_id=l.party_id
          AND a.subject_kind='actor'
          AND a.subject_id=$3
          AND a.carrier_kind='transport'
          AND a.carrier_id=$2
          AND a.status='active'
        WHERE l.party_id=$1
          AND l.owner_kind='transport'
          AND l.owner_id=$2
        FOR UPDATE OF l,a`,
      [partyId, check.transport_id, check.actor_id]
    );
    const actual = result.rows[0];
    return resultOf(
      Number(actual?.state_version)
        === check.expected_transport_location_state_version
      && Number(actual?.attachment_version)
        === check.expected_attachment_state_version
      && actual?.location_kind === check.expected_location_kind
    );
  }
  if (check.kind === 'capacity') {
    if (check.capacity_model == null) {
      const result = await transaction.query(
        `SELECT party_id
           FROM party_runtime.parties
          WHERE party_id=$1
          FOR UPDATE`,
        [partyId]
      );
      return resultOf(result.rows[0]?.party_id === partyId);
    }
    return recheckLocalEvidenceSlot({
      transaction,
      partyId,
      check,
      plan
    });
  }
  return Object.freeze({ ok: true });
}

async function recheckLocalEvidenceSlot({
  transaction,
  partyId,
  check,
  plan
}) {
  const writeMatches = placementWriteMatches({ check, plan });
  const invalid = check.capacity_model
        !== 'local_evidence_slot_within_g5_anchor'
      || !nonEmpty(check.anchor_id)
      || !nonEmpty(check.anchor_template_id)
      || !nonEmpty(check.anchor_slot_key)
      || !Number.isInteger(check.expected_anchor_item_capacity)
      || check.expected_anchor_item_capacity < 0
      || !nonEmpty(check.capacity_contract_ref)
      || !nonEmpty(check.zone_ref)
      || !nonEmpty(check.location_ref)
      || !nonEmpty(check.placement_slot_id)
      || !nonEmpty(check.local_anchor_semantics)
      || !nonEmpty(check.item_template_id)
      || check.item_capacity_class !== 'evidence'
      || !Number.isInteger(check.placement_slot_capacity)
      || check.placement_slot_capacity < 1
      || !Number.isInteger(check.expected_existing_item_count)
      || check.expected_existing_item_count < 0
      || typeof check.placement_write_required !== 'boolean'
      || !writeMatches;
  if (invalid) {
    return resultOf(false, 'relation_capacity_undefined');
  }
  const anchorResult = await transaction.query(
    `SELECT a.template_id,a.slot_key,a.item_capacity,a.state
       FROM party_runtime.party_g5_anchors a
      WHERE a.party_id=$1 AND a.anchor_id=$2
      FOR UPDATE`,
    [partyId, check.anchor_id]
  );
  const itemResult = await transaction.query(
    `SELECT i.item_id,i.state,p.anchor_id
       FROM party_runtime.party_items i
       LEFT JOIN party_runtime.party_item_placements p
         ON p.party_id=i.party_id AND p.item_id=i.item_id
      WHERE i.party_id=$1 AND i.template_id=$2
      ORDER BY i.item_id
      FOR UPDATE OF i`,
    [partyId, check.item_template_id]
  );
  const actual = anchorResult.rows[0];
  const existing = itemResult.rows.length;
  const existingPlacementsMatch = itemResult.rows.every(
    (item) =>
      item.anchor_id === check.anchor_id
      && placementStateMatches(
        item.state?.placement_contract,
        check
      )
  );
  const withinSlotCapacity = check.placement_write_required
    ? existing < check.placement_slot_capacity
    : existing <= check.placement_slot_capacity;
  return resultOf(
    actual?.template_id === check.anchor_template_id
    && actual?.slot_key === check.anchor_slot_key
    && Number(actual?.item_capacity)
      === check.expected_anchor_item_capacity
    && actual?.state?.capacity_contract_ref
      === check.capacity_contract_ref
    && actual?.state?.zone_ref === check.zone_ref
    && existing === check.expected_existing_item_count
    && existingPlacementsMatch
    && withinSlotCapacity,
    'relation_capacity_undefined'
  );
}

function placementWriteMatches({ check, plan }) {
  const inserts = plan?.inserts ?? [];
  const itemWrites = inserts.filter(
    ({ target_table: table, record }) =>
      table === 'party_items'
      && record?.template_id === check.item_template_id
  );
  const placementWrites = inserts.filter(
    ({ target_table: table, record }) =>
      table === 'party_item_placements'
      && itemWrites.some(({ record: item }) =>
        item?.item_id === record?.item_id)
  );
  if (!check.placement_write_required) {
    return itemWrites.length === 0 && placementWrites.length === 0;
  }
  return itemWrites.length === 1
    && placementWrites.length === 1
    && placementStateMatches(
      itemWrites[0].record?.state?.placement_contract,
      check
    )
    && placementWrites[0].record?.anchor_id === check.anchor_id;
}

function placementStateMatches(placement, check) {
  return placement?.placement_model === check.capacity_model
    && placement?.placement_slot_id === check.placement_slot_id
    && placement?.local_anchor_semantics === check.local_anchor_semantics
    && placement?.anchor_id === check.anchor_id
    && placement?.capacity_contract_ref === check.capacity_contract_ref
    && placement?.zone_ref === check.zone_ref
    && placement?.location_ref === check.location_ref
    && placement?.item_capacity_class === check.item_capacity_class
    && placement?.g5_item_capacity_consumed === 0;
}

function nonEmpty(value) {
  return typeof value === 'string' && value.length > 0;
}

function resultOf(ok, code = 'state_version_conflict') {
  return Object.freeze({
    ok,
    code
  });
}
