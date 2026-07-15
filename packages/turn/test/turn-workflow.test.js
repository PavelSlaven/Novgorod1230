import test from 'node:test';
import assert from 'node:assert/strict';

import { createPartyStore } from '@rus/party-store';
import { createNarrationService } from '@rus/narration';
import {
  TURN_WORKFLOW_STAGE_IDS,
  TURN_WORKFLOW_STAGE_PLAN,
  TURN_ALLOWED_STATE_BLOCKS,
  TURN_ALLOWED_WRITE_TARGETS,
  TURN_TRAVEL_COMMAND_IDS,
  createTurnCommandRegistry,
  runTurnWorkflow,
  validateTurnWorkflowStagePlan
} from '../src/index.js';
import {
  createLegacyTurnCompatibilityAdapter,
  createPartyTurnRuntimeState
} from '../src/compat/index.js';

function validVisibleContext(overrides = {}) {
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

function createServices(log = [], overrides = {}) {
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
            party_state: { party_id: request.party_id },
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
      narrator: {
        async run(request) {
          log.push('narration');
          assert.equal(request.schema, 'narration_request');
          assert.equal(JSON.stringify(request).includes('hidden_sentinel'), false);
          return approvedNarration(request.request_id, 'На оглобле темнеет свежая полоса грязи.');
        }
      },
      partyStore,
      ...serviceOverrides
  };
  const defaultMode = { selected_primary_mode: 'attention', secondary_modes: [], resolution_plan: { subsystems: ['visible_context_projection'], checks_to_run: ['visibility'], expected_writes: ['party_state', 'party_visible_context_package', 'party_narrator_output'], state_blocks_to_load: ['party_state', 'current_position', 'clock_weather_light', 'visible_context', 'relevant_hidden_state'] } };
  services.commandRegistry = createTurnCommandRegistry([{
    command_id: commandOverrides.command_id ?? 'inspect_cart', target_id: 'place-gate', expected_cost: { kind: 'time', value: 5 }, known_risks: [], reason_visible_to_actor: 'Осмотреть доступный объект.',
    matches(context) { log.push('resolve_mode'); return (commandOverrides.matches ?? (() => true))(context); },
    mode: commandOverrides.mode ?? defaultMode,
    async availability(context) { log.push('availability'); return (commandOverrides.availability ?? (() => ({ version: 1, schema: 'turn_availability_decision', status: 'check_required', can_attempt: true, reasons: [], check_requests: [{ check_id: 'attention-1', difficulty: 10, attribute_value: 12, skill_bonus: 1 }] })))(context); },
    async consequence(context) { log.push('consequence'); if (!commandOverrides.consequence) assert.equal(context.checks.results[0].roll, 10); return (commandOverrides.consequence ?? (() => ({ version: 1, schema: 'turn_consequence_package', status: 'resolved', duration_minutes: 5, visible_seed: { observation: 'На оглобле свежая грязь.' }, hidden_update: { recent_changes: ['attention-1'] }, state_changes: [{ target: 'character_knowledge_map', operation: 'append_observation' }], suggested_actions: [{ label: 'Осмотреть колёса', command: 'осматриваю колёса' }] })))(context); },
    async hiddenUpdate(context) { log.push('hidden_update'); return (commandOverrides.hiddenUpdate ?? ((value) => ({ approved_update: value.approved_update })))(context); },
    async writeTargets(context) { log.push('persistence_plan'); return (commandOverrides.writeTargets ?? ((value) => [{ target: 'party_state', value: { turn_number: 1 } }, { target: 'party_visible_context_package', value: value.visibleContext }, { target: 'party_narrator_output', value: value.narration }]))(context); }
  }]);
  return { commits, services };
}

