import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { deriveEnvironment } from '@rus/environment-state';
import { createSpatialV3ProductionCompositionRoot } from '../src/composition/production-spatial-v3.js';
import { turnStepOperationChoices } from '../src/runtime/lower-dvina-trace-turn-step-operation-choices.js';
import {
  bootstrapV17PresenceE2e, createPresenceProductionRoot,
  installPresenceProductionE2eFetch, publicStartScenario,
} from '../../../test/spatial-v3/presence-rules-production-e2e-fixture.js';

const root = new URL('../../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const key = (id, version) => `${id}@${version}`;
const vikhtuy = (name) => `cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_${name}`;

function manifestTables(path, expectedDigest) {
  const bytes = read(path);
  assert.equal(sha256(bytes), expectedDigest, `${path}: exact manifest pin`);
  const manifest = JSON.parse(bytes);
  return (table) => {
    const dataset = manifest.datasets.find((row) => row.table === table);
    assert.ok(dataset, `${table}: dataset in pinned closure`);
    const contents = readFileSync(new URL(dataset.file, new URL(path, root)));
    assert.equal(sha256(contents), dataset.sha256, `${table}: dataset pin`);
    return JSON.parse(contents);
  };
}

// IDs only: T1 examines the fresh bootstrap's DATABASE, not candidate bytes.
function usedBindings() {
  const request = JSON.parse(read('data/world-catalogs/novgorod/m2c-p12-v17-walk-acoustics-v1/request.json'));
  const pin = request.bundle_order.find(({ name }) => name === 'expansion');
  assert.ok(pin, 'v17 bootstrap pins its Spatial expansion closure');
  assert.equal(sha256(read(pin.approval_path)), pin.approval_sha256);
  const table = manifestTables(pin.manifest_path, pin.manifest_sha256);
  const g4s = new Set(table('spatial_v3_nodes')
    .filter((row) => row.status === 'approved' && row.spatial_level === 'G4')
    .map((row) => key(row.id, row.version)));
  const latest = new Map();
  for (const row of table('spatial_v3_canonical_g5_connection_bindings')) {
    if (row.status !== 'approved' || !g4s.has(key(row.parent_g4_id, row.parent_g4_version))) continue;
    if (!latest.has(row.id) || latest.get(row.id).version < row.version) latest.set(row.id, row);
  }
  assert.equal(latest.size, 454, 'the approved wave covers 454 directed canonical lines');
  return [...latest.values()];
}

// Authoring approval, not production activation. Only T2 inserts one pair in its disposable DB.
function authoredLineFixture() {
  const approval = JSON.parse(read('data/world-catalogs/novgorod/spatial-v3/candidates/m2c-lines-v1/approval-attestation.json'));
  assert.equal(approval.decision, 'APPROVE_WITH_LIMITS');
  const table = manifestTables(approval.import_manifest_ref, approval.import_manifest_sha256);
  const bindings = table('spatial_v3_canonical_g5_connection_bindings');
  const forward = bindings.find((row) => row.from_canonical_g5_id === vikhtuy('work_storage')
    && row.to_canonical_g5_id === vikhtuy('water_access'));
  assert.ok(forward, 'approved work_storage -> water_access line');
  const reverse = bindings.find((row) => row.id === forward.reverse_binding_id
    && row.version === forward.reverse_binding_version);
  assert.ok(reverse, 'the approved reverse pin exists');
  const line = table('spatial_v3_line_kind_profiles').find((row) =>
    row.id === forward.line_kind_profile_id && row.version === forward.line_kind_profile_version);
  assert.ok(line, 'exact authored line-kind profile');
  const cost = table('spatial_v3_movement_method_cost_profiles').find((row) =>
    row.id === line.movement_method_cost_profile_id && row.version === line.movement_method_cost_profile_version);
  assert.ok(cost, 'exact authored method cost');
  assert.equal(cost.calibration_kind, 'minutes_on_line');
  assert.equal(cost.base_minutes, null);
  assert.ok(forward.base_minutes > 0);
  const options = table('spatial_v3_movement_method_cost_options')
    .filter((row) => row.profile_id === cost.id && row.profile_version === cost.version);
  const baseline = options.find((row) => row.movement_method_id === line.baseline_movement_method_id);
  assert.equal(baseline?.cost_mode, 'baseline');
  assert.equal(baseline.factor_numerator, null); // D56 baseline method = 1/1.
  assert.equal(baseline.factor_denominator, null);
  return { table, forward, reverse, line, cost, options };
}

async function assertImportedLines(worldPool) {
  const used = usedBindings();
  const { rows } = await worldPool.query(`WITH latest AS (
      SELECT DISTINCT ON (id) * FROM world_base.spatial_v3_canonical_g5_connection_bindings
      WHERE status='approved' AND id=ANY($1::text[]) ORDER BY id,version DESC
    ) SELECT b.*,lp.status AS line_status,lp.canonical_digest AS line_digest,
      lav.status AS line_pin_status,lav.canonical_digest AS line_pin_digest,
      cp.status AS cost_status,cp.base_minutes AS cost_base_minutes,cp.calibration_kind,
      cp.canonical_digest AS cost_digest,cav.status AS cost_pin_status,cav.canonical_digest AS cost_pin_digest
    FROM latest b LEFT JOIN world_base.spatial_v3_line_kind_profiles lp
      ON lp.id=b.line_kind_profile_id AND lp.version=b.line_kind_profile_version
    LEFT JOIN world_base.spatial_v3_authoring_versions lav ON lav.entity_kind='line_kind_profile'
      AND lav.entity_id=lp.id AND lav.version=lp.version AND lav.world_revision_id=lp.world_revision_id
    LEFT JOIN world_base.spatial_v3_movement_method_cost_profiles cp
      ON cp.id=lp.movement_method_cost_profile_id AND cp.version=lp.movement_method_cost_profile_version
      AND cp.world_revision_id=lp.world_revision_id
    LEFT JOIN world_base.spatial_v3_authoring_versions cav ON cav.entity_kind='movement_method_cost_profile'
      AND cav.entity_id=cp.id AND cav.version=cp.version AND cav.world_revision_id=cp.world_revision_id`,
  [used.map(({ id }) => id)]);
  assert.equal(rows.length, used.length, 'all USED canonical lines exist after bootstrap');
  const actual = new Map(rows.map((row) => [row.id, row]));
  const invalid = used.filter((expected) => {
    const row = actual.get(expected.id);
    return row.from_canonical_g5_id !== expected.from_canonical_g5_id
      || row.to_canonical_g5_id !== expected.to_canonical_g5_id
      || row.from_canonical_g5_version !== expected.from_canonical_g5_version
      || row.to_canonical_g5_version !== expected.to_canonical_g5_version
      || !(row.base_minutes > 0) || !row.line_kind_profile_id
      || row.connection_profile_id != null || row.calibration_kind !== 'minutes_on_line'
      || row.cost_base_minutes !== null || row.line_status !== 'approved' || row.cost_status !== 'approved'
      || row.line_pin_status !== 'approved' || row.cost_pin_status !== 'approved'
      || row.line_digest !== row.line_pin_digest || row.cost_digest !== row.cost_pin_digest;
  });
  assert.equal(invalid.length, 0, `Spatial D56: USED imported lines require binding minutes and minutes_on_line;`
    + ` ${invalid.length} invalid, first IDs: ${invalid.slice(0, 3).map(({ id }) => id).join(', ')}`);
}

async function installAuthoredPair(worldPool, fixture) {
  const { table, forward, reverse, line, cost, options } = fixture;
  const wanted = new Set([key(forward.id, forward.version), key(reverse.id, reverse.version),
    key(line.id, line.version), key(cost.id, cost.version)]);
  const client = await worldPool.connect();
  // Named columns preserve SQL defaults (e.g. entity_kind); table/column names are fixture constants.
  const insert = async (name, row) => {
    const columns = Object.keys(row);
    await client.query(`INSERT INTO world_base.${name} (${columns.join(',')})
      VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')}) ON CONFLICT DO NOTHING`, Object.values(row));
  };
  try {
    await client.query('BEGIN');
    for (const row of table('source_records')) await insert('source_records', row);
    for (const row of table('spatial_v3_authoring_versions')) {
      if (wanted.has(key(row.entity_id, row.version))) await insert('spatial_v3_authoring_versions', row);
    }
    await insert('spatial_v3_movement_method_cost_profiles', cost);
    for (const row of options) await insert('spatial_v3_movement_method_cost_options', row);
    await insert('spatial_v3_line_kind_profiles', line);
    for (const row of table('spatial_v3_line_kind_alternative_methods')) {
      if (row.profile_id === line.id && row.profile_version === line.version) {
        await insert('spatial_v3_line_kind_alternative_methods', row);
      }
    }
    await insert('spatial_v3_canonical_g5_connection_bindings', forward);
    await insert('spatial_v3_canonical_g5_connection_bindings', reverse);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
  const { rows } = await worldPool.query(`SELECT base_minutes FROM world_base.spatial_v3_canonical_g5_connection_bindings
    WHERE id=$1 AND version=$2`, [forward.id, forward.version]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].base_minutes, forward.base_minutes, 'fixture preserves the authored binding minutes');
}

// A-03 authorizes this test-only prepared projection; production root never receives this option.
// Accepted by A-lines-b1-3c-29 and NOTE-env-dynamic-status (not imported/activated).
// Exact sources under /srv/novgorod-work/fleet/tasks/env-dynamic/out/candidate/datasets/:
// spatial_v3_transition_environment_profiles_v2.candidate.json:53-75 (env.land_path@2),
// SHA256 42f1029af6c0a346853f98a8ac33e2f0d80b1df926874bd381378ff604633ced;
// dynamic_environment_rule_sets.candidate.json:959-1026 (ruleset@1, clear_dry_calm/night),
// SHA256 dd83b475a7b3ffed738c87249d1abf5ad83a02e9762e77ee4d569318c0eb105e.
// Only the accepted numeric/source fields are frozen below. The access/boundary wrappers are
// test-only API input, not historical data, production records or environment activation.
const acceptedEnvironment = Object.freeze({
  profile_id: 'env.land_path', profile_version: 2,
  ruleset_id: 'dynamic_environment_rule_set.land_path', ruleset_version: 1,
  weather_record_id: 'record:weather_transition_profiles_processes:novgorod_weather_v2',
  weather_record_version: '1', light_profile_id: 'novgorod_outdoor_civil_light_v2',
  weather_id: 'clear_dry_calm', light_id: 'night',
  weather_factor: { numerator: '1', denominator: '1' },
  light_factor: { numerator: '3', denominator: '2' },
  movement_factor: { numerator: '3', denominator: '2' },
});
const seal = (value) => ({ ...value, canonical_digest: computeSpatialV3CanonicalDigest(value) });
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const versioned = (kind, id, version = '1') => ({ entity_ref: ref(kind, id), authoring_version: version });

function projectAcceptedTestEnvironment({ clock }) {
  const a = acceptedEnvironment;
  const scope = ref('party_g6_instance', 'test-only-site-time-scope');
  const weather = versioned('weather_state', a.weather_record_id, a.weather_record_version);
  const light = versioned('light_profile', a.light_profile_id);
  const composition = versioned('transition_environment_profile', a.ruleset_id, `v${a.ruleset_version}`);
  const access = versioned('condition_set', 'test-only-site-time-access');
  const weatherBoundary = versioned('condition_set', 'test-only-site-time-weather-boundary');
  const weatherVisible = versioned('condition_set', 'test-only-site-time-weather-visibility');
  const lightBoundary = versioned('condition_set', 'test-only-site-time-light-boundary');
  const lightVisible = versioned('condition_set', 'test-only-site-time-light-visibility');
  const accessVisible = versioned('condition_set', 'test-only-site-time-access-visibility');
  const profile = (kind, profile_ref, id, factor, boundary_policy_ref, visibility_policy_ref) => seal({
    profile_ref, status: 'approved', provenance_ref: ref('source_record', 'env_dynamic_candidate_2026_10_02'),
    applicability: { scope_refs: [scope] }, [`current_${kind}_id`]: id,
    current_movement_factor: factor, boundary_policy_ref, visibility_policy_ref,
    interrupt_effect: 'background', transitions: [], ...(kind === 'light' ? { artificial_light: null } : {}),
  });
  const input = {
    clock,
    weather_state: profile('weather', weather, a.weather_id, a.weather_factor, weatherBoundary, weatherVisible),
    light_profile: profile('light', light, a.light_id, a.light_factor, lightBoundary, lightVisible),
    movement_composition_policy: seal({ policy_ref: composition, status: 'approved',
      composition_kind: 'worst_applicable', factor_reducer: 'maximum_rational',
      provenance_ref: ref('source_record', 'env_dynamic_candidate_2026_10_02') }),
    place_access_context: seal({ scope_ref: scope, portal_access_state_id: 'open', invalidates_at: null,
      invalidation_reason_id: null, access_policy_ref: access, visibility_policy_ref: accessVisible,
      interrupt_effect: 'background' }),
    catalog_pins: seal({ pins: [
      ['weather_dependency', weather], ['light_profile', light], ['dynamic_environment_rule_set', composition],
      ['availability_condition_set', access], ['condition_rule', weatherBoundary], ['condition', weatherVisible],
      ['condition_rule', lightBoundary], ['condition', lightVisible], ['condition', accessVisible],
    ].map(([dependency_role, value]) => ({ dependency_role, entity_ref: value.entity_ref,
      version_pin: { pin_kind: 'authoring_version', authoring_version: value.authoring_version } })) }),
  };
  const result = deriveEnvironment(input);
  assert.equal(result.status, 'ok', 'accepted-factor fixture is valid environment-state input');
  assert.deepEqual(result.effects.movement_factor, a.movement_factor, 'approved maximum_rational, not product');
  return result;
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
  assertRational(n, a * b, expected, 'exact committed clock delta equals binding minutes × accepted factors');
}
function assertIntervalMinutes(intervals, prefix, expected) {
  let n = 0n, d = 1n;
  for (const row of intervals) {
    const next = BigInt(row[`${prefix}_time_denominator`]);
    n = n * next + BigInt(row[`${prefix}_time_numerator`]) * d;
    d *= next;
  }
  assertRational(n, d, expected, `${prefix} intervals equal binding minutes × accepted factors`);
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

// Select only an offered operation. Neither route/edge description nor approach text is a selector.
function selectMovement(request, selection) {
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

test('D102: imported canonical lines and production site traversal follow D56 time',
  { timeout: 1_800_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    // Validate the prepared environment without relying on the absent baseline hook.
    projectAcceptedTestEnvironment({ clock: { whole_minutes: '0', subminute_numerator: '0', subminute_denominator: '1' } });
    await t.test('T1: USED imported lines carry binding minutes, not cost-profile minutes', async () => {
      await assertImportedLines(env.worldPool);
    });
    const fixture = authoredLineFixture();
    const selection = { bindingId: fixture.forward.id, localEdge: null, offered: false };
    t.after(installPresenceProductionE2eFetch({ turnStepPlanner: ({ request }) => selectMovement(request, selection) }));
    const initial = await createPresenceProductionRoot(env);
    await initial.runtime.close();
    // Existing on lines-b1; old root ignores this option. No production code is edited here.
    const runtime = await createSpatialV3ProductionCompositionRoot({ ...initial.rootOptions,
      testOnlyProjectEnvironmentAtClock: projectAcceptedTestEnvironment });
    t.after(() => runtime.close());
    const partyId = await publicStartScenario(runtime, 'novgorod_vikhtuy_work_storage_v1');
    await t.test('scene_movement_edge: real local action has unchanged exact clock', async () => {
      let hops = 0;
      while ((await location(env.partyPool, partyId)).slot !== 'departure' && hops < 12) {
        const before = await location(env.partyPool, partyId), clockBefore = await clock(env.partyPool, partyId);
        selection.localEdge = await nextLocalEdge(env.partyPool, partyId, before.position_id);
        selection.offered = false;
        const requestId = `site-time-local-${partyId}-${hops++}`;
        await runtime.submitTurn(partyId, { raw_text: 'Иду к месту выхода.', request_id: requestId });
        assert.equal(selection.offered, true, 'SQL-nominated edge is actually offered to the planner');
        const after = await location(env.partyPool, partyId);
        const { rows } = await env.partyPool.query(`SELECT s.state_payload->'last_turn' AS last_turn
          FROM party_runtime.parties p JOIN party_runtime.party_state_snapshots s
            ON s.party_id=p.party_id AND s.state_version=p.state_version
          WHERE p.party_id=$1 AND s.state_payload->'last_turn'->>'request_id'=$2`, [partyId, requestId]);
        assert.equal(rows.length, 1);
        const consequence = rows[0].last_turn.consequence;
        assert.equal(after.g5, before.g5);
        assert.notEqual(after.position_id, before.position_id);
        assert.equal(consequence.position_transition.movement_admission.cost_kind, 'action');
        assert.ok(consequence.position_transition.movement_admission.action_units > 0);
        assert.equal(consequence.duration_minutes, 0);
        assertClockDelta(clockBefore, await clock(env.partyPool, partyId), { numerator: 0n, denominator: 1n });
        const plans = await env.partyPool.query(`SELECT id FROM party_runtime.party_route_plans
          WHERE party_id=$1 AND planning_request_id=$2`, [partyId, requestId]);
        assert.equal(plans.rows.length, 0, 'plain local movement creates no travel plan');
      }
      assert.ok(hops > 0, 'control executes a real scene edge');
      assert.equal((await location(env.partyPool, partyId)).slot, 'departure');
    });
    await t.test('T2: authored site line commits timed progress, binding × factors, clock and arrival', async () => {
      await installAuthoredPair(env.worldPool, fixture);
      selection.localEdge = null;
      selection.offered = false;
      // Explicit test case: baseline method/load/body/pace=1/1, no delays (A-03).
      const expected = { numerator: BigInt(fixture.forward.base_minutes)
        * BigInt(acceptedEnvironment.movement_factor.numerator),
      denominator: BigInt(acceptedEnvironment.movement_factor.denominator) };
      assert.ok(expected.numerator > 0n);
      const before = await location(env.partyPool, partyId), clockBefore = await clock(env.partyPool, partyId);
      const requestId = `site-time-path-${partyId}`;
      await runtime.submitTurn(partyId, { raw_text: 'Иду по выбранному проходу.', request_id: requestId });
      assert.equal(selection.offered, true, 'the selected canonical line is actually offered');
      const paths = (await env.partyPool.query(`SELECT p.id AS plan_id,s.step_kind,s.static_contract_snapshot,
          e.id AS execution_id,e.status FROM party_runtime.party_route_plans p
        JOIN party_runtime.party_route_plan_steps s ON s.route_plan_id=p.id
        JOIN party_runtime.party_route_plan_executions e ON e.route_plan_id=p.id
        WHERE p.party_id=$1 AND p.planning_request_id=$2 ORDER BY s.ordinal`, [partyId, requestId])).rows;
      assert.equal(paths.length, 1, 'one physical site segment for this request');
      assert.equal(paths[0].step_kind, 'timed_traversal', 'site_connection must not commit a zero-time immediate_action');
      assert.equal(paths[0].status, 'completed');
      const segment = paths[0].static_contract_snapshot.traversal_snapshot.physical_segment_ref.segment_ref;
      assert.equal(segment.segment_kind, 'site_connection');
      const connection = (await env.partyPool.query(`SELECT to_jsonb(c) AS value
        FROM party_runtime.g5_site_connections c WHERE party_id=$1 AND id=$2`, [partyId, segment.segment_id])).rows[0]?.value;
      assert.equal(connection?.cost_kind, 'time');
      assert.equal(connection.source_canonical_connection_ref.entity_id, fixture.forward.id);
      assert.equal(String(connection.source_canonical_connection_ref.authoring_version), String(fixture.forward.version));
      const intervals = (await env.partyPool.query(`SELECT * FROM party_runtime.party_traversal_interval_results
        WHERE route_plan_execution_id=$1 ORDER BY interval_ordinal`, [paths[0].execution_id])).rows;
      assert.ok(intervals.length > 0, 'committed physical progress intervals');
      assert.equal(intervals[0].progress_before_ppm, 0);
      let progress = 0;
      for (const interval of intervals) {
        assert.equal(interval.progress_before_ppm, progress);
        assert.ok(interval.actual_progress_after_ppm > progress, 'each interval advances along the segment');
        progress = interval.actual_progress_after_ppm;
      }
      assertIntervalMinutes(intervals, 'planned', expected);
      assertIntervalMinutes(intervals, 'actual', expected);
      assert.equal(progress, 1_000_000);
      assert.equal(intervals.at(-1).result_kind, 'segment_completed');
      const travel = (await env.partyPool.query(`SELECT * FROM party_runtime.traveller_travel_states
        WHERE route_plan_execution_id=$1`, [paths[0].execution_id])).rows;
      assert.equal(travel.length, 1);
      assert.equal(travel[0].segment_progress_ppm, 1_000_000);
      assert.equal(travel[0].status, 'closed');
      assert.equal(travel[0].closed_result, 'completed');
      assertRational(travel[0].cumulative_actual_time_numerator, travel[0].cumulative_actual_time_denominator,
        expected, 'travel state preserves exact actual minutes');
      assertClockDelta(clockBefore, await clock(env.partyPool, partyId), expected);
      const after = await location(env.partyPool, partyId);
      assert.equal(after.g5, vikhtuy('water_access'));
      assert.equal(after.slot, fixture.forward.to_scene_endpoint_slot_key);
      assert.notEqual(after.position_id, before.position_id);
      const actions = await env.partyPool.query(`SELECT id FROM party_runtime.party_action_step_runs
        WHERE party_id=$1 AND execution_id=$2`, [partyId, paths[0].execution_id]);
      assert.equal(actions.rows.length, 0, 'timed crossing has no immediate action run');
    });
  });
