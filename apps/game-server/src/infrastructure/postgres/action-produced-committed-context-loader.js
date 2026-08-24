import { INVALID_ACTION_PRODUCED_DATA,
  actionProducedText as text,
  deepFreezeActionProducedPersistenceData as deepFreeze,
  exactActionProducedRecord as exact,
  failActionProducedPersistence as fail,
  snapshotActionProducedPersistenceData as snapshot
} from './action-produced-persistence-boundary.js';
import { loadActionProducedOutputDestination } from './action-produced-authority-loader.js';
import { actionProducedOwnerOutputDestination } from
  './action-produced-atomic-write-plan-pins.js';
import { actionProducedPreparedOrdinaryRows } from './action-produced-prepared-ordinary.js';
import { actionProducedDestinationAfterPreparedActions,
  actionProducedPreparedActionRows } from
  './action-produced-prepared-ordinary.js';
import { bindActionProducedResourcePins } from
  './action-produced-resource-pins.js';
import { actionProducedAccessState,
  actionProducedControllerPermitted,
  actionProducedControllerRef,
  actionProducedPlacementAccessible,
  loadActionProducedAccessContainers } from
  './action-produced-contained-access.js';

const INPUT_KEYS = ['party_id', 'actor_ref', 'root_turn_id', 'action_ref',
  'step_index', 'context_ref', 'expected_party_state_version', 'source_refs',
  'tool_refs', 'admission_profile', 'technical_policy'];
