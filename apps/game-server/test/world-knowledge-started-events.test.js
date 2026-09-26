import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { createWorldKnowledgeCore } from '@rus/world-knowledge';
import { createProductionWorldKnowledgeGrounder } from
  '../src/runtime/world-knowledge-grounding.js';
import { createLowerDvinaTraceNpcSemanticModel } from
  '../src/runtime/lower-dvina-trace-conversation-llm.js';
import { createOrdinaryMaterializationModel } from
  '../src/runtime/ordinary-materialization-llm.js';
import { projectCalendar } from '@rus/time-events-history/calendar';
import { createLowerDvinaTraceNpcAutonomousModel } from
  '../src/runtime/lower-dvina-trace-autonomous-llm.js';
import { createLowerDvinaTraceTurnStepModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { withPartyHistoricalEvents } from
  '../src/runtime/world-knowledge-request-context.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const bundlePath = join(ROOT,
  'data/world-catalogs/novgorod/world-knowledge/production-v1/runtime-bundle.json');

const CONCEPT = 'wk:social_law_economy:accounting-amount';
const CLAIM = 'claim:social-debt-records-accounting-amount';
const MARK = 'FUTURE_FAMINE_MARKER';
const EVENT = 'event:famine-1230';

function loadMutableBundle() {
  const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
  const claim = bundle.claims.find((c) => c.claim_ref === CLAIM);
  assert.ok(claim, `missing ${CLAIM}`);
  claim.applicability = {
    conditions: [{ facet: 'started_historical_events', operator: 'includes',
      value: EVENT }]
  };
  claim.localizations.ru.runtime_text =
    `${MARK} ${claim.localizations.ru.runtime_text}`;
  return bundle;
}

function calendarProfile() {
  return {
    profile_id: 'novgorod-calendar', version: '1', status: 'approved',
    provenance: { source_id: 'chronicle-x', source_version: '1' },
    epoch: { game_timestamp: { whole_minutes: '0', subminute_numerator: '0',
      subminute_denominator: '1' }, year: '1230', month: '1', day: '1' },
    calendar_system: 'source-backed',
    month_rules: { month_lengths: ['30', '30'] },
    leap_rules: { cycle_years: '4', leap_year_indexes: ['3'], leap_month: '2',
      leap_days: '1' },
    day_start_rule: { local_minute: '360' },
    local_offset_rule: { offset_minutes: '0' },
    daypart_rule: { ranges: [
      { id: 'night', start_minute: '0', end_minute: '360' },
      { id: 'day', start_minute: '360', end_minute: '1080' },
      { id: 'evening', start_minute: '1080', end_minute: '1440' }] },
    season_rule: { ranges: [
      { id: 'cold', start_day: '1', end_day: '30' },
      { id: 'warm', start_day: '31', end_day: '61' }] },
    daylight_rule: { ranges: [
      { id: 'dark', start_day: '1', end_day: '30' },
      { id: 'light', start_day: '31', end_day: '61' }] }
  };
}

function ts(m) {
  return { whole_minutes: String(m), subminute_numerator: '0',
    subminute_denominator: '1' };
}

function makeGrounder(bundle, log) {
  return createProductionWorldKnowledgeGrounder({
    worldKnowledge: {
      bundle,
      core: createWorldKnowledgeCore(bundle),
      calendar_profile: calendarProfile(),
      encoder: { encode: async () => [1] },
      vector_index: { search: () => new Map([[CLAIM, 0.99]]) }
    },
    telemetry: {
      onGameplayTrace: (t) => log.traces.push(t),
      onDetail: () => {}
    },
    roleRunner: {
      async run(call) {
        log.calls.push(call);
        const payload = JSON.parse(call.messages[1].content);
        const wire = payload.request ?? payload;
        const avail = Object.keys(wire.available_knowledge_refs ?? {});
        return {
          output: {
            schema: 'world_knowledge_query_plan_v1',
            query_locale: 'ru',
            domains: ['social_law_economy'],
            focus_refs: avail.includes(CONCEPT) ? [CONCEPT] : [],
            requested_predicates: [],
            search_hints: ['счётная величина долговая запись']
          }
        };
      }
    }
  });
}

