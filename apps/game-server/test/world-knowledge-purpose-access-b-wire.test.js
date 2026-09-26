import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createLowerDvinaTracePlayerConversationModel } from
  '../src/runtime/lower-dvina-trace-conversation-llm.js';
import { createLowerDvinaTraceNarrationService } from
  '../src/runtime/lower-dvina-trace-narration-llm.js';
import { createTraceTurnRuntime } from
  '../src/runtime/releases/spatial-v3-production-trace-runtime.js';
import { createSpatialV3ProductionV17NpcRuntimePorts } from
  '../src/runtime/releases/spatial-v3-production-v17-bindings.js';
import {
  createM2ConversationContext,
  executeM2ConversationExchange,
  m2PlayerConversationModel,
  prepareM2PlayerConversationPlan
} from '../src/runtime/lower-dvina-trace-m2-conversation-exchange.js';
import { playerPlan } from './lower-dvina-trace-m2-conversation-fixture.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const ts = (m) => ({
  whole_minutes: String(m), subminute_numerator: '0', subminute_denominator: '1'
});
test('F4 durable narrator forwards authoritative options (N1)', async () => {
  const { createLowerDvinaTracePhase2DurableNarrator } = await import(
    '../src/infrastructure/postgres/lower-dvina-trace-phase-2-presentation.js');
  const { computeSpatialV3CanonicalDigest } = await import(
    '@rus/contracts/spatial-v3/registry');
  const { canonicalDigest } = await import('@rus/materialization');
  const payload = { schema: 'temporal_visible_package.v1',
    perceived_scene: 'Берег.', perceived_changes: ['Вода ушла.'],
    sensory_details: [], visible_npcs: [], visible_objects: [], known_context: [],
    uncertainties: [], hypotheses: [], player_safe_interruption: null,
    allowed_action_affordances: [] };
  const snapshotPayload = { party_id: 'party', actor_id: 'actor',
    party_state: { turn_number: 7, state_version: 39 },
    opening_identity: { opening_screen_digest: 'opening' },
    last_turn: { received_at: '2026-01-01T00:00:00.000Z',
      check_result: null, consequence: {},
      visible_package: { package_id: 'package',
        package_digest: computeSpatialV3CanonicalDigest(payload) } } };
  const envelope = { party_id: 'party', package_id: 'package', turn_id: 'turn',
    committed_state_version: 39, dependency_pins: {},
    package_digest: computeSpatialV3CanonicalDigest(payload),
    visible_payload: payload, snapshot_payload: snapshotPayload,
    state_digest: canonicalDigest(snapshotPayload) };
  const visible = { version: 1, schema: 'visible_context_package',
    visible_scene: payload.perceived_scene,
    visible_changes: payload.perceived_changes, sensory_details: [],
    visible_npc: [], visible_objects: [], known_context: [],
    uncertainties: [], allowed_tensions: [], do_not_imply: [] };
  const seen = [];
  const client = { async query() { return { rows: [envelope] }; }, release() {} };
  const durable = createLowerDvinaTracePhase2DurableNarrator({
    partyPool: {
      query: client.query.bind(client),
      connect(callback) { callback(null, client, () => {}); }
    },
    narrationService: {
      async run(request, options = {}) {
        seen.push({ request_id: request.request_id, options });
        return {
          version: 1, schema: 'narration_flow_result', request_id: 'turn',
          surface: 'turn', status: 'approved', pass: true,
          approved_output: {
            version: 1, schema: 'narration_output', output_id: 'turn',
            prose: 'Берег.', action_options: [], used_references: [],
            self_check: {}
          },
          final_audit: null, generation_history: [], repair_history: [],
          audit_history: [], diagnostics: { phase: 'approved', errors: [],
            repairs_used: 0 }
        };
      }
    },
    presentationStore: {
      async claimPresentationAttempt() {
        return { ok: true, disposition: 'claimed', attempt_id: 'a',
          claim_token: 'c' };
      },
      async persistNarrationOutput(input) {
        return { ok: true, disposition: 'output_ready',
          output_digest: input.output_digest };
      },
      async finalizePresentationAttempt(input) {
        return { ok: true, presentation_status: 'delivered',
          output_digest: input.output_digest };
      }
    }
  });
  const auth = {
    clock: { whole_minutes: '7', subminute_numerator: '0',
      subminute_denominator: '1' },
    historical_events: [{ event_id: 'event:started', phases: [] }],
    actor_facets: { role_ref: 'nov_role_fisher' }
  };
  await durable.run({
    version: 1, schema: 'narration_request', party_id: 'party',
    request_id: 'turn', delivery_turn_number: 7, surface: 'turn',
    visible_context: visible
  }, { worldKnowledgeAuthoritative: auth });
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].options.worldKnowledgeAuthoritative, auth);
});

