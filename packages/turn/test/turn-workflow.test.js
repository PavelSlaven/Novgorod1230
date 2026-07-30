import test from 'node:test';
import assert from 'node:assert/strict';

import { createPartyStore } from '@rus/party-store';
import { createNarrationService } from '@rus/narration';
import {
  TURN_WORKFLOW_STAGE_IDS,
  TURN_WORKFLOW_STAGE_PLAN,
  createTurnAvailableActionSet,
  createTurnCommandRegistry,
  resolveTurnSemanticIntent,
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
    matches(context) { log.push('resolve_mode'); return (commandOverrides.matches ?? (() => true))(context); },
    mode: commandOverrides.mode ?? defaultMode,
    async availability(context) { log.push('availability'); return (commandOverrides.availability ?? (() => ({ version: 1, schema: 'turn_availability_decision', status: 'check_required', can_attempt: true, reasons: [], check_requests: [{ check_id: 'attention-1', difficulty: 10, attribute_value: 12, skill_bonus: 1 }] })))(context); },
    async consequence(context) { log.push('consequence'); if (!commandOverrides.consequence) assert.equal(context.checks.results[0].roll, 10); return (commandOverrides.consequence ?? (() => ({ version: 1, schema: 'turn_consequence_package', status: 'resolved', duration_minutes: 5, visible_seed: { observation: 'На оглобле свежая грязь.' }, hidden_update: { recent_changes: ['attention-1'] }, state_changes: [{ target: 'character_knowledge_map', operation: 'append_observation' }], suggested_actions: [{ label: 'Осмотреть колёса', command: 'осматриваю колёса' }] })))(context); },
    async hiddenUpdate(context) { log.push('hidden_update'); return (commandOverrides.hiddenUpdate ?? ((value) => ({ approved_update: value.approved_update })))(context); },
    async writeTargets(context) { log.push('persistence_plan'); return (commandOverrides.writeTargets ?? ((value) => [{ target: 'party_state', value: { turn_number: 1 } }, { target: 'party_visible_context_package', value: value.visibleContext }]))(context); }
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
  return {
    party_id: 'party-1',
    turn_number: 1,
    request_id: 'request-1',
    idempotency_key: 'idempotency-1',
    raw_text: 'Я осматриваю телегу.'
  };
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
  assert.deepEqual(log, [
    'load_context',
    'availability',
    'resolve_mode',
    'load_context',
    'availability',
    'availability',
    'consequence',
    'hidden_update',
    'visible_projection',
    'persistence_plan',
    'persisted_visible_projection',
    'narration'
  ]);
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

test('code command registry and semantic resolver are mandatory', async () => {
  const { services } = createServices();
  delete services.commandRegistry;
  await assert.rejects(() => runTurnWorkflow(input(), services), (error) => error.code === 'TURN_SERVICES_MISSING');
});

test('available action set is committed-state-driven, complete, sorted and raw-text independent', async () => {
  const seen = [];
  const pin = {
    id: 'approved.inspect',
    version: 1,
    digest: 'a'.repeat(64)
  };
  const definition = (optionId, matches, visible = true) => ({
    command_id: `command:${optionId}`,
    option_id: optionId,
    label: optionId,
    approved_record: pin,
    matches,
    mode: {
      selected_primary_mode: 'attention',
      resolution_plan: {
        state_blocks_to_load: ['party_state'],
        subsystems: [],
        checks_to_run: [],
        expected_writes: []
      }
    },
    availability(context) {
      seen.push(structuredClone(context));
      return {
        version: 1,
        schema: 'turn_availability_decision',
        status: visible ? 'available' : 'blocked',
        can_attempt: visible,
        reasons: [],
        check_requests: []
      };
    },
    consequence() {},
    writeTargets() { return []; }
  });
  const registry = createTurnCommandRegistry([
    definition('z-option', () => false),
    definition('a-option', () => false),
    definition('hidden-option', () => true, false)
  ]);
  const state = {
    party_state: { state_version: 7 },
    visible_context: { scene: 'shore' },
    relevant_hidden_state: { culprit: 'must-not-be-projected' }
  };
  const left = await createTurnAvailableActionSet({
    registry,
    committedState: state,
    actorId: 'actor-1',
    policyPins: [pin]
  });
  const right = await createTurnAvailableActionSet({
    registry,
    committedState: state,
    actorId: 'actor-1',
    policyPins: [pin]
  });
  assert.deepEqual(left.options.map(({ option_id }) => option_id), [
    'a-option',
    'z-option'
  ]);
  assert.equal(left.options_digest, right.options_digest);
  assert.equal(JSON.stringify(left).includes('culprit'), false);
  assert.equal(seen.every((entry) => !('raw_text' in entry)), true);
});

test('zero regex matches invokes bounded semantic resolver and preserves the approved option_id', async () => {
  const pin = {
    id: 'approved.inspect',
    version: 1,
    digest: 'b'.repeat(64)
  };
  const registry = createTurnCommandRegistry([{
    command_id: 'inspect-command',
    option_id: 'inspect_wreck_in_detail',
    label: 'Осмотреть крушение',
    approved_record: pin,
    matches: () => false,
    mode: {},
    availability: () => ({
      status: 'available',
      can_attempt: true,
      check_requests: []
    }),
    consequence() {},
    writeTargets() {}
  }]);
  const set = await createTurnAvailableActionSet({
    registry,
    committedState: { state_version: 3 },
    actorId: 'mikula',
    policyPins: [pin]
  });
  let semanticInput;
  const resolved = await resolveTurnSemanticIntent({
    rawText: 'Хочу внимательно изучить повреждения судна.',
    actionSet: set,
    semanticResolver: async (input) => {
      semanticInput = input;
      return { option_id: input.action_set[0].option_id };
    },
    stateVersion: 3,
    policyVersion: '1',
    requestId: 'semantic-1',
    partyId: 'party-1',
    decisionSecret: 'semantic-secret',
    issuedAt: '2026-07-12T10:00:00.000Z',
    expiresAt: '2026-07-12T10:05:00.000Z',
    decisionNow: () => '2026-07-12T10:01:00.000Z'
  });
  assert.equal(resolved.option_id, 'inspect_wreck_in_detail');
  assert.equal(semanticInput.action_set.length, 1);
  assert.equal(JSON.stringify(semanticInput).includes('culprit'), false);
  assert.equal(
    semanticInput.action_set_digest,
    set.options_digest
  );
  assert.equal('bounded_decision_request' in semanticInput, false);
  assert.equal('command_token' in semanticInput.action_set[0], false);
});

test('semantic decision expiry uses resolved time while exact fast path does not', async () => {
  const definition = (matches) => ({
    command_id: 'inspect-command',
    option_id: 'inspect_wreck_in_detail',
    matches,
    mode: {},
    availability: () => ({
      status: 'available',
      can_attempt: true,
      check_requests: []
    }),
    consequence() {},
    writeTargets() {}
  });
  const semanticRegistry = createTurnCommandRegistry([
    definition(() => false)
  ]);
  const semanticSet = await createTurnAvailableActionSet({
    registry: semanticRegistry,
    committedState: { state_version: 3 },
    actorId: 'mikula',
    policyPins: []
  });
  await assert.rejects(
    () => resolveTurnSemanticIntent({
      rawText: 'Хочу внимательно осмотреть крушение.',
      actionSet: semanticSet,
      semanticResolver: async (request) => ({
        option_id: request.action_set[0].option_id
      }),
      stateVersion: 3,
      policyVersion: '1',
      requestId: 'semantic-expired',
      partyId: 'party-1',
      decisionSecret: 'semantic-secret',
      issuedAt: '2026-07-12T10:00:00.000Z',
      expiresAt: '2026-07-12T10:05:00.000Z',
      decisionNow: () => '2026-07-12T10:06:00.000Z'
    }),
    { code: 'TURN_SEMANTIC_DECISION_EXPIRED' }
  );

  const exactRegistry = createTurnCommandRegistry([
    definition(() => true)
  ]);
  const exactSet = await createTurnAvailableActionSet({
    registry: exactRegistry,
    committedState: { state_version: 3 },
    actorId: 'mikula',
    policyPins: []
  });
  const exact = await resolveTurnSemanticIntent({
    rawText: 'Осмотреть крушение.',
    actionSet: exactSet,
    semanticResolver: async () => {
      throw new Error('exact fast path must not invoke resolver');
    },
    stateVersion: 3,
    policyVersion: '1',
    requestId: 'semantic-exact',
    partyId: 'party-1',
    decisionSecret: 'semantic-secret',
    issuedAt: '2026-07-12T10:00:00.000Z',
    expiresAt: '2026-07-12T10:05:00.000Z',
    decisionNow: () => {
      throw new Error('exact fast path must not read decision clock');
    }
  });
  assert.equal(exact.option_id, 'inspect_wreck_in_detail');
});

test('semantic resolution rejects invented, stale, tampered and overpowered results', async () => {
  const registry = createTurnCommandRegistry([{
    command_id: 'inspect-command',
    option_id: 'inspect_wreck_in_detail',
    matches: () => false,
    mode: {},
    availability: () => ({
      status: 'available',
      can_attempt: true,
      check_requests: []
    }),
    consequence() {},
    writeTargets() {}
  }]);
  const build = () => createTurnAvailableActionSet({
    registry,
    committedState: { state_version: 2 },
    actorId: 'mikula',
    policyPins: []
  });
  const args = (actionSet, semanticResolver, overrides = {}) => ({
    rawText: 'свободная формулировка',
    actionSet,
    semanticResolver,
    stateVersion: 2,
    policyVersion: '1',
    requestId: 'semantic-invalid',
    partyId: 'party-1',
    decisionSecret: 'semantic-secret',
    issuedAt: '2026-07-12T10:00:00.000Z',
    expiresAt: '2026-07-12T10:05:00.000Z',
    decisionNow: () => '2026-07-12T10:01:00.000Z',
    ...overrides
  });
  const inventedSet = await build();
  await assert.rejects(
    () => resolveTurnSemanticIntent(args(inventedSet, async () => ({
      option_id: 'invented'
    }))),
    { code: 'TURN_SEMANTIC_OPTION_INVALID' }
  );
  const staleSet = await build();
  await assert.rejects(
    () => resolveTurnSemanticIntent(args(staleSet, async () => ({
      status: 'unknown'
    }), { stateVersion: 3 })),
    { code: 'TURN_SEMANTIC_STATE_STALE' }
  );
  const excessiveSet = await build();
  await assert.rejects(
    () => resolveTurnSemanticIntent(args(excessiveSet, async () => ({
      option_id: 'inspect_wreck_in_detail',
      consequence: { elapsed: 15 }
    }))),
    { code: 'TURN_SEMANTIC_RESULT_INVALID' }
  );
  const tamperedSet = await build();
  assert.throws(
    () => {
      tamperedSet.options[0].reason_visible_to_actor = 'tampered';
    },
    TypeError,
    'the digest-bound action set is deeply immutable'
  );
});

test('semantic resolution fails closed when an offered precondition cannot be revalidated', async () => {
  const registry = createTurnCommandRegistry([{
    command_id: 'inspect-command',
    option_id: 'inspect_wreck_in_detail',
    matches: () => false,
    mode: {},
    preconditions: [{ kind: 'committed_location', location_ref: 'shore' }],
    availability: () => ({
      status: 'available',
      can_attempt: true,
      check_requests: []
    }),
    consequence() {},
    writeTargets() {}
  }]);
  const set = await createTurnAvailableActionSet({
    registry,
    committedState: { state_version: 2, position: { location_ref: 'shore' } },
    actorId: 'mikula',
    policyPins: []
  });
  const invoke = (evaluatePrecondition) => resolveTurnSemanticIntent({
    rawText: 'осмотреть место',
    actionSet: set,
    semanticResolver: async (input) => {
      return { option_id: input.action_set[0].option_id };
    },
    stateVersion: 2,
    policyVersion: '1',
    requestId: 'semantic-precondition',
    partyId: 'party-1',
    decisionSecret: 'semantic-secret',
    issuedAt: '2026-07-12T10:00:00.000Z',
    expiresAt: '2026-07-12T10:05:00.000Z',
    decisionNow: () => '2026-07-12T10:01:00.000Z',
    evaluatePrecondition
  });
  await assert.rejects(() => invoke(undefined), {
    code: 'TURN_SEMANTIC_OPTION_INVALID'
  });
  await assert.rejects(() => invoke(() => false), {
    code: 'TURN_SEMANTIC_OPTION_INVALID'
  });
  assert.equal((await invoke((precondition, state) =>
    state.position.location_ref === precondition.location_ref)).option_id,
  'inspect_wreck_in_detail');
});

test('committed state is reloaded after intent resolution and before RNG', async () => {
  let reads = 0;
  let rolls = 0;
  const { services, commits } = createServices([], {
    stateReader: {
      async read() {
        reads += 1;
        return {
          party_state: {
            party_id: 'party-1',
            state_version: reads === 1 ? 0 : 1
          },
          current_position: {
            region_id: 'region-novgorod',
            place_id: 'place-gate'
          },
          clock_weather_light: {
            clock: { day: 1, hour: 9, minute: 0 },
            weather: {},
            light: {}
          },
          visible_context: validVisibleContext(),
          character_knowledge_map: [],
          relevant_hidden_state: {},
          relevant_events: []
        };
      }
    },
    randomSource: {
      next() {
        rolls += 1;
        return 0.45;
      }
    }
  });
  await assert.rejects(
    () => runTurnWorkflow(input(), services),
    { code: 'TURN_SEMANTIC_STATE_STALE' }
  );
  assert.equal(reads, 2);
  assert.equal(rolls, 0);
  assert.equal(commits.length, 0);
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

test('failed narration audit cannot roll back committed factual state', async () => {
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
  assert.equal(commits.length, 1);
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