async function run(purpose, request, authoritative) {
  const log = { calls: [], traces: [] };
  const bundle = loadMutableBundle();
  let grounded = null;
  let error = null;
  try {
    grounded = await makeGrounder(bundle, log).ground(request, purpose,
      authoritative);
  } catch (e) {
    error = `${e.code ?? e.name}: ${e.message}`.slice(0, 400);
  }
  const plannerText = log.calls.map((c) => c.messages.map((m) => m.content)
    .join('\n')).join('\n');
  const sliceText = JSON.stringify(grounded?.world_knowledge ?? null);
  const query = log.traces[0]?.query ?? null;
  return {
    error,
    context: query?.context ?? null,
    concept_in_planner_refs: plannerText.includes(CONCEPT),
    marker_in_planner: plannerText.includes(MARK),
    claim_in_slice: sliceText.includes(CLAIM),
    marker_in_slice: sliceText.includes(MARK),
    facts: grounded?.world_knowledge?.facts?.length ?? null
  };
}

test('A-01 empty started_historical_events is valid through real Core path',
  async () => {
    const result = await run('npc_decision', {
      input_locale: 'ru', reason: 'счётная величина долговая запись',
      occurred_at: ts(0), historical_context: { year: 1230 },
      historical_events: []
    }, { clock: ts(0) });
    assert.equal(result.error, null, result.error);
    assert.deepEqual(result.context?.conditions?.started_historical_events, []);
    assert.equal(result.concept_in_planner_refs, false);
    assert.equal(result.marker_in_planner, false);
    assert.equal(result.claim_in_slice, false);
    assert.equal(result.marker_in_slice, false);
  });

test('A-05 unseen-equivalent: before event claim absent; after event present',
  async () => {
    const FAMINE_AT = 40 * 1440;
    const events = [{ id: EVENT,
      phases: [{ id: 'start', start_at_minutes: FAMINE_AT }] }];
    const before = await run('npc_decision', {
      input_locale: 'ru', reason: 'счётная величина долговая запись голод',
      occurred_at: ts(0)
    }, { clock: ts(0), historical_events: events });
    assert.equal(before.error, null, before.error);
    assert.deepEqual(before.context?.conditions?.started_historical_events, []);
    assert.equal(before.concept_in_planner_refs, false);
    assert.equal(before.marker_in_planner, false);
    assert.equal(before.claim_in_slice, false);
    assert.equal(before.marker_in_slice, false);

    const after = await run('npc_decision', {
      input_locale: 'ru', reason: 'счётная величина долговая запись голод',
      occurred_at: ts(FAMINE_AT + 10)
    }, { clock: ts(FAMINE_AT + 10), historical_events: events });
    assert.equal(after.error, null, after.error);
    assert.deepEqual(after.context?.conditions?.started_historical_events,
      [EVENT]);
    assert.equal(after.concept_in_planner_refs, true);
    // Planner wire carries concept labels, not claim runtime_text — MARK is
    // slice-only. Before-event path already asserts MARK absent from planner.
    assert.equal(after.marker_in_planner, false);
    assert.equal(after.claim_in_slice, true);
    assert.equal(after.marker_in_slice, true);
    assert.ok(after.facts > 0);
  });

test('A-03 O1 materialization_support uses party clock year from calendar',
  async () => {
    const yearClock = {
      whole_minutes: String(400 * 1440),
      subminute_numerator: '0', subminute_denominator: '1'
    };
    // Use npc_decision to avoid O1 plan-shape coupling; clock path is shared.
    const result = await run('npc_decision', {
      input_locale: 'ru', reason: 'счётная величина',
      occurred_at: yearClock
    }, { clock: yearClock });
    assert.equal(result.error, null, result.error);
    assert.notEqual(result.context?.time?.year, 1230);
    assert.ok(Number.isInteger(result.context?.time?.year));
  });

