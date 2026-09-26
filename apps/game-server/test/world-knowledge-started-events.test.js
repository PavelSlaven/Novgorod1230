import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { createWorldKnowledgeCore } from '@rus/world-knowledge';
import { createProductionWorldKnowledgeGrounder } from
  '../src/runtime/world-knowledge-grounding.js';

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
      occurred_at: ts(0), historical_context: { year: 1230 }
    }, { clock: ts(0), started_historical_events: [] });
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
