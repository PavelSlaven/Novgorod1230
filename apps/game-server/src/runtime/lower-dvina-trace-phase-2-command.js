import { createTurnCommandRegistry } from '@rus/turn';
import { serverError } from '../errors.js';
import {
  evidenceSupportsFact,
  TRACE_PHASE_2_IDS
} from './lower-dvina-trace-phase-2-contracts.js';
import {
  inspectTracePhase2TemporalWindow
} from './lower-dvina-trace-phase-2-temporal.js';

const EXACT_INSPECTION_TEXTS = new Set([
  'осмотреть лодку, верёвку и следы. понять, что здесь случилось.',
  'осмотреть место крушения подробно.'
]);

export function createTracePhase2InspectionRegistry({
  contracts,
  inputDigest
}) {
  const ids = TRACE_PHASE_2_IDS;
  return createTurnCommandRegistry([{
    command_id: 'lower_dvina_trace.inspect_wreck_in_detail',
    option_id: ids.option,
    label: 'Подробно осмотреть место крушения',
    target_id: contracts.locationRef,
    approved_record: contracts.activityPin,
    reason_visible_to_actor:
      'Можно внимательно изучить лодку, крепления и следы на берегу.',
    expected_cost: {
      kind: 'exact_time',
      value: contracts.activity.duration_minutes
    },
    known_risks: [
      'Холод и промокшая одежда продолжают действовать.'
    ],
    preconditions: [{
      kind: 'committed_location',
      location_ref: contracts.locationRef
    }, {
      kind: 'approved_access_policy',
      policy_ref: contracts.activity.preconditions.access_policy_ref
    }],
    mode: inspectionMode(),
    matches({ raw_text: rawText }) {
      return EXACT_INSPECTION_TEXTS.has(normalizeText(rawText));
    },
    availability(context) {
      const state = context.committed_state ?? context.retrievedState;
      if (!tracePhase2PreconditionSatisfied({
        kind: 'committed_location',
        location_ref: contracts.locationRef
      }, state, contracts)
          || !tracePhase2PreconditionSatisfied({
            kind: 'approved_access_policy',
            policy_ref: contracts.accessPolicy.policy_id
          }, state, contracts)) {
        return availability('blocked', false, [], [
          'player_not_at_wreck_shore'
        ]);
      }
      const temporalWindow = inspectTracePhase2TemporalWindow({
        contracts,
        state
      });
      if (!temporalWindow.ok) {
        return availability('blocked', false, [], [
          'temporal_boundary_precedes_activity_completion'
        ]);
      }
      return availability('check_required', true, [{
        check_id: contracts.check.check_id,
        difficulty: contracts.check.dc,
        attribute_value:
          state.player_profile.attributes[
            contracts.check.attribute
          ].value,
        skill_bonus:
          state.player_profile.skills[contracts.check.skill].bonus,
        state_modifier: contracts.check.modifiers.state,
        equipment_modifier:
          contracts.check.modifiers.item_or_evidence,
        circumstance_modifier:
          contracts.check.modifiers.circumstance,
        profile_version: contracts.check.version,
        consequence_refs:
          structuredClone(contracts.check.outcome_refs),
        retry_policy: contracts.check.retry_policy
      }]);
    },
    consequence({ retrievedState, checks }) {
      return resolveInspectionConsequence({
        retrievedState,
        checks,
        contracts,
        inputDigest
      });
    },
    writeTargets(input) {
      return inspectionWriteTargets(input);
    }
  }]);
}

export function tracePhase2PreconditionSatisfied(
  precondition,
  state,
  contracts
) {
  if (precondition.kind === 'committed_location') {
    return state?.position?.location_ref === precondition.location_ref
      && typeof state.position.g5_anchor_id === 'string'
      && state.position.g5_anchor_id.length > 0;
  }
  if (precondition.kind === 'approved_access_policy') {
    return precondition.policy_ref === contracts.accessPolicy.policy_id
      && contracts.accessPolicy.location_ref
        === state?.position?.location_ref
      && contracts.accessPolicy.hidden_or_open_state === 'open'
      && contracts.accessPolicy.unmaterialized_access === 'forbidden'
      && typeof state?.actor_id === 'string'
      && state.actor_id.length > 0;
  }
  return false;
}