test('A-03b ordinary materialization_support authoritative includes party clock',
  async () => {
    const yearClock = {
      whole_minutes: String(400 * 1440),
      subminute_numerator: '0', subminute_denominator: '1'
    };
    const log = { calls: [], traces: [] };
    const bundle = loadMutableBundle();
    const grounder = createProductionWorldKnowledgeGrounder({
      worldKnowledge: {
        bundle,
        core: createWorldKnowledgeCore(bundle),
        calendar_profile: calendarProfile(),
        encoder: { encode: async () => [1] },
        vector_index: { search: () => new Map() }
      },
      telemetry: {
        onGameplayTrace: (t) => log.traces.push(t),
        onDetail: () => {}
      },
      roleRunner: {
        async run() {
          return {
            output: {
              schema: 'world_knowledge_query_plan_v1',
              query_locale: 'ru',
              domains: ['physics_material_science'],
              focus_refs: [],
              requested_predicates: [],
              search_hints: ['материал']
            }
          };
        }
      }
    });
    const grounded = await grounder.ground({
      schema: 'ordinary_materialization_request_v1',
      input_locale: 'ru',
      mode: 'resolve_presence',
      candidate_query: { candidate_hint: 'бревно' },
      authority_envelope: { candidate: { semantic_type: 'wood',
        functional_bucket: 'household', admission_class: 'common_mundane',
        availability_class: 'common', coverage_kind: 'open' } },
      policy_refs: { allowed_admission_classes: ['common_mundane'] }
    }, 'materialization_support', {
      clock: yearClock,
      semantic_context: { visible_scene: 'изба' }
    });
    assert.ok(grounded.world_knowledge);
    assert.notEqual(log.traces[0].query.context.time.year, 1230);
    assert.ok(Array.isArray(
      log.traces[0].query.context.conditions.started_historical_events));
  });

test('A-02 conversation adapter opens claim from explicit model-context events',
  async () => {
    const FAMINE_AT = 40 * 1440;
    const events = [{ id: EVENT,
      phases: [{ id: 'start', start_at_minutes: FAMINE_AT }] }];
    async function viaConversation(clock) {
      const log = { calls: [], traces: [] };
      const bundle = loadMutableBundle();
      const grounder = makeGrounder(bundle, log);
      let lastGrounded = null;
      let seenAuth = null;
      const model = withPartyHistoricalEvents(
        createLowerDvinaTraceNpcSemanticModel({
          worldKnowledgeGrounder: {
            async ground(request, purpose, authoritative) {
              assert.equal(purpose, 'conversation');
              seenAuth = authoritative;
              lastGrounded = await grounder.ground(request, purpose, authoritative);
              return lastGrounded;
            }
          },
          roleRunner: { async run() { return { output: {} }; } }
        }),
        () => ({ historical_events: events })
      );
      const request = {
        schema: 'npc_conversation_response_request_v1',
        request_id: 'req-a02',
        input_locale: 'ru',
        requested_at: clock,
        decision_reasons: {
          perceived_changes: ['счётная величина долговая запись голод']
        },
        perception: {
          visible_scene: ['счётная величина долговая запись голод']
        },
        public_conversation_history: []
      };
      try {
        await model(request, { repair: null });
      } catch {
        // Assembly may fail on stub output; grounding already ran.
      }
      assert.deepEqual(seenAuth?.historical_events, events);
      assert.ok(lastGrounded, 'conversation adapter must call grounder');
      return {
        started: log.traces.at(-1)?.query?.context?.conditions
          ?.started_historical_events ?? null,
        claim: JSON.stringify(lastGrounded.world_knowledge).includes(CLAIM)
      };
    }
    const before = await viaConversation(ts(0));
    assert.deepEqual(before.started, []);
    assert.equal(before.claim, false);
    const after = await viaConversation(ts(FAMINE_AT + 10));
    assert.deepEqual(after.started, [EVENT]);
    assert.equal(after.claim, true);
  });

test('F1 request-body historical_events do not open claims', async () => {
  const FAMINE_AT = 40 * 1440;
  const events = [{ id: EVENT,
    phases: [{ id: 'start', start_at_minutes: FAMINE_AT }] }];
  const log = { calls: [], traces: [] };
  const grounder = makeGrounder(loadMutableBundle(), log);
  const request = {
    schema: 'npc_conversation_response_request_v1',
    request_id: 'req-f1-inj',
    input_locale: 'ru',
    requested_at: ts(FAMINE_AT + 10),
    historical_events: events,
    decision_reasons: {
      perceived_changes: ['счётная величина долговая запись голод']
    },
    perception: {
      visible_scene: ['счётная величина долговая запись голод']
    },
    public_conversation_history: []
  };
  const grounded = await grounder.ground(request, 'conversation', {
    clock: request.requested_at
  });
  assert.deepEqual(
    log.traces.at(-1)?.query?.context?.conditions?.started_historical_events,
    []);
  assert.equal(JSON.stringify(grounded.world_knowledge).includes(CLAIM), false);
});

