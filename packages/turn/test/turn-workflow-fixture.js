import assert from 'node:assert/strict';

import { createPartyStore } from '@rus/party-store';
import { createTurnCommandRegistry } from '../src/index.js';

export function validVisibleContext(overrides = {}) {
  return {
    version: 1,
    schema: 'visible_context_package',
    visible_scene: 'У ворот стоит телега; дальше видна дорога.',
    visible_changes: [],
    sensory_details: [],
    visible_npc: [],
    visible_objects: [],
    known_context: [],
    uncertainties: [],
    allowed_tensions: [],
    do_not_imply: [],
    ...overrides
  };
}
export function committedTurnState(stateVersion = 0) {
  return {
    party_state: { party_id: 'party-1', state_version: stateVersion },
    current_position: {
      region_id: 'region-novgorod', place_id: 'place-gate'
    },
    clock_weather_light: {
      clock: { day: 1, hour: 9, minute: 0 }, weather: {}, light: {}
    },
    visible_context: validVisibleContext(),
    character_knowledge_map: [],
    relevant_hidden_state: { hidden_sentinel: 'must_not_leak' },
    relevant_events: []
  };
}

export function createServices(log = [], overrides = {}) {
  const { command: commandOverrides = {}, ...serviceOverrides } = overrides;
  const commits = [];
  const partyStore = createPartyStore({ transact: async (plan) => {
    commits.push(structuredClone(plan));
    return { committed: true, write_count: plan.write_targets.length };
  } });
  const services = {
      stateReader: {
        async read(request) {
          log.push('load_context');
          return {
            party_state: { party_id: request.party_id, state_version: 0 },
            current_position: { region_id: 'region-novgorod', place_id: 'place-gate' },
            clock_weather_light: { clock: { day: 1, hour: 9, minute: 0 }, weather: {}, light: {} },
            visible_context: validVisibleContext(),
            character_knowledge_map: [],
            relevant_hidden_state: { hidden_sentinel: 'must_not_leak' },
            relevant_events: []
          };
        }
      },
      randomSource: { next: () => 0.45 },
      visibleProjector: {
        async project(request) {
          log.push('visible_projection');
          assert.equal(request.retrieved_state.relevant_hidden_state.hidden_sentinel, 'must_not_leak');
          return validVisibleContext({
            visible_scene: 'На оглобле телеги заметна свежая грязь.',
            visible_changes: ['Ты внимательнее осмотрел телегу.']
          });
        }
      },
      persistedVisibleReader: {
        async read() {
          log.push('persisted_visible_projection');
          return validVisibleContext({
            visible_scene: 'На оглобле телеги заметна свежая грязь.',
            visible_changes: ['Ты внимательнее осмотрел телегу.']
          });
        }
      },
      narrator: {
        async run(request) {
          log.push('narration');
          assert.equal(request.schema, 'narration_request');
          assert.equal(JSON.stringify(request).includes('hidden_sentinel'), false);
          assert.equal(Object.hasOwn(request.context, 'mode_resolution'), false);
          assert.equal(Object.hasOwn(request.context, 'player_input'), false);
          return approvedNarration(request.request_id, 'На оглобле темнеет свежая полоса грязи.');
        }
      },
      partyStore,
      semanticResolver: async () => ({ status: 'unknown' }),
      decisionSecret: 'turn-test-secret',
      decisionExpiresAt: '2027-07-12T10:00:00.000Z',
      decisionNow: () => '2026-07-12T10:00:01.000Z',
      ...serviceOverrides
  };
  const defaultMode = { selected_primary_mode: 'attention', secondary_modes: [], resolution_plan: { subsystems: ['visible_context_projection'], checks_to_run: ['visibility'], expected_writes: ['party_state', 'party_visible_context_package', 'party_narrator_output'], state_blocks_to_load: ['party_state', 'current_position', 'clock_weather_light', 'visible_context', 'relevant_hidden_state'] } };
  services.commandRegistry = createTurnCommandRegistry([{
    command_id: commandOverrides.command_id ?? 'inspect_cart', target_id: 'place-gate', expected_cost: { kind: 'time', value: 5 }, known_risks: [], reason_visible_to_actor: 'Осмотреть доступный объект.',
    semantic_binding: commandOverrides.semantic_binding ?? null,
    matches(context) { log.push('resolve_mode'); return (commandOverrides.matches ?? (() => true))(context); },
    mode: commandOverrides.mode ?? defaultMode,
    async availability(context) { log.push('availability'); return (commandOverrides.availability ?? (() => ({ version: 1, schema: 'turn_availability_decision', status: 'check_required', can_attempt: true, reasons: [], check_requests: [{ check_id: 'attention-1', difficulty: 10, attribute_value: 12, skill_bonus: 1 }] })))(context); },
    async consequence(context) { log.push('consequence'); if (!commandOverrides.consequence) assert.equal(context.checks.results[0].roll, 10); return (commandOverrides.consequence ?? (() => ({ version: 1, schema: 'turn_consequence_package', status: 'resolved', duration_minutes: 5, visible_seed: { observation: 'На оглобле свежая грязь.' }, hidden_update: { recent_changes: ['attention-1'] }, state_changes: [{ target: 'character_knowledge_map', operation: 'append_observation' }], suggested_actions: [{ label: 'Осмотреть колёса', command: 'осматриваю колёса' }] })))(context); },
    async hiddenUpdate(context) { log.push('hidden_update'); return (commandOverrides.hiddenUpdate ?? ((value) => ({ approved_update: value.approved_update })))(context); },
    async writeTargets(context) { log.push('persistence_plan'); return (commandOverrides.writeTargets ?? ((value) => [{ target: 'party_state', value: { turn_number: 1 } }, { target: 'party_visible_context_package', value: value.visibleContext }]))(context); }
  }]);
  return { commits, services };
}