test('F4 services narrator wrap uses post-commit state facets/events', async () => {
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
  const scenarioBundle = await loadLowerDvinaTraceMaterializationBundle();
  const f = fixture({ scenarioBundle, materializationBundle: scenarioBundle });
  f.state.historical_events = [{ event_id: 'event:pre', phases: [] }];
  f.state.player_profile = {
    ...(f.state.player_profile ?? {}),
    social_status: {
      ...(f.state.player_profile?.social_status ?? {}),
      social_role_id: 'nov_role_fisher'
    }
  };
  f.state.clock = ts(9);
  const phase2Bundle = await loadLowerDvinaTracePhase2Bundle({
    scenarioDefinitionRevision: f.state.scenario_definition_revision
      ?? scenarioBundle.scenario_definition?.revision
  });
  const contracts = resolveTracePhase2Contracts({
    state: f.state, bundle: scenarioBundle, phase2Bundle
  });
  const seen = [];
  const postCommit = {
    ...f.state,
    historical_events: [{ event_id: 'event:post', phases: [] }],
    player_profile: {
      ...f.state.player_profile,
      social_status: {
        ...f.state.player_profile.social_status,
        social_role_id: 'nov_role_merchant_clerk'
      }
    },
    clock: ts(12)
  };
  const services = buildLowerDvinaTracePhase2Services({
    partyId: f.state.party_id, requestId: 'req:svc',
    idempotencyKey: 'idem:svc', inputDigest: 'd'.repeat(64),
    issuedAt: '2026-07-30T08:00:00.000Z', scenarioId: f.state.scenario_id,
    state: f.state, contracts, registry: {},
    repository: {
      async commitPhase2Turn() {
        return { ok: true, committed_public_result: { turn_number: 2 } };
      },
      async loadPhase2State() { return postCommit; }
    },
    semanticResolver: async () => ({}), turnStepModel: null,
    locationProfiles: scenarioBundle.location_topology_set.location_profiles,
    scenePresentation: scenarioBundle.scene_presentation ?? null,
    randomSource: createSeededRandomSource('svc'),
    randomSourceFactory: () => createSeededRandomSource('svc'),
    narrator: {
      async run(_req, options = {}) {
        seen.push(options.worldKnowledgeAuthoritative);
        return { status: 'approved', pass: true };
      }
    },
    decisionSecret: 's'
  });
  await services.narrator.run({
    version: 1, schema: 'narration_request', request_id: 'n-pre',
    surface: 'turn',
    visible_context: {
      version: 1, schema: 'visible_context_package',
      visible_scene: 'Река.', visible_changes: ['Ты поднял сеть.'],
      uncertainties: [], do_not_imply: [], allowed_tensions: [],
      sensory_details: [], visible_objects: [], known_context: []
    }
  });
  assert.equal(seen[0]?.actor_facets?.role_ref, 'nov_role_fisher');
  assert.equal(seen[0]?.historical_events?.[0]?.event_id, 'event:pre');
  assert.equal(seen[0]?.clock?.whole_minutes, '9');
  await services.partyStore.commit({ write_plan: {} });
  await services.narrator.run({
    version: 1, schema: 'narration_request', request_id: 'n-post',
    surface: 'turn',
    visible_context: {
      version: 1, schema: 'visible_context_package',
      visible_scene: 'Река.', visible_changes: ['Ты поднял сеть.'],
      uncertainties: [], do_not_imply: [], allowed_tensions: [],
      sensory_details: [], visible_objects: [], known_context: []
    }
  });
  assert.equal(seen[1]?.actor_facets?.role_ref, 'nov_role_merchant_clerk');
  assert.equal(seen[1]?.historical_events?.[0]?.event_id, 'event:post');
  assert.equal(seen[1]?.clock?.whole_minutes, '12');
});

