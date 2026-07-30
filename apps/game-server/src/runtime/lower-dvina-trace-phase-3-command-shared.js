import { serverError } from '../errors.js';

const EXACT = Object.freeze({
  follow_path_to_fishing_camp: new Set([
    'пойти по тропе к рыбацкому стану.',
    'дойти до рыбацкого стана.'
  ]),
  ask_eremey_about_wreck: new Set([
    'спросить еремея о крушении.',
    'поговорить с еремеем о крушении.'
  ]),
  show_clue_and_seek_eremey_cooperation: new Set([
    'показать еремею синюю шерсть.',
    'показать улику еремею и попросить помочь.'
  ])
});

export function exactMatcher(optionId) {
  return ({ raw_text: rawText }) =>
    EXACT[optionId].has(String(rawText ?? '').trim().toLowerCase()
      .replace(/\s+/gu, ' '));
}

export function available(canAttempt, checkRequests, reasons) {
  return {
    version: 1,
    schema: 'turn_availability_decision',
    status: checkRequests.length ? 'check_required'
      : canAttempt ? 'available' : 'blocked',
    can_attempt: canAttempt,
    reasons,
    check_requests: checkRequests
  };
}

export function mode(primary, subsystems) {
  return {
    selected_primary_mode: primary,
    secondary_modes: [],
    resolution_plan: {
      subsystems,
      checks_to_run: [],
      expected_writes: ['party_state', 'party_visible_context_package'],
      state_blocks_to_load: [
        'party_state', 'current_position', 'clock_weather_light',
        'visible_context', 'character_knowledge_map', 'relevant_items'
      ]
    }
  };
}

export function packageBase({ inputDigest, duration, kind, ...detail }) {
  return {
    version: 1,
    schema: 'turn_consequence_package',
    status: 'resolved',
    activity_attempt_id: `attempt:${inputDigest.slice(0, 32)}`,
    duration_minutes: duration,
    phase3_kind: kind,
    ...detail,
    visible_seed: {},
    hidden_update: {},
    state_changes: [],
    suggested_actions: []
  };
}

export function phase3WriteTargets(input) {
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
  }];
}

export function exact(records, key, id) {
  const found = records.filter((record) => record[key] === id);
  if (found.length !== 1) fail('TRACE_PHASE_3_EXECUTION_BINDING_GAP');
  return found[0];
}

export function fail(code) {
  throw serverError(code, 'Phase 3 execution failed closed.', { status: 409 });
}
