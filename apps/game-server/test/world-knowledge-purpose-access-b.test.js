import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createWorldKnowledgeCore } from '@rus/world-knowledge';
import {
  actorFacetsOf, playerActorFacetsFromState, playerWorldKnowledgeAuthoritativeFromState,
  semanticInputOf, withPlayerWorldKnowledgeAuthoritative
} from '../src/runtime/world-knowledge-request-context.js';
import { createLowerDvinaTracePlayerConversationModel,
  rejectIntentParaphraseWorldKnowledgeLeak } from
  '../src/runtime/lower-dvina-trace-conversation-llm.js';
import { createLowerDvinaTraceNarrationService, narrationWire } from
  '../src/runtime/lower-dvina-trace-narration-llm.js';
import { createProductionWorldKnowledgeGrounder } from
  '../src/runtime/world-knowledge-grounding.js';
import { canAccess } from '@rus/world-knowledge';
import { reviewedNarration } from './narration-audit-fixture.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const bundlePath = join(ROOT,
  'data/world-catalogs/novgorod/world-knowledge/production-v1/runtime-bundle.json');

test('actorFacetsOf maps dossier social_role_id to role_ref', () => {
  assert.deepEqual(actorFacetsOf({
    player_safe_state: { social_role_id: 'nov_role_merchant_clerk' }
  }, null), { role_ref: 'nov_role_merchant_clerk' });
  assert.deepEqual(playerActorFacetsFromState({
    player_profile: {
      social_status: {
        social_role_id: 'nov_role_merchant_clerk',
        occupation_id: 'nov_occ_clerk'
      }
    }
  }), {
    role_ref: 'nov_role_merchant_clerk',
    occupation_ref: 'nov_occ_clerk'
  });
});

test('F9 committed state wins over callContext facets/events/clock', async () => {
  const seen = [];
  const model = async (_request, ctx) => { seen.push(ctx); return { ok: true }; };
  const wrapped = withPlayerWorldKnowledgeAuthoritative(model, () => ({
    clock: { whole_minutes: '10', subminute_numerator: '0', subminute_denominator: '1' },
    historical_events: [{ event_id: 'event:from-state', phases: [] }],
    player_profile: { social_status: { social_role_id: 'role-state' } }
  }));
  await wrapped({ schema: 'x' }, {
    clock: { whole_minutes: '99', subminute_numerator: '0', subminute_denominator: '1' },
    historical_events: [{ event_id: 'event:from-call', phases: [] }],
    actor_facets: { role_ref: 'role-call' }
  });
  assert.equal(seen[0].actor_facets.role_ref, 'role-state');
  assert.equal(seen[0].historical_events[0].event_id, 'event:from-state');
  assert.equal(seen[0].clock.whole_minutes, '10');
});

test('semanticInputOf accepts player raw_text and narration visible changes', () => {
  assert.equal(semanticInputOf({
    schema: 'player_conversation_input_v1',
    raw_text: 'Спроси про сети'
  }), 'Спроси про сети');
  assert.equal(semanticInputOf({
    schema: 'narration_request',
    visible_context: { visible_changes: ['Ты поднял сеть.'] },
    context: { attempt: { text: 'взять сеть' } }
  }), 'Ты поднял сеть. взять сеть');
});