test('F4 replay narrator receives authoritative options', async () => {
  const { replayLowerDvinaTracePhase2Presentation } = await import(
    '../src/infrastructure/postgres/lower-dvina-trace-phase-2-presentation-replay.js');
  const { computeSpatialV3CanonicalDigest } = await import(
    '@rus/contracts/spatial-v3/registry');
  const payload = {
    schema: 'temporal_visible_package.v1',
    perceived_scene: 'Берег.',
    perceived_changes: ['Вода ушла.'],
    sensory_details: [],
    visible_npcs: [],
    visible_objects: [],
    known_context: [],
    uncertainties: [],
    hypotheses: [],
    player_safe_interruption: null,
    allowed_action_affordances: []
  };
  const digest = computeSpatialV3CanonicalDigest(payload);
  const seen = [];
  const client = {
    async query() {
      return {
        rowCount: 1,
        rows: [{
          visible_payload: payload,
          package_digest: digest,
          committed_state_version: 5
        }]
      };
    },
    release() {}
  };
  const replay = {
    screen: { screen_status: 'committed_presentation_pending', turn_id: 't1' },
    state: {
      party_state: { turn_number: 3, state_version: 5 },
      clock: { whole_minutes: '11', subminute_numerator: '0',
        subminute_denominator: '1' },
      historical_events: [{ event_id: 'event:replay', phases: [] }],
      player_profile: { social_status: { social_role_id: 'nov_role_fisher' } },
      last_turn: {
        raw_text: 'осмотреть',
        consequence: {},
        visible_package: { package_id: 'p', package_digest: digest }
      }
    },
    input_digest: 'digest',
    public_result: null
  };
  await replayLowerDvinaTracePhase2Presentation({
    partyPool: {
      query: client.query.bind(client),
      connect(callback) { callback(null, client, () => {}); }
    },
    partyId: 'party',
    replay,
    narrator: {
      async run(_request, options = {}) {
        seen.push(options?.worldKnowledgeAuthoritative ?? null);
        return {
          status: 'approved', pass: true,
          approved_output: { prose: 'ok' },
          presentation: { package_digest: digest, output_digest: 'out' }
        };
      }
    },
    turnBudget: null,
    persistPhase2Screen: async ({ result }) => result
  }).catch(() => {
    // Screen assembly needs fuller party state; options already captured above.
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.actor_facets?.role_ref, 'nov_role_fisher');
  assert.equal(seen[0]?.historical_events?.[0]?.event_id, 'event:replay');
  assert.equal(seen[0]?.clock?.whole_minutes, '11');
});

test('A1 prepareM2PlayerConversationPlan injects facets/events/clock from state',
  async () => {
  const seen = [];
  const npc = {
    instance_id: 'npc_fisher_neighbor',
    location_profile_ref: 'loc_river'
  };
  const state = {
    actor_id: 'player_1',
    party_id: 'party_a1',
    party_state: { state_version: 1, turn_number: 1 },
    clock: ts(5),
    position: { location_ref: 'loc_river' },
    historical_events: [{ event_id: 'event_m2', phases: [] }],
    player_profile: { social_status: { social_role_id: 'nov_role_fisher' } },
    npcs: [npc],
    knowledge: []
  };
  const context = createM2ConversationContext({
    state,
    targetActor: npc,
    actualNpcActors: [npc],
    playerInput: { raw_text: 'Где сети?' },
    inputDigest: 'a'.repeat(64),
    phase: 'phase_3',
    checkResult: null,
    availableEvidence: null,
    contracts: { check: null },
    playerOperationContract: {},
    playerConversationModel: async (request, ctx) => {
      seen.push(ctx);
      return playerPlan(request);
    },
    revalidateStateVersion: async () => 1,
    npcSemanticModel: async () => ({})
  });
  assert.equal(typeof m2PlayerConversationModel, 'function');
  const plan = await prepareM2PlayerConversationPlan(context);
  assert.equal(plan.speech.utterance_text, 'Где сети?');
  assert.equal(seen.length >= 1, true);
  assert.equal(seen[0].actor_facets.role_ref, 'nov_role_fisher');
  assert.equal(seen[0].historical_events[0].event_id, 'event_m2');
  assert.equal(seen[0].clock.whole_minutes, '5');
});

test('A2 v17 ports factory grounds player semantic_resolution and NPC conversation',
  async () => {
  const grounds = [];
  const grounder = {
    async ground(request, purpose, authoritative) {
      grounds.push({ purpose, schema: request?.schema ?? null,
        role: authoritative?.actor_facets?.role_ref ?? null });
      return { ...request, world_knowledge: { facts: [], hard_constraints: [] } };
    }
  };
  const roleRunner = {
    async run(call) {
      if (call.role_id === 'player_conversation_interpreter'
          || call.role_id === 'player_conversation_interpreter_format_repair') {
        return {
          output: {
            input_mode: 'intent_paraphrase',
            contribution_kind: 'speech',
            primary_addressee_ref: { entity_kind: 'npc', entity_id: 'npc:1' },
            intended_addressee_refs: [{ entity_kind: 'npc', entity_id: 'npc:1' }],
            affected_actor_refs: [],
            speech: {
              utterance_text: 'Где сети?',
              dominant_act: 'question',
              interaction_tags: [],
              topic_refs: [],
              claims: [],
              response_expectation: { kind: 'none', target_refs: [] }
            },
            interpretation: {
              intent: 'спросить', grounded_contribution: 'спросить',
              adaptation: 'literal'
            },
            resolution: 'automatic',
            activity: { duration_class: 'moment', effort: 'none' },
            supporting_operations: [],
            check: null,
            handoff: null
          }
        };
      }
      if (call.role_id === 'npc_conversation_responder'
          || call.role_id === 'npc_conversation_responder_format_repair') {
        return {
          output: {
            contribution_kind: 'speech',
            primary_addressee_ref: { entity_kind: 'player_character',
              entity_id: 'player' },
            intended_addressee_refs: [{ entity_kind: 'player_character',
              entity_id: 'player' }],
            affected_actor_refs: [],
            speech: {
              utterance_text: 'Сети у берега.',
              dominant_act: 'answer',
              interaction_tags: [],
              topic_refs: [],
              claims: [],
              response_expectation: { kind: 'none', target_refs: [] }
            },
            interpretation: {
              intent: 'ответить', grounded_contribution: 'ответить',
              adaptation: 'literal'
            },
            resolution: 'automatic',
            activity: { duration_class: 'moment', effort: 'none' },
            supporting_operations: [],
            check: null,
            handoff: null
          }
        };
      }
      return { output: {} };
    }
  };
  const ports = createSpatialV3ProductionV17NpcRuntimePorts({
    roleRunner, worldKnowledgeGrounder: grounder
  });
  assert.equal(typeof ports.playerConversationModel, 'function');
  assert.equal(typeof ports.npcSemanticModel, 'function');
  assert.equal(typeof ports.npcAutonomousModel, 'function');
  await ports.playerConversationModel({
    schema: 'player_conversation_input_v1',
    request_id: 'p1',
    conversation_id: 'c1',
    state_version: 1,
    speaker_ref: { entity_kind: 'player_character', entity_id: 'player' },
    raw_text: 'Где сети?',
    received_at: 't1',
    player_safe_context: {
      allowed_duration_classes: ['moment'],
      allowed_references: {
        actor_refs: [{ entity_kind: 'npc', entity_id: 'npc:1' }],
        entity_refs: [], knowledge_refs: [], combat_target_refs: []
      },
      current_game_timestamp: ts(0)
    },
    operation_contract: {}
  }, { actor_facets: { role_ref: 'nov_role_fisher' }, historical_events: [] });
  assert.ok(grounds.some((g) => g.purpose === 'semantic_resolution'));
  // Ground path for NPC semantic uses purpose conversation before assembly.
  const groundSpy = {
    async ground(request, purpose) {
      grounds.push({ purpose, schema: request?.schema ?? null });
      return { ...request, world_knowledge: { facts: [], hard_constraints: [] } };
    }
  };
  const ports2 = createSpatialV3ProductionV17NpcRuntimePorts({
    roleRunner: {
      async run() {
        throw Object.assign(new Error('stop-after-ground'), { code: 'STOP' });
      }
    },
    worldKnowledgeGrounder: groundSpy
  });
  await assert.rejects(() => ports2.npcSemanticModel({
    schema: 'npc_conversation_response_request_v1',
    request_id: 'n1',
    conversation_id: 'c1',
    state_version: 1,
    npc_ref: { entity_kind: 'npc', entity_id: 'npc:1' },
    requested_at: ts(0),
    npc: { social_role: { role_ref: 'nov_role_fisher' } },
    decision_scope: {
      allowed_contribution_kinds: ['speech'],
      operation_contract: {}
    },
    public_conversation_history: [],
    social_context: { delivery_cues: [] },
    speaker_ref: { entity_kind: 'npc', entity_id: 'npc:1' },
    boundary: { boundary_id: 'b1' },
    player_safe_context: {
      allowed_references: {
        actor_refs: [{ entity_kind: 'player_character', entity_id: 'player' }],
        entity_refs: [], knowledge_refs: [], combat_target_refs: []
      }
    }
  }, { historical_events: [] }));
  assert.ok(grounds.some((g) => g.purpose === 'conversation'));
});

test('F4 F5 guard is invoked from player conversation model', async () => {
  const roleRunner = {
    async run() {
      return {
        output: {
          input_mode: 'intent_paraphrase',
          contribution_kind: 'speech',
          primary_addressee_ref: { entity_kind: 'npc', entity_id: 'npc:1' },
          intended_addressee_refs: [{ entity_kind: 'npc', entity_id: 'npc:1' }],
          affected_actor_refs: [],
          speech: {
            utterance_text: 'Купальщик моется водой из бани для стирки белья.',
            dominant_act: 'inform',
            interaction_tags: [],
            topic_refs: [],
            claims: [],
            response_expectation: { kind: 'none', target_refs: [] }
          },
          interpretation: {
            intent: 'сказать',
            grounded_contribution: 'сказать',
            adaptation: 'literal'
          },
          resolution: 'automatic',
          activity: { duration_class: 'moment', effort: 'none' },
          supporting_operations: [],
          check: null,
          handoff: null
        }
      };
    }
  };
  const grounder = {
    async ground(request) {
      return {
        ...request,
        world_knowledge: {
          facts: [{ claim_ref: 'claim:bathing-washing-water',
            runtime_text: 'Купальщик моется водой из бани для стирки белья.' }],
          hard_constraints: []
        }
      };
    }
  };
  const model = createLowerDvinaTracePlayerConversationModel({
    roleRunner, worldKnowledgeGrounder: grounder
  });
  await assert.rejects(() => model({
    schema: 'player_conversation_input_v1',
    request_id: 'leak',
    conversation_id: 'c1',
    state_version: 1,
    speaker_ref: { entity_kind: 'actor', entity_id: 'player' },
    raw_text: 'скажи про баню',
    received_at: 't1',
    player_safe_context: {
      current_game_timestamp: ts(0),
      allowed_duration_classes: ['moment'],
      allowed_references: {
        actor_refs: [{ entity_kind: 'npc', entity_id: 'npc:1' }],
        entity_refs: [], knowledge_refs: [], combat_target_refs: []
      }
    },
    operation_contract: {}
  }), /PLAYER_CONVERSATION_WK_UTTERANCE_LEAK|utterance must not copy/u);
});

test('B1 createTraceTurnRuntime wires grounder+telemetry into narration', async () => {
  const grounds = [];
  let narrationService = null;
  let narrationPorts = null;
  createTraceTurnRuntime({
    partyPool: { query() {}, connect() {} },
    committer: { commit() {} },
    env: {},
    config: {
      traceTurnDecisionSecret: 'test-secret',
      llmTurnBudget: {},
      llmDiagnostics: { telemetry: { onGameplayTrace() {}, onDetail() {} },
        turnBudget: {} }
    },
    ordinaryMaterializationProfile: null,
    ordinaryContainerContentsProfile: null,
    ordinaryStageBApproval: {
      model_identity: {
        provider: 'test', model: 'test', scope: 'turn_runtime',
        role_id: 'ordinary_materialization', config_hash: 'test'
      }
    },
    actionProductionProfile: null, localFireProfile: null,
    spatialSemanticProfile: null,
    createNpcRuntimePorts: () => ({}),
    createPhase2RuntimeFactory: () => ({}),
    createNarrationService: (ports) => {
      narrationPorts = ports;
      assert.ok(Object.hasOwn(ports, 'worldKnowledgeGrounder'));
      assert.ok(Object.hasOwn(ports, 'telemetry'));
      narrationService = createLowerDvinaTraceNarrationService({
        roleRunner: {
          async run(call) {
            if (call.role_id === 'gameplay_narrator') {
              return { output: { prose: 'Ты поднял сеть.' } };
            }
            if (call.role_id === 'gameplay_narrator_auditor') {
              const body = JSON.parse(call.messages[1].content);
              return {
                output: {
                  reviewed_segments: body.segments.map((s) => s.segment_id),
                  source_reviews: [...body.required_current_beat.changes,
                    ...body.required_current_beat.uncertainties]
                    .map(({ ref }) => ({
                      ref, segment_choices: [body.segments[0].segment_id]
                    })),
                  unsupported: [], literary_failures: [], evidence: ['ok']
                }
              };
            }
            return { output: {} };
          }
        },
        worldKnowledgeGrounder: {
          async ground(request, purpose, authoritative) {
            grounds.push({
              purpose,
              role: authoritative?.actor_facets?.role_ref ?? null
            });
            return {
              ...request,
              world_knowledge: {
                schema: 'world_knowledge_slice_v1', pack_ref: 'p',
                pack_revision: 'r', coverage: [], hard_constraints: [],
                facts: [], disputes: [], gaps: []
              }
            };
          }
        },
        telemetry: ports.telemetry
      });
      return narrationService;
    }
  });
  assert.ok(narrationPorts);
  assert.ok(Object.hasOwn(narrationPorts, 'worldKnowledgeGrounder'));
  assert.ok(Object.hasOwn(narrationPorts, 'telemetry'));
  const result = await narrationService.run({
    version: 1, schema: 'narration_request', request_id: 'n-b1',
    surface: 'turn',
    visible_context: {
      version: 1, schema: 'visible_context_package',
      visible_scene: 'Река.', visible_changes: ['Ты поднял сеть.'],
      uncertainties: [], do_not_imply: [], allowed_tensions: [],
      sensory_details: [], visible_objects: [], known_context: []
    }
  }, {
    worldKnowledgeAuthoritative: {
      actor_facets: { role_ref: 'nov_role_fisher' },
      historical_events: [], clock: null
    }
  });
  assert.equal(result.status, 'approved');
  assert.equal(grounds.length, 1);
  assert.equal(grounds[0].purpose, 'narration');
  assert.equal(grounds[0].role, 'nov_role_fisher');
});

test('B5 createTraceTurnRuntime passes grounder into v17 npc ports', async () => {
  const grounds = [];
  const spyGrounder = {
    async ground(request, purpose, authoritative) {
      grounds.push({
        purpose, role: authoritative?.actor_facets?.role_ref ?? null
      });
      return {
        ...request,
        world_knowledge: { facts: [], hard_constraints: [] }
      };
    }
  };
  let captured = null;
  let portsArgs = null;
  createTraceTurnRuntime({
    partyPool: { query() {}, connect() {} },
    committer: { commit() {} },
    env: {},
    config: {
      traceTurnDecisionSecret: 'test-secret',
      llmTurnBudget: {},
      llmDiagnostics: { telemetry: null, turnBudget: {} }
    },
    ordinaryMaterializationProfile: null,
    ordinaryContainerContentsProfile: null,
    ordinaryStageBApproval: {
      model_identity: {
        provider: 'test', model: 'test', scope: 'turn_runtime',
        role_id: 'ordinary_materialization', config_hash: 'test'
      }
    },
    actionProductionProfile: null, localFireProfile: null,
    spatialSemanticProfile: null,
    createNpcRuntimePorts: (args) => {
      portsArgs = args;
      assert.ok(Object.hasOwn(args, 'worldKnowledgeGrounder'));
      assert.ok(Object.hasOwn(args, 'roleRunner'));
      return createSpatialV3ProductionV17NpcRuntimePorts({
        roleRunner: {
          async run(call) {
            if (call.role_id === 'player_conversation_interpreter'
                || call.role_id === 'player_conversation_interpreter_format_repair') {
              return {
                output: {
                  input_mode: 'intent_paraphrase',
                  contribution_kind: 'speech',
                  primary_addressee_ref: { entity_kind: 'npc', entity_id: 'npc:1' },
                  intended_addressee_refs: [{ entity_kind: 'npc', entity_id: 'npc:1' }],
                  affected_actor_refs: [],
                  speech: {
                    utterance_text: 'Где сети?',
                    dominant_act: 'question',
                    interaction_tags: [], topic_refs: [], claims: [],
                    response_expectation: { kind: 'none', target_refs: [] }
                  },
                  interpretation: {
                    intent: 'спросить', grounded_contribution: 'спросить',
                    adaptation: 'literal'
                  },
                  resolution: 'automatic',
                  activity: { duration_class: 'moment', effort: 'none' },
                  supporting_operations: [], check: null, handoff: null
                }
              };
            }
            return { output: {} };
          }
        },
        worldKnowledgeGrounder: spyGrounder
      });
    },
    createPhase2RuntimeFactory: (input) => {
      captured = input;
      return {};
    }
  });
  assert.ok(Object.hasOwn(portsArgs, 'worldKnowledgeGrounder'));
  assert.equal(typeof captured.playerConversationModel, 'function');
  await captured.playerConversationModel({
    schema: 'player_conversation_input_v1',
    request_id: 'p-b5',
    conversation_id: 'c1',
    state_version: 1,
    speaker_ref: { entity_kind: 'player_character', entity_id: 'player' },
    raw_text: 'Где сети?',
    received_at: 't1',
    player_safe_context: {
      allowed_duration_classes: ['moment'],
      allowed_references: {
        actor_refs: [{ entity_kind: 'npc', entity_id: 'npc:1' }],
        entity_refs: [], knowledge_refs: [], combat_target_refs: []
      },
      current_game_timestamp: ts(0)
    },
    operation_contract: {}
  }, { actor_facets: { role_ref: 'nov_role_fisher' }, historical_events: [] });
  assert.ok(grounds.some((g) => g.purpose === 'semantic_resolution'
    && g.role === 'nov_role_fisher'));
  const bindingsSrc = readFileSync(join(ROOT,
    'apps/game-server/src/runtime/releases/spatial-v3-production-v17-bindings.js'),
  'utf8');
  assert.match(bindingsSrc,
    /createNpcRuntimePorts:\s*createSpatialV3ProductionV17NpcRuntimePorts\b/u);
});

test('B6 executeM2ConversationExchange injects facets/events/clock', async () => {
  const seen = [];
  const npc = {
    instance_id: 'npc_fisher_neighbor',
    location_profile_ref: 'loc_river'
  };
  const state = {
    actor_id: 'player_1',
    party_id: 'party_b6',
    party_state: { state_version: 1, turn_number: 1 },
    clock: ts(5),
    position: { location_ref: 'loc_river' },
    historical_events: [{ event_id: 'event_m2_ex', phases: [] }],
    player_profile: { social_status: { social_role_id: 'nov_role_fisher' } },
    npcs: [npc],
    knowledge: []
  };
  const base = createM2ConversationContext({
    state,
    targetActor: npc,
    actualNpcActors: [npc],
    playerInput: { raw_text: 'Где сети?' },
    inputDigest: 'b'.repeat(64),
    phase: 'phase_3',
    checkResult: null,
    availableEvidence: null,
    contracts: {
      check: null,
      talk: { duration_minutes: 8 },
      conversationBindings: {
        max_contributions_per_exchange: 8,
        fallback_policy: 'forbidden',
        legacy_bounded_production_path: false,
        contribution_minutes: 1
      }
    },
    playerOperationContract: {},
    playerConversationModel: async (request, ctx) => {
      seen.push(ctx);
      return playerPlan(request);
    },
    revalidateStateVersion: async () => 1,
    npcSemanticModel: async () => {
      throw Object.assign(new Error('stop-after-player'), { code: 'STOP' });
    },
    temporalAdvanceOwner: {
      advance(working) {
        return {
          working_state: working,
          elapsed_minutes: 0,
          temporal_boundary_refs: [],
          temporal_advance_results: []
        };
      }
    }
  });
  // Duration + contribution-slots read playerPlan during setup; the
  // conversationModel ternary must still take m2PlayerConversationModel.
  let playerPlanReads = 0;
  const setupPlan = {
    activity: { duration_class: 'domain_owned' },
    intended_addressee_refs: [{
      entity_kind: 'npc', entity_id: 'npc_fisher_neighbor'
    }]
  };
  const context = new Proxy(base, {
    get(target, prop, receiver) {
      if (prop === 'playerPlan') {
        playerPlanReads += 1;
        return playerPlanReads <= 2 ? setupPlan : undefined;
      }
      return Reflect.get(target, prop, receiver);
    }
  });
  assert.equal(typeof m2PlayerConversationModel, 'function');
  try {
    await executeM2ConversationExchange(context);
  } catch {
    // Exchange may stop after player model; facets must already be captured.
  }
  assert.equal(seen.length >= 1, true);
  assert.equal(seen[0].actor_facets.role_ref, 'nov_role_fisher');
  assert.equal(seen[0].historical_events[0].event_id, 'event_m2_ex');
  assert.equal(seen[0].clock.whole_minutes, '5');
});
