import { computeSpatialV3CanonicalDigest as digest } from
  '@rus/contracts/spatial-v3/registry';

export async function lockAndVerifyActionProducedContext(client, plan) {
  await lockAuthority(client, plan);
  await lockDestination(client, plan);
}

async function lockAuthority(client, plan) {
  const selected = await client.query(
    `SELECT party_id,actor_ref,context_ref,profile_ref,profile_version,
       policy_ref,policy_version,max_new_entities,allowed_access_states,
       allowed_identity_modes,allowed_origins,allowed_result_classes,
       authority_state_version,status,authority_digest
     FROM party_runtime.party_action_production_authorities
     WHERE party_id=$1 AND actor_ref=$2 AND context_ref=$3 FOR UPDATE`,
  [plan.party_id, plan.actor_ref, plan.context_pin.context_ref]);
  if (selected.rows.length !== 1
      || digest(normalizedAuthority(selected.rows[0]))
        !== plan.authority_pin.persisted_row_digest) {
    fail('ACTION_PRODUCED_AUTHORITY_STALE');
  }
}

async function lockDestination(client, plan) {
  const pin = plan.output_destination_pin;
  if (pin == null) return;
  const selected = await client.query(
    `SELECT p.g5_anchor_id AS anchor_id,a.item_capacity
     FROM party_runtime.party_positions p
     JOIN party_runtime.party_g5_anchors a
       ON a.party_id=p.party_id AND a.anchor_id=p.g5_anchor_id
     WHERE p.party_id=$1 FOR UPDATE OF p,a`, [plan.party_id]);
  const used = await client.query(
    `SELECT item_id FROM party_runtime.party_item_placements
     WHERE party_id=$1 AND anchor_id=$2 ORDER BY item_id FOR UPDATE`,
  [plan.party_id, pin.anchor_id]);
  const value = selected.rows.length === 1 ? {
    anchor_id: selected.rows[0].anchor_id,
    item_capacity: Number(selected.rows[0].item_capacity),
    used_item_ids: used.rows.map(({ item_id: itemId }) => itemId)
  } : null;
  if (value == null || digest(value) !== pin.destination_digest
      || value.used_item_ids.length + plan.result_items.length
        > value.item_capacity) fail('ACTION_PRODUCED_DESTINATION_STALE');
}

function normalizedAuthority(row) {
  return { party_id: row.party_id, actor_ref: row.actor_ref,
    context_ref: row.context_ref, profile_ref: row.profile_ref,
    profile_version: row.profile_version, policy_ref: row.policy_ref,
    policy_version: Number(row.policy_version),
    max_new_entities: Number(row.max_new_entities),
    allowed_access_states: row.allowed_access_states,
    allowed_identity_modes: row.allowed_identity_modes,
    allowed_origins: row.allowed_origins,
    allowed_result_classes: row.allowed_result_classes,
    authority_state_version: Number(row.authority_state_version),
    status: row.status, authority_digest: row.authority_digest };
}

function fail(code) { throw Object.assign(new Error(code), { code }); }