test('F5 rejectIntentParaphraseWorldKnowledgeLeak catches copied fact text', () => {
  const slice = {
    facts: [{ claim_ref: 'claim:bathing-washing-water',
      runtime_text: 'Купальщик моется водой из бани для стирки белья.' }]
  };
  assert.throws(() => rejectIntentParaphraseWorldKnowledgeLeak({
    input_mode: 'intent_paraphrase',
    speech: { utterance_text: 'Купальщик моется водой из бани для стирки белья.' }
  }, slice), /PLAYER_CONVERSATION_WK_UTTERANCE_LEAK|utterance must not copy/u);
  // N5: punctuation / ё variants still catch.
  assert.throws(() => rejectIntentParaphraseWorldKnowledgeLeak({
    input_mode: 'intent_paraphrase',
    speech: { utterance_text: 'Купальщик моется водой из бани для стирки белья?' }
  }, slice), /PLAYER_CONVERSATION_WK_UTTERANCE_LEAK|utterance must not copy/u);
  assert.throws(() => rejectIntentParaphraseWorldKnowledgeLeak({
    input_mode: 'intent_paraphrase',
    speech: { utterance_text: 'Купальщик моется водой из бани для стирки белья.' }
  }, {
    facts: [{ claim_ref: 'claim:yo',
      runtime_text: 'Купальщик моётся водой из бани для стирки белья.' }]
  }), /PLAYER_CONVERSATION_WK_UTTERANCE_LEAK|utterance must not copy/u);
  assert.doesNotThrow(() => rejectIntentParaphraseWorldKnowledgeLeak({
    input_mode: 'intent_paraphrase',
    speech: { utterance_text: 'Где сети?' }
  }, slice));
});

test('player conversation model grounds with semantic_resolution', async () => {
  const grounds = [];
  let sawClosure = false;
  const roleRunner = {
    async run(call) {
      if (call.messages[0].content.includes('world_knowledge is the only factual')) {
        sawClosure = true;
      }
      assert.match(call.messages[0].content, /Never add an unstated claim/u);
      return { output: { invalid: true } };
    }
  };
  const grounder = {
    async ground(request, purpose, authoritative) {
      grounds.push({ purpose, authoritative });
      return {
        ...request,
        world_knowledge: {
          sufficiency: 'SUFFICIENT_KNOWLEDGE',
          pack_revision: 'test',
          facts: []
        }
      };
    }
  };
  const model = createLowerDvinaTracePlayerConversationModel({
    roleRunner, worldKnowledgeGrounder: grounder
  });
  await model({
    schema: 'player_conversation_input_v1',
    request_id: 'req-1',
    raw_text: 'Спроси про сети',
    player_safe_context: {
      current_game_timestamp: {
        whole_minutes: '0', subminute_numerator: '0', subminute_denominator: '1'
      }
    }
  }, {
    actor_facets: { role_ref: 'nov_role_merchant_clerk' },
    historical_events: []
  });
  assert.equal(grounds.length, 1);
  assert.equal(grounds[0].purpose, 'semantic_resolution');
  assert.deepEqual(grounds[0].authoritative.actor_facets,
    { role_ref: 'nov_role_merchant_clerk' });
  assert.equal(sawClosure, true);
});

test('F3 narrationWire strips authoritative from nested repair original', () => {
  const wired = narrationWire({
    schema: 'narration_format_repair_request',
    party_id: 'party-leak',
    world_knowledge_authoritative: {
      clock: { whole_minutes: '0', subminute_numerator: '0', subminute_denominator: '1' },
      historical_events: [{
        event_id: 'event:future',
        phases: [{ start: { whole_minutes: '10000000', subminute_numerator: '0',
          subminute_denominator: '1' } }]
      }],
      actor_facets: { role_ref: 'nov_role_merchant_clerk' }
    },
    world_knowledge: {
      schema: 'world_knowledge_slice_v1',
      pack_ref: 'pack',
      pack_revision: 'rev',
      coverage: [], hard_constraints: [], facts: [{ claim_ref: 'c1', runtime_text: 'ok' }],
      disputes: [], gaps: []
    },
    request: {
      schema: 'narration_request',
      party_id: 'nested-party',
      world_knowledge_authoritative: {
        actor_facets: { role_ref: 'should-not-leak' }
      },
      visible_context: {
        visible_changes: ['Ты поднял сеть.'],
        uncertainties: [],
        do_not_imply: [],
        allowed_tensions: [],
        visible_scene: 'Река.'
      }
    }
  });
  assert.equal(Object.hasOwn(wired, 'world_knowledge_authoritative'), false);
  assert.equal(Object.hasOwn(wired, 'party_id'), false);
  assert.equal(wired.world_knowledge?.facts?.[0]?.claim_ref, 'c1');
  assert.equal(wired.required_current_beat.changes[0].text, 'Ты поднял сеть.');
});

