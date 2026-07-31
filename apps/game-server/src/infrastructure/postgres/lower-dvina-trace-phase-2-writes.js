import { canonicalDigest } from '@rus/materialization';
import {
  computeSpatialV3CanonicalDigest
} from '@rus/contracts/spatial-v3/registry';
import { row } from './first-playable/plan-shared.js';
import {
  appendPhase2Clue
} from './lower-dvina-trace-phase-2-clue-writes.js';

export function buildPhase2Writes(input) {
  const {
    partyId, state, snapshot, factual, visibleEnvelope, pendingScreen,
    nextVersion, turnNumber, changeSetId, idemId, clue, inputDigest,
    nextBodyState
  } = input;
  const inserts = [
    row('party_state_snapshots', `${partyId}:${nextVersion}`, {
      party_id: partyId,
      state_version: nextVersion,
      state_payload: snapshot,
      state_digest: canonicalDigest(snapshot)
    })
  ];
  const updates = [
    row('parties', partyId, {
      party_id: partyId,
      status: 'active'
    }),
    row('party_server_sessions', partyId, {
      party_id: partyId,
      screen: pendingScreen,
      turn_number: turnNumber,
      last_turn_id: factual.mode_resolution.turn_id,
      updated_change_set_id: changeSetId
    }),
    row('party_clocks', partyId, {
      party_id: partyId,
      whole_minutes: factual.time_update.clock_after.whole_minutes,
      subminute_numerator:
        factual.time_update.clock_after.subminute_numerator,
      subminute_denominator:
        factual.time_update.clock_after.subminute_denominator,
      updated_change_set_id: changeSetId
    }),
    row('party_actor_body_states',
      `player_character:${state.actor_id}`, {
        party_id: partyId,
        actor_kind: 'player_character',
        actor_id: state.actor_id,
        health: nextBodyState.health,
        energy: nextBodyState.energy,
        satiety: nextBodyState.satiety,
        updated_change_set_id: changeSetId
      })
  ];
  appendConditionUpdates({
    updates,
    state,
    nextBodyState,
    partyId
  });
  const appends = [
    row('party_v3_change_sets', changeSetId, {
      id: changeSetId,
      party_id: partyId,
      operation_kind: 'trace_wreck_inspection',
      idempotency_record_id: idemId
    }),
    row('party_check_resolutions',
      `check:${partyId}:trace-phase2:${turnNumber}`,
      checkRecord({
        partyId, turnNumber, changeSetId, factual, inputDigest
      })),
    row('party_body_temporal_history',
      `body-history:${partyId}:trace-phase2:${turnNumber}`, {
        history_id:
          `body-history:${partyId}:trace-phase2:${turnNumber}`,
        party_id: partyId,
        subject_kind: 'player_character',
        subject_id: state.actor_id,
        effect_ref: {
          entity_kind: 'body_effect',
          entity_id: factual.consequence.body_effect_ref,
          activity_attempt_id:
            factual.consequence.activity_attempt_id,
          execution_variant_id:
            factual.body_update.proposal.execution_variant_id
        },
        change_set_id: changeSetId,
        idempotency_record_id: idemId,
        occurred_at_whole_minutes:
          factual.time_update.clock_after.whole_minutes,
        occurred_at_subminute_numerator:
          factual.time_update.clock_after.subminute_numerator,
        occurred_at_subminute_denominator:
          factual.time_update.clock_after.subminute_denominator
      })
  ];
  appendKnowledge({ inserts, state, factual, partyId });
  appendPhase2Clue({ inserts, state, clue, partyId });
  return { inserts, updates, appends, deletes: [] };
}

function appendConditionUpdates({
  updates,
  state,
  nextBodyState,
  partyId
}) {
  const beforeByStorageId = new Map(
    state.body_state.active_conditions.map(
      (condition) => [condition.storage_condition_id, condition]
    )
  );
  for (const after of nextBodyState.active_conditions) {
    const before = beforeByStorageId.get(after.storage_condition_id);
    if (!before || !after.condition_outcome) continue;
    updates.push(row(
      'party_actor_active_conditions',
      `player_character:${state.actor_id}:${after.storage_condition_id}`,
      {
        party_id: partyId,
        actor_kind: 'player_character',
        actor_id: state.actor_id,
        condition_id: after.storage_condition_id,
        condition_profile_ref:
          structuredClone(after.condition_profile_ref),
        status: 'active',
        terminal_change_set_id: null
      }
    ));
  }
}

