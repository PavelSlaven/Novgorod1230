import { computeSpatialV3CanonicalDigest as digest } from
  '@rus/contracts/spatial-v3/registry';
import { deriveActionProducedPropertyCompatibilityBasis } from
  '@rus/items-property';
import {
  INVALID_ACTION_PRODUCED_DATA,
  actionProducedText as text,
  deepFreezeActionProducedPersistenceData as deepFreeze,
  exactActionProducedRecord as exact,
  failActionProducedPersistence as fail,
  snapshotActionProducedPersistenceData as snapshot
} from './action-produced-persistence-boundary.js';
import { loadActionProducedOutputDestination } from
  './action-produced-authority-loader.js';
import { actionProducedOwnerOutputDestination } from
  './action-produced-atomic-write-plan-pins.js';
import { actionProducedPreparedOrdinaryRows } from
  './action-produced-prepared-ordinary.js';
import { bindActionProducedResourcePins } from
  './action-produced-resource-pins.js';

const INPUT_KEYS = [
  'party_id', 'actor_ref', 'root_turn_id', 'action_ref', 'step_index',
  'context_ref', 'expected_party_state_version', 'source_refs', 'tool_refs',
  'admission_profile', 'technical_policy'
];
const PREPARED_INPUT_KEYS = [...INPUT_KEYS, 'prepared_ordinary_plan',
  'change_set_id'];

export async function loadActionProducedCommittedContext(client, rawInput) {
  const input = snapshot(rawInput);
  if (input === INVALID_ACTION_PRODUCED_DATA
      || !(exact(input, INPUT_KEYS) || exact(input, PREPARED_INPUT_KEYS))
      || ![input.party_id, input.actor_ref, input.root_turn_id,
        input.action_ref, input.context_ref].every(text)
      || !Number.isSafeInteger(input.step_index) || input.step_index < 1
      || input.step_index > 8
      || !Number.isSafeInteger(input.expected_party_state_version)
      || input.expected_party_state_version < 0
      || !refs(input.source_refs, false) || !refs(input.tool_refs, true)
      || input.source_refs.some((ref) => input.tool_refs.includes(ref))
      || !validProfiles(input)
      || typeof client?.query !== 'function'
      || Object.hasOwn(input, 'prepared_ordinary_plan')
        && !text(input.change_set_id)) fail('ACTION_PRODUCED_LOAD_INVALID');

  const party = await client.query(
    `SELECT state_version FROM party_runtime.parties
     WHERE party_id=$1`, [input.party_id]);
  if (party.rows.length !== 1
      || Number(party.rows[0].state_version)
        !== input.expected_party_state_version) {
    fail('ACTION_PRODUCED_PARTY_STALE');
  }
  const outputDestinationPin = await loadActionProducedOutputDestination(
    client, input);

  const requested = [...input.source_refs, ...input.tool_refs];
  const rows = await client.query(
    `SELECT i.item_id,i.run_id,i.template_id,i.profile_id,i.category_id,
       i.quantity,i.condition_state,i.legal_status,i.state,i.state_version,
       p.anchor_id,p.container_id,p.holder_npc_id,p.holder_character_id,
       p.physical_position,p.equipment_slot_category_id,p.attached_item_id,
       o.ownership_id,o.owner_npc_id,o.owner_character_id,o.owner_party,
       o.controller_npc_id,o.controller_character_id,o.claim_state
     FROM party_runtime.party_items i
     JOIN party_runtime.party_item_placements p
       ON p.party_id=i.party_id AND p.item_id=i.item_id
     JOIN party_runtime.party_ownership o
       ON o.party_id=i.party_id AND o.item_id=i.item_id
     WHERE i.party_id=$1 AND i.item_id=ANY($2::text[])
     ORDER BY i.item_id`, [input.party_id, requested]);
  const prepared = actionProducedPreparedOrdinaryRows(input, requested);
  if (rows.rows.length + prepared.size !== requested.length) {
    fail('ACTION_PRODUCED_ITEM_GAP');
  }

  const resourceRows = await client.query(
    `SELECT resource_node_id,source_resource_ref,quantity_numerator,
       quantity_denominator,quantity_unit_ref,lifecycle_state,state_version,
       position_node_id,property_basis_ref
     FROM party_runtime.party_resource_nodes
     WHERE party_id=$1
       AND source_resource_ref->>'entity_kind'='party_item'
       AND source_resource_ref->>'entity_id'=ANY($2::text[])
     ORDER BY resource_node_id`, [input.party_id, input.source_refs]);
  const resources = bindActionProducedResourcePins(resourceRows.rows,
    input.source_refs);
  const byId = new Map(rows.rows.map((row) => [row.item_id, row]));
  const contextVersion = contextVersionFrom(input);
  const rowPins = requested.map((itemId) => {
    const future = prepared.get(itemId);
    return rowPin({
    row: future?.row ?? byId.get(itemId),
    role: input.source_refs.includes(itemId) ? 'source' : 'tool',
    actorRef: input.actor_ref,
    contextVersion,
    finite: resources.get(itemId) ?? null,
    accessAnchorId: outputDestinationPin?.anchor_id ?? null,
    preparedOrdinary: future?.preparedOrdinary ?? null
  });
  });
  const entities = rowPins.map(({ role, entity_snapshot: entity }) => ({
    entity_ref: entity.entity_ref,
    state_version: entity.state_version,
    lifecycle_state: entity.lifecycle_state,
    access_state: entity.access_state,
    accessible_actor_ref: input.actor_ref,
    holder_ref: entity.holder_ref,
    controller_ref: entity.controller_ref,
    role_membership: [role],
    mechanics_state_ref: entity.mechanics_state_ref,
    property_state_ref: entity.property_state_ref,
    ownership_state_ref: entity.ownership_state_ref,
    ownership_basis_ref: entity.ownership_basis_ref,
    property_basis_ref: entity.property_basis_ref,
    placement_state_ref: entity.placement_state_ref
  }));
  const sourceSnapshots = input.source_refs.map((ref) =>
    structuredClone(rowPins.find(({ item_id: id }) =>
      id === ref).entity_snapshot));
  const toolSnapshots = input.tool_refs.map((ref) =>
    structuredClone(rowPins.find(({ item_id: id }) =>
      id === ref).entity_snapshot));
  return deepFreeze({
    schema: 'action_produced_committed_context_load_v1',
    party_id: input.party_id,
    party_state_version: input.expected_party_state_version,
    output_destination_pin: outputDestinationPin,
    output_destination: actionProducedOwnerOutputDestination(
      outputDestinationPin, input.actor_ref),
    admission_profile: structuredClone(input.admission_profile),
    technical_policy: structuredClone(input.technical_policy),
    committed_context: {
      schema: 'rus.items.action_produced_committed_context.v1',
      context_ref: input.context_ref,
      state_version: contextVersion,
      commit_state: 'committed',
      root_turn_id: input.root_turn_id,
      action_ref: input.action_ref,
      step_index: input.step_index,
      actor_ref: input.actor_ref,
      entities
    },
    source_snapshots: sourceSnapshots,
    tool_snapshots: toolSnapshots,
    row_pins: rowPins
  });
}