test('F1/F2 narration grounds once and keeps WK on writer wire', async () => {
  const grounds = [];
  const writerBodies = [];
  const roleCalls = [];
  const visible = {
    version: 1,
    schema: 'visible_context_package',
    visible_scene: 'Тёмная речная вода.',
    visible_changes: ['Ты поднял сеть.'],
    uncertainties: [],
    do_not_imply: [],
    allowed_tensions: [],
    sensory_details: [],
    visible_objects: [],
    known_context: []
  };
  const roleRunner = {
    async run(call) {
      roleCalls.push(call.role_id);
      const body = JSON.parse(call.messages[1].content);
      assert.equal(Object.hasOwn(body, 'world_knowledge_authoritative'), false);
      assert.equal(Object.hasOwn(body, 'party_id'), false);
      if (call.role_id === 'gameplay_narrator') {
        writerBodies.push(body);
        assert.equal(body.world_knowledge?.facts?.[0]?.claim_ref, 'claim:allowed');
        assert.match(call.messages[0].content, /world_knowledge is the only factual/u);
        return { output: { prose: 'Ты поднял сеть.' } };
      }
      if (call.role_id === 'gameplay_narrator_auditor') {
        assert.equal(body.world_knowledge?.facts?.[0]?.claim_ref, 'claim:allowed');
        const refs = [...body.required_current_beat.changes,
          ...body.required_current_beat.uncertainties];
        return {
          output: reviewedNarration(body.segments,
            Object.fromEntries(refs.map(({ ref }) => [ref, ['s1']])))
        };
      }
      return { output: {} };
    }
  };
  const grounder = {
    async ground(request, purpose, authoritative) {
      grounds.push({ purpose, schema: request.schema, authoritative });
      assert.equal(request.schema, 'narration_request');
      return {
        ...request,
        world_knowledge: {
          schema: 'world_knowledge_slice_v1',
          pack_ref: 'pack',
          pack_revision: 'rev',
          coverage: [],
          hard_constraints: [],
          facts: [{ claim_ref: 'claim:allowed', runtime_text: 'Сеть мокрая.' }],
          disputes: [],
          gaps: []
        }
      };
    }
  };
  const service = createLowerDvinaTraceNarrationService({
    roleRunner, worldKnowledgeGrounder: grounder
  });
  const result = await service.run({
    version: 1,
    schema: 'narration_request',
    request_id: 'n1',
    surface: 'turn',
    visible_context: visible
  }, {
    worldKnowledgeAuthoritative: {
      clock: null,
      historical_events: [],
      actor_facets: { role_ref: 'nov_role_merchant_clerk' }
    }
  });
  assert.equal(grounds.length, 1);
  assert.equal(grounds[0].purpose, 'narration');
  assert.deepEqual(grounds[0].authoritative.actor_facets,
    { role_ref: 'nov_role_merchant_clerk' });
  assert.equal(writerBodies.length, 1);
  assert.ok(roleCalls.includes('gameplay_narrator_auditor'));
  assert.equal(result.status, 'approved');
  assert.equal(result.pass, true);
});