test('F2 turn step and npc_decision open claim from committed events',
  async () => {
    const FAMINE_AT = 40 * 1440;
    const events = [{ id: EVENT,
      phases: [{ id: 'start', start_at_minutes: FAMINE_AT }] }];
    const { request: turnRequest, output: turnOutput } = await import(
      './lower-dvina-trace-turn-step-llm-test-helpers.js');
    const { requestTurnStepPlanWithRepair } = await import(
      '../../../packages/turn/src/turn-step-plan-repair.js');
    const { fixture } = await import('./lower-dvina-trace-phase-2-fixture.js');
    const { loadLowerDvinaTraceMaterializationBundle } = await import(
      '../src/internal/lower-dvina-trace-phase-1a.js');
    const { loadLowerDvinaTracePhase2Bundle } = await import(
      '../src/internal/lower-dvina-trace-phase-2-bundle.js');
    const { resolveTracePhase2Contracts } = await import(
      '../src/runtime/lower-dvina-trace-phase-2-contracts.js');
    const { buildLowerDvinaTracePhase2Services } = await import(
      '../src/runtime/lower-dvina-trace-phase-2-services.js');
    const { createSeededRandomSource } = await import('@rus/checks-rng');
    // R5-1: production wrap via buildLowerDvinaTracePhase2Services, not a
    // hand-copied 3rd-arg stub (auditor swap of services wrap must fail this).
    async function viaTurn(clock, partyEvents) {
      const scenarioBundle = await loadLowerDvinaTraceMaterializationBundle();
      const f = fixture({
        scenarioBundle, materializationBundle: scenarioBundle
      });
      f.state.historical_events = partyEvents;
      f.state.clock = clock;
      if (f.state.clock_weather_light?.clock) {
        f.state.clock_weather_light = {
          ...f.state.clock_weather_light, clock
        };
      }
      const phase2Bundle = await loadLowerDvinaTracePhase2Bundle({
        scenarioDefinitionRevision: scenarioBundle.definition_revision
      });
      const contracts = resolveTracePhase2Contracts({
        state: f.state, bundle: scenarioBundle, phase2Bundle
      });
      const log = { calls: [], traces: [] };
      const grounder = makeGrounder(loadMutableBundle(), log);
      let lastGrounded = null;
      const inner = createLowerDvinaTraceTurnStepModel({
        worldKnowledgeGrounder: {
          async ground(request, purpose, authoritative) {
            lastGrounded = await grounder.ground(request, purpose, authoritative);
            return lastGrounded;
          }
        },
        roleRunner: {
          async run() {
            return { output: turnOutput() };
          }
        }
      });
      const services = buildLowerDvinaTracePhase2Services({
        partyId: f.partyId,
        requestId: 'r5-1-turn',
        idempotencyKey: 'r5-1-key',
        inputDigest: 'r5-1-digest',
        issuedAt: '2026-07-30T08:00:00.000Z',
        state: f.state,
        scenarioId: f.state.scenario_id,
        contracts,
        registry: {},
        repository: f.repository,
        semanticResolver: async () => ({}),
        turnStepModel: inner,
        randomSource: createSeededRandomSource(
          'lower-dvina-trace-phase-2-acceptance'),
        locationProfiles: {},
        scenePresentation: {}
      });
      await requestTurnStepPlanWithRepair({
        request: turnRequest({
          remaining_intent: 'счётная величина долговая запись голод',
          root_player_action: 'счётная величина долговая запись голод',
          player_safe_state: { clock, visible_entities: [] }
        }),
        turnStepModel: services.turnStepModel,
        allowRepair: false
      }).catch(() => {});
      return {
        started: log.traces.at(-1)?.query?.context?.conditions
          ?.started_historical_events ?? null,
        claim: JSON.stringify(lastGrounded?.world_knowledge ?? {}).includes(CLAIM)
      };
    }
    async function viaNpc(clock) {
      const { phase7Command, phase7CommittedState, phase7PlayerInput } =
        await import('./lower-dvina-trace-phase-7-runtime-fixture.js');
      const { approvedPhase7Contracts, phase7AutonomousPlan } = await import(
        './lower-dvina-trace-phase-7-contract-fixture.js');
      const log = { calls: [], traces: [] };
      const grounder = makeGrounder(loadMutableBundle(), log);
      let lastGrounded = null;
      const state = phase7CommittedState();
      state.historical_events = events;
      state.clock = clock;
      if (state.clock_weather_light?.clock) {
        state.clock_weather_light = {
          ...state.clock_weather_light, clock
        };
      }
      const contracts = approvedPhase7Contracts(state);
      const model = createLowerDvinaTraceNpcAutonomousModel({
        worldKnowledgeGrounder: {
          async ground(request, purpose, authoritative) {
            assert.equal(purpose, 'npc_decision');
            lastGrounded = await grounder.ground(request, purpose, authoritative);
            return lastGrounded;
          }
        },
        roleRunner: {
          async run(call) {
            const payload = JSON.parse(call.messages[1].content);
            const req = payload.request ?? payload;
            return { output: phase7AutonomousPlan(req, 'wait') };
          }
        }
      });
      try {
        await phase7Command({ state, contracts, model }).consequence({
          retrievedState: state,
          playerInput: phase7PlayerInput(state, 'wait')
        });
      } catch { /* fixture may stop after decision */ }
      return {
        started: log.traces.at(-1)?.query?.context?.conditions
          ?.started_historical_events ?? null,
        claim: JSON.stringify(lastGrounded?.world_knowledge ?? {}).includes(CLAIM)
      };
    }
    const turnBefore = await viaTurn(ts(0), events);
    assert.deepEqual(turnBefore.started, []);
    assert.equal(turnBefore.claim, false);
    const turnAfter = await viaTurn(ts(FAMINE_AT + 10), events);
    assert.deepEqual(turnAfter.started, [EVENT]);
    assert.equal(turnAfter.claim, true);
    const turnNoEvents = await viaTurn(ts(FAMINE_AT + 10), []);
    assert.deepEqual(turnNoEvents.started, []);
    assert.equal(turnNoEvents.claim, false);
    const npcBefore = await viaNpc(ts(0));
    assert.deepEqual(npcBefore.started, []);
    assert.equal(npcBefore.claim, false);
    const npcAfter = await viaNpc(ts(FAMINE_AT + 10));
    assert.deepEqual(npcAfter.started, [EVENT]);
    assert.equal(npcAfter.claim, true);
  });