export function approvedNarration(requestId, prose) {
  return {
    version: 1,
    schema: 'narration_flow_result',
    request_id: requestId,
    surface: 'turn',
    status: 'approved',
    pass: true,
    approved_output: {
      version: 1,
      schema: 'narration_output',
      output_id: `narration:${requestId}`,
      prose,
      action_options: [],
      used_references: [],
      self_check: { no_new_world_facts: true }
    },
    final_audit: {
      version: 1,
      schema: 'narration_audit',
      pass: true,
      concerns: [],
      evidence: ['Approved against visible context.']
    },
    repair_request: null,
    generation_history: [],
    audit_history: [],
    repair_history: [],
    diagnostics: {}
  };
}

export function input() {
  return {
    party_id: 'party-1',
    turn_number: 1,
    request_id: 'request-1',
    idempotency_key: 'idempotency-1',
    raw_text: 'Я осматриваю телегу.'
  };
}

export function turnStepPlan(request, overrides = {}) {
  return {
    schema: 'turn_step_plan_v1',
    request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision,
    step_index: request.step_index,
    interpretation: {
      player_goal: request.root_player_action,
      grounded_attempt: request.remaining_intent,
      adaptation: 'literal'
    },
    resolution: 'direct',
    goal_result: 'achieved',
    activity: {
      owner: 'semantic',
      duration_class: 'moment',
      effort: 'light'
    },
    operations: [],
    check: null,
    continuation: null,
    clarification: null,
    reason_code: 'test_step',
    reason: 'Code-owned integration test plan.',
    ...overrides
  };
}

export function genericCheck(outcomeOverrides = {}) {
  const outcome = (band) => outcomeOverrides[band] ?? {
    goal_result: 'not_achieved',
    additional_activity: null,
    operations: [],
    continuation: null
  };
  return {
    purpose: 'удержать равновесие',
    attribute_ref: 'party-1',
    skill_ref: null,
    difficulty_id: 'risky',
    outcomes: {
      clean_success: outcome('clean_success'),
      success: outcome('success'),
      success_with_cost: outcome('success_with_cost'),
      failure_with_consequence: outcome('failure_with_consequence'),
      severe_failure: outcome('severe_failure')
    }
  };
}
