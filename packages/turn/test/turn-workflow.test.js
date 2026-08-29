import test from 'node:test';
import assert from 'node:assert/strict';

import { createNarrationService } from '@rus/narration';
import {
  TURN_WORKFLOW_STAGE_IDS,
  TURN_WORKFLOW_STAGE_PLAN,
  createTurnStepExecutionRegistry,
  runTurnStepLoop,
  runTurnWorkflow,
  validateTurnWorkflowStagePlan
} from '../src/index.js';
import {
  createLegacyTurnCompatibilityAdapter,
  createPartyTurnRuntimeState
} from '../src/compat/index.js';
import { createTurnWorkflowContext, setTrustedTurnWorkflowStage } from '../src/context.js';
import { createTurnStageDefinitions } from '../src/workflow-stages.js';
import { deepFreeze } from '@rus/kernel';
import {
  createServices,
  input,
  turnStepPlan,
  validVisibleContext
} from './turn-workflow-fixture.js';

test('turn stage plan is exact and declarative', () => {
  assert.equal(validateTurnWorkflowStagePlan(TURN_WORKFLOW_STAGE_PLAN), TURN_WORKFLOW_STAGE_PLAN);
  assert.deepEqual(TURN_WORKFLOW_STAGE_PLAN.map((stage) => stage.id), TURN_WORKFLOW_STAGE_IDS);
});

test('turn stages reuse frozen prior artifacts while checkpointing new output', async () => {
  const { services } = createServices();
  const rawInput = input();
  const context = createTurnWorkflowContext({
    partyId: rawInput.party_id,
    requestId: rawInput.request_id,
    turnNumber: rawInput.turn_number,
    now: '2026-07-12T10:00:00.000Z'
  });
  const [normalize, load] = createTurnStageDefinitions({
    context, services, rawInput, now: '2026-07-12T10:00:00.000Z'
  });
  const normalized = (await normalize.execute({ input: deepFreeze({
    version: 1, schema: 'turn_workflow_state'
  }) })).artifact;
  const loaded = (await load.execute({ input: normalized })).artifact;
  assert.equal(Object.isFrozen(loaded.playerInput), true);
  assert.equal(loaded.playerInput, normalized.playerInput);
  assert.notEqual(context.getStage('normalize_intent'), normalized.playerInput);
  assert.deepEqual(context.snapshot().stages.normalize_intent,
    normalized.playerInput);
});

test('turn context isolates output and snapshots', () => {
  const context = createTurnWorkflowContext();
  const mutable = { nested: { value: 1 } };
  context.setStage('default', mutable);
  mutable.nested.value = 2;
  assert.equal(context.getStage('default').nested.value, 1);
  const frozen = deepFreeze({ nested: { value: 3 } });
  context.setStage('trusted', frozen);
  const snapshot = context.snapshot();
  assert.notEqual(snapshot.stages.trusted, frozen);
  assert.deepEqual(snapshot.stages.trusted, frozen);
});

