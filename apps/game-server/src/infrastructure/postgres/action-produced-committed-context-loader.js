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
  actionProducedDestinationAfterPreparedOrdinary,
  actionProducedPreparedActionRows } from
  './action-produced-prepared-ordinary.js';
import { bindActionProducedResourcePins } from
  './action-produced-resource-pins.js';
import { loadActionProducedAccessContainers } from
  './action-produced-contained-access.js';
import { createActionProducedCommittedRowPin } from
  './action-produced-committed-row-pin.js';

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
    actionProducedDestinationAfterPreparedOrdinary(
      await loadActionProducedOutputDestination(client, input),
      input.prepared_ordinary_plan ?? null), input.prepared_action_plans ?? []);

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
       p.anchor_id,p.scene_position_id AS item_scene_position_id,
       p.container_id,p.holder_npc_id,p.holder_character_id,
       p.physical_position,p.equipment_slot_category_id,p.attached_item_id,
       e.position_node_id AS scene_position_id,
       e.occupies_capacity_units AS scene_occupies_capacity_units,
       e.state_version AS scene_state_version,
       o.ownership_id,o.owner_npc_id,o.owner_character_id,o.owner_party,
       o.owner_external_ref,
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
    return createActionProducedCommittedRowPin({
    row: future?.row ?? byId.get(itemId),
    role: input.source_refs.includes(itemId) ? 'source' : 'tool',
    actorRef: input.actor_ref,
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

function refs(value, empty) {
  return Array.isArray(value) && (empty || value.length > 0)
    && value.every(text) && new Set(value).size === value.length;
}