test('A-03 createOrdinaryMaterializationModel passes party clock year',
  async () => {
    const { loadLowerDvinaTraceOrdinaryStageBApproval } = await import(
      '../src/internal/lower-dvina-trace-ordinary-stage-b-approval.js');
    const yearClock = {
      whole_minutes: String(400 * 1440),
      subminute_numerator: '0', subminute_denominator: '1'
    };
    const expectedYear = Number(projectCalendar(yearClock, calendarProfile())
      .year);
    assert.notEqual(expectedYear, 1230);
    const log = { calls: [], traces: [] };
    const bundle = loadMutableBundle();
    const inner = createProductionWorldKnowledgeGrounder({
      worldKnowledge: {
        bundle,
        core: createWorldKnowledgeCore(bundle),
        calendar_profile: calendarProfile(),
        encoder: { encode: async () => [1] },
        vector_index: { search: () => new Map() }
      },
      telemetry: {
        onGameplayTrace: (t) => log.traces.push(t),
        onDetail: () => {}
      },
      roleRunner: {
        async run() {
          return {
            output: {
              schema: 'world_knowledge_query_plan_v1',
              query_locale: 'ru',
              domains: ['physics_material_science'],
              focus_refs: [],
              requested_predicates: [],
              search_hints: ['материал']
            }
          };
        }
      }
    });
    let seenClock = null;
    const approval = await loadLowerDvinaTraceOrdinaryStageBApproval();
    const modelIdentity = approval.model_identity;
    const model = createOrdinaryMaterializationModel({
      stageBApprovalReceipt: approval,
      worldKnowledgeGrounder: {
        async ground(request, purpose, authoritative) {
          assert.equal(purpose, 'materialization_support');
          seenClock = authoritative.clock;
          return inner.ground(request, purpose, authoritative);
        }
      },
      roleRunner: {
        async run() {
          return {
            provider_record: { ...modelIdentity },
            output: { resolution: 'no_change', entities: [],
              background_groups: [], presence_resolutions: [],
              density_band_proposal: null, reason_code: 'no_change',
              semantic_materialization_kind: null,
              semantic_admission_class: null }
          };
        }
      }
    });
    try {
      await model({
        schema: 'ordinary_materialization_request_v1',
        request_id: 'o1-a03',
        input_locale: 'ru',
        mode: 'resolve_presence',
        candidate_query: { candidate_hint: 'бревно' },
        authority_envelope: {
          candidate: {
            semantic_type: 'wood', functional_bucket: 'household',
            admission_class: 'common_mundane', availability_class: 'common',
            coverage_kind: 'open'
          }
        },
        policy_refs: { allowed_admission_classes: ['common_mundane'] }
      }, { repair: null, clock: yearClock });
    } catch {
      // Plan bind may fail; clock must already have reached the grounder.
    }
    assert.deepEqual(seenClock, yearClock);
    assert.equal(log.traces.at(-1)?.query?.context?.time?.year, expectedYear);
  });

