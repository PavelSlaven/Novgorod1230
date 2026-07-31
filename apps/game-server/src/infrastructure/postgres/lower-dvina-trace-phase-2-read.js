import { canonicalDigest } from '@rus/materialization';
import {
  computeSpatialV3CanonicalDigest
} from '@rus/contracts/spatial-v3/registry';
import { serverError } from '../../errors.js';

export async function assertPhase2NormalizedRows(pool, payload, head) {
  const [
    body, conditions, bodyHistory, clock, items, knowledge, check, visible,
    idempotency
  ] =
    await Promise.all([
      pool.query(
        `SELECT health,energy,satiety,state_version
           FROM party_runtime.party_actor_body_states
          WHERE party_id=$1 AND actor_kind='player_character'
            AND actor_id=$2`,
        [payload.party_id, payload.actor_id]
      ),
      pool.query(
        `SELECT condition_id,condition_profile_ref,status,state_version
           FROM party_runtime.party_actor_active_conditions
          WHERE party_id=$1 AND actor_kind='player_character'
            AND actor_id=$2
          ORDER BY condition_id`,
        [payload.party_id, payload.actor_id]
      ),
      loadPhase2BodyHistory(pool, payload.party_id, payload.actor_id),
      pool.query(
        `SELECT whole_minutes::text,subminute_numerator::text,
                subminute_denominator::text,state_version
           FROM party_runtime.party_clocks WHERE party_id=$1`,
        [payload.party_id]
      ),
      pool.query(
        `SELECT i.item_id,i.template_id,i.profile_id,i.quantity,i.state,
                p.anchor_id,p.container_id,p.holder_npc_id,
                p.holder_character_id,p.physical_position,
                p.equipment_slot_category_id,
                o.owner_external_ref,o.controller_character_id,o.claim_state
           FROM party_runtime.party_items i
           JOIN party_runtime.party_item_placements p
             ON p.party_id=i.party_id AND p.item_id=i.item_id
           JOIN party_runtime.party_ownership o
             ON o.party_id=i.party_id AND o.item_id=i.item_id
          WHERE i.party_id=$1 ORDER BY i.item_id`,
        [payload.party_id]
      ),
      pool.query(
        `SELECT fact_id,knowledge_state,evidence
           FROM party_runtime.party_character_knowledge
          WHERE party_id=$1 AND character_id=$2 ORDER BY fact_id`,
        [payload.party_id, payload.actor_id]
      ),
      pool.query(
        `SELECT *
           FROM party_runtime.party_check_resolutions
          WHERE party_id=$1
            AND check_scope_kind='immediate_action'
          ORDER BY check_resolution_id`,
        [payload.party_id]
      ),
      pool.query(
        `SELECT package_digest,visible_payload
           FROM party_runtime.party_visible_packages
          WHERE package_id=$1`,
        [payload.last_turn.visible_package.package_id]
      ),
      pool.query(
        `SELECT request_id,semantic_command_snapshot,
                semantic_command_digest
           FROM party_runtime.party_command_idempotency
          WHERE idempotency_key=$1`,
        [payload.last_turn.idempotency_key]
      )
    ]);
  const expectedClue = payload.items.find(
    (item) => item.template_id
      === 'trace_ld_v1_item_blue_wool_fragment'
  );
  const actualClue = items.rows.find(
    (item) => item.template_id
      === 'trace_ld_v1_item_blue_wool_fragment'
  );
  const expectedKnowledge = [...payload.knowledge].sort(
    (left, right) => left.fact_id.localeCompare(right.fact_id)
  );
  const actualKnowledge = knowledge.rows.map((entry) => ({
    fact_id: entry.fact_id,
    knowledge_state: entry.knowledge_state,
    evidence_refs: entry.evidence
  }));
  const currentCheck = check.rows.find(
    (entry) => entry.check_scope_key?.request_id
      === payload.last_turn.request_id
  );
  const semanticSnapshot =
    idempotency.rows[0]?.semantic_command_snapshot;
  const expectedConditions = normalizedConditionProof(
    payload.body_state.active_conditions
  );
  const actualConditions = normalizedConditionProof(
    conditions.rows.map(conditionFromRow)
  );
  if (Number(body.rows[0]?.state_version)
        !== Number(head.body_state_version)
      || Number(clock.rows[0]?.state_version)
        !== Number(head.clock_state_version)
      || Number(body.rows[0]?.health) !== payload.body_state.health
      || Number(body.rows[0]?.energy) !== payload.body_state.energy
      || Number(body.rows[0]?.satiety) !== payload.body_state.satiety
      || canonicalDigest(actualConditions)
        !== canonicalDigest(expectedConditions)
      || canonicalDigest(bodyHistory)
        !== canonicalDigest(payload.body_effect_history ?? [])
      || clock.rows[0]?.whole_minutes !== payload.clock.whole_minutes
      || clock.rows[0]?.subminute_numerator
        !== payload.clock.subminute_numerator
      || clock.rows[0]?.subminute_denominator
        !== payload.clock.subminute_denominator
      || canonicalDigest(actualKnowledge)
        !== canonicalDigest(expectedKnowledge)
      || check.rows.length !== payload.party_state.turn_number
      || currentCheck?.roll_value !== payload.last_turn.check_result.roll
      || canonicalDigest(currentCheck?.modifier_snapshot)
        !== canonicalDigest(payload.last_turn.check_result.modifiers)
      || currentCheck?.target_value
        !== payload.last_turn.check_result.difficulty
      || currentCheck?.deterministic_roll_input_digest
        !== canonicalDigest({
          input_digest: payload.last_turn.input_digest,
          request: payload.last_turn.check_request,
          audit: payload.last_turn.check_result.audit
        })
      || currentCheck?.canonical_digest
        !== canonicalDigest({
          input_digest: payload.last_turn.input_digest,
          scope: {
            request_id: payload.last_turn.request_id,
            option_id: payload.last_turn.option_id
          },
          result: payload.last_turn.check_result,
          consequence: payload.last_turn.consequence
        })
      || visible.rows.length !== 1
      || idempotency.rows.length !== 1
      || idempotency.rows[0].request_id
        !== payload.last_turn.request_id
      || semanticSnapshot?.input_digest
        !== payload.last_turn.input_digest
      || semanticSnapshot?.selected_option_id
        !== payload.last_turn.option_id
      || semanticSnapshot?.action_set_digest
        !== payload.last_turn.action_set_digest
      || canonicalDigest(semanticSnapshot?.semantic_trace)
        !== canonicalDigest(payload.last_turn.semantic_trace)
      || visible.rows[0].package_digest
        !== payload.last_turn.visible_package.package_digest
      || visible.rows[0].package_digest
        !== computeSpatialV3CanonicalDigest(
          visible.rows[0].visible_payload
        )
      || Boolean(expectedClue) !== Boolean(actualClue)
      || (expectedClue
        && (expectedClue.item_id !== actualClue.item_id
          || !cluePlacementMatches(expectedClue, actualClue)
          || !clueOwnershipMatches(expectedClue, actualClue)
          || canonicalDigest(expectedClue.state)
            !== canonicalDigest(actualClue.state)))) {
    throw phase2IntegrityError();
  }
}