function approvedNarration(requestId, prose) {
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

function input() {
  return { party_id: 'party-1', turn_number: 1, raw_text: 'Я осматриваю телегу.' };
}

test('turn stage plan is exact and declarative', () => {
  assert.equal(validateTurnWorkflowStagePlan(TURN_WORKFLOW_STAGE_PLAN), TURN_WORKFLOW_STAGE_PLAN);
  assert.deepEqual(TURN_WORKFLOW_STAGE_PLAN.map((stage) => stage.id), TURN_WORKFLOW_STAGE_IDS);
});

test('full modular turn runs a code command, approved check, commit and screen projection', async () => {
  const log = [];
  const { services, commits } = createServices(log);
  const result = await runTurnWorkflow(input(), services, { now: '2026-07-12T10:00:00.000Z' });

  assert.equal(result.status, 'resolved');
  assert.equal(result.mode, 'attention');
  assert.equal(result.summary.check_count, 1);
  assert.equal(result.summary.duration_minutes, 5);
  assert.equal(result.screen.prose, 'На оглобле темнеет свежая полоса грязи.');
  assert.equal(commits.length, 1);
  assert.deepEqual(log, ['resolve_mode', 'load_context', 'availability', 'consequence', 'hidden_update', 'visible_projection', 'narration', 'persistence_plan']);
  assert.deepEqual(result.checkpoint.events.map((event) => event.stage_id), TURN_WORKFLOW_STAGE_IDS);
});

test('turn integrates the canonical narration flow and versioned TurnScreen', async () => {
  const { services } = createServices();
  services.narrator = createNarrationService({
    writer: {
      async generate(request) {
        return {
          version: 1,
          schema: 'narration_output',
          output_id: `output:${request.request_id}`,
          prose: 'На площади медленно тянется разговор.',
          action_options: [],
          used_references: [],
          self_check: { no_new_world_facts: true }
        };
      }
    },
    auditor: { async audit() { return { version: 1, schema: 'narration_audit', pass: true, concerns: [], evidence: ['Grounded in visible context.'] }; } },
    formatRepairer: { async repair(request) { return request.invalid_output ?? request.prior_output; } },
    seniorWriter: { async repair(request) { return request.prior_output; } },
    seniorAuditor: { async audit() { return { version: 1, schema: 'narration_audit', pass: true, concerns: [], evidence: ['Senior approval.'] }; } },
    router: { async route() { return { version: 1, schema: 'narration_repair_route', route: 'block', reason: 'UNREACHABLE' }; } }
  });
  const result = await runTurnWorkflow(input(), services);
  assert.equal(result.screen.schema, 'turn_screen');
  assert.equal(result.screen.main_prose, 'На площади медленно тянется разговор.');
  assert.equal(result.screen.narration_approval.audit_evidence.length, 1);
});

test('player words remain intent and are never promoted to world facts by the command registry', async () => {
  const { services } = createServices();
  const result = await runTurnWorkflow({ ...input(), raw_text: 'Я беру нож со стола.' }, services);
  const normalized = result.checkpoint.stages.normalize_intent;
  assert.equal(normalized.contract, 'intent_not_fact');
  assert.equal(normalized.interpretation_status, 'pending');
  assert.equal('knife_exists' in normalized, false);
});

test('code command registry is mandatory and no free-form semantic resolver is accepted', async () => {
  const { services } = createServices();
  delete services.commandRegistry;
  await assert.rejects(() => runTurnWorkflow(input(), services), (error) => error.code === 'TURN_SERVICES_MISSING');
});

test('RandomSource is required only when an approved check request exists', async () => {
  const { services } = createServices();
  delete services.randomSource;
  await assert.rejects(() => runTurnWorkflow(input(), services), (error) => error.code === 'TURN_RANDOM_SOURCE_REQUIRED');

  const noCheck = createServices([], { command: {
      availability() { return { version: 1, schema: 'turn_availability_decision', status: 'available', can_attempt: true, reasons: [], check_requests: [] }; },
      consequence(request) { assert.equal(request.checks.results.length, 0); return {
          version: 1,
          schema: 'turn_consequence_package',
          status: 'resolved',
          duration_minutes: 0,
          visible_seed: {},
          hidden_update: {},
          state_changes: [],
          suggested_actions: []
        }; }
  } });
  delete noCheck.services.randomSource;
  const result = await runTurnWorkflow(input(), noCheck.services);
  assert.equal(result.summary.check_count, 0);
});

test('visible security boundary rejects hidden fields before narration and commit', async () => {
  const { services, commits } = createServices([], {
    visibleProjector: {
      async project() {
        return validVisibleContext({ hidden_state: { secret: true } });
      }
    }
  });
  await assert.rejects(() => runTurnWorkflow(input(), services), /visible_context_package invalid/u);
  assert.equal(commits.length, 0);
});

test('failed narration audit blocks persistence', async () => {
  const { services, commits } = createServices([], {
    narrator: {
      async run(request) {
        return {
          version: 1,
          schema: 'narration_flow_result',
          request_id: request.request_id,
          surface: 'turn',
          status: 'blocked',
          pass: false,
          approved_output: null,
          final_audit: null,
          repair_request: null,
          generation_history: [],
          audit_history: [],
          repair_history: [],
          diagnostics: { phase: 'audit' }
        };
      }
    }
  });
  await assert.rejects(() => runTurnWorkflow(input(), services), /narration_flow_result invalid/u);
  assert.equal(commits.length, 0);
});

test('legacy compatibility adapter preserves runtime names without importing legacy implementation', async () => {
  const { services } = createServices();
  const screen = {
    party_id: 'party-1',
    turn_number: 0,
    visible_context: validVisibleContext()
  };
  const runtime = createPartyTurnRuntimeState({ partyScreenPayload: { firstGameScreen: screen } });
  assert.equal(runtime.schema, 'party_turn_runtime_state');
  const adapter = createLegacyTurnCompatibilityAdapter(services);
  const result = await adapter.runPartyTurnRuntime({ partyRuntimeState: runtime, rawText: 'Осматриваюсь.' });
  assert.equal(result.partyRuntimeState.current_turn_number, 1);
  assert.equal(result.partyScreenPayload.schema, 'party_turn_result_ui_payload');
});

test('repair_required stops before time, narration and persistence', async () => {
  const log = [];
  const { services, commits } = createServices(log, { command: {
      consequence() { return {
          version: 1,
          schema: 'turn_consequence_package',
          status: 'repair_required',
          duration_minutes: 0,
          visible_seed: {},
          hidden_update: {},
          state_changes: [],
          suggested_actions: []
        }; }
  } });
  await assert.rejects(() => runTurnWorkflow(input(), services), (error) => error.code === 'TURN_REPAIR_REQUIRED');
  assert.equal(commits.length, 0);
  assert.equal(log.includes('narration'), false);
  assert.equal(log.includes('persistence_plan'), false);
});

test('turn contracts reserve travel state blocks and normalized persistence targets', () => {
  for (const stateBlock of ['active_journey', 'journey_legs', 'travel_position', 'environment_landmarks', 'environment_cues', 'movement_traces', 'transport_state']) {
    assert.equal(TURN_ALLOWED_STATE_BLOCKS.includes(stateBlock), true, stateBlock);
  }
  for (const target of ['party_journeys', 'party_journey_legs', 'party_environment_runs', 'party_environment_choices', 'party_environment_landmarks', 'party_environment_cues', 'party_environment_traces']) {
    assert.equal(TURN_ALLOWED_WRITE_TARGETS.includes(target), true, target);
  }
});

test('travel command identifiers are a code-owned finite set', () => {
  assert.deepEqual(TURN_TRAVEL_COMMAND_IDS, [
    'travel.start_route', 'travel.start_course', 'travel.continue', 'travel.stop',
    'travel.change_pace', 'travel.reroute', 'travel.camp', 'travel.resume', 'travel.abandon'
  ]);
});