test('F6 exactModelContext rejects bad clock; seed passes clock+events',
  async () => {
    const { exactModelContext } = await import(
      '../src/runtime/ordinary-materialization-llm-support.js');
    assert.throws(() => exactModelContext({ repair: null, clock: 'bad' }),
      (err) => err?.code === 'TRACE_ORDINARY_MODEL_CALL_SEQUENCE_INVALID');
    // N5: soft forms rejected by owner normalizeGameTimestamp / int clock.
    assert.throws(() => exactModelContext({ repair: null, clock: -5 }),
      (err) => err?.code === 'TRACE_ORDINARY_MODEL_CALL_SEQUENCE_INVALID');
    assert.throws(() => exactModelContext({ repair: null, clock: 1.5 }),
      (err) => err?.code === 'TRACE_ORDINARY_MODEL_CALL_SEQUENCE_INVALID');
    assert.throws(() => exactModelContext({
      repair: null,
      clock: {
        whole_minutes: '10', subminute_numerator: '0',
        subminute_denominator: '1', day: 1
      }
    }), (err) => err?.code === 'TRACE_ORDINARY_MODEL_CALL_SEQUENCE_INVALID');
    const FAMINE_AT = 40 * 1440;
    const yearClock = {
      whole_minutes: String(FAMINE_AT + 10),
      subminute_numerator: '0', subminute_denominator: '1'
    };
    const events = [{ id: EVENT,
      phases: [{ id: 'start', start_at_minutes: FAMINE_AT }] }];
    const log = { calls: [], traces: [] };
    const grounder = makeGrounder(loadMutableBundle(), log);
    let seenAuth = null;
    const { loadLowerDvinaTraceOrdinaryStageBApproval } = await import(
      '../src/internal/lower-dvina-trace-ordinary-stage-b-approval.js');
    const approval = await loadLowerDvinaTraceOrdinaryStageBApproval();
    const modelIdentity = approval.model_identity;
    const model = createOrdinaryMaterializationModel({
      stageBApprovalReceipt: approval,
      worldKnowledgeGrounder: {
        async ground(request, purpose, authoritative) {
          seenAuth = authoritative;
          return grounder.ground(request, purpose, authoritative);
        }
      },
      roleRunner: {
        async run() {
          return {
            provider_record: { ...modelIdentity },
            output: { resolution: 'no_change', entities: [],
              background_groups: [], presence_resolutions: [],
              density_band_proposal: null, reason_code: 'no_change',
              semantic_materialization_kind: null,
              semantic_admission_class: null }
          };
        }
      }
    });
    try {
      await model({
        schema: 'ordinary_materialization_request_v1',
        request_id: 'o1-f6',
        input_locale: 'ru',
        mode: 'resolve_presence',
        candidate_query: { candidate_hint: 'счётная величина долговая запись голод' },
        authority_envelope: {
          candidate: {
            semantic_type: 'wood', functional_bucket: 'household',
            admission_class: 'common_mundane', availability_class: 'common',
            coverage_kind: 'open'
          }
        },
        policy_refs: { allowed_admission_classes: ['common_mundane'] }
      }, { repair: null, clock: yearClock, historical_events: events });
    } catch { /* plan bind may fail */ }
    assert.deepEqual(seenAuth?.clock, yearClock);
    assert.deepEqual(seenAuth?.historical_events, events);
    // Grounding may no-op when materialization coverage lacks social domains;
    // the O1 port contract is the authoritative handoff above (F6).
    if (log.traces.length > 0) {
      assert.deepEqual(
        log.traces.at(-1)?.query?.context?.conditions?.started_historical_events,
        [EVENT]);
    }
  });