function cluePlacementMatches(expected, actual) {
  if (!expected.state?.pickup_transition) {
    return expected.placement.anchor_id === actual.anchor_id;
  }
  return expected.profile_id === actual.profile_id
    && expected.quantity === actual.quantity
    && canonicalDigest(expected.placement) === canonicalDigest({
      holder_character_id: actual.holder_character_id,
      physical_position: actual.physical_position
    });
}

function clueOwnershipMatches(expected, actual) {
  if (!expected.state?.pickup_transition) return true;
  return canonicalDigest(actual.owner_external_ref) === canonicalDigest({
    entity_kind: 'participant_slot',
    entity_id: expected.state.property_state.owner_ref
  })
    && actual.controller_character_id
      === expected.state.property_state.controller_ref
    && actual.claim_state === 'owner_preserved_evidence_held';
}

export async function loadPhase2Conditions(pool, partyId, actorId) {
  const result = await pool.query(
    `SELECT condition_id,condition_profile_ref,status,state_version
       FROM party_runtime.party_actor_active_conditions
      WHERE party_id=$1 AND actor_kind='player_character'
        AND actor_id=$2 AND status='active'
      ORDER BY condition_id`,
    [partyId, actorId]
  );
  const conditions = result.rows.map(conditionFromRow);
  if (conditions.some((condition) => !condition.id)) {
    throw phase2IntegrityError();
  }
  return conditions;
}

export async function loadPhase2BodyHistory(pool, partyId, actorId) {
  const result = await pool.query(
    `SELECT history_id,effect_ref,
            occurred_at_whole_minutes::text,
            occurred_at_subminute_numerator::text,
            occurred_at_subminute_denominator::text
       FROM party_runtime.party_body_temporal_history
      WHERE party_id=$1 AND subject_kind='player_character'
        AND subject_id=$2
      ORDER BY occurred_at_whole_minutes,history_id`,
    [partyId, actorId]
  );
  return result.rows.map((row) => ({
    history_id: row.history_id,
    effect_ref: row.effect_ref?.entity_id,
    activity_attempt_id: row.effect_ref?.activity_attempt_id,
    execution_variant_id: row.effect_ref?.execution_variant_id,
    occurred_at: {
      whole_minutes: row.occurred_at_whole_minutes,
      subminute_numerator: row.occurred_at_subminute_numerator,
      subminute_denominator: row.occurred_at_subminute_denominator
    }
  }));
}

function conditionFromRow(row) {
  return {
    id: row.condition_profile_ref?.state ?? null,
    storage_condition_id: row.condition_id,
    condition_profile_ref: structuredClone(row.condition_profile_ref),
    status: row.status,
    state_version: Number(row.state_version)
  };
}

function normalizedConditionProof(conditions) {
  return [...(conditions ?? [])].map((condition) => ({
    id: condition.id,
    storage_condition_id: condition.storage_condition_id,
    condition_profile_ref: structuredClone(condition.condition_profile_ref),
    status: condition.status,
    state_version: Number(condition.state_version)
  })).sort((left, right) =>
    left.storage_condition_id.localeCompare(right.storage_condition_id));
}

export function mergePhase2Knowledge(current, added) {
  const byId = new Map(
    current.map((entry) => [entry.fact_id, structuredClone(entry)])
  );
  for (const entry of added) {
    if (!byId.has(entry.fact_id)) byId.set(entry.fact_id, entry);
  }
  return [...byId.values()].sort(
    (left, right) => left.fact_id.localeCompare(right.fact_id)
  );
}

export function phase2IntegrityError() {
  return serverError(
    'TRACE_PHASE_2_SESSION_READ_INVALID',
    'Persisted Phase 2 state failed exact cross-table validation.',
    { status: 409 }
  );
}