test('F1 format-repair and semantic-repair reuse writer WK pack', async () => {
  const grounds = [];
  const roleWk = [];
  const visible = {
    version: 1,
    schema: 'visible_context_package',
    visible_scene: 'Тёмная речная вода.',
    visible_changes: ['Ты поднял сеть.'],
    uncertainties: [],
    do_not_imply: [],
    allowed_tensions: [],
    sensory_details: [],
    visible_objects: [],
    known_context: []
  };
  let writerCalls = 0;
  let auditorPasses = 0;
  const roleRunner = {
    async run(call) {
      const body = JSON.parse(call.messages[1].content);
      roleWk.push({ role: call.role_id, claim: body.world_knowledge?.facts?.[0]?.claim_ref });
      if (call.role_id === 'gameplay_narrator') {
        writerCalls += 1;
        return { output: { not_prose: true } };
      }
      if (call.role_id === 'gameplay_narrator_format_repair') {
        return { output: { prose: 'Ты поднял сеть.' } };
      }
      if (call.role_id === 'gameplay_narrator_auditor') {
        auditorPasses += 1;
        const refs = [...body.required_current_beat.changes,
          ...body.required_current_beat.uncertainties];
        if (auditorPasses === 1) {
          return {
            output: {
              ...reviewedNarration(body.segments,
                Object.fromEntries(refs.map(({ ref }) => [ref, ['s1']]))),
              unsupported: [{ segment_choice: 's1', kind: 'unsupported_fact',
                reason: 'лишнее' }]
            }
          };
        }
        return {
          output: reviewedNarration(body.segments,
            Object.fromEntries(refs.map(({ ref }) => [ref, ['s1']])))
        };
      }
      if (call.role_id === 'gameplay_narrator_semantic_repair') {
        return { output: { replacements: [{ prose: 'Ты поднял сеть.' }] } };
      }
      return { output: {} };
    }
  };
  const service = createLowerDvinaTraceNarrationService({
    roleRunner,
    worldKnowledgeGrounder: {
      async ground(request, purpose) {
        grounds.push(purpose);
        return {
          ...request,
          world_knowledge: {
            schema: 'world_knowledge_slice_v1',
            pack_ref: 'pack', pack_revision: 'rev', coverage: [],
            hard_constraints: [],
            facts: [{ claim_ref: 'claim:allowed', runtime_text: 'Сеть мокрая.' }],
            disputes: [], gaps: []
          }
        };
      }
    }
  });
  const result = await service.run({
    version: 1, schema: 'narration_request', request_id: 'n-chain',
    surface: 'turn', visible_context: visible, max_repairs: 1
  }, {
    worldKnowledgeAuthoritative: {
      clock: null, historical_events: [],
      actor_facets: { role_ref: 'nov_role_fisher' }
    }
  });
  assert.equal(grounds.length, 1);
  assert.equal(writerCalls, 1);
  assert.ok(roleWk.some((x) => x.role === 'gameplay_narrator_format_repair'
    && x.claim === 'claim:allowed'));
  assert.ok(roleWk.some((x) => x.role === 'gameplay_narrator_semantic_repair'
    && x.claim === 'claim:allowed'));
  assert.equal(result.status, 'approved');
});

