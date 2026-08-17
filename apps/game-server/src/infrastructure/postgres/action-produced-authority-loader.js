import { computeSpatialV3CanonicalDigest as digest } from
  '@rus/contracts/spatial-v3/registry';
import { actionProducedText as text,
  failActionProducedPersistence as fail } from
  './action-produced-persistence-boundary.js';

export async function loadActionProducedOutputDestination(client, input) {
  const selected = await client.query(
    `SELECT p.g5_anchor_id AS anchor_id,a.item_capacity
     FROM party_runtime.party_positions p
     JOIN party_runtime.party_g5_anchors a
       ON a.party_id=p.party_id AND a.anchor_id=p.g5_anchor_id
     WHERE p.party_id=$1`, [input.party_id]);
  if (selected.rows.length === 0) return null;
  if (selected.rows.length !== 1 || !text(selected.rows[0].anchor_id)) {
    fail('ACTION_PRODUCED_DESTINATION_INVALID');
  }
  const itemCapacity = Number(selected.rows[0].item_capacity);
  if (!Number.isSafeInteger(itemCapacity) || itemCapacity < 0) {
    fail('ACTION_PRODUCED_DESTINATION_INVALID');
  }
  const used = await client.query(
    `SELECT item_id FROM party_runtime.party_item_placements
     WHERE party_id=$1 AND anchor_id=$2 ORDER BY item_id`,
  [input.party_id, selected.rows[0].anchor_id]);
  const usedItemIds = used.rows.map(({ item_id: itemId }) => itemId);
  if (!refs(usedItemIds) || usedItemIds.length > itemCapacity) {
    fail('ACTION_PRODUCED_DESTINATION_INVALID');
  }
  const value = { anchor_id: selected.rows[0].anchor_id,
    item_capacity: itemCapacity, used_item_ids: usedItemIds };
  return { schema: 'action_production_output_destination_pin_v1',
    destination_kind: 'party_current_anchor', ...value,
    destination_digest: digest(value) };
}

export async function loadActionProducedAuthority(client, input) {
  const selected = await client.query(
    `SELECT party_id,actor_ref,context_ref,profile_ref,profile_version,
       policy_ref,policy_version,max_new_entities,allowed_access_states,
       allowed_identity_modes,allowed_origins,allowed_result_classes,
       authority_state_version,status,authority_digest
     FROM party_runtime.party_action_production_authorities
     WHERE party_id=$1 AND actor_ref=$2 AND context_ref=$3`,
  [input.party_id, input.actor_ref, input.context_ref]);
  if (selected.rows.length !== 1) fail('ACTION_PRODUCED_AUTHORITY_GAP');
  const raw = selected.rows[0];
  const row = { party_id: raw.party_id, actor_ref: raw.actor_ref,
    context_ref: raw.context_ref, profile_ref: raw.profile_ref,
    profile_version: raw.profile_version, policy_ref: raw.policy_ref,
    policy_version: Number(raw.policy_version),
    max_new_entities: Number(raw.max_new_entities),
    allowed_access_states: raw.allowed_access_states,
    allowed_identity_modes: raw.allowed_identity_modes,
    allowed_origins: raw.allowed_origins,
    allowed_result_classes: raw.allowed_result_classes,
    authority_state_version: Number(raw.authority_state_version),
    status: raw.status, authority_digest: raw.authority_digest };
  const authorityInput = Object.fromEntries(Object.entries(row)
    .filter(([key]) => key !== 'authority_digest'));
  const authorityDigest = digest(authorityInput);
  if (row.party_id !== input.party_id || row.actor_ref !== input.actor_ref
      || row.context_ref !== input.context_ref || row.status !== 'committed'
      || row.policy_version !== 1
      || !Number.isSafeInteger(row.max_new_entities)
      || row.max_new_entities < 1 || row.max_new_entities > 8
      || !Number.isSafeInteger(row.authority_state_version)
      || row.authority_state_version < 1
      || row.authority_digest !== authorityDigest
      || !authorityArrays(row)) fail('ACTION_PRODUCED_AUTHORITY_INVALID');
  return { row, pin: {
    schema: 'action_production_committed_authority_pin_v1',
    authority_digest: authorityDigest,
    persisted_row_digest: digest(row), persisted_row: row
  } };
}

function authorityArrays(row) {
  const allowed = [
    [row.allowed_access_states,
      ['immediate', 'quick', 'top_bag', 'deep_bag', 'contained'], false],
    [row.allowed_identity_modes,
      ['preserve_source', 'independent_outputs', 'no_useful_result'], false],
    [row.allowed_origins, ['direct_partition', 'crafted'], true],
    [row.allowed_result_classes, ['ordinary_physical_result',
      'partial_transformation', 'nonworking_construction', 'waste',
      'written_carrier', 'no_useful_result'], false]
  ];
  return allowed.every(([values, vocabulary, empty]) =>
    Array.isArray(values) && (empty || values.length > 0)
      && values.every((value) => vocabulary.includes(value))
      && new Set(values).size === values.length);
}

function refs(values) {
  return Array.isArray(values) && values.every(text)
    && new Set(values).size === values.length;
}
