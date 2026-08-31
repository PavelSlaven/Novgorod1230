import { createTurnCommandRegistry } from '@rus/turn';
import { serverError } from '../errors.js';
import {
  TRACE_PHASE_2_IDS
} from './lower-dvina-trace-phase-2-contracts.js';
import {
  resolveInspectionConsequence
} from './lower-dvina-trace-phase-2-consequence.js';
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
  return createTurnCommandRegistry([
    createTracePhase2InspectionCommand({ contracts, inputDigest })
  ]);
}

export function createTracePhase2InspectionCommand({
  contracts,
  inputDigest
}) {
  const ids = TRACE_PHASE_2_IDS;
  return {
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
      if (!temporalWindow.ok
          && state.temporal_source_proof?.version !== 2) {
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
  };
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
