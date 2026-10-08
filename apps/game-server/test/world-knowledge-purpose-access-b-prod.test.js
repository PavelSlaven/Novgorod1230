import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createWorldKnowledgeCore } from '@rus/world-knowledge';
import { playerWorldKnowledgeAuthoritativeFromState } from
  '../src/runtime/world-knowledge-request-context.js';
import { createLowerDvinaTraceNarrationService } from
  '../src/runtime/lower-dvina-trace-narration-llm.js';
import { createProductionWorldKnowledgeGrounder } from
  '../src/runtime/world-knowledge-grounding.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const bundlePath = join(ROOT,
  'data/world-catalogs/novgorod/world-knowledge/production-v2/runtime-bundle.json');

const HIDDEN = 'claim:bathing-washing-water';
const ROLE = 'claim:population-bark-float';
const FUTURE = 'claim:clothing-pointed-cap-xii-depiction';
const EVENT = 'event:famine-1230';
const FAMINE_AT = 40 * 1440;
const ts = (m) => ({
  whole_minutes: String(m), subminute_numerator: '0', subminute_denominator: '1'
});
const TEXT = 'онучи шапка береста поплавок баня мытьё вода';

function calendarProfile() {
  return {
    profile_id: 'novgorod-calendar', version: '1', status: 'approved',
    provenance: { source_id: 'chronicle-x', source_version: '1' },
    epoch: { game_timestamp: ts(0), year: '1230', month: '1', day: '1' },
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

function loadProbeBundle() {
  const b = JSON.parse(readFileSync(bundlePath, 'utf8'));
  const f = b.claims.find((c) => c.claim_ref === FUTURE);
  f.applicability = {
    ...f.applicability,
    conditions: [{ facet: 'started_historical_events', operator: 'includes',
      value: EVENT }]
  };
  return b;
}

function makeProbeRunner() {
  const auditCount = new Map();
  return {
    async run(call) {
      if (call.role_id === 'world_knowledge_query_planner') {
        return {
          output: {
            schema: 'world_knowledge_query_plan_v1',
            query_locale: 'ru',
            domains: ['material_culture'],
            focus_refs: [],
            requested_predicates: [],
            search_hints: [TEXT]
          }
        };
      }
      if (call.role_id === 'gameplay_narrator') {
        return { output: { prose: 'Ты поднял сеть.' } };
      }
      if (call.role_id === 'gameplay_narrator_format_repair') {
        return { output: { prose: 'Ты поднял сеть.' } };
      }
      if (call.role_id === 'gameplay_narrator_auditor') {
        const k = call.request_identity ?? 'x';
        const n = (auditCount.get(k) ?? 0) + 1;
        auditCount.set(k, n);
        const wire = JSON.parse(call.messages[1].content);
        const first = wire.segments[0]?.segment_id;
        const refs = [...wire.required_current_beat.changes,
          ...wire.required_current_beat.uncertainties].map(({ ref }) => ref);
        return {
          output: {
            reviewed_segments: wire.segments.map((s) => s.segment_id),
            source_reviews: refs.map((ref) => ({
              ref, segment_choices: [first]
            })),
            unsupported: [],
            literary_failures: [],
            evidence: ['Grounded current beat.']
          }
        };
      }
      if (call.role_id === 'gameplay_narrator_semantic_repair') {
        return { output: { replacements: [{ prose: 'Ты вытянул сеть из воды.' }] } };
      }
      return { output: {} };
    }
  };
}

test('A3 production grounder via services+durable yields approved fisher slice',
  async () => {
  const { createLowerDvinaTracePhase2DurableNarrator } = await import(
    '../src/infrastructure/postgres/lower-dvina-trace-phase-2-presentation.js');
  const { buildLowerDvinaTracePhase2Services } = await import(
    '../src/runtime/lower-dvina-trace-phase-2-services.js');
  const { phase2VisibleContextFromPayload } = await import(
    '../src/infrastructure/postgres/lower-dvina-trace-phase-2-projection.js');
  const { canonicalDigest } = await import('@rus/materialization');
  const { computeSpatialV3CanonicalDigest } = await import(
    '@rus/contracts/spatial-v3/registry');
  const { fixture } = await import('./lower-dvina-trace-phase-2-fixture.js');
  const { loadLowerDvinaTracePhase2Bundle } = await import(
    '../src/internal/lower-dvina-trace-phase-2-bundle.js');
  const { resolveTracePhase2Contracts } = await import(
    '../src/runtime/lower-dvina-trace-phase-2-contracts.js');
  const { committedTraceScenarioDefinitionRevision } = await import(
    '../src/runtime/lower-dvina-trace-committed-revision.js');
  const { createSeededRandomSource } = await import('@rus/checks-rng');
  const { loadLowerDvinaTraceMaterializationBundle } = await import(
    '../src/internal/lower-dvina-trace-phase-1a.js');

  const bundle = await loadLowerDvinaTraceMaterializationBundle();
  const fx = fixture({ scenarioBundle: bundle, materializationBundle: bundle });
  const base = fx.state;
  const phase2Bundle = await loadLowerDvinaTracePhase2Bundle({
    scenarioDefinitionRevision: committedTraceScenarioDefinitionRevision(base)
  });
  const contracts = resolveTracePhase2Contracts({
    state: base, bundle, phase2Bundle
  });

  const ALL = [HIDDEN, ROLE, FUTURE];
  const runner = makeProbeRunner();
  const wkBundle = loadProbeBundle();
  const sliceLog = [];
  const real = createProductionWorldKnowledgeGrounder({
    worldKnowledge: {
      bundle: wkBundle,
      core: createWorldKnowledgeCore(wkBundle),
      calendar_profile: calendarProfile(),
      encoder: { encode: async () => [1] },
      vector_index: { search: () => new Map(ALL.map((r) => [r, 0.99])) }
    },
    telemetry: { onGameplayTrace: () => {}, onDetail: () => {} },
    roleRunner: runner,
    year: 1230,
    placeRefs: ['region_novgorod_land']
  });
  const grounder = {
    async ground(request, purpose, authoritative) {
      const g = await real.ground(request, purpose, authoritative);
      const s = JSON.stringify(g.world_knowledge ?? null);
      sliceLog.push({
        purpose,
        role: authoritative?.actor_facets?.role_ref ?? null,
        in_slice: Object.fromEntries(ALL.map((r) => [r, s.includes(r)]))
      });
      return g;
    }
  };
  const shared = createLowerDvinaTraceNarrationService({
    roleRunner: runner, worldKnowledgeGrounder: grounder
  });
  const visiblePayload = {
    perceived_scene: 'Тёмная речная вода.',
    perceived_changes: ['Ты поднял сеть.'],
    sensory_details: [], visible_npcs: [], visible_objects: [],
    known_context: [], uncertainties: []
  };
  const visible = phase2VisibleContextFromPayload(visiblePayload);
  const fakePool = {
    async query(q, vals) {
      const values = vals ?? q.values ?? [];
      const turnId = values[1];
      const snapshot = { party_state: { turn_number: 1 } };
      return {
        rowCount: 1,
        rows: [{
          package_id: `pkg:${turnId}`, party_id: values[0], turn_id: turnId,
          committed_state_version: 1, change_set_id: 'cs',
          package_digest: computeSpatialV3CanonicalDigest(visiblePayload),
          visible_payload: visiblePayload, presentation_status: 'pending',
          projection_policy_ref: 'p', dependency_pins: {},
          idempotency_record_id: 'i', snapshot_payload: snapshot,
          state_digest: canonicalDigest(snapshot)
        }]
      };
    }
  };
  const fakeStore = {
    async claimPresentationAttempt() {
      return { ok: true, disposition: 'claimed', attempt_id: 'a1',
        claim_token: 't1' };
    },
    async persistNarrationOutput() {
      return { ok: true, disposition: 'output_ready' };
    },
    async finalizePresentationAttempt(a) {
      return { ok: true, presentation_status: a.presentation_status,
        output_digest: a.output_digest };
    },
    async finalizeFactualPresentationAttempt() {
      return { ok: true, presentation_status: 'factual_delivered' };
    }
  };
  const narrator = createLowerDvinaTracePhase2DurableNarrator({
    partyPool: fakePool, narrationService: shared, presentationStore: fakeStore
  });
  const state = structuredClone(base);
  state.historical_events = [{
    id: EVENT, phases: [{ id: 'start', start_at_minutes: FAMINE_AT }]
  }];
  state.clock = ts(FAMINE_AT + 10);
  state.player_profile = {
    ...(state.player_profile ?? {}),
    social_status: {
      ...(state.player_profile?.social_status ?? {}),
      social_role_id: 'nov_role_fisher'
    }
  };
  state.party_id = 'party:A3';
  const rng = createSeededRandomSource('a3');
  const services = buildLowerDvinaTracePhase2Services({
    partyId: state.party_id, requestId: 'req:A3', idempotencyKey: 'idem:A3',
    inputDigest: 'd'.repeat(64), issuedAt: '2026-07-30T08:00:00.000Z',
    scenarioId: state.scenario_id, state, contracts, registry: {},
    repository: {}, semanticResolver: async () => ({}), turnStepModel: null,
    locationProfiles: bundle.location_topology_set.location_profiles,
    scenePresentation: bundle.scene_presentation ?? null,
    randomSource: rng, randomSourceFactory: () => rng, narrator,
    decisionSecret: 's'
  });
  const result = await services.narrator.run({
    version: 1, schema: 'narration_request', request_id: 'n:A3',
    surface: 'turn', visible_context: structuredClone(visible),
    context: { attempt: { text: 'поднять сеть' } }
  });
  assert.equal(result?.status, 'approved');
  assert.equal(sliceLog.length >= 1, true);
  const narrationSlice = sliceLog.find((s) => s.purpose === 'narration');
  assert.ok(narrationSlice);
  assert.equal(narrationSlice.role, 'nov_role_fisher');
  assert.equal(narrationSlice.in_slice[ROLE], true);
  assert.equal(narrationSlice.in_slice[HIDDEN], false);
  assert.equal(narrationSlice.in_slice[FUTURE], true);
  // Pre-event clock must hide FUTURE.
  sliceLog.length = 0;
  const early = structuredClone(state);
  early.clock = ts(0);
  early.party_id = 'party:A3b';
  const earlyServices = buildLowerDvinaTracePhase2Services({
    partyId: early.party_id, requestId: 'req:A3b', idempotencyKey: 'idem:A3b',
    inputDigest: 'e'.repeat(64), issuedAt: '2026-07-30T08:00:00.000Z',
    scenarioId: early.scenario_id, state: early, contracts, registry: {},
    repository: {}, semanticResolver: async () => ({}), turnStepModel: null,
    locationProfiles: bundle.location_topology_set.location_profiles,
    scenePresentation: bundle.scene_presentation ?? null,
    randomSource: rng, randomSourceFactory: () => rng, narrator,
    decisionSecret: 's'
  });
  const earlyResult = await earlyServices.narrator.run({
    version: 1, schema: 'narration_request', request_id: 'n:A3b',
    surface: 'turn', visible_context: structuredClone(visible),
    context: { attempt: { text: 'поднять сеть' } }
  });
  assert.equal(earlyResult?.status, 'approved');
  const earlySlice = sliceLog.find((s) => s.purpose === 'narration');
  assert.ok(earlySlice);
  assert.equal(earlySlice.in_slice[FUTURE], false);
  assert.equal(earlySlice.in_slice[HIDDEN], false);
  assert.equal(typeof playerWorldKnowledgeAuthoritativeFromState, 'function');
});