function rowPin({ row, role, actorRef, contextVersion, finite, accessAnchorId,
  preparedOrdinary = null }) {
  if (!row || !text(row.item_id)
      || !Number.isSafeInteger(Number(row.state_version))
      || Number(row.state_version) < 1
      || preparedOrdinary === null
        && !accessiblePlacement(row, actorRef, accessAnchorId)
      || row.holder_npc_id !== null
      || !validOwnership(row)
      || row.controller_character_id !== actorRef
      || row.controller_npc_id !== null
      || row.state?.lifecycle_status != null
        && row.state.lifecycle_status !== 'active'
      || finite != null && (
        finite.persisted_row.position_node_id
          !== row.state?.resource_position_node_id
        || finite.persisted_row.property_basis_ref
          !== row.state?.property_state?.resource_property_basis_ref)) {
    fail('ACTION_PRODUCED_ITEM_ACCESS_DENIED');
  }
  const access = preparedOrdinary === null
    ? accessState(row, actorRef, accessAnchorId) : 'quick';
  const holderRef = row.holder_character_id === actorRef ? actorRef : null;
  const item = {
    item_id: row.item_id,
    run_id: row.run_id,
    template_id: row.template_id,
    profile_id: row.profile_id,
    category_id: row.category_id,
    quantity: Number(row.quantity),
    condition_state: row.condition_state,
    legal_status: row.legal_status,
    state: row.state,
    state_version: Number(row.state_version)
  };
  const placement = {
    anchor_id: row.anchor_id, container_id: row.container_id,
    holder_npc_id: row.holder_npc_id,
    holder_character_id: row.holder_character_id,
    physical_position: row.physical_position,
    equipment_slot_category_id: row.equipment_slot_category_id,
    attached_item_id: row.attached_item_id
  };
  const ownership = {
    ownership_id: row.ownership_id,
    owner_npc_id: row.owner_npc_id,
    owner_character_id: row.owner_character_id,
    owner_party: row.owner_party,
    controller_npc_id: row.controller_npc_id,
    controller_character_id: row.controller_character_id,
    claim_state: row.claim_state
  };
  const mechanicsRef = digest({
    runtime_instance_mechanics_snapshot:
      item.state?.runtime_instance_mechanics_snapshot ?? null,
    inventory_profile_snapshot:
      item.state?.inventory_profile_snapshot ?? null,
    template_id: item.template_id, profile_id: item.profile_id,
    category_id: item.category_id, quantity: item.quantity
  });
  const propertyRef = digest({
    property_state: item.state?.property_state ?? null, ownership
  });
  const placementRef = digest(placement);
  const propertyBasis = deriveActionProducedPropertyCompatibilityBasis(
    ownership, item.state?.property_state ?? null);
  return {
    role, item_id: row.item_id, item, placement, ownership,
    item_digest: digest(item), placement_digest: placementRef,
    ownership_digest: digest(ownership),
    entity_snapshot: {
      schema: 'rus.items.action_produced_committed_entity_snapshot.v1',
      commit_state: 'committed', role, entity_ref: row.item_id,
      state_version: contextVersion,
      lifecycle_state: 'active', access_state: access,
      holder_ref: holderRef, controller_ref: actorRef,
      mechanics_state_ref: mechanicsRef,
      property_state_ref: propertyRef,
      ownership_state_ref: digest(ownership),
      ...propertyBasis,
      ownership_snapshot: structuredClone(ownership),
      placement_state_ref: placementRef,
      finite_resource: finite?.snapshot ?? null
    },
    finite_resource_row: finite?.persisted_row ?? null,
    ...(preparedOrdinary === null ? {} : {
      prepared_ordinary: preparedOrdinary
    })
  };
}

