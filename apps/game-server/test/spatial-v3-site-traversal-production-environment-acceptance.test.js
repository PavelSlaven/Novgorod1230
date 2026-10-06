import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs, { readFileSync, readFile } from 'node:fs';
import fsPromises, { readFile as promiseReadFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import test from 'node:test';
import { computeSpatialV3CanonicalDigest as digest } from '@rus/contracts/spatial-v3/registry';

const root = new URL('../../../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const vikhtuy = (name) => `cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_${name}`;

// A-lines-b1-20: the production policy is environment=1 until rules are imported (#321).
// These static traversal/SQL shapes follow the existing traversal owner fixture.
// Environment itself is projected from real approved Temporal records, with no hook.
const party_id = 'party';
const rational = (numerator, denominator = '1') => ({ numerator, denominator });
const seal = (payload) => ({ ...payload, canonical_digest: digest(payload) });
const active = (id, extra = {}) => ({ id, party_id, status: 'active', state_version: 1, ...extra });
const versioned = (entity_id) => ({ entity_id, authoring_version: '1' });
const visible = { version: 1, schema: 'visible_context_package', visible_scene: 'За проходом видна новая поляна.',
  visible_changes: [], sensory_details: [], visible_npc: [], visible_objects: [],
  known_context: [], uncertainties: [], allowed_tensions: [], do_not_imply: [] };
const capabilityPins = [{ dependency_role: 'source_authoring',
  entity_ref: { entity_kind: 'world_revision', entity_id: 'revision' },
  version_pin: { pin_kind: 'authoring_version', authoring_version: 'revision', state_version: null } }];
const capability = { cohort_membership_snapshot_pin: null, load_state_pin: null,
  root_carrier_attachment_pins: null, allowed_movement_methods: ['movement.walk'],
  available_transport_pins: null, equipment_state_pins: null, legal_access_fact_pins: null,
  allowed_pace_modes: [], dependency_pins: {
    pins: capabilityPins, canonical_digest: digest(capabilityPins).slice(7) } };
capability.canonical_digest = digest(capability);
const connection = active('connection', { from_site_id: 'site:source', to_site_id: 'site:target',
  passage_type_id: 'passage.local', cost_kind: 'time', action_units: null, base_minutes: 20,
  capacity: null, portal_entity_id: null,
  line_kind_id: 'line.path', line_kind_profile_ref: versioned('line.path'),
  line_name: 'лесной тропой', line_discriminator: null, line_direction_id: 'outbound',
  baseline_movement_method_id: 'movement.walk',
  movement_method_cost_profile_ref: versioned('method-cost'), dynamic_recheck_policy_ref: versioned('recheck'),
  source_canonical_connection_ref: versioned('canonical-connection'),
  transition_environment_profile_ref: versioned('env'),
  movement_orientation_profile_ref: versioned('orientation'),
  availability_condition_set_ref: versioned('availability.local_state_conditional') });
const profile = { id: 'profile', version: 1, status: 'approved', profile_scope: 'site_connection',
  passage_type_id: 'passage.local', cost_kind: 'time', action_units: null, base_minutes: 20,
  line_kind_id: 'line.path', line_kind_profile_id: 'line.path', line_kind_profile_version: 1,
  movement_method_cost_profile_id: 'method-cost', movement_method_cost_profile_version: 1,
  dynamic_recheck_policy_id: 'recheck', dynamic_recheck_policy_version: 1,
  transition_environment_profile_id: 'env', transition_environment_profile_version: 1,
  movement_orientation_profile_id: null, movement_orientation_profile_version: null,
  movement_orientation_profile_ref: versioned('orientation'),
  availability_condition_set_ref: 'availability.local_state_conditional@1',
  capacity_semantics_ref: 'capacity.no_static_limit@1', canonical_digest: 'profile-digest' };
const sites = [active('site:source', { parent_g4_id: 'g4' }),
  active('site:target', { parent_g4_id: 'g4' })];
const baselines = [active('baseline:source', { host_kind: 'g5_site', host_id: 'site:source' }),
  active('baseline:target', { host_kind: 'g5_site', host_id: 'site:target' })];
const g6 = [active('g6:source', { scene_baseline_id: 'baseline:source', host_kind: 'g5_site', host_id: 'site:source' }),
  active('g6:target', { scene_baseline_id: 'baseline:target', host_kind: 'g5_site', host_id: 'site:target' })];
const positions = [active('position:source', { g6_instance_id: 'g6:source', capacity: 4 }),
  active('position:target', { g6_instance_id: 'g6:target', capacity: 4 })];
const endpoints = [active('endpoint:from', { site_connection_id: connection.id,
  endpoint_role: 'from', g5_site_id: 'site:source', position_id: 'position:source' }),
active('endpoint:to', { site_connection_id: connection.id,
  endpoint_role: 'to', g5_site_id: 'site:target', position_id: 'position:target' })];
const fixtureLocation = { id: 'journey', party_id, owner_kind: 'actor', owner_id: 'actor',
  location_kind: 'scene', scene_position_id: 'position:source', state_version: 1 };
const context = { partyId: party_id, actorId: 'actor', world_revision_id: 'revision',
  world_catalog_digest: 'catalog', location: fixtureLocation, position: positions[0], site: sites[0],
  baseline: baselines[0], closure: { connection_profiles: [profile] },
  snapshot: { sites, scene_baselines: baselines, g6_instances: g6,
    scene_positions: positions, endpoint_bindings: endpoints,
    line_bindings: [{ site_connection_id: 'connection', authoring_version: 3,
      canonical_digest: 'line-digest', line_name: 'лесной тропой', line_discriminator: null,
      line_kind_profile_ref: 'line.path@1', base_minutes: 20,
      movement_method_id: 'movement.walk', method_factor: rational('1'),
      movement_method_options: [{ movement_method_id: 'movement.walk', factor: rational('1') }],
      dynamic_recheck_policy: { id: 'recheck', version: 1, policy_kind: 'fixed_time_interval', interval_minutes: 15 } }] } };
const state = { party_id, actor_id: 'actor', party_state: { state_version: 1, turn_number: 0 },
  clock: { whole_minutes: '120', subminute_numerator: '0', subminute_denominator: '1' },
  position: { position_id: 'position:source', g4_id: 'g4' },
  journey_location: { id: 'journey', scene_position_id: 'position:source', state_version: 1 } };

function recheckRow(sourceConnection = connection) {
  const row = { scene_position_id: 'position:source', location_kind: 'scene', journey_version: 1,
    from_site_id: 'site:source', to_site_id: 'site:target', connection_status: 'active',
    connection_version: 1, cost_kind: sourceConnection.cost_kind,
    action_units: sourceConnection.action_units, base_minutes: sourceConnection.base_minutes,
    line_kind_id: sourceConnection.line_kind_id, line_kind_profile_ref: sourceConnection.line_kind_profile_ref,
    line_name: sourceConnection.line_name, line_discriminator: sourceConnection.line_discriminator,
    line_direction_id: sourceConnection.line_direction_id,
    baseline_movement_method_id: sourceConnection.baseline_movement_method_id,
    movement_method_cost_profile_ref: sourceConnection.movement_method_cost_profile_ref,
    transition_environment_profile_ref: sourceConnection.transition_environment_profile_ref,
    movement_orientation_profile_ref: sourceConnection.movement_orientation_profile_ref,
    dynamic_recheck_policy_ref: sourceConnection.dynamic_recheck_policy_ref,
    connection_capacity: null, portal_entity_id: null,
    from_position: 'position:source', from_site: 'site:source', from_binding_status: 'active', from_binding_version: 1,
    to_position: 'position:target', to_site: 'site:target', to_binding_status: 'active', to_binding_version: 1,
    source_position_status: 'active', source_position_version: 1, destination_position_status: 'active', destination_position_version: 1,
    destination_capacity: 4, source_g6_status: 'active', source_g6_version: 1,
    destination_g6_status: 'active', destination_g6_version: 1, destination_g6_id: 'g6:target',
    source_baseline_status: 'active', source_baseline_version: 1,
    destination_baseline_status: 'active', destination_baseline_version: 1, destination_baseline_id: 'baseline:target',
    source_site_status: 'active', source_site_version: 1,
    destination_site_status: 'active', destination_site_version: 1, destination_g4_id: 'g4' };
  for (const field of ['availability_condition_set_ref']) row[field] = sourceConnection[field] ?? null;
  return row;
}

async function location(pool, partyId) {
  const { rows } = await pool.query(`SELECT loc.scene_position_id AS position_id,pos.template_slot_key AS slot,
      COALESCE(site.canonical_g5_ref->>'entity_id',site.canonical_g5_ref->>'id') AS g5
    FROM party_runtime.party_journey_locations loc
    JOIN party_runtime.scene_position_nodes pos ON pos.party_id=loc.party_id AND pos.id=loc.scene_position_id
    JOIN party_runtime.party_g6_instances g6 ON g6.party_id=pos.party_id AND g6.id=pos.g6_instance_id
    JOIN party_runtime.party_scene_baselines base ON base.party_id=g6.party_id AND base.id=g6.scene_baseline_id
    JOIN party_runtime.party_g5_sites site ON site.party_id=base.party_id AND site.id=base.host_id
    WHERE loc.party_id=$1 AND loc.owner_kind='actor'`, [partyId]);
  assert.equal(rows.length, 1);
  return rows[0];
}
async function clock(pool, partyId) {
  const { rows } = await pool.query(`SELECT whole_minutes::text,subminute_numerator::text,
    subminute_denominator::text FROM party_runtime.party_clocks WHERE party_id=$1`, [partyId]);
  assert.equal(rows.length, 1);
  return rows[0];
}
function assertRational(numerator, denominator, expected, message) {
  assert.equal(BigInt(numerator) * expected.denominator, expected.numerator * BigInt(denominator), message);
}
function assertClockDelta(before, after, expected) {
  const a = BigInt(after.subminute_denominator), b = BigInt(before.subminute_denominator);
  const n = (BigInt(after.whole_minutes) - BigInt(before.whole_minutes)) * a * b
    + BigInt(after.subminute_numerator) * b - BigInt(before.subminute_numerator) * a;
  assertRational(n, a * b, expected, 'exact committed clock delta equals binding minutes × unit factors');
}
function assertIntervalMinutes(intervals, prefix, expected) {
  let n = 0n, d = 1n;
  for (const row of intervals) {
    const next = BigInt(row[`${prefix}_time_denominator`]);
    n = n * next + BigInt(row[`${prefix}_time_numerator`]) * d;
    d *= next;
  }
  assertRational(n, d, expected, `${prefix} intervals equal binding minutes × unit factors`);
}
async function nextLocalEdge(pool, partyId, positionId) {
  const { rows } = await pool.query(`WITH RECURSIVE walk(position_id,visited,edge_ids) AS (
      SELECT $2::text,ARRAY[$2::text],ARRAY[]::text[] UNION ALL
      SELECT e.to_position_id,w.visited||e.to_position_id,w.edge_ids||e.id
      FROM walk w JOIN party_runtime.scene_movement_edges e ON e.party_id=$1
        AND e.from_position_id=w.position_id AND e.status='active' AND e.cost_kind='action'
      WHERE cardinality(w.edge_ids)<12 AND NOT e.to_position_id=ANY(w.visited)
    ) SELECT w.edge_ids[1] AS edge_id FROM walk w
    JOIN party_runtime.scene_position_nodes p ON p.party_id=$1 AND p.id=w.position_id
    WHERE p.template_slot_key='departure' AND cardinality(w.edge_ids)>0
    ORDER BY cardinality(w.edge_ids),w.edge_ids LIMIT 1`, [partyId, positionId]);
  assert.equal(rows.length, 1, 'a local action path reaches departure');
  return rows[0].edge_id;
}

function selectMovement(request, selection, turnStepOperationChoices) {
  const choices = turnStepOperationChoices(request).filter(({ operation: op }) => op.op === 'request_movement'
    && (selection.localEdge ? op.movement_kind === 'local' && op.route_ref == null
      && op.target_ref === selection.localEdge : op.movement_kind === 'route'
      && op.target_ref === selection.bindingId && op.route_ref === selection.bindingId));
  assert.ok(choices.length <= 1, 'selection identifies at most one visible operation');
  const pick = choices[0];
  if (!pick) return {
    interpretation: { adaptation: 'literal' }, resolution: 'direct', goal_result: 'not_achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' }, operations: [],
    operation_choice: null, check: null, continuation: null, clarification: null,
    direct_result_kind: null, reason_code: 'no_named_passage', reason: 'Выбранный путь сейчас недоступен.',
  };
  selection.offered = true;
  return {
    interpretation: { player_goal: request.root_player_action,
      grounded_attempt: pick.operation.description, adaptation: 'literal' },
    resolution: 'domain_request', goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operation_family: 'request_movement', operation_choice: pick.choice_id,
    check: null, continuation: null, clarification: null, direct_result_kind: null,
    reason_code: 'visible_movement', reason: 'Следую выбранному видимому пути.',
  };
}


function approvedTemporalRecord(family) {
  const approval = JSON.parse(read(`data/world-catalogs/novgorod/temporal-v4/approvals/${family}.json`));
  assert.equal(approval.status, 'approved');
  const bytes = read(approval.artifacts.dataset.path);
  assert.equal(sha256(bytes), approval.artifacts.dataset.sha256, `${family}: exact approved dataset`);
  const records = JSON.parse(bytes).filter((row) => approval.record_ids.includes(row.record_id)
    && String(row.version) === String(approval.record_version) && row.status === 'approved');
  assert.equal(records.length, 1, `${family}: unambiguous approved record`);
  return records[0];
}

function assertUnitFactors(factors) {
  assert.ok(Array.isArray(factors), 'committed traversal has explicit resolved factors');
  for (const kind of ['method', 'environment', 'load', 'body', 'pace']) {
    const matches = factors.filter((factor) => factor.factor_kind === kind);
    assert.equal(matches.length, 1, `one ${kind} factor`);
    assert.equal(matches[0].numerator, '1', `${kind} numerator is exactly one`);
    assert.equal(matches[0].denominator, '1', `${kind} denominator is exactly one`);
  }
}

function guardCandidateReads(t) {
  const attempts = [];
  const check = (path) => {
    const value = path instanceof URL ? path.pathname : String(path);
    if (/(?:^|[/\\])(?:env-dynamic|environment-dynamic)(?:[/\\]|$)/.test(value)) {
      attempts.push(value);
      throw Object.assign(new Error('Production tried to read env-dynamic candidate data'),
        { code: 'A20_CANDIDATE_READ_FORBIDDEN' });
    }
  };
  for (const [owner, method] of [[fs, 'readFileSync'], [fs, 'readFile'], [fsPromises, 'readFile']]) {
    const original = owner[method];
    t.mock.method(owner, method, function (path, ...args) {
      check(path);
      return original.call(this, path, ...args);
    });
  }
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  return attempts;
}

test('A20: production uses no environment test hook or candidate data', { timeout: 1_800_000 }, async (t) => {
  const attempts = guardCandidateReads(t);
  await t.test('file guard covers default and named fs/fs-promises readers', () => {
    const forbidden = new URL('data/world-catalogs/novgorod/environment-dynamic/candidate/probe.json', root);
    for (const call of [() => fs.readFileSync(forbidden), () => readFileSync(forbidden),
      () => fs.readFile(forbidden, () => {}), () => readFile(forbidden, () => {}),
      () => fs.promises.readFile(forbidden), () => fsPromises.readFile(forbidden),
      () => promiseReadFile(forbidden)]) {
      assert.throws(call, { code: 'A20_CANDIDATE_READ_FORBIDDEN' });
    }
    attempts.length = 0;
  });
  t.after(() => assert.deepEqual(attempts, [], 'production never reads env-dynamic candidate files'));

  await t.test('production launcher and composition loader do not supply the test hook', () => {
    const launcher = read('apps/game-server/src/modular-entry.js').toString();
    const loader = read('apps/game-server/src/runtime/load-composition.js').toString();
    const config = read('apps/game-server/src/config.js').toString();
    for (const source of [launcher, loader, config]) {
      assert.doesNotMatch(source, /testOnlyProjectEnvironmentAtClock/);
    }
    assert.match(launcher, /loadConfiguredComposition\(config\.compositionModule,\s*\{\s*env: process\.env,\s*config: runtimeConfig\s*\}\)/);
    assert.match(loader, /createSpatialV3ProductionCompositionRoot\(context\)/);
  });

  const { deriveApprovedInitialEnvironment } = await import('@rus/materialization');
  const { resolveGameTimestampFromCalendarDate } = await import('@rus/time-events-history/calendar');
  const { buildCalendarProjectionProfile } = await import('../src/internal/lower-dvina-trace-phase-1a-bundle.js');
  const { createTargetCurrentFactualContext } = await import('../src/infrastructure/postgres/target-current-factual-context.js');
  const { createSpatialV3SiteTraversalRuntime } = await import('../src/runtime/spatial-v3-site-traversal-runtime.js');
  const { turnStepOperationChoices } = await import('../src/runtime/lower-dvina-trace-turn-step-operation-choices.js');
  const calendar = approvedTemporalRecord('calendar_daylight_light_profiles');
  const weather = approvedTemporalRecord('weather_transition_profiles_processes');
  const calendarProfile = buildCalendarProjectionProfile(calendar);
  const projectEnvironmentAtClock = createTargetCurrentFactualContext({ runtime: {
    materialization_inputs: { calendar_profile: calendarProfile,
      approved_actor_temporal_bundle: { temporal_records: [calendar, weather] } },
  } }).projectEnvironmentAtClock;
  const boundary = calendar.payload.daylight_boundary_rules.year_daily_boundaries['1230']['03-01'];
  const lightCases = [['night', 0], ['civil_dawn', Number(boundary.civil_dawn_minute_of_day)],
    ['daylight', Number(boundary.sunrise_minute_of_day)], ['civil_dusk', Number(boundary.sunset_minute_of_day)]];
  const coveredWeather = new Set();
  await t.test('all six approved weather states × four light states keep line environment=1', async (matrix) => {
    for (let draw = 0; draw < 6; draw++) {
      const initial = deriveApprovedInitialEnvironment({ calendar_record: calendar, weather_record: weather,
        calendar_date: { year: 1230, month: 3, day: 1 }, local_minute_of_day: 0,
        random: { nextUint32: () => draw } });
      coveredWeather.add(initial.weather_state.weather_state_id);
      for (const [light, minute] of lightCases) await matrix.test(`${initial.weather_state.weather_state_id}/${light}`, async () => {
        const clock = resolveGameTimestampFromCalendarDate({ calendar_system: calendarProfile.calendar_system,
          year: '1230', month: '3', day: '1', local_minute_of_day: String(minute),
          subminute_numerator: '0', subminute_denominator: '1' }, calendarProfile);
        const currentState = { ...state, clock, environment_snapshot: initial };
        const environment = projectEnvironmentAtClock({ state: currentState, clock });
        assert.equal(environment.weather_state.weather_state_id, initial.weather_state.weather_state_id);
        assert.equal(environment.light_state, light, 'actual production projection uses the approved daylight boundary');
        const prepare = createSpatialV3SiteTraversalRuntime({
          pool: { query: async (sql) => ({ rowCount: 1,
            rows: [sql.includes('FOR UPDATE OF l,c') ? recheckRow() : { units: 0 }] }) },
          assessAvailability: async () => ({ ok: true, status: 'open', connection_id: connection.id,
            condition_set_ref: 'availability.local_state_conditional@1' }),
          assessMovementCapability: async () => ({ ok: true, actor_id: 'actor', capability_context: capability }),
          projectDestination: async () => ({ ok: true, position_id: 'position:target', site_id: 'site:target', visible_context: visible }),
          projectEnvironmentAtClock,
        });
        const identity = `a20-${draw}-${light}`;
        const consequence = await prepare({ partyId: party_id, actorId: 'actor', requestId: identity,
          state: currentState, playerInput: { idempotency_key: identity }, inputDigest: identity, context, connection });
        const traversal = consequence.spatial_v3_traversal;
        assert.equal(traversal.result.result_kind, 'segment_completed');
        assert.ok(traversal.traversal_intervals.length > 0);
        for (const interval of traversal.traversal_intervals) assertUnitFactors(interval.result.resolved_factors);
        assertRational(traversal.clock_update.actual_elapsed.numerator, traversal.clock_update.actual_elapsed.denominator,
          { numerator: 20n, denominator: 1n }, 'exact line minutes × unit factors');
      });
    }
    assert.deepEqual([...coveredWeather].sort(), weather.payload.weather_states.map((row) => row.weather_state_id).sort(),
      'matrix covers every approved weather state, including non-unit weather-record factors');
  });

  await t.test('configured no-hook production commits bootstrap line, exact time and arrival', async (pg) => {
    const { bootstrapV17PresenceE2e, createPresenceProductionRoot, installPresenceProductionE2eFetch,
      publicStartScenario } = await import('../../../test/spatial-v3/presence-rules-production-e2e-fixture.js');
    const { loadConfiguredComposition } = await import('../src/runtime/load-composition.js');
    const env = await bootstrapV17PresenceE2e(pg);
    const bindings = (await env.worldPool.query(`SELECT * FROM world_base.spatial_v3_canonical_g5_connection_bindings
      WHERE status='approved' AND from_canonical_g5_id=$1 AND to_canonical_g5_id=$2
      ORDER BY version DESC LIMIT 1`, [vikhtuy('work_storage'), vikhtuy('water_access')])).rows;
    assert.equal(bindings.length, 1, 'bootstrap imports the actual approved canonical line');
    const binding = bindings[0];
    assert.ok(binding.base_minutes > 0, 'line carries positive binding minutes');
    const selection = { bindingId: binding.id, localEdge: null, offered: false };
    pg.after(installPresenceProductionE2eFetch({ turnStepPlanner: ({ request }) => selectMovement(request, selection, turnStepOperationChoices) }));
    const initial = await createPresenceProductionRoot(env);
    await initial.runtime.close();
    assert.equal(Object.hasOwn(initial.rootOptions, 'testOnlyProjectEnvironmentAtClock'), false);
    assert.equal(Object.hasOwn(initial.rootOptions.config, 'testOnlyProjectEnvironmentAtClock'), false);
    const runtime = await loadConfiguredComposition('builtin:production-spatial-v3', initial.rootOptions);
    pg.after(() => runtime.close());
    const partyId = await publicStartScenario(runtime, 'novgorod_vikhtuy_work_storage_v1');
    // Reach the real departure endpoint through offered scene edges, with no test state writes.
    for (let hops = 0; (await location(env.partyPool, partyId)).slot !== 'departure' && hops < 12; hops++) {
      const current = await location(env.partyPool, partyId);
      selection.localEdge = await nextLocalEdge(env.partyPool, partyId, current.position_id);
      selection.offered = false;
      await runtime.submitTurn(partyId, { raw_text: 'Иду к месту выхода.', request_id: `a20-local-${partyId}-${hops}` });
      assert.equal(selection.offered, true, 'approach uses a genuinely offered scene edge');
    }
    assert.equal((await location(env.partyPool, partyId)).slot, 'departure');
    selection.localEdge = null;
    selection.offered = false;
    const before = await location(env.partyPool, partyId), clockBefore = await clock(env.partyPool, partyId);
    const requestId = `a20-line-${partyId}`;
    await runtime.submitTurn(partyId, { raw_text: 'Иду по выбранному проходу.', request_id: requestId });
    assert.equal(selection.offered, true, 'the actual imported line was offered to the planner');
    const paths = (await env.partyPool.query(`SELECT p.id AS plan_id,s.step_kind,s.static_contract_snapshot,
        e.id AS execution_id,e.status FROM party_runtime.party_route_plans p
      JOIN party_runtime.party_route_plan_steps s ON s.route_plan_id=p.id
      JOIN party_runtime.party_route_plan_executions e ON e.route_plan_id=p.id
      WHERE p.party_id=$1 AND p.planning_request_id=$2 ORDER BY s.ordinal`, [partyId, requestId])).rows;
    assert.equal(paths.length, 1, 'one plan step for this physical segment');
    assert.equal(paths[0].step_kind, 'timed_traversal');
    assert.equal(paths[0].status, 'completed');
    const segment = paths[0].static_contract_snapshot.traversal_snapshot.physical_segment_ref.segment_ref;
    assert.equal(segment.segment_kind, 'site_connection');
    const committed = (await env.partyPool.query(`SELECT to_jsonb(c) AS value FROM party_runtime.g5_site_connections c
      WHERE party_id=$1 AND id=$2`, [partyId, segment.segment_id])).rows[0]?.value;
    assert.equal(committed?.cost_kind, 'time');
    assert.equal(committed.base_minutes, binding.base_minutes);
    assert.equal(committed.source_canonical_connection_ref.entity_id, binding.id);
    assert.equal(String(committed.source_canonical_connection_ref.authoring_version), String(binding.version));
    const intervals = (await env.partyPool.query(`SELECT * FROM party_runtime.party_traversal_interval_results
      WHERE route_plan_execution_id=$1 ORDER BY interval_ordinal`, [paths[0].execution_id])).rows;
    assert.ok(intervals.length > 0, 'exact physical progress is persisted');
    for (const interval of intervals) assertUnitFactors(interval.dynamic_snapshot.resolved_factors);
    const expected = { numerator: BigInt(binding.base_minutes), denominator: 1n };
    assertIntervalMinutes(intervals, 'planned', expected);
    assertIntervalMinutes(intervals, 'actual', expected);
    assert.equal(intervals.at(-1).actual_progress_after_ppm, 1_000_000);
    assert.equal(intervals.at(-1).result_kind, 'segment_completed');
    assertClockDelta(clockBefore, await clock(env.partyPool, partyId), expected);
    const after = await location(env.partyPool, partyId);
    assert.equal(after.g5, vikhtuy('water_access'));
    assert.equal(after.slot, binding.to_scene_endpoint_slot_key);
    assert.notEqual(after.position_id, before.position_id);
    assert.deepEqual(attempts, [], 'bootstrap, root construction and committed turn did not read candidate files');
  });
});
