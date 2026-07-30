export async function recheckTracePhase3LocationCapacity({
  transaction,
  partyId,
  check
}) {
  const expectedNpcs = Array.isArray(check.expected_present_npcs)
    ? check.expected_present_npcs
    : [];
  const allowed = new Set(check.allowed_participant_slots ?? []);
  if (!nonEmpty(check.destination_anchor_id)
      || !nonEmpty(check.destination_location_ref)
      || !nonEmpty(check.capacity_contract_ref)
      || !nonEmpty(check.access_policy_ref)
      || !nonEmpty(check.zone_ref)
      || !Number.isInteger(check.max_actors)
      || check.max_actors < 1
      || !allowed.has(check.incoming_participant_slot)
      || expectedNpcs.length + 1 > check.max_actors
      || expectedNpcs.some(({ npc_id: npcId, participant_slot_ref: slot }) =>
        !nonEmpty(npcId) || !allowed.has(slot))) {
    return resultOf(false);
  }
  const [anchor, npcs] = await Promise.all([
    transaction.query(
      `SELECT state
         FROM party_runtime.party_g5_anchors
        WHERE party_id=$1 AND anchor_id=$2
        FOR UPDATE`,
      [partyId, check.destination_anchor_id]
    ),
    transaction.query(
      `SELECT npc_id,semantic_state
         FROM party_runtime.party_npcs
        WHERE party_id=$1 AND anchor_id=$2
        ORDER BY npc_id
        FOR UPDATE`,
      [partyId, check.destination_anchor_id]
    )
  ]);
  const expected = expectedNpcs.map((npc) => ({
    npc_id: npc.npc_id,
    participant_slot_ref: npc.participant_slot_ref,
    location_profile_ref: check.destination_location_ref
  })).sort((left, right) => left.npc_id.localeCompare(right.npc_id));
  const actual = npcs.rows.map((npc) => ({
    npc_id: npc.npc_id,
    participant_slot_ref: npc.semantic_state?.participant_slot_ref,
    location_profile_ref: npc.semantic_state?.location_profile_ref
  }));
  const state = anchor.rows[0]?.state;
  return resultOf(
    anchor.rowCount === 1
    && state?.capacity_contract_ref === check.capacity_contract_ref
    && state?.access_policy_ref === check.access_policy_ref
    && state?.zone_ref === check.zone_ref
    && actual.length + 1 <= check.max_actors
    && JSON.stringify(actual) === JSON.stringify(expected)
  );
}

const nonEmpty = (value) =>
  typeof value === 'string' && value.length > 0;

const resultOf = (ok) => Object.freeze({
  ok,
  code: ok ? 'state_version_conflict' : 'relation_capacity_undefined'
});