const PREPARED_INPUT_KEYS = [...INPUT_KEYS, 'prepared_ordinary_plan',
  'prepared_action_plans', 'change_set_id'];

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
        && (!text(input.change_set_id)
          || !Array.isArray(input.prepared_action_plans))) {
    fail('ACTION_PRODUCED_LOAD_INVALID');
  }

  const party = await client.query(
    `SELECT state_version FROM party_runtime.parties
     WHERE party_id=$1`, [input.party_id]);
  if (party.rows.length !== 1
      || Number(party.rows[0].state_version)
        !== input.expected_party_state_version) {
    fail('ACTION_PRODUCED_PARTY_STALE');
  }
  const outputDestinationPin = actionProducedDestinationAfterPreparedActions(
    await loadActionProducedOutputDestination(client, input),
    input.prepared_action_plans ?? []);

  const requested = [...input.source_refs, ...input.tool_refs];
  const preparedActions = actionProducedPreparedActionRows(input);
  if (requested.some((itemId) => preparedActions.retired.has(itemId))) {
    fail('ACTION_PRODUCED_ITEM_ACCESS_DENIED');
  }
  const prepared = actionProducedPreparedOrdinaryRows(input, requested);
  const databaseRefs = requested.filter((itemId) =>
    !preparedActions.rows.has(itemId) && !prepared.has(itemId));
  const rows = await client.query(
    `SELECT i.item_id,i.run_id,i.template_id,i.profile_id,i.category_id,
       i.quantity,i.condition_state,i.legal_status,i.state,i.state_version,
       p.anchor_id,p.container_id,p.holder_npc_id,p.holder_character_id,
       p.physical_position,p.equipment_slot_category_id,p.attached_item_id,
       e.position_node_id AS scene_position_id,
       e.occupies_capacity_units AS scene_occupies_capacity_units,
       e.state_version AS scene_state_version,
       o.ownership_id,o.owner_npc_id,o.owner_character_id,o.owner_party,
       o.controller_npc_id,o.controller_character_id,o.claim_state
     FROM party_runtime.party_items i
     JOIN party_runtime.party_item_placements p
       ON p.party_id=i.party_id AND p.item_id=i.item_id
     JOIN party_runtime.party_ownership o
       ON o.party_id=i.party_id AND o.item_id=i.item_id
     LEFT JOIN party_runtime.entity_placements e
       ON e.party_id=i.party_id AND e.entity_kind='item'
      AND e.entity_id=i.item_id AND e.placement_kind='scene_position'
     WHERE i.party_id=$1 AND i.item_id=ANY($2::text[])
     ORDER BY i.item_id`, [input.party_id, databaseRefs]);
  if (rows.rows.length + prepared.size + [...preparedActions.rows.keys()]
    .filter((itemId) => requested.includes(itemId)).length
      !== requested.length) {
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
     ORDER BY resource_node_id`, [input.party_id, databaseRefs.filter(
      (itemId) => input.source_refs.includes(itemId))]);
  const resources = bindActionProducedResourcePins(resourceRows.rows,
    input.source_refs);
  for (const [itemId, future] of preparedActions.rows) {
    if (!input.source_refs.includes(itemId)
        || future.finiteResourceRow == null) continue;
    const bound = bindActionProducedResourcePins(
      [future.finiteResourceRow], [itemId]);
    resources.set(itemId, bound.get(itemId));
  }
  const byId = new Map(rows.rows.map((row) => [row.item_id, row]));
  const accessContainers = await loadActionProducedAccessContainers(client,
    input.party_id, rows.rows.map(({ container_id: id }) => id));
  const contextVersion = contextVersionFrom(input);
  const rowPins = requested.map((itemId) => {
    const futureAction = preparedActions.rows.get(itemId);
    const future = futureAction ?? prepared.get(itemId);
    return rowPin({
    row: future?.row ?? byId.get(itemId),
    role: input.source_refs.includes(itemId) ? 'source' : 'tool',
    actorRef: input.actor_ref,
    contextVersion,
    finite: resources.get(itemId) ?? null,
    accessAnchorId: outputDestinationPin?.anchor_id ?? null,
    accessScenePositionId: outputDestinationPin?.scene_position_id ?? null,
    accessContainer: future == null
      ? accessContainers.get(byId.get(itemId)?.container_id) ?? null : null,
    preparedOrdinary: future?.preparedOrdinary ?? null,
    preparedAction: future?.preparedAction ?? null
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
    role_membership: [role]
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
  accessScenePositionId,
  accessContainer = null, preparedOrdinary = null, preparedAction = null }) {
  if (!row || !text(row.item_id)
      || !Number.isSafeInteger(Number(row.state_version))
      || Number(row.state_version) < 1
      || preparedOrdinary === null && preparedAction === null
        && !actionProducedPlacementAccessible(row, accessContainer, actorRef,
          accessAnchorId)
      || row.scene_position_id != null && (!text(accessScenePositionId)
        || row.scene_position_id !== accessScenePositionId)
      || row.holder_npc_id !== null
      || !validOwnership(row)
      || !actionProducedControllerPermitted(row, role, actorRef)
      || row.state?.lifecycle_status != null
        && row.state.lifecycle_status !== 'active'
      || finite != null && (
        finite.persisted_row.position_node_id
          !== row.state?.resource_position_node_id
        || finite.persisted_row.property_basis_ref
          !== row.state?.property_state?.resource_property_basis_ref)) {
    fail('ACTION_PRODUCED_ITEM_ACCESS_DENIED');
  }
  const access = preparedOrdinary === null && preparedAction === null
    ? actionProducedAccessState(row, accessContainer, actorRef, accessAnchorId)
    : 'quick';
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
  return {
    role, item_id: row.item_id, item, placement, ownership,
    ...(row.scene_position_id == null ? {} : { scene_placement: {
      position_node_id: row.scene_position_id,
      occupies_capacity_units: Number(row.scene_occupies_capacity_units),
      state_version: Number(row.scene_state_version) } }),
    entity_snapshot: {
      schema: 'rus.items.action_produced_committed_entity_snapshot.v1',
      commit_state: 'committed', role, entity_ref: row.item_id,
      state_version: contextVersion,
      lifecycle_state: 'active', access_state: access,
      holder_ref: holderRef,
      controller_ref: actionProducedControllerRef(row),
      ownership_snapshot: structuredClone(ownership),
      finite_resource: finite?.snapshot ?? null
    },
    finite_resource_row: finite?.persisted_row ?? null,
    ...(accessContainer === null ? {} : {
      access_container: structuredClone(accessContainer)
    }),
    ...(preparedOrdinary === null ? {} : {
      prepared_ordinary: preparedOrdinary
    }),
    ...(preparedAction === null ? {} : {
      prepared_action: preparedAction
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

function refs(value, empty) {
  return Array.isArray(value) && (empty || value.length > 0)
    && value.every(text) && new Set(value).size === value.length;
}