function resolveInspectionConsequence({
  retrievedState,
  checks,
  contracts,
  inputDigest
}) {
  const ids = TRACE_PHASE_2_IDS;
  const checkResult = checks.results.find(
    (entry) => entry.check_id === contracts.check.check_id
  );
  if (!checkResult) {
    throw serverError(
      'TRACE_PHASE_2_CHECK_RESULT_MISSING',
      'Canonical wreck inspection check did not resolve.',
      { status: 409 }
    );
  }
  const success = checkResult.outcome.success === true;
  const evidenceRefs = [
    ...contracts.check.precheck_automatic_observation_refs.filter((ref) =>
      contracts.evidenceGraph.evidence_records.some(
        (record) => record.evidence_id === ref
      )),
    ...(success
      ? contracts.check.admitted_evidence_by_outcome.success
      : contracts.check.admitted_evidence_by_outcome.failure)
  ];
  const observationRefs = [...new Set([
    ...contracts.check.precheck_automatic_observation_refs,
    ...(success ? contracts.check.success_observation_refs : []),
    ...evidenceRefs
  ])];
  const knownFacts = new Set(
    (retrievedState.knowledge ?? []).map(({ fact_id: factId }) => factId)
  );
  const newlyCommittedObservationRefs = observationRefs.filter(
    (factId) => !knownFacts.has(factId)
  );
  const newlyCommittedEvidenceRefs = evidenceRefs.filter((evidenceId) =>
    newlyCommittedObservationRefs.some((factId) =>
      evidenceSupportsFact(contracts, evidenceId, factId)
    )
  );
  const clueAlreadyCommitted = retrievedState.items.some(
    (item) => item.template_id === ids.blueWool
  );
  return {
    version: 1,
    schema: 'turn_consequence_package',
    status: 'resolved',
    activity_attempt_id:
      `attempt:${inputDigest.slice(0, 32)}`,
    duration_minutes: contracts.activity.duration_minutes,
    body_effect_ref: ids.bodyEffect,
    consequence_ref: success
      ? contracts.check.outcome_refs.success
      : contracts.check.outcome_refs.failure,
    check_result: structuredClone(checkResult),
    observations: newlyCommittedObservationRefs.map((factId, ordinal) => ({
      observation_id:
        `observation:${inputDigest.slice(0, 20)}:${ordinal}`,
      fact_id: factId,
      kind: 'committed_observation'
    })),
    knowledge_records: newlyCommittedObservationRefs.map((factId) => ({
      fact_id: factId,
      knowledge_state: 'observed',
      evidence_refs: newlyCommittedEvidenceRefs.filter((evidenceId) =>
        evidenceSupportsFact(contracts, evidenceId, factId))
    })),
    evidence_relations: newlyCommittedEvidenceRefs.map((evidenceId) => ({
      evidence_id: evidenceId,
      relation: 'discovered_during_inspection',
      proves: 'bounded_observation_only'
    })),
    clue_materialization:
      success && !clueAlreadyCommitted
        ? structuredClone(contracts.blueWoolClue)
        : null,
    visible_seed: {
      observation_refs: observationRefs,
      evidence_refs: evidenceRefs,
      clue_ref: success ? ids.blueWool : null,
      check_outcome: checkResult.outcome.band
    },
    hidden_update: {
      approved_fact_ids: observationRefs,
      approved_evidence_ids: evidenceRefs
    },
    state_changes: [{
      target: 'character_knowledge_map',
      operation: 'append_committed_observations'
    }],
    suggested_actions: []
  };
}

function inspectionWriteTargets(input) {
  return [{
    target: 'party_state',
    value: {
      player_input: input.playerInput,
      mode_resolution: input.modeResolution,
      availability: input.availability,
      consequence: input.consequence,
      time_update: input.timeUpdate,
      body_update: input.bodyUpdate,
      hidden_update: input.hiddenUpdate
    }
  }, {
    target: 'party_visible_context_package',
    value: input.visibleContext
  }, {
    target: 'party_character_knowledge_map',
    value: input.consequence.knowledge_records
  }, {
    target: 'party_events',
    value: input.consequence.observations
  }, {
    target: 'party_items',
    value: input.consequence.clue_materialization
  }];
}

function inspectionMode() {
  return {
    selected_primary_mode: 'attention',
    secondary_modes: ['knowledge_history', 'body_state'],
    resolution_plan: {
      subsystems: [
        'visible_context_projection',
        'knowledge_memory',
        'body_state',
        'time_progression'
      ],
      checks_to_run: ['visibility', 'body_state', 'time_cost'],
      expected_writes: [
        'party_state',
        'party_character_knowledge_map',
        'party_items',
        'party_events',
        'party_visible_context_package'
      ],
      state_blocks_to_load: [
        'party_state',
        'current_position',
        'clock_weather_light',
        'visible_context',
        'character_knowledge_map',
        'relevant_hidden_state',
        'relevant_items',
        'relevant_anchors',
        'relevant_events'
      ]
    }
  };
}

function availability(status, canAttempt, checkRequests, reasons) {
  return {
    version: 1,
    schema: 'turn_availability_decision',
    status,
    can_attempt: canAttempt,
    reasons,
    check_requests: checkRequests
  };
}

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase()
    .replace(/\s+/gu, ' ');
}
