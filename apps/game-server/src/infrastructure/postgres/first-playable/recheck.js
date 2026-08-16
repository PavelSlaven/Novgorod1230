import { canonicalDigest } from '@rus/materialization';
import {
  recheckTracePhase3LocationCapacity
} from './recheck-location-capacity.js';
import { recheckLocalEvidenceSlot } from './recheck-local-evidence-slot.js';
import { recheckPhase6TargetedAdmission } from
  './recheck-phase6-admission.js';

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
  if (check.kind === 'item') {
    return recheckExactItem({ transaction, partyId, check });
  }
  if (check.kind === 'container') {
    return recheckExactContainer({ transaction, partyId, check });
  }
  if (check.kind === 'physical'
      && check.physical_model === 'trace_phase6_targeted_admission') {
    return recheckPhase6TargetedAdmission({ transaction, partyId, check });
  }
  if (check.kind === 'activity') {
    return recheckExactActivity({ transaction, check });
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
    if (check.capacity_model === 'trace_phase3_location_actor_capacity') {
      return recheckTracePhase3LocationCapacity({
        transaction, partyId, check
      });
    }
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

async function recheckExactItem({ transaction, partyId, check }) {
  const holder = exactActorExpectation(
    'holder',
    check.expected_holder_npc_id,
    check.expected_holder_character_id
  );
  const controller = exactActorExpectation(
    'controller',
    check.expected_controller_npc_id,
    check.expected_controller_character_id
  );
  const exactNullableCondition = Object.hasOwn(check, 'expected_ownership')
    && check.expected_condition_state === null;
  if (!nonEmpty(check.item_id) || holder == null || controller == null
      || (!nonEmpty(check.expected_condition_state) && !exactNullableCondition)
      || !nonEmpty(check.expected_physical_position)) {
    return resultOf(false, 'generated_schema_mismatch');
  }
  const result = await transaction.query(
    `SELECT i.condition_state,p.holder_npc_id,p.holder_character_id,
            p.physical_position,p.equipment_slot_category_id,
            o.owner_npc_id,o.owner_character_id,o.owner_party,
            o.owner_external_ref,o.controller_npc_id,
            o.controller_character_id,o.claim_state
       FROM party_runtime.party_items i
       JOIN party_runtime.party_item_placements p
         ON p.party_id=i.party_id AND p.item_id=i.item_id
       JOIN party_runtime.party_ownership o
         ON o.party_id=i.party_id AND o.item_id=i.item_id
      WHERE i.party_id=$1 AND i.item_id=$2
      FOR UPDATE OF i,p,o`,
    [partyId, check.item_id]
  );
  const actual = result.rows[0];
  return resultOf(
    result.rowCount === 1
    && actual.condition_state === check.expected_condition_state
    && actual[holder.column] === holder.value
    && actual[controller.column] === controller.value
    && actual.physical_position === check.expected_physical_position
    && (!Object.hasOwn(check, 'expected_equipment_slot_category_id')
      || actual.equipment_slot_category_id
        === check.expected_equipment_slot_category_id)
    && expectedOwnershipMatches(actual, check)
  );
}

async function recheckExactContainer({ transaction, partyId, check }) {
  const holder = exactActorExpectation('holder',
    check.expected_holder_npc_id, check.expected_holder_character_id);
  const controller = exactActorExpectation('controller',
    check.expected_controller_npc_id,
    check.expected_controller_character_id);
  if (!nonEmpty(check.container_id) || holder == null || controller == null
      || !nonEmpty(check.expected_physical_position)
      || !Object.hasOwn(check, 'expected_ownership')) {
    return resultOf(false, 'generated_schema_mismatch');
  }
  const result = await transaction.query(
    `SELECT c.condition_state,c.closure_state,c.holder_npc_id,
            c.holder_character_id,c.physical_position,
            c.equipment_slot_category_id,o.owner_npc_id,
            o.owner_character_id,o.owner_party,o.owner_external_ref,
            o.controller_npc_id,o.controller_character_id,o.claim_state
       FROM party_runtime.party_containers c
       JOIN party_runtime.party_ownership o
         ON o.party_id=c.party_id AND o.container_id=c.container_id
      WHERE c.party_id=$1 AND c.container_id=$2
      FOR UPDATE OF c,o`,
    [partyId, check.container_id]
  );
  const actual = result.rows[0];
  return resultOf(result.rowCount === 1
    && actual.condition_state === check.expected_condition_state
    && actual.closure_state === check.expected_closure_state
    && actual[holder.column] === holder.value
    && actual[controller.column] === controller.value
    && actual.physical_position === check.expected_physical_position
    && actual.equipment_slot_category_id
      === check.expected_equipment_slot_category_id
    && expectedOwnershipMatches(actual, check));
}

function expectedOwnershipMatches(actual, check) {
  if (!Object.hasOwn(check, 'expected_ownership')) return true;
  return canonicalDigest(ownershipState(actual))
    === canonicalDigest(check.expected_ownership);
}

function ownershipState(value) {
  return {
    owner_npc_id: value?.owner_npc_id ?? null,
    owner_character_id: value?.owner_character_id ?? null,
    owner_party: value?.owner_party === true,
    owner_external_ref: structuredClone(value?.owner_external_ref ?? null),
    controller_npc_id: value?.controller_npc_id ?? null,
    controller_character_id: value?.controller_character_id ?? null,
    claim_state: value?.claim_state ?? null
  };
}

function exactActorExpectation(prefix, npcId, characterId) {
  const values = [
    [`${prefix}_npc_id`, npcId],
    [`${prefix}_character_id`, characterId]
  ];
  const populated = values.filter(([, value]) => nonEmpty(value));
  if (populated.length !== 1) return null;
  return { column: populated[0][0], value: populated[0][1] };
}

async function recheckExactActivity({ transaction, check }) {
  if (!nonEmpty(check.execution_id)
      || !Number.isInteger(check.expected_progress_before)
      || check.expected_progress_before < 0) {
    return resultOf(false, 'generated_schema_mismatch');
  }
  const result = await transaction.query(
    `SELECT cumulative_elapsed_numerator::text,
            cumulative_elapsed_denominator::text,status,state_version
       FROM party_runtime.party_timed_activity_executions
      WHERE id=$1
      FOR UPDATE`,
    [check.execution_id]
  );
  if (check.expected_progress_before === 0) {
    return resultOf(result.rowCount === 0);
  }
  const actual = result.rows[0];
  return resultOf(
    result.rowCount === 1
    && actual.cumulative_elapsed_numerator
      === String(check.expected_progress_before)
    && actual.cumulative_elapsed_denominator === '1'
    && ['active', 'paused'].includes(actual.status)
  );
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