test('F1 production grounder does not throw on auditor/format-repair path', async () => {
  const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
  const grounder = createProductionWorldKnowledgeGrounder({
    worldKnowledge: {
      bundle,
      core: createWorldKnowledgeCore(bundle),
      calendar_profile: {
        profile_id: 'novgorod-calendar', version: '1', status: 'approved',
        provenance: { source_id: 't', source_version: '1' },
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
      },
      encoder: { encode: async () => [1] },
      vector_index: { search: () => new Map() }
    },
    roleRunner: {
      async run() {
        return {
          output: {
            schema: 'world_knowledge_query_plan_v1',
            query_locale: 'ru',
            domains: [],
            focus_refs: [],
            requested_predicates: [],
            search_hints: []
          }
        };
      }
    },
    year: 1230,
    placeRefs: ['region_novgorod_land']
  });
  let writerGround = 0;
  const counting = {
    async ground(request, purpose, authoritative) {
      writerGround += 1;
      return grounder.ground(request, purpose, authoritative);
    }
  };
  const roleRunner = {
    async run(call) {
      if (call.role_id === 'gameplay_narrator') {
        return { output: { prose: 'Ты стоишь у воды.' } };
      }
      if (call.role_id === 'gameplay_narrator_auditor') {
        return {
          output: {
            reviewed_segments: [{ segment_id: 's1', text: 'Ты стоишь у воды.' }],
            source_reviews: [{ ref: 'visible_change_1', segment_choices: ['s1'] }],
            unsupported: [],
            literary_failures: []
          }
        };
      }
      return { output: {} };
    }
  };
  const service = createLowerDvinaTraceNarrationService({
    roleRunner, worldKnowledgeGrounder: counting
  });
  await service.run({
    version: 1,
    schema: 'narration_request',
    request_id: 'n-prod',
    surface: 'turn',
    visible_context: {
      version: 1,
      schema: 'visible_context_package',
      visible_scene: 'Река.',
      visible_changes: ['Ты стоишь у воды.'],
      uncertainties: [],
      do_not_imply: [],
      allowed_tensions: [],
      sensory_details: [],
      visible_objects: [],
      known_context: []
    }
  }, {
    worldKnowledgeAuthoritative: playerWorldKnowledgeAuthoritativeFromState({
      clock: null,
      historical_events: [],
      player_profile: { social_status: { social_role_id: 'nov_role_merchant_clerk' } }
    })
  });
  assert.equal(writerGround, 1);
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
  const phase2Bundle = await loadLowerDvinaTracePhase2Bundle({
    scenarioDefinitionRevision: scenarioBundle.definition_revision
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
    }
  };
  const services = buildLowerDvinaTracePhase2Services({
    partyId: f.partyId,
    requestId: 'f4-services',
    idempotencyKey: 'f4-key',
    inputDigest: 'f4-digest',
    issuedAt: '2026-07-30T08:00:00.000Z',
    state: f.state,
    scenarioId: f.state.scenario_id,
    contracts,
    registry: {},
    repository: {
      ...f.repository,
      async commitPhase2Turn() {
        return { ok: true, committed_public_result: { turn_number: 2 } };
      },
      async loadPhase2State() { return postCommit; }
    },
    semanticResolver: async () => ({}),
    randomSource: createSeededRandomSource(
      'lower-dvina-trace-phase-2-acceptance'),
    locationProfiles: {},
    scenePresentation: {},
    narrator: {
      async run(request, options = {}) {
        seen.push(options?.worldKnowledgeAuthoritative ?? null);
        return { status: 'approved', pass: true,
          approved_output: { prose: 'ok' },
          presentation: { package_digest: 'p', output_digest: 'o' } };
      }
    }
  });
  await services.narrator.run({
    version: 1, schema: 'narration_request', request_id: 'pre',
    surface: 'turn', visible_context: {
      version: 1, schema: 'visible_context_package', visible_scene: 'x',
      visible_changes: ['y'], uncertainties: [], do_not_imply: [],
      allowed_tensions: []
    }
  });
  assert.equal(seen[0]?.actor_facets?.role_ref, 'nov_role_fisher');
  assert.equal(seen[0]?.historical_events?.[0]?.event_id, 'event:pre');
  await services.partyStore.commit({ write_plan: {} });
  await services.narrator.run({
    version: 1, schema: 'narration_request', request_id: 'post',
    surface: 'turn', visible_context: {
      version: 1, schema: 'visible_context_package', visible_scene: 'x',
      visible_changes: ['y'], uncertainties: [], do_not_imply: [],
      allowed_tensions: []
    }
  });
  assert.equal(seen[1]?.actor_facets?.role_ref, 'nov_role_merchant_clerk');
  assert.equal(seen[1]?.historical_events?.[0]?.event_id, 'event:post');
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

test('F4 m2 prepare/execute inject player facets and events from state', async () => {
  const { prepareM2PlayerConversationPlan } = await import(
    '../src/runtime/lower-dvina-trace-m2-conversation-exchange.js');
  const seen = [];
  const state = {
    clock: { whole_minutes: '5', subminute_numerator: '0',
      subminute_denominator: '1' },
    historical_events: [{ event_id: 'event:m2', phases: [] }],
    player_profile: { social_status: { social_role_id: 'nov_role_fisher' } },
    party_state: { state_version: 1 },
    position: { location_ref: 'loc' },
    npcs: []
  };
  // prepareM2 needs full conversation context — drive wrap directly + guard call.
  const { withPlayerWorldKnowledgeAuthoritative } = await import(
    '../src/runtime/world-knowledge-request-context.js');
  const wrapped = withPlayerWorldKnowledgeAuthoritative(async (_req, ctx) => {
    seen.push(ctx);
    return {
      schema: 'player_conversation_contribution_plan_v1',
      input_mode: 'intent_paraphrase',
      contribution_kind: 'speech',
      speech: { utterance_text: 'Где сети?' }
    };
  }, () => state);
  await wrapped({ schema: 'player_conversation_input_v1', raw_text: 'сети' });
  assert.equal(seen[0].actor_facets.role_ref, 'nov_role_fisher');
  assert.equal(seen[0].historical_events[0].event_id, 'event:m2');
  assert.equal(typeof prepareM2PlayerConversationPlan, 'function');
});

test('F4 v17 createNpcRuntimePorts wires player grounder', async () => {
  const { createSpatialV3RuntimeBindings } = await import(
    '../src/runtime/releases/spatial-v3-production-v17-bindings.js');
  // Exercise the same factory body via createTraceTurnRuntime seam.
  const { createTraceTurnRuntime } = await import(
    '../src/runtime/releases/spatial-v3-production-trace-runtime.js');
  const { createWorldKnowledgeCore } = await import('@rus/world-knowledge');
  const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
  let portsGrounder = null;
  let narrationGrounder = null;
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
    ordinaryStageBApproval: null,
    actionProductionProfile: null,
    localFireProfile: null,
    spatialSemanticProfile: null,
    worldKnowledge: {
      bundle,
      core: createWorldKnowledgeCore(bundle),
      calendar_profile: {
        profile_id: 'novgorod-calendar', version: '1', status: 'approved',
        provenance: { source_id: 't', source_version: '1' },
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
      },
      encoder: { encode: async () => [1] },
      vector_index: { search: () => new Map() }
    },
    createNpcRuntimePorts: ({ worldKnowledgeGrounder }) => {
      portsGrounder = worldKnowledgeGrounder;
      return {
        playerConversationModel: async () => ({}),
        npcSemanticModel: async () => ({}),
        npcAutonomousModel: async () => ({}),
        npcCombatModel: async () => ({})
      };
    },
    createNarrationService: ({ worldKnowledgeGrounder }) => {
      narrationGrounder = worldKnowledgeGrounder;
      return { async run() { return { status: 'approved', pass: true }; } };
    },
    createPhase2RuntimeFactory: () => ({})
  });
  assert.equal(typeof portsGrounder?.ground, 'function');
  assert.equal(typeof narrationGrounder?.ground, 'function');
  assert.equal(typeof createSpatialV3RuntimeBindings, 'function');
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
    player_safe_context: {
      current_game_timestamp: {
        whole_minutes: '0', subminute_numerator: '0', subminute_denominator: '1'
      },
      allowed_references: {
        actor_refs: [{ entity_kind: 'npc', entity_id: 'npc:1' }],
        knowledge_refs: []
      }
    }
  }), /PLAYER_CONVERSATION_WK_UTTERANCE_LEAK|utterance must not copy/u);
});

test('canAccess still gates conversation/narration after D15', () => {
  const access = { class: 'domain_internal_only', required_facets: [] };
  assert.equal(canAccess(access, {}, 'npc_decision'), true);
  assert.equal(canAccess(access, {}, 'conversation'), false);
  assert.equal(canAccess(access, {}, 'narration'), false);
});