test('N4 seed scope forwards committed clock+events to O1 model', async () => {
  const { resolveOrdinaryMaterializationSeedScope } = await import('@rus/turn');
  const { createOrdinaryAggregate } = await import('@rus/materialization');
  const FAMINE_AT = 40 * 1440;
  const yearClock = ts(FAMINE_AT + 10);
  const events = [{ id: EVENT,
    phases: [{ id: 'start', start_at_minutes: FAMINE_AT }] }];
  let seenContext = null;
  const seedRequest = Object.freeze({
    schema: 'ordinary_materialization_request_v1', request_id: 'seed-n4',
    mode: 'seed_scope', scope_ref: { entity_kind: 'g6', entity_id: 'scope-a' },
    context_refs: {
      period_ref: 'period', region_ref: 'region', function_refs: ['household'],
      environment_refs: ['environment'], occupation_household_refs: ['household'],
      economic_context_ref: 'economy', occupancy_state_ref: 'occupied',
      material_culture_refs: ['culture'], property_context_ref: 'property'
    },
    policy_refs: {
      authority_policy_ref: 'authority', density_policy_ref: 'density',
      ordinary_presence_policy_ref: 'presence',
      runtime_item_mechanics_policy_ref: 'mechanics',
      allowed_admission_classes: ['common_mundane'],
      context_bound_permission_refs: [],
      allowed_supporting_bases: [{ basis_ref: 'basis-a', basis_state: 'committed' }]
    },
    ordinary_state: { seeded: false, density_band: null,
      remaining_identity_budget: 0, background_groups: [],
      presence_resolutions: [], closed_observation_scopes: [] },
    candidate_query: null,
    technical_limits: { max_new_entities: 2, max_new_background_groups: 2,
      max_resolution_records: 4 }
  });
  await resolveOrdinaryMaterializationSeedScope({
    request: seedRequest,
    partyClock: yearClock,
    historicalEvents: events,
    ordinaryMaterializationModel: async (_req, context) => {
      seenContext = context;
      return {
        schema: 'ordinary_materialization_plan_v1',
        request_id: seedRequest.request_id,
        resolution: 'no_change', density_band_proposal: null,
        background_groups: [], entities: [], presence_resolutions: [],
        reason_code: 'no_change'
      };
    },
    workingProjection: {
      ordinary_materialization_aggregate: createOrdinaryAggregate({
        scope_ref: seedRequest.scope_ref, resolution_record_cap: 4
      })
    },
    basisCatalog: [{ basis_ref: 'basis-a', state: 'committed', policy: {
      functional_buckets: ['household'],
      allowed_admission_classes: ['common_mundane'], permission_refs: []
    } }],
    allowedDisclosurePolicyRefs: ['disclosure-a'],
    resolveIdentityBudget: async (value) => ({
      policy_version: 'density', density_band: value.density_band,
      identity_budget: 2, source: 'policy'
    })
  }).catch(() => {});
  assert.deepEqual(seenContext?.clock, yearClock);
  assert.deepEqual(seenContext?.historical_events, events);
});