test('internal workflow stage retention requires a frozen artifact', () => {
  const context = createTurnWorkflowContext();
  assert.throws(() => setTrustedTurnWorkflowStage(context, 'bad', {}),
    /frozen/u);
  const output = deepFreeze({ value: 1 });
  setTrustedTurnWorkflowStage(context, 'trusted', output);
  assert.notEqual(context.getStage('trusted'), output);
  assert.deepEqual(context.getStage('trusted'), output);
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

test('persistence retains a completed local-fire temporal plan from an exact command',
  async () => {
    const completedFire = { schema: 'local_fire_atomic_write_plan_v1',
      transition_proposal: { process_after: {
        process_ref: 'fire:shore', status: 'completed', state_version: 3
      } } };
    const { services, commits } = createServices([], {
      temporalAdvance: async ({ clock_before: clockBefore }) => ({
        clock_after: { ...clockBefore, minute: clockBefore.minute + 5 },
        exact_elapsed: { exact_minutes: { numerator: '5', denominator: '1' } },
        nearest_boundary: null,
        local_fire_atomic_write_plans: [completedFire]
      })
    });

    await runTurnWorkflow(input(), services);

    assert.deepEqual(commits[0].local_fire_atomic_write_plans,
      [completedFire]);
  });

test('turn integrates the canonical narration flow and versioned TurnScreen', async () => {
  const { services } = createServices();
  services.narrator = createNarrationService({
    writer: {
      async generate(request) {
        return {
          version: 1,
          schema: 'narration_output',
          output_id: request.request_id,
          prose: 'На площади медленно тянется разговор.',
          action_options: [],
          used_references: [],
          self_check: { no_new_world_facts: true }
        };
      }
    },
    auditor: { async audit() { return { version: 1, schema: 'narration_audit', pass: true, concerns: [], evidence: ['Grounded in visible context.'] }; } },
    semanticRepairer: { async repair() { return { version: 1, schema: 'narration_semantic_repair', replacements: [] }; } },
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

test('revalidation may use a version owner without reloading the snapshot',
  async () => {
    let reads = 0;
    let revalidations = 0;
    const { services } = createServices([], {
      stateReader: {
        async read() {
          reads += 1;
          return {
            party_state: { party_id: 'party-1', state_version: 0 },
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
        },
        async revalidate() {
          revalidations += 1;
          return 0;
        }
      }
    });
    await runTurnWorkflow(input(), services);
    assert.equal(reads, 1);
    assert.equal(revalidations, 1);
  });

test('stale version-only revalidation aborts before commit', async () => {
  const { services, commits } = createServices([], {
    stateReader: {
      async read() {
        return {
          party_state: { party_id: 'party-1', state_version: 0 },
          current_position: {
            region_id: 'region-novgorod', place_id: 'place-gate'
          },
          clock_weather_light: {
            clock: { day: 1, hour: 9, minute: 0 }, weather: {}, light: {}
          },
          visible_context: validVisibleContext(),
          character_knowledge_map: [],
          relevant_hidden_state: {},
          relevant_events: []
        };
      },
      async revalidate() {
        return 1;
      }
    }
  });
  await assert.rejects(
    () => runTurnWorkflow(input(), services),
    { code: 'TURN_SEMANTIC_STATE_STALE' }
  );
  assert.equal(commits.length, 0);
});

test('turn-step actor remains immutable across model calls and trace', async () => {
  const actor = { actor_ref: 'actor-1', identity: { name: 'Микула' } };
  const seenActors = [];
  const result = await runTurnStepLoop({
    requestId: 'actor-freeze-request',
    rootTurnId: 'actor-freeze-turn',
    committedStateVersion: 0,
    rootPlayerAction: 'осмотреть телегу',
    actor,
    initialWorkingProjection: { actor_ref: 'actor-1' }
  }, {
    executionRegistry: createTurnStepExecutionRegistry({
      applySemanticActivity: async ({ working_projection }) => ({
        working_projection, summary: 'момент', write_fragments: []
      })
    }),
    projectPlayerSafeState: async ({ working_projection }) => working_projection,
    revalidateCommittedState: async () => ({ state_version: 0 }),
    turnStepModel: async (request) => {
      seenActors.push(structuredClone(request.actor));
      assert.throws(() => { request.actor.identity.name = 'подмена'; },
        TypeError);
      return turnStepPlan(request, request.step_index === 1 ? {
        goal_result: 'pending',
        continuation: { remaining_intent: 'закончить осмотр', depends_on_refs: [] }
      } : {});
    }
  });
  assert.deepEqual(actor, { actor_ref: 'actor-1', identity: { name: 'Микула' } });
  assert.deepEqual(seenActors, [actor, actor]);
  assert.deepEqual(result.step_traces.map(({ plan_request }) => plan_request.actor),
    [actor, actor]);
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