export function buildPhase2VisibleEnvelope({
  partyId,
  turnNumber,
  nextVersion,
  changeSetId,
  idemId,
  context,
  contracts
}) {
  const payload = {
    schema: 'temporal_visible_package.v1',
    perceived_scene: context.visible_scene,
    perceived_changes: context.visible_changes,
    sensory_details: context.sensory_details,
    visible_npcs: context.visible_npc,
    visible_objects: context.visible_objects,
    known_context: context.known_context,
    uncertainties: context.uncertainties,
    hypotheses: [],
    player_safe_interruption: null,
    allowed_action_affordances: []
  };
  const dependencyPins = [{
    dependency_role: 'source_authoring',
    entity_ref: {
      entity_kind: 'activity_profile',
      entity_id: contracts.activityPin.id
    },
    version_pin: {
      pin_kind: 'authoring_version',
      authoring_version: String(contracts.activityPin.version),
      state_version: null
    }
  }];
  return {
    package_id: `visible:${partyId}:trace-phase2:${turnNumber}`,
    party_id: partyId,
    turn_id: `turn:${partyId}:${turnNumber}`,
    committed_state_version: String(nextVersion),
    change_set_id: changeSetId,
    package_digest: computeSpatialV3CanonicalDigest(payload),
    visible_payload: payload,
    presentation_status: 'pending',
    projection_policy_ref: {
      entity_ref: {
        entity_kind: 'visibility_modifier',
        entity_id: 'lower_dvina_trace_phase_2_visible_v1'
      },
      authoring_version: '1'
    },
    dependency_pins: {
      pins: dependencyPins,
      canonical_digest: canonicalDigest(dependencyPins)
    },
    idempotency_record_id: idemId
  };
}

function appendKnowledge({ inserts, state, factual, partyId }) {
  for (const knowledge of factual.consequence.knowledge_records) {
    if ((state.knowledge ?? []).some(
      (entry) => entry.fact_id === knowledge.fact_id
    )) continue;
    inserts.push(row('party_character_knowledge',
      `${state.actor_id}:${knowledge.fact_id}`, {
        party_id: partyId,
        character_id: state.actor_id,
        fact_id: knowledge.fact_id,
        knowledge_state: knowledge.knowledge_state,
        evidence: knowledge.evidence_refs
      }));
  }
}

function checkRecord({
  partyId, turnNumber, changeSetId, factual, inputDigest
}) {
  const result = factual.consequence.check_result;
  const scope = {
    request_id: factual.player_input.request_id,
    option_id: factual.mode_resolution.option_id
  };
  const policyRef = {
    entity_kind: 'check_policy',
    entity_id: factual.availability.check_requests[0].check_id,
    authoring_version:
      String(factual.availability.check_requests[0].profile_version)
  };
  const consequenceRef = {
    entity_kind: 'consequence_policy',
    entity_id: factual.consequence.consequence_ref,
    authoring_version: '1'
  };
  return {
    check_resolution_id:
      `check:${partyId}:trace-phase2:${turnNumber}`,
    party_id: partyId,
    check_scope_kind: 'immediate_action',
    check_scope_key: scope,
    check_policy_ref: policyRef,
    deterministic_roll_input_digest: canonicalDigest({
      input_digest: inputDigest,
      request: factual.availability.check_requests[0],
      audit: result.audit
    }),
    roll_value: result.roll,
    modifier_snapshot: result.modifiers,
    target_value: result.difficulty,
    result_kind: result.outcome.success ? 'success' : 'failure',
    consequence_policy_ref: consequenceRef,
    result_change_set_id: changeSetId,
    canonical_digest: canonicalDigest({
      input_digest: inputDigest,
      scope,
      result,
      consequence: factual.consequence
    })
  };
}