function contextVersionFrom(input) {
  return String(input.expected_party_state_version);
}

function validProfiles(input) {
  const admission = input.admission_profile;
  const policy = input.technical_policy;
  return exact(admission, ['schema', 'profile_ref', 'profile_version',
    'status', 'context_ref', 'context_state_version',
    'allowed_access_states', 'allowed_identity_modes', 'allowed_origins',
    'allowed_result_classes'])
    && admission.schema === 'rus.items.action_produced_admission_profile.v1'
    && admission.status === 'committed'
    && admission.context_ref === input.context_ref
    && admission.context_state_version
      === String(input.expected_party_state_version)
    && exact(policy, ['schema', 'version', 'status', 'policy_ref',
      'profile_ref', 'profile_version', 'max_new_entities'])
    && policy.schema === 'rus.items.action_produced_technical_policy.v1'
    && policy.version === 1 && policy.status === 'committed'
    && policy.profile_ref === admission.profile_ref
    && policy.profile_version === admission.profile_version
    && Number.isSafeInteger(policy.max_new_entities)
    && policy.max_new_entities >= 1 && policy.max_new_entities <= 8;
}

function validOwnership(row) {
  const owners = Number(text(row.owner_character_id))
    + Number(text(row.owner_npc_id)) + Number(row.owner_party === true);
  return owners === 1 && typeof row.owner_party === 'boolean'
    && text(row.claim_state);
}

function accessiblePlacement(row, actorRef, accessAnchorId) {
  return row.holder_character_id === actorRef && row.holder_npc_id === null
    || text(accessAnchorId) && row.anchor_id === accessAnchorId
      && row.holder_character_id === null && row.holder_npc_id === null
      && row.container_id === null && row.attached_item_id === null;
}

function accessState(row, actorRef, accessAnchorId) {
  if (row.holder_character_id === actorRef
      && ['hands', 'equipped', 'worn_quick'].includes(row.physical_position)) {
    return 'immediate';
  }
  if (row.holder_character_id === actorRef
      && ['worn', 'external', 'external_load'].includes(
        row.physical_position)
      || row.anchor_id === accessAnchorId) return 'quick';
  fail('ACTION_PRODUCED_ITEM_ACCESS_DENIED');
}
function refs(value, empty) {
  return Array.isArray(value) && (empty || value.length > 0)
    && value.every(text) && new Set(value).size === value.length;
}
