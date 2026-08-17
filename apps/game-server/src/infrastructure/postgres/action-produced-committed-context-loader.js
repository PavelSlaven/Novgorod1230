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
import { loadActionProducedAuthority as loadAuthority,
  loadActionProducedOutputDestination as loadOutputDestination } from
  './action-produced-authority-loader.js';
import { actionProducedOwnerOutputDestination } from
  './action-produced-atomic-write-plan-pins.js';

const INPUT_KEYS = [
  'party_id', 'actor_ref', 'root_turn_id', 'action_ref', 'step_index',
  'context_ref', 'expected_party_state_version', 'source_refs', 'tool_refs'
];

export async function loadActionProducedCommittedContext(client, rawInput) {
  const input = snapshot(rawInput);
  if (input === INVALID_ACTION_PRODUCED_DATA || !exact(input, INPUT_KEYS)
      || ![input.party_id, input.actor_ref, input.root_turn_id,
        input.action_ref, input.context_ref].every(text)
      || !Number.isSafeInteger(input.step_index) || input.step_index < 1
      || input.step_index > 8
      || !Number.isSafeInteger(input.expected_party_state_version)
      || input.expected_party_state_version < 0
      || !refs(input.source_refs, false) || !refs(input.tool_refs, true)
      || input.source_refs.some((ref) => input.tool_refs.includes(ref))
      || typeof client?.query !== 'function') fail('ACTION_PRODUCED_LOAD_INVALID');

  const party = await client.query(
    `SELECT state_version FROM party_runtime.parties
     WHERE party_id=$1`, [input.party_id]);
  if (party.rows.length !== 1
      || Number(party.rows[0].state_version)
        !== input.expected_party_state_version) {
    fail('ACTION_PRODUCED_PARTY_STALE');
  }
  const authority = await loadAuthority(client, input);
  const outputDestinationPin = await loadOutputDestination(client, input);

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
  if (rows.rows.length !== requested.length) fail('ACTION_PRODUCED_ITEM_GAP');

  const resourceRows = await client.query(
    `SELECT resource_node_id,source_resource_ref,quantity_numerator,
       quantity_denominator,quantity_unit_ref,lifecycle_state,state_version,
       position_node_id,property_basis_ref
     FROM party_runtime.party_resource_nodes
     WHERE party_id=$1
       AND source_resource_ref->>'entity_kind'='party_item'
       AND source_resource_ref->>'entity_id'=ANY($2::text[])
     ORDER BY resource_node_id`, [input.party_id, input.source_refs]);
  const resources = bindResources(resourceRows.rows, input.source_refs);
  const byId = new Map(rows.rows.map((row) => [row.item_id, row]));
  const contextVersion = String(input.expected_party_state_version);
  const rowPins = requested.map((itemId) => rowPin({
    row: byId.get(itemId),
    role: input.source_refs.includes(itemId) ? 'source' : 'tool',
    actorRef: input.actor_ref,
    contextVersion,
    finite: resources.get(itemId) ?? null
  }));
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
    authority_pin: authority.pin,
    output_destination_pin: outputDestinationPin,
    output_destination: actionProducedOwnerOutputDestination(
      outputDestinationPin, input.actor_ref),
    admission_profile: {
      schema: 'rus.items.action_produced_admission_profile.v1',
      profile_ref: authority.row.profile_ref,
      profile_version: authority.row.profile_version,
      status: 'committed', context_ref: authority.row.context_ref,
      context_state_version: contextVersion,
      allowed_access_states: structuredClone(authority.row.allowed_access_states),
      allowed_identity_modes:
        structuredClone(authority.row.allowed_identity_modes),
      allowed_origins: structuredClone(authority.row.allowed_origins),
      allowed_result_classes:
        structuredClone(authority.row.allowed_result_classes)
    },
    technical_policy: {
      schema: 'rus.items.action_produced_technical_policy.v1', version: 1,
      status: 'committed', policy_ref: authority.row.policy_ref,
      profile_ref: authority.row.profile_ref,
      profile_version: authority.row.profile_version,
      max_new_entities: authority.row.max_new_entities
    },
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

function rowPin({ row, role, actorRef, contextVersion, finite }) {
  if (!row || !text(row.item_id)
      || !Number.isSafeInteger(Number(row.state_version))
      || Number(row.state_version) < 1
      || row.holder_character_id !== actorRef
      || row.holder_npc_id !== null
      || row.owner_character_id !== actorRef
      || row.owner_npc_id !== null
      || row.owner_party !== false
      || row.claim_state !== 'owned'
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
  const access = accessState(row.physical_position);
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
      holder_ref: actorRef, controller_ref: actorRef,
      mechanics_state_ref: mechanicsRef,
      property_state_ref: propertyRef,
      ownership_state_ref: digest(ownership),
      ...propertyBasis,
      ownership_snapshot: structuredClone(ownership),
      placement_state_ref: placementRef,
      finite_resource: finite?.snapshot ?? null
    },
    finite_resource_row: finite?.persisted_row ?? null
  };
}

function bindResources(rows, sourceRefs) {
  const output = new Map();
  for (const row of rows) {
    const itemId = row.source_resource_ref?.entity_id;
    if (!sourceRefs.includes(itemId) || output.has(itemId)) {
      fail('ACTION_PRODUCED_RESOURCE_AMBIGUOUS');
    }
    const numerator = numeric(row.quantity_numerator);
    const denominator = numeric(row.quantity_denominator);
    const stateVersion = numeric(row.state_version);
    const unit = row.quantity_unit_ref?.entity_id;
    if (row.source_resource_ref?.entity_kind !== 'party_item'
        || Object.keys(row.source_resource_ref).sort().join(',')
          !== 'entity_id,entity_kind'
        || !text(unit) || numerator < 0 || denominator < 1
        || stateVersion < 1 || row.lifecycle_state !== 'active') {
      fail('ACTION_PRODUCED_RESOURCE_INVALID');
    }
    output.set(itemId, {
      snapshot: {
        schema: 'rus.items.finite_resource_snapshot.v1',
        commit_state: 'committed',
        source_resource_node_id: row.resource_node_id,
        state_version: stateVersion,
        lifecycle_state: row.lifecycle_state,
        quantity: { numerator, denominator, unit }
      },
      persisted_row: {
        resource_node_id: row.resource_node_id,
        source_resource_ref: row.source_resource_ref,
        quantity_numerator: numerator,
        quantity_denominator: denominator,
        quantity_unit_ref: row.quantity_unit_ref,
        lifecycle_state: row.lifecycle_state,
        state_version: stateVersion,
        position_node_id: row.position_node_id,
        property_basis_ref: row.property_basis_ref
      }
    });
  }
  return output;
}

function accessState(value) {
  if (['hands', 'equipped', 'worn_quick'].includes(value)) return 'immediate';
  if (['worn', 'external', 'external_load'].includes(value)) return 'quick';
  fail('ACTION_PRODUCED_ITEM_ACCESS_DENIED');
}
function refs(value, empty) {
  return Array.isArray(value) && (empty || value.length > 0)
    && value.every(text) && new Set(value).size === value.length;
}
function numeric(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) fail('ACTION_PRODUCED_NUMERIC_INVALID');
  return number;
}
